"""User-Agent request aggregation.

Pure functions (no FastAPI dependency) so they can be imported directly in
BDD step definitions. Feeds the "Block Suggestions → By User-Agent" and
"→ By Signature" tabs, where the decision to block a UA depends on how many
requests it made and how many distinct IPs it came from.

A scraper that forges an ordinary browser User-Agent cannot be told apart by
that string alone - it is a genuine Chrome string and every real Chrome user
sends the same one. What separates it is the *conjunction*: that UA, arriving
with no Referer, on a small set of expensive paths. The ``no_referer`` and
``signature`` counters carried through here are what make that conjunction
visible per row, so it can be proposed as a block rule.
"""
import re
from collections import Counter

EMPTY_UA = "(empty)"

# Tokens that identify an automated client, e.g. "SemrushBot", "ia_archiver".
_BOT_TOKEN_RE = re.compile(
    r"[A-Za-z][A-Za-z0-9._!-]*"
    r"(?:bot|crawl(?:er)?|spider|scraper|slurp|archiver|fetcher|checker|monitor)"
    r"[A-Za-z0-9._!-]*",
    re.IGNORECASE,
)

# "Product/Version" pairs, e.g. "curl/8.5.0", "Chrome/120.0.0.0", "check_http/v2.2".
_PRODUCT_RE = re.compile(r"([A-Za-z][A-Za-z0-9._!-]*)/v?[0-9][A-Za-z0-9._-]*", re.IGNORECASE)

# A leading bare word, for clients that carry no version: "politiquices (+url)".
_LEADING_RE = re.compile(r"^([A-Za-z][A-Za-z0-9._!-]*)(?:/\S*)?(?=$|[\s(;,])")

# Layout-engine boilerplate every browser repeats — never a useful block target.
_GENERIC_PRODUCTS = {
    "mozilla", "applewebkit", "khtml", "gecko", "like", "version", "mobile",
}


def product_token(user_agent: str) -> str:
    """Reduce a User-Agent string to a short, stable token.

    Heuristic, in order: an automation keyword anywhere in the string
    (``SemrushBot``), then the first product name that is not layout-engine
    boilerplate (``curl``, ``Chrome``), then a leading bare word for clients
    that carry no version (``politiquices (+https://…)``), then the string
    itself. Blocking on the token rather than the full string survives
    version bumps.
    """
    ua = (user_agent or "").strip()
    if not ua or ua == "-":
        return EMPTY_UA

    m = _BOT_TOKEN_RE.search(ua)
    if m:
        return m.group(0).strip("._-")

    for name in _PRODUCT_RE.findall(ua):
        if name.lower() not in _GENERIC_PRODUCTS:
            return name

    lead = _LEADING_RE.match(ua)
    if lead and lead.group(1).lower() not in _GENERIC_PRODUCTS:
        return lead.group(1)

    return ua


def _group_key(user_agent: str, group: str) -> str:
    if group == "token":
        return product_token(user_agent)
    return user_agent or EMPTY_UA


def aggregate(
    ua_counter: Counter,
    ua_bot_counter: Counter,
    ua_ips: dict | None = None,
    group: str = "full",
    query: str = "",
    limit: int = 500,
    bots_only: bool = False,
    min_requests: int = 1,
    ip_cap: int | None = None,
    ua_noref_counter: Counter | None = None,
    ua_sig_counter: Counter | None = None,
    ua_sig_ips: dict | None = None,
    no_referer_only: bool = False,
    signature_only: bool = False,
    min_signature_share: float = 0.0,
) -> dict:
    """Build the User-Agent statistics payload.

    ``group`` is ``full`` (the UA string as logged) or ``token`` (collapsed to
    the product token, so every SemrushBot version rolls up into one row).
    ``ua_ips`` maps a UA string to the set of IPs that sent it; sets are
    unioned per group so the count stays correct when rows are collapsed.
    ``ip_cap`` is the caller's per-UA limit on remembered IPs: a row whose
    own set reached it is flagged ``ips_capped`` so the dashboard can render
    the count as a lower bound. A union simply exceeding the cap is not
    capped — only a saturated source set is.
    A UA is reported as a bot when *every* one of its requests was classified
    as one — classification depends only on the string, so a mixed result can
    only come from a rule changing mid-tail.

    ``ua_noref_counter`` and ``ua_sig_counter`` carry the per-UA count of
    requests that arrived with no Referer, and of those that additionally hit
    one of the configured signature paths. ``no_referer_only`` and
    ``signature_only`` keep just the rows with a non-zero count, and
    ``min_signature_share`` (0-100) keeps rows where the signature accounts for
    at least that percentage of the UA's traffic — the filter that separates a
    forged browser UA from the real one sharing the same string.
    """
    ua_ips = ua_ips or {}
    ua_noref_counter = ua_noref_counter or Counter()
    ua_sig_counter = ua_sig_counter or Counter()
    ua_sig_ips = ua_sig_ips or {}
    total_requests = sum(ua_counter.values())

    totals: Counter = Counter()
    bots: Counter = Counter()
    noref: Counter = Counter()
    sig: Counter = Counter()
    ips: dict[str, set] = {}
    sig_ips: dict[str, set] = {}
    capped: set[str] = set()
    samples: dict[str, str] = {}

    for ua, count in ua_counter.items():
        key = _group_key(ua, group)
        totals[key] += count
        bots[key] += ua_bot_counter.get(ua, 0)
        noref[key] += ua_noref_counter.get(ua, 0)
        sig[key] += ua_sig_counter.get(ua, 0)
        if ua_ips.get(ua):
            ips.setdefault(key, set()).update(ua_ips[ua])
            if ip_cap is not None and len(ua_ips[ua]) >= ip_cap:
                capped.add(key)
        if ua_sig_ips.get(ua):
            sig_ips.setdefault(key, set()).update(ua_sig_ips[ua])
        # Keep the busiest raw string as the example for a collapsed row.
        if key not in samples or count > ua_counter.get(samples[key], 0):
            samples[key] = ua or EMPTY_UA

    needle = query.strip().lower()
    matching = Counter({
        k: c for k, c in totals.items()
        if (not needle or needle in k.lower())
        and c >= min_requests
        and (not bots_only or bots.get(k, 0) == c)
        and (not no_referer_only or noref.get(k, 0) > 0)
        and (not signature_only or sig.get(k, 0) > 0)
        and (not min_signature_share or (sig.get(k, 0) / c * 100) >= min_signature_share)
    })

    # Rank by whatever the caller is actually filtering on: in signature mode
    # the interesting row is the one with the most signature hits, which is not
    # necessarily the one with the most traffic overall.
    if signature_only or min_signature_share:
        ordered = sorted(
            matching.items(),
            key=lambda kv: (sig.get(kv[0], 0), kv[1]),
            reverse=True,
        )[:limit]
    elif no_referer_only:
        ordered = sorted(
            matching.items(),
            key=lambda kv: (noref.get(kv[0], 0), kv[1]),
            reverse=True,
        )[:limit]
    else:
        ordered = matching.most_common(limit)

    rows = []
    for key, total in ordered:
        bot_count = bots.get(key, 0)
        noref_count = noref.get(key, 0)
        sig_count = sig.get(key, 0)
        rows.append({
            "user_agent": key,
            "sample": samples.get(key, key),
            "token": product_token(key) if group == "full" else key,
            "total": total,
            "bots": bot_count,
            "humans": total - bot_count,
            "is_bot": bot_count == total,
            "unique_ips": len(ips.get(key, ())),
            "ips_capped": key in capped,
            "share": round(total / total_requests * 100, 2) if total_requests else 0.0,
            "no_referer": noref_count,
            "no_referer_share": round(noref_count / total * 100, 2) if total else 0.0,
            "signature": sig_count,
            "signature_share": round(sig_count / total * 100, 2) if total else 0.0,
            "signature_ips": len(sig_ips.get(key, ())),
        })

    return {
        "user_agents": rows,
        "unique_user_agents": len(totals),
        "matched": len(matching),
        "total_requests": total_requests,
        "group": "token" if group == "token" else "full",
        "query": query,
    }

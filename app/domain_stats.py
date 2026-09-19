"""Domain extraction and aggregation.

Two independent notions of "domain" are tracked:

* **referer**  — the external site that sent the visitor (from the Referer
  header). Answers *where is my traffic coming from*.
* **url**      — the archived target embedded in the requested path, e.g.
  ``/wayback/20200101000000/http://example.com/page`` -> ``example.com``.
  Answers *which archived sites are being replayed most*.

Pure functions (no FastAPI dependency) so they can be imported directly in
BDD step definitions.
"""
import re
from collections import Counter
from functools import lru_cache

from .url_stats import rank

# A server log cannot distinguish "the visitor typed the URL" from "this client
# never sends a Referer". Most traffic here is the latter, so the label states
# what was observed rather than implying a human chose to arrive directly.
NO_REFERER = "(no referer)"
DIRECT = NO_REFERER          # backwards-compatible alias
NONE = ""

# Matches a scheme inside a path, tolerating Apache's collapsed double slash
# (``http:/example.com``) which shows up in rewritten replay URLs.
_SCHEME_RE = re.compile(r"https?:/{1,2}", re.IGNORECASE)

# Any scheme followed by an authority, e.g. android-app://com.google.android.gm.
# Mobile apps and other non-web clients send these; without this they fall
# through _clean_host and get miscounted as having no referer at all.
_ANY_SCHEME_RE = re.compile(r"^([a-z][a-z0-9+.-]*):/{2,3}", re.IGNORECASE)

# A wayback-style timestamp segment, optionally followed by a modifier flag
# such as ``if_``, ``im_`` or ``id_``.
_TIMESTAMP_RE = re.compile(r"^\d{4,17}[a-z]{0,3}_?$", re.IGNORECASE)


def _clean_host(host: str) -> str:
    """Normalise a raw host: lowercase, drop credentials, port and ``www.``."""
    host = host.strip().lower()
    if "@" in host:
        host = host.rsplit("@", 1)[1]
    if host.startswith("["):                      # IPv6 literal
        host = host.split("]", 1)[0].lstrip("[")
    else:
        host = host.split(":", 1)[0]
    if host.startswith("www."):
        host = host[4:]
    return host if "." in host or ":" in host else NONE


@lru_cache(maxsize=8192)
def referer_domain(referer: str) -> str:
    """Extract the host from a Referer value.

    Empty values and Apache's ``-`` placeholder become ``(direct)``.
    """
    ref = (referer or "").strip()
    if not ref or ref == "-":
        return NO_REFERER
    m = _SCHEME_RE.match(ref)
    if m:
        host = re.split(r"[/?#]", ref[m.end():], 1)[0]
        return _clean_host(host) or NO_REFERER
    other = _ANY_SCHEME_RE.match(ref)
    if other:
        scheme = other.group(1).lower()
        authority = re.split(r"[/?#]", ref[other.end():], 1)[0].strip().lower()
        return f"{scheme}://{authority}" if authority else f"{scheme}://"
    host = re.split(r"[/?#]", ref, 1)[0]
    return _clean_host(host) or NO_REFERER


@lru_cache(maxsize=8192)
def url_domain(path: str) -> str:
    """Extract the archived target domain embedded in a request path.

    Returns an empty string when the path carries no embedded URL.
    """
    p = (path or "").strip()
    if not p:
        return NONE

    # 1. An explicit scheme anywhere in the path wins.
    m = _SCHEME_RE.search(p)
    if m:
        host = re.split(r"[/?#]", p[m.end():], 1)[0]
        cleaned = _clean_host(host)
        if cleaned:
            return cleaned

    # 2. Otherwise a scheme-less target following a wayback timestamp segment.
    segments = [s for s in p.split("/") if s]
    for i, seg in enumerate(segments[:-1]):
        if _TIMESTAMP_RE.match(seg):
            cleaned = _clean_host(re.split(r"[?#]", segments[i + 1], 1)[0])
            if cleaned:
                return cleaned
            break

    return NONE


def aggregate(
    domain_counter: Counter,
    domain_bot_counter: Counter,
    domain_error_counter: Counter,
    source: str = "referer",
    query: str = "",
    limit: int = 500,
) -> dict:
    """Build the domain statistics payload for one source."""
    result = rank(
        domain_counter,
        domain_bot_counter,
        domain_error_counter,
        key_name="domain",
        query=query,
        limit=limit,
    )
    return {
        "domains": result.pop("rows"),
        "unique_domains": result.pop("unique"),
        "source": "url" if source == "url" else "referer",
        **result,
    }

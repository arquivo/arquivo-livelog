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

DIRECT = "(direct)"
NONE = ""

# Matches a scheme inside a path, tolerating Apache's collapsed double slash
# (``http:/example.com``) which shows up in rewritten replay URLs.
_SCHEME_RE = re.compile(r"https?:/{1,2}", re.IGNORECASE)

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
        return DIRECT
    m = _SCHEME_RE.match(ref)
    rest = ref[m.end():] if m else ref
    host = re.split(r"[/?#]", rest, 1)[0]
    return _clean_host(host) or DIRECT


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

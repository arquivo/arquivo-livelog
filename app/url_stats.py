"""URL request aggregation.

Pure functions (no FastAPI dependency) so they can be imported directly in
BDD step definitions.
"""
from collections import Counter


def strip_query(path: str) -> str:
    """Return the path without its query string.

    ``/search?q=foo`` -> ``/search``. An empty result falls back to ``/``.
    """
    base = (path or "").split("?", 1)[0].split("#", 1)[0]
    return base or "/"


def rank(
    totals: Counter,
    bots: Counter,
    errors: Counter,
    key_name: str,
    query: str = "",
    limit: int = 500,
) -> dict:
    """Rank counter keys by request count, with an optional substring filter.

    Shared by the URL and domain endpoints; ``key_name`` names the field that
    carries the key in each row (``url`` or ``domain``).
    """
    total_requests = sum(totals.values())
    unique_keys    = len(totals)

    needle = query.strip().lower()
    if needle:
        matching = Counter({k: c for k, c in totals.items() if needle in k.lower()})
    else:
        matching = totals

    rows = []
    for key, total in matching.most_common(limit):
        bot_count = bots.get(key, 0)
        rows.append({
            key_name: key,
            "total": total,
            "bots": bot_count,
            "humans": total - bot_count,
            "errors": errors.get(key, 0),
            "share": round(total / total_requests * 100, 2) if total_requests else 0.0,
        })

    return {
        "rows": rows,
        "unique": unique_keys,
        "matched": len(matching),
        "total_requests": total_requests,
        "query": query,
    }


def _group_counter(counter: Counter, group: str) -> Counter:
    """Collapse a full-path counter into path-only keys when requested."""
    if group != "path":
        return counter
    grouped: Counter = Counter()
    for url, count in counter.items():
        grouped[strip_query(url)] += count
    return grouped


def aggregate(
    url_counter: Counter,
    url_bot_counter: Counter,
    url_error_counter: Counter,
    group: str = "path",
    query: str = "",
    limit: int = 500,
) -> dict:
    """Build the URL statistics payload.

    ``group`` is ``path`` (query strings collapsed) or ``full`` (as logged).
    ``query`` is a case-insensitive substring filter applied to the URL.
    """
    result = rank(
        _group_counter(url_counter, group),
        _group_counter(url_bot_counter, group),
        _group_counter(url_error_counter, group),
        key_name="url",
        query=query,
        limit=limit,
    )
    return {
        "urls": result.pop("rows"),
        "unique_urls": result.pop("unique"),
        "group": "path" if group == "path" else "full",
        **result,
    }

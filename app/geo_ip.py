from functools import lru_cache

_geo = None


def _get_geo():
    global _geo
    if _geo is None:
        try:
            from geoip2fast import GeoIP2Fast
            _geo = GeoIP2Fast(verbose=False)
        except Exception:
            _geo = False
    return _geo


@lru_cache(maxsize=8192)
def lookup(ip: str) -> dict:
    geo = _get_geo()
    if not geo:
        return {"country_code": "??", "country_name": "Unknown"}
    try:
        result = geo.lookup(ip)
        code = (result.country_code or "??").upper()
        name = result.country_name or "Unknown"
        if code in ("", "--", "??"):
            return {"country_code": "??", "country_name": "Unknown"}
        return {"country_code": code, "country_name": name}
    except Exception:
        return {"country_code": "??", "country_name": "Unknown"}

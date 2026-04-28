import re
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Optional

try:
    from user_agents import parse as _ua_parse
    _HAS_UA_LIB = True
except ImportError:
    _HAS_UA_LIB = False


@dataclass
class BotRule:
    id: str
    name: str
    description: str
    pattern: Optional[str] = None
    enabled: bool = True
    custom: bool = False       # True = user-created, can be deleted
    _compiled: Optional[re.Pattern] = field(default=None, repr=False)

    def __post_init__(self):
        self._recompile()

    def _recompile(self):
        if self.pattern:
            self._compiled = re.compile(self.pattern, re.IGNORECASE)
        else:
            self._compiled = None

    def matches(self, ua: str) -> bool:
        return bool(self._compiled and self._compiled.search(ua))

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "pattern": self.pattern,
            "enabled": self.enabled,
            "custom": self.custom,
        }


# Default rules — never mutated directly
_DEFAULT_RULES: list[BotRule] = [
    BotRule(
        id="empty_ua",
        name="Empty / Dash User-Agent",
        description="Requests with no User-Agent header or the literal dash '-'. "
                    "Always classified as bots — no legitimate browser omits this header.",
    ),
    BotRule(
        id="search_engines",
        name="Search Engine Crawlers",
        description="Official crawlers from Google, Bing, Yahoo (Slurp), Baidu, "
                    "Yandex, DuckDuckGo, Sogou, and Exalead.",
        pattern=r"googlebot|bingbot|slurp|baiduspider|yandexbot|duckduckbot|sogou|exabot",
    ),
    BotRule(
        id="seo_tools",
        name="SEO Analysis Tools",
        description="Automated SEO auditing bots: SemrushBot, AhrefsBot, "
                    "Majestic MJ12Bot, and DotBot.",
        pattern=r"semrush|ahrefs|mj12bot|dotbot",
    ),
    BotRule(
        id="social_preview",
        name="Social Media Link Previews",
        description="Headless fetchers that generate link previews: Facebook, "
                    "Twitter/X, LinkedIn, WhatsApp, Bing Preview, and Internet Archive.",
        pattern=r"facebookexternalhit|twitterbot|linkedinbot|whatsapp|bingpreview|ia_archiver",
    ),
    BotRule(
        id="http_tools",
        name="HTTP Clients & Scripting Tools",
        description="Command-line tools and language HTTP libraries: curl, wget, "
                    "Python requests/urllib, Go http.Client, Java, Ruby, Perl, "
                    "PHP, libwww, Scrapy, and Axios.",
        pattern=(
            r"curl|wget|python-requests|python-urllib|go-http-client|"
            r"java/|ruby|perl|php|libwww|scrapy|axios"
        ),
    ),
    BotRule(
        id="generic_crawlers",
        name="Generic Crawler Keywords",
        description="Catch-all for user-agents containing the words 'bot', "
                    "'crawl', 'spider', or 'scraper' that didn't match a specific rule above.",
        pattern=r"bot|crawl|spider|scraper",
    ),
    BotRule(
        id="ua_library",
        name="user-agents Library (ua-parser)",
        description="Detection by the Python user-agents library using the ua-parser "
                    "database. Identifies bots not caught by regex patterns above.",
    ),
]

# Runtime-mutable rule list (deep-copy of defaults + custom rules added by users)
_active_rules: list[BotRule] = [
    BotRule(
        id=r.id, name=r.name, description=r.description,
        pattern=r.pattern, enabled=r.enabled, custom=False,
    )
    for r in _DEFAULT_RULES
]

_next_custom_id: int = 1


def _clear_cache() -> None:
    get_bot_info.cache_clear()
    is_bot.cache_clear()


def get_rules() -> list[BotRule]:
    return _active_rules


def update_rule(rule_id: str, enabled: Optional[bool] = None, pattern: Optional[str] = None) -> Optional[BotRule]:
    for rule in _active_rules:
        if rule.id == rule_id:
            if enabled is not None:
                rule.enabled = enabled
            if pattern is not None:
                rule.pattern = pattern if pattern.strip() else None
                rule._recompile()
            _clear_cache()
            return rule
    return None


def add_custom_rule(name: str, description: str, pattern: str) -> BotRule:
    global _next_custom_id
    rule = BotRule(
        id=f"custom_{_next_custom_id}",
        name=name,
        description=description,
        pattern=pattern,
        enabled=True,
        custom=True,
    )
    _next_custom_id += 1
    # Insert before ua_library (keep it last)
    insert_pos = next(
        (i for i, r in enumerate(_active_rules) if r.id == "ua_library"),
        len(_active_rules),
    )
    _active_rules.insert(insert_pos, rule)
    _clear_cache()
    return rule


def delete_custom_rule(rule_id: str) -> bool:
    global _active_rules
    before = len(_active_rules)
    _active_rules = [r for r in _active_rules if not (r.id == rule_id and r.custom)]
    changed = len(_active_rules) < before
    if changed:
        _clear_cache()
    return changed


@lru_cache(maxsize=8192)
def get_bot_info(user_agent: str) -> dict:
    if not user_agent or user_agent == "-":
        r = next((r for r in _active_rules if r.id == "empty_ua"), None)
        if r and r.enabled:
            return {"is_bot": True, "rule_id": r.id, "rule_name": r.name}
        return {"is_bot": False, "rule_id": None, "rule_name": None}

    for rule in _active_rules:
        if rule.id in ("empty_ua", "ua_library") or not rule.enabled:
            continue
        if rule.matches(user_agent):
            return {"is_bot": True, "rule_id": rule.id, "rule_name": rule.name}

    ua_rule = next((r for r in _active_rules if r.id == "ua_library"), None)
    if ua_rule and ua_rule.enabled and _HAS_UA_LIB:
        try:
            ua = _ua_parse(user_agent)
            if ua.is_bot:
                return {"is_bot": True, "rule_id": ua_rule.id, "rule_name": ua_rule.name}
        except Exception:
            pass

    return {"is_bot": False, "rule_id": None, "rule_name": None}


@lru_cache(maxsize=8192)
def is_bot(user_agent: str) -> bool:
    return get_bot_info(user_agent)["is_bot"]


def test_ua(user_agent: str) -> dict:
    info = get_bot_info(user_agent)
    result = {
        "user_agent": user_agent,
        "is_bot": info["is_bot"],
        "rule_id": info.get("rule_id"),
        "rule_name": info.get("rule_name"),
        "matched_term": None,
    }
    if info["is_bot"] and info["rule_id"]:
        rule = next((r for r in _active_rules if r.id == info["rule_id"]), None)
        if rule and rule.pattern:
            m = re.search(rule.pattern, user_agent, re.IGNORECASE)
            if m:
                result["matched_term"] = m.group(0)
    return result

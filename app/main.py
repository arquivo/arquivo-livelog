import asyncio
import json
import os
from collections import Counter, deque
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime
from typing import Set

import aiofiles
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .reset_scheduler import next_reset_time as _next_reset_time
from .bot_detector import (
    _HAS_UA_LIB, add_custom_rule, delete_custom_rule,
    get_bot_info, get_rules, is_bot, test_ua, update_rule,
)
from .config import config
from .geo_ip import lookup as geo_lookup
from .log_parser import LogEntry, parse_line, tail_file
from .outlier_detector import compute_threshold, find_heavy_users
from .domain_stats import (
    aggregate as aggregate_domains, referer_domain, url_domain,
)
from .ua_stats import aggregate as aggregate_uas
from .url_stats import aggregate as aggregate_urls


# Upper bound on the distinct IPs remembered per User-Agent. Bounds memory on
# long tails; counts at the cap are reported as "N+" by the dashboard.
MAX_IPS_PER_UA = 2048


def _has_referer(referer: str | None) -> bool:
    """Apache logs a missing Referer as "-"; treat that and empty as absent."""
    r = (referer or "").strip()
    return bool(r) and r != "-"


def _matches_signature_path(path: str | None) -> bool:
    """True when the request path starts with one of config.signature_paths."""
    p = path or ""
    return any(p.startswith(prefix) for prefix in config.signature_paths)


# ---------------------------------------------------------------------------
# In-memory store
# ---------------------------------------------------------------------------

@dataclass
class Store:
    entries: deque = None
    ip_counter: Counter = None
    ip_bot_counter: Counter = None
    country_counter: Counter = None
    url_counter: Counter = None
    url_bot_counter: Counter = None
    url_error_counter: Counter = None
    ua_counter: Counter = None
    ua_bot_counter: Counter = None
    ua_ips: dict = None
    ua_noref_counter: Counter = None
    ua_sig_counter: Counter = None
    ua_sig_ips: dict = None
    domain_counters: dict = None
    rule_hit_counter: Counter = None
    total: int = 0
    bots: int = 0
    humans: int = 0
    heavy_user_ips: Set[str] = None
    outlier_threshold: float = 0.0
    log_file_error: str = ""

    def __post_init__(self):
        self.entries = deque(maxlen=config.max_display_entries)
        self.ip_counter = Counter()
        self.ip_bot_counter = Counter()
        self.country_counter = Counter()
        self.url_counter = Counter()
        self.url_bot_counter = Counter()
        self.url_error_counter = Counter()
        self.ua_counter = Counter()
        self.ua_bot_counter = Counter()
        self.ua_ips = {}
        self.ua_noref_counter = Counter()
        self.ua_sig_counter = Counter()
        self.ua_sig_ips = {}
        # Two scopes per source: "all" is every request, "unblocked" omits those
        # an access rule rejected. The referer panel defaults to "unblocked" —
        # with 90%+ of traffic blocked and referer-less, "all" is one enormous
        # (no referer) bucket that hides every real referring site.
        self.domain_counters = {
            src: {
                scope: {"total": Counter(), "bots": Counter(), "errors": Counter()}
                for scope in ("all", "unblocked")
            }
            for src in ("referer", "url")
        }
        self.rule_hit_counter = Counter()
        self.heavy_user_ips = set()

    def add_entry(self, entry: LogEntry) -> None:
        self.entries.append(entry)
        self.ip_counter[entry.ip] += 1
        url = entry.path or "-"
        self.url_counter[url] += 1
        if entry.status >= 400:
            self.url_error_counter[url] += 1
        self._count_domains(entry)
        self._count_user_agent(entry)
        self.total += 1
        if entry.is_bot:
            self.bots += 1
            self.ip_bot_counter[entry.ip] += 1
            self.url_bot_counter[url] += 1
            self.ua_bot_counter[entry.user_agent or "-"] += 1
            info = get_bot_info(entry.user_agent)
            if info["rule_id"]:
                self.rule_hit_counter[info["rule_id"]] += 1
        else:
            self.humans += 1
        self.country_counter[entry.country_code] += 1

    def _count_user_agent(self, entry: LogEntry) -> None:
        ua = entry.user_agent or "-"
        self.ua_counter[ua] += 1
        ips = self.ua_ips.setdefault(ua, set())
        if len(ips) < MAX_IPS_PER_UA:
            ips.add(entry.ip)

        # The signature conjunction: no Referer, on one of the configured
        # paths. Counted at ingest like every other counter, so changing
        # config.signature_paths re-tails the log (see api_config_update).
        if not _has_referer(entry.referer):
            self.ua_noref_counter[ua] += 1
            if _matches_signature_path(entry.path):
                self.ua_sig_counter[ua] += 1
                sig_ips = self.ua_sig_ips.setdefault(ua, set())
                if len(sig_ips) < MAX_IPS_PER_UA:
                    sig_ips.add(entry.ip)

    def _count_domains(self, entry: LogEntry) -> None:
        for source, key in (
            ("referer", referer_domain(entry.referer)),
            ("url", url_domain(entry.path)),
        ):
            if not key:
                continue
            scopes = ["all"] if entry.block_reason else ["all", "unblocked"]
            for scope in scopes:
                counters = self.domain_counters[source][scope]
                counters["total"][key] += 1
                if entry.is_bot:
                    counters["bots"][key] += 1
                if entry.status >= 400:
                    counters["errors"][key] += 1

    def stats(self) -> dict:
        return {
            "total": self.total,
            "humans": self.humans,
            "bots": self.bots,
            "countries": len(self.country_counter),
            "unique_urls": len(self.url_counter),
            "unique_user_agents": len(self.ua_counter),
            "heavy_users": len(self.heavy_user_ips),
            "outlier_threshold": round(self.outlier_threshold, 1),
            "log_file": config.log_file,
            "tail_lines": config.tail_lines,
            "log_file_error": self.log_file_error,
            "reset_interval": config.reset_interval,
            "next_reset_at": _get_next_reset_iso(),
        }

    def reset_counters(self) -> None:
        self.ip_counter.clear()
        self.ip_bot_counter.clear()
        self.country_counter.clear()
        self.url_counter.clear()
        self.url_bot_counter.clear()
        self.url_error_counter.clear()
        self.ua_counter.clear()
        self.ua_bot_counter.clear()
        self.ua_ips.clear()
        self.ua_noref_counter.clear()
        self.ua_sig_counter.clear()
        self.ua_sig_ips.clear()
        for scopes in self.domain_counters.values():
            for counters in scopes.values():
                for c in counters.values():
                    c.clear()
        self.rule_hit_counter.clear()
        self.total = 0
        self.bots = 0
        self.humans = 0
        self.heavy_user_ips = set()


store = Store()
connected_clients: set[WebSocket] = set()
_watcher_reset_to: int | None = None
_last_reset: datetime = datetime.now()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _is_ignored(ip: str) -> bool:
    return ip in config.ignore_ips


def _enrich(entry: LogEntry) -> LogEntry:
    entry.is_bot = is_bot(entry.user_agent)
    geo = geo_lookup(entry.ip)
    entry.country_code = geo["country_code"]
    entry.country_name = geo["country_name"]
    return entry


def _mark_heavy(entry: LogEntry) -> LogEntry:
    entry.is_heavy_user = entry.ip in store.heavy_user_ips
    return entry


async def _broadcast(message: dict) -> None:
    dead: set[WebSocket] = set()
    payload = json.dumps(message)
    for ws in connected_clients:
        try:
            await ws.send_text(payload)
        except Exception:
            dead.add(ws)
    connected_clients.difference_update(dead)


def _recompute_heavy_users() -> None:
    store.heavy_user_ips = find_heavy_users(
        store.ip_counter,
        iqr_multiplier=config.heavy_usage_iqr_multiplier,
        min_requests=config.heavy_usage_min_requests,
    )
    store.outlier_threshold = compute_threshold(
        store.ip_counter,
        iqr_multiplier=config.heavy_usage_iqr_multiplier,
        min_requests=config.heavy_usage_min_requests,
    )
    for e in store.entries:
        e.is_heavy_user = e.ip in store.heavy_user_ips


# ---------------------------------------------------------------------------
# Auto-reset helpers
# ---------------------------------------------------------------------------

def _get_next_reset_iso() -> str | None:
    nxt = _next_reset_time(config.reset_interval, _last_reset)
    return nxt.isoformat() if nxt else None


async def _do_reset() -> None:
    global _watcher_reset_to, _last_reset
    store.entries.clear()
    store.reset_counters()
    _recompute_heavy_users()
    try:
        _watcher_reset_to = os.path.getsize(config.log_file)
    except OSError:
        _watcher_reset_to = 0
    _last_reset = datetime.now()
    await _broadcast({
        "type": "snapshot",
        "entries": [],
        "stats": store.stats(),
    })


async def _auto_reset_watcher() -> None:
    while True:
        await asyncio.sleep(30)
        if config.reset_interval == "none":
            continue
        nxt = _next_reset_time(config.reset_interval, _last_reset)
        if nxt and datetime.now() >= nxt:
            await _do_reset()


# ---------------------------------------------------------------------------
# Log watcher background task
# ---------------------------------------------------------------------------

async def _reload_tail() -> None:
    global _watcher_reset_to
    store.entries.clear()
    store.reset_counters()

    lines = tail_file(config.log_file, config.tail_lines)
    store.log_file_error = "" if lines else f"Log file not found or empty: {config.log_file}"

    for line in lines:
        entry = parse_line(line)
        if entry is None or _is_ignored(entry.ip):
            continue
        _enrich(entry)
        store.add_entry(entry)

    _recompute_heavy_users()
    for e in store.entries:
        e.is_heavy_user = e.ip in store.heavy_user_ips

    try:
        _watcher_reset_to = os.path.getsize(config.log_file)
    except OSError:
        _watcher_reset_to = 0

    recent = list(store.entries)[-200:]
    recent.reverse()
    await _broadcast({
        "type": "snapshot",
        "entries": [e.to_dict() for e in recent],
        "stats": store.stats(),
    })


async def _watch_log() -> None:
    global _watcher_reset_to
    last_pos: int = 0
    recompute_counter: int = 0

    while True:
        if _watcher_reset_to is not None:
            last_pos = _watcher_reset_to
            _watcher_reset_to = None
            recompute_counter = 0

        try:
            stat_result = os.stat(config.log_file)
            current_size = stat_result.st_size

            if current_size < last_pos:
                # Log was rotated
                last_pos = 0

            if current_size > last_pos:
                async with aiofiles.open(config.log_file, "r", errors="replace") as f:
                    await f.seek(last_pos)
                    new_content = await f.read()
                    last_pos = current_size

                new_entries = []
                for line in new_content.splitlines():
                    entry = parse_line(line)
                    if entry is None or _is_ignored(entry.ip):
                        continue
                    _enrich(entry)
                    _mark_heavy(entry)
                    store.add_entry(entry)
                    new_entries.append(entry)

                if new_entries:
                    recompute_counter += len(new_entries)
                    if recompute_counter >= 100:
                        _recompute_heavy_users()
                        recompute_counter = 0

                    await _broadcast({
                        "type": "new_entries",
                        "entries": [e.to_dict() for e in new_entries[-50:]],
                        "stats": store.stats(),
                    })

            store.log_file_error = ""

        except FileNotFoundError:
            store.log_file_error = f"Log file not found: {config.log_file}"
        except PermissionError:
            store.log_file_error = f"Permission denied: {config.log_file}"
        except Exception as exc:
            store.log_file_error = str(exc)

        await asyncio.sleep(config.refresh_interval)


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load initial tail
    lines = tail_file(config.log_file, config.tail_lines)
    store.log_file_error = "" if lines else (
        f"Log file not found or empty: {config.log_file}"
    )

    for line in lines:
        entry = parse_line(line)
        if entry is None or _is_ignored(entry.ip):
            continue
        _enrich(entry)
        store.add_entry(entry)

    _recompute_heavy_users()
    for e in store.entries:
        e.is_heavy_user = e.ip in store.heavy_user_ips

    # Track where the file is now, so the watcher does not re-read (and
    # double-count) the lines the initial tail already loaded.
    global _watcher_reset_to
    try:
        _watcher_reset_to = os.path.getsize(config.log_file)
    except OSError:
        _watcher_reset_to = 0

    watcher_task = asyncio.create_task(_watch_log())
    reset_task   = asyncio.create_task(_auto_reset_watcher())
    yield
    watcher_task.cancel()
    reset_task.cancel()


app = FastAPI(title="Apache Live Logs", lifespan=lifespan)
app.mount("/static", StaticFiles(directory="static"), name="static")


# ---------------------------------------------------------------------------
# HTTP routes
# ---------------------------------------------------------------------------

@app.get("/")
async def root():
    return FileResponse("static/index.html")


@app.get("/api/stats")
async def api_stats():
    return store.stats()


@app.get("/api/logs")
async def api_logs(
    tab: str = "all",
    limit: int = 200,
    offset: int = 0,
):
    entries = list(store.entries)
    entries.reverse()

    if tab == "humans":
        entries = [e for e in entries if not e.is_bot]
    elif tab == "bots":
        entries = [e for e in entries if e.is_bot]
    elif tab == "heavy":
        entries = [e for e in entries if e.is_heavy_user]

    total = len(entries)
    page = entries[offset: offset + limit]
    return {"total": total, "entries": [e.to_dict() for e in page]}


@app.get("/api/heavy-users")
async def api_heavy_users():
    heavy = {
        ip: {
            "ip": ip,
            "count": store.ip_counter[ip],
            "threshold": round(store.outlier_threshold, 1),
            **geo_lookup(ip),
            "is_bot": any(
                e.is_bot for e in store.entries if e.ip == ip
            ),
        }
        for ip in store.heavy_user_ips
    }
    result = sorted(heavy.values(), key=lambda x: x["count"], reverse=True)
    return {"users": result, "threshold": round(store.outlier_threshold, 1)}


@app.get("/api/ip-stats")
async def api_ip_stats(limit: int = 500):
    rows = []
    for ip, total in store.ip_counter.most_common(limit):
        bots = store.ip_bot_counter.get(ip, 0)
        geo = geo_lookup(ip)
        rows.append({
            "ip": ip,
            "total": total,
            "bots": bots,
            "humans": total - bots,
            "is_heavy_user": ip in store.heavy_user_ips,
            "country_code": geo["country_code"],
            "country_name": geo["country_name"],
        })
    return {
        "ips": rows,
        "threshold": round(store.outlier_threshold, 1),
        "unique_ips": len(store.ip_counter),
    }


@app.get("/api/url-stats")
async def api_url_stats(
    group: str = "path",
    q: str = "",
    limit: int = 500,
):
    return aggregate_urls(
        store.url_counter,
        store.url_bot_counter,
        store.url_error_counter,
        group=group,
        query=q,
        limit=limit,
    )


@app.get("/api/ua-stats")
async def api_ua_stats(
    group: str = "full",
    q: str = "",
    limit: int = 500,
    bots_only: bool = False,
    min_requests: int = 1,
    no_referer_only: bool = False,
    signature_only: bool = False,
    min_signature_share: float = 0.0,
):
    report = aggregate_uas(
        store.ua_counter,
        store.ua_bot_counter,
        store.ua_ips,
        group=group,
        query=q,
        limit=limit,
        bots_only=bots_only,
        min_requests=min_requests,
        ip_cap=MAX_IPS_PER_UA,
        ua_noref_counter=store.ua_noref_counter,
        ua_sig_counter=store.ua_sig_counter,
        ua_sig_ips=store.ua_sig_ips,
        no_referer_only=no_referer_only,
        signature_only=signature_only,
        min_signature_share=min_signature_share,
    )
    report["signature_paths"] = list(config.signature_paths)
    for row in report["user_agents"]:
        info = get_bot_info(row["sample"])
        row["rule_id"] = info["rule_id"]
        row["rule_name"] = info["rule_name"]
    return report


@app.get("/api/domain-stats")
async def api_domain_stats(
    source: str = "referer",
    q: str = "",
    limit: int = 500,
    exclude_blocked: bool = False,
):
    src = "url" if source == "url" else "referer"
    scope = "unblocked" if exclude_blocked else "all"
    counters = store.domain_counters[src][scope]
    report = aggregate_domains(
        counters["total"],
        counters["bots"],
        counters["errors"],
        source=src,
        query=q,
        limit=limit,
    )
    report["scope"] = scope
    return report


@app.get("/api/geo-stats")
async def api_geo_stats():
    countries = []
    bot_by_country: Counter = Counter()
    for e in store.entries:
        if e.is_bot:
            bot_by_country[e.country_code] += 1

    for code, count in store.country_counter.most_common(50):
        name = geo_lookup.__wrapped__(code) if hasattr(geo_lookup, "__wrapped__") else {}
        # Resolve name from cache via a lookup on the first entry matching
        entry_match = next(
            (e for e in store.entries if e.country_code == code), None
        )
        countries.append({
            "code": code,
            "name": entry_match.country_name if entry_match else code,
            "count": count,
            "bots": bot_by_country.get(code, 0),
        })
    return {"countries": countries}


@app.get("/api/bot-rules")
async def api_bot_rules():
    rules = [
        {
            **rule.to_dict(),
            "hits": store.rule_hit_counter.get(rule.id, 0),
            "library_available": _HAS_UA_LIB if rule.id == "ua_library" else None,
        }
        for rule in get_rules()
    ]
    return {
        "rules": rules,
        "total_bots": store.bots,
        "ua_library_available": _HAS_UA_LIB,
    }


@app.patch("/api/bot-rules/{rule_id}")
async def api_bot_rules_update(rule_id: str, body: dict):
    rule = update_rule(
        rule_id,
        enabled=body.get("enabled"),
        pattern=body.get("pattern"),
    )
    if rule is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"rule": rule.to_dict()}


@app.post("/api/bot-rules")
async def api_bot_rules_add(body: dict):
    name        = str(body.get("name", "")).strip()
    description = str(body.get("description", "")).strip()
    pattern     = str(body.get("pattern", "")).strip()
    if not name or not pattern:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="name and pattern are required")
    rule = add_custom_rule(name, description, pattern)
    return {"rule": rule.to_dict()}


@app.delete("/api/bot-rules/{rule_id}")
async def api_bot_rules_delete(rule_id: str):
    ok = delete_custom_rule(rule_id)
    if not ok:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Custom rule not found or not deletable")
    return {"deleted": rule_id}


@app.get("/api/bot-rules/test")
async def api_bot_rules_test(ua: str = ""):
    return test_ua(ua)


@app.get("/api/config")
async def api_config():
    return {
        "log_file": config.log_file,
        "tail_lines": config.tail_lines,
        "heavy_usage_iqr_multiplier": config.heavy_usage_iqr_multiplier,
        "heavy_usage_min_requests": config.heavy_usage_min_requests,
        "refresh_interval": config.refresh_interval,
        "ignore_ips": config.ignore_ips,
        "reset_interval": config.reset_interval,
        "next_reset_at": _get_next_reset_iso(),
        "signature_paths": config.signature_paths,
    }


@app.patch("/api/config")
async def api_config_update(body: dict):
    if "reset_interval" in body:
        val = str(body["reset_interval"]).lower()
        if val not in ("none", "daily", "monthly", "yearly"):
            from fastapi import HTTPException
            raise HTTPException(status_code=422, detail="reset_interval must be none, daily, monthly, or yearly")
        config.reset_interval = val
        return {
            "reset_interval": config.reset_interval,
            "next_reset_at": _get_next_reset_iso(),
        }

    if "signature_paths" in body:
        raw = body["signature_paths"]
        vals = raw if isinstance(raw, list) else str(raw).split(",")
        paths = [str(p).strip() for p in vals if str(p).strip()]
        if not paths:
            from fastapi import HTTPException
            raise HTTPException(status_code=422, detail="signature_paths must not be empty")
        config.signature_paths = paths
        # Signature counts are accumulated at ingest, so the tail has to be
        # replayed for the new paths to take effect.
        await _reload_tail()
        return {"signature_paths": config.signature_paths}

    if "tail_lines" in body:
        val = int(body["tail_lines"])
        if val < 1:
            from fastapi import HTTPException
            raise HTTPException(status_code=422, detail="tail_lines must be >= 1")
        config.tail_lines = val
        await _reload_tail()
        return {"tail_lines": config.tail_lines}

    changed = False

    if "heavy_usage_iqr_multiplier" in body:
        val = float(body["heavy_usage_iqr_multiplier"])
        if val <= 0:
            from fastapi import HTTPException
            raise HTTPException(status_code=422, detail="iqr_multiplier must be > 0")
        config.heavy_usage_iqr_multiplier = val
        changed = True

    if "heavy_usage_min_requests" in body:
        val = int(body["heavy_usage_min_requests"])
        if val < 1:
            from fastapi import HTTPException
            raise HTTPException(status_code=422, detail="min_requests must be >= 1")
        config.heavy_usage_min_requests = val
        changed = True

    if changed:
        _recompute_heavy_users()
        for e in store.entries:
            e.is_heavy_user = e.ip in store.heavy_user_ips
        await _broadcast({"type": "stats_update", "stats": store.stats()})

    return {
        "heavy_usage_iqr_multiplier": config.heavy_usage_iqr_multiplier,
        "heavy_usage_min_requests": config.heavy_usage_min_requests,
        "outlier_threshold": round(store.outlier_threshold, 1),
        "heavy_users": len(store.heavy_user_ips),
    }


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.add(websocket)
    try:
        # Send initial snapshot
        recent = list(store.entries)[-200:]
        recent.reverse()
        await websocket.send_text(json.dumps({
            "type": "snapshot",
            "entries": [e.to_dict() for e in recent],
            "stats": store.stats(),
        }))
        # Keep connection alive
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        connected_clients.discard(websocket)

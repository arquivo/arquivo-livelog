# Arquivo.pt Live Log Analysis

Real-time web dashboard for Apache access logs. Tails a log file, enriches each entry with GeoIP data, classifies requests as bot or human, and flags outlier IPs (heavy users) using IQR-based statistical detection.

---

## Features

- **Live tail** — streams new log entries via WebSocket as they arrive; configurable tail window (default 50 000 lines)
- **Bot detection** — classifies each request using the `user-agents` library with a regex fallback covering search engines, SEO tools, social preview bots, and HTTP scripting tools; empty/dash user-agents are always bots
- **Bot rules management** — view, toggle, and edit every detection rule from the dashboard; add custom regex rules or delete rules you no longer need; test any user-agent string interactively
- **GeoIP enrichment** — resolves every IP to country using `geoip2fast` (offline, no API key required)
- **Heavy user detection** — identifies outlier IPs with the IQR method; threshold adapts automatically to the traffic mix and can be adjusted live from the dashboard
- **Requests per IP** — sortable table of every IP with human/bot split and outlier flag
- **Localhost ignored** — configurable list of IPs excluded from all views and statistics
- **Auto reset** — schedule automatic stats/entry clearing on a daily, monthly, or yearly cycle; configurable live from the **Auto Reset** ⚙ card in the stats strip
- **Seven views** — All Traffic · Humans · Bots · Heavy Users · Geo Stats · Requests per IP · Bot Rules
- **Arquivo.pt design** — institutional navy/white colour scheme, Roboto font

---

## Quick start

### Without Docker

```bash
# 1. Create venv and install dependencies
uv venv .venv
uv pip install --python .venv/bin/python -r requirements.txt

# 2. Generate a synthetic demo log (optional)
.venv/bin/python tests/generate_test_log.py /tmp/test.log 5000

# 3. Start the server
LOG_FILE=/tmp/test.log .venv/bin/uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000

### With Docker (demo mode — no real log needed)

```bash
docker compose build
docker compose up
```

The container auto-generates a synthetic log when `LOG_FILE` does not exist or is empty.

### With Docker (real Apache log)

```bash
LOG_DIR=/var/log/apache2 LOG_FILENAME=access.log docker compose up
```

### Tailing logs from multiple remote servers

`arquivo-livelog` only reads a single local file, so to watch several servers at once, merge
their logs locally first with [`scripts/tail_remote_logs.sh`](scripts/tail_remote_logs.sh) — it
opens an `ssh tail -f` per host and appends everything into one file (respawning the tails at
midnight, since the remote files are date-suffixed):

```bash
./scripts/tail_remote_logs.sh --server server1.arquivo.pt,server2.arquivo.pt --out /tmp/arquivo-livelog-merged.log
```

Then, in another terminal, point the app at the merged file:

```bash
LOG_DIR=/tmp/ LOG_FILENAME=arquivo-livelog-merged.log docker compose up --build
```

Open http://localhost:8000/

---

## Configuration

All settings are controlled via environment variables.

| Variable | Default | Description |
|---|---|---|
| `LOG_FILE` | `/var/log/apache2/access.log` | Absolute path to the Apache access log |
| `TAIL_LINES` | `50000` | Lines to read from the end of the file on startup |
| `HEAVY_USAGE_IQR_MULTIPLIER` | `1.5` | IQR multiplier for the outlier threshold (lower = stricter) |
| `HEAVY_USAGE_MIN_REQUESTS` | `10` | Minimum requests an IP must have to qualify as a heavy user |
| `REFRESH_INTERVAL` | `2.0` | Seconds between file-poll cycles |
| `MAX_DISPLAY_ENTRIES` | `10000` | Maximum entries kept in the in-memory deque |
| `IGNORE_IPS` | `127.0.0.1,::1,0:0:0:0:0:0:0:1` | Comma-separated IPs to exclude entirely |
| `RESET_INTERVAL` | `none` | Auto-reset schedule: `none` · `daily` · `monthly` · `yearly` |
| `PORT` | `8000` | Uvicorn listen port |

`HEAVY_USAGE_IQR_MULTIPLIER` and `HEAVY_USAGE_MIN_REQUESTS` can also be changed at runtime from the **Outlier Threshold** card on the dashboard — changes take effect immediately and are broadcast to all connected clients.

`TAIL_LINES` can also be changed at runtime from the **Lines Loaded** ⚙ card in the stats strip — the server re-reads the last N lines from the log file, resets the in-memory store, and broadcasts a fresh snapshot to all connected clients.

`RESET_INTERVAL` can also be changed at runtime from the **Auto Reset** ⚙ card in the stats strip — the next reset time is computed immediately and shown in the popover.

In `docker-compose.yml` you can also set `APP_PORT` (host-side port mapping) and `LOG_DIR` / `LOG_FILENAME` to mount a host log directory.

---

## Log format

Expects the Apache **Combined Log Format**:

```
%h %l %u %t "%r" %>s %O "%{Referer}i" "%{User-Agent}i"
```

Common Log Format (without `Referer` and `User-Agent` fields) is also accepted; those fields will be empty.

---

## Bot detection rules

Seven built-in rules are evaluated in order for each request:

| Rule | What it matches |
|---|---|
| **Empty / Dash User-Agent** | Missing UA or literal `-`; always a bot |
| **Search Engine Crawlers** | Googlebot, Bingbot, Slurp, Baiduspider, Yandexbot, DuckDuckBot, Sogou, Exabot |
| **SEO Analysis Tools** | SemrushBot, AhrefsBot, MJ12Bot, DotBot |
| **Social Media Link Previews** | FacebookExternalHit, Twitterbot, LinkedInBot, WhatsApp, BingPreview, ia_archiver |
| **HTTP Clients & Scripting Tools** | curl, wget, python-requests, python-urllib, Go http.Client, Java, Ruby, Perl, PHP, libwww, Scrapy, Axios |
| **Generic Crawler Keywords** | Any UA containing `bot`, `crawl`, `spider`, or `scraper` |
| **user-agents Library** | ua-parser database catch-all (requires `user-agents` package) |

Rules can be toggled on/off, their regex patterns can be edited inline, and custom rules can be added or deleted — all without restarting the server.

---

## API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Dashboard (HTML) |
| `GET` | `/api/stats` | Summary counts and active configuration |
| `GET` | `/api/logs` | Paginated log entries (`?tab=all\|humans\|bots\|heavy&limit=200&offset=0`) |
| `GET` | `/api/heavy-users` | Outlier IPs with request counts and threshold |
| `GET` | `/api/ip-stats` | All IPs sorted by request count (`?limit=500`), with human/bot split |
| `GET` | `/api/geo-stats` | Country breakdown (top 50) |
| `GET` | `/api/bot-rules` | All bot detection rules with hit counts |
| `PATCH` | `/api/bot-rules/{id}` | Enable/disable a rule or update its regex pattern |
| `POST` | `/api/bot-rules` | Add a custom rule (`{name, description, pattern}`) |
| `DELETE` | `/api/bot-rules/{id}` | Delete a custom rule |
| `GET` | `/api/bot-rules/test` | Test a user-agent string (`?ua=...`) |
| `GET` | `/api/config` | Active configuration values |
| `PATCH` | `/api/config` | Update `heavy_usage_iqr_multiplier`, `heavy_usage_min_requests`, `tail_lines`, or `reset_interval` live |
| `WS` | `/ws` | Live stream of new entries |

WebSocket messages sent by the server:

```json
{ "type": "snapshot",     "entries": [...], "stats": {...} }
{ "type": "new_entries",  "entries": [...], "stats": {...} }
{ "type": "stats_update", "stats": {...} }
```

`stats_update` is sent when the outlier threshold is changed via `PATCH /api/config`, so all connected clients update their Heavy Users count and threshold display simultaneously.

`snapshot` is sent when `tail_lines` is changed, triggering a full re-render of all traffic views across all connected clients.

---

## Heavy user detection

Request counts per IP are collected across the entire tail window. The outlier threshold is:

```
threshold           = Q3 + IQR_MULTIPLIER × IQR
effective_threshold = max(threshold, HEAVY_USAGE_MIN_REQUESTS)
```

IPs whose count exceeds `effective_threshold` appear in the **Heavy Users** tab and are flagged in all traffic views. The threshold is recomputed every 100 new entries and whenever the multiplier or floor is changed from the dashboard.

---

## BDD test suite

The project uses [behave](https://behave.readthedocs.io/) for BDD-style acceptance tests written in Gherkin.

### Run locally

```bash
uv pip install --python .venv/bin/python behave

# Generate test data
.venv/bin/python tests/generate_test_log.py /tmp/test.log 2000

# Run the full suite
LOG_FILE=/tmp/test.log .venv/bin/behave features/
```

Expected output: **7 features · 72 scenarios · 277 steps — all passing**.

### Run via Docker

```bash
docker compose --profile test run bdd-tests
```

### Features covered

| Feature file | Scenarios |
|---|---|
| `log_parsing.feature` | Combined Log Format parsing, dash-size lines, malformed lines, `tail_file()` behaviour |
| `bot_detection.feature` | Known bots (Googlebot, curl, python-requests, Scrapy, SemrushBot, AhrefsBot), human browsers, empty UA |
| `geoip.feature` | Public IP resolution, private IPs, invalid IPs, required result fields |
| `outlier_detection.feature` | IQR outlier detection, similar-count baseline, min-requests floor, fewer-than-4 IPs edge case, configurable multiplier |
| `bot_rules.feature` | Custom rule add/toggle/delete/edit, `get_bot_info`, `test_ua` |
| `live_config.feature` | `tail_lines` mutability, reduced/exceeded tail window, live change applied to subsequent reads |
| `auto_reset.feature` | `reset_interval` config field, next-reset timing for all intervals, December→January wrap, store counter reset |

---

## Project structure

```
├── app/
│   ├── config.py           # Environment-variable configuration (mutable at runtime)
│   ├── log_parser.py       # Apache Combined Log Format regex + tail_file()
│   ├── bot_detector.py     # BotRule dataclass, rule CRUD, LRU-cached classification
│   ├── geo_ip.py           # geoip2fast wrapper (LRU-cached, offline)
│   ├── outlier_detector.py # IQR-based heavy-user detection
│   ├── reset_scheduler.py  # next_reset_time() pure function for auto-reset timing
│   └── main.py             # FastAPI app, WebSocket broadcast, background file watcher
├── static/
│   ├── index.html          # Single-page dashboard (seven tabs)
│   ├── style.css           # Arquivo.pt colour scheme (navy/white)
│   └── app.js              # WebSocket client, tab rendering, bot rule editing
├── features/
│   ├── *.feature           # Gherkin specifications
│   ├── environment.py      # Behave bootstrap
│   └── steps/              # Step definitions
├── tests/
│   └── generate_test_log.py  # Synthetic Apache log generator
├── Dockerfile
├── docker-compose.yml
├── docker-entrypoint.sh    # Auto-generates demo log if LOG_FILE is missing
└── requirements.txt
```

---

## Stack

- **Python 3.12** · FastAPI · Uvicorn · WebSockets · aiofiles
- **geoip2fast** — offline GeoIP with bundled database
- **user-agents** — UA parsing for bot/human classification
- **behave** — BDD test runner (Gherkin)
- **Docker** + docker-compose

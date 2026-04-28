"""
Agent 3 helper: generates a realistic synthetic Apache log file for testing.
Usage: python tests/generate_test_log.py [output_path] [num_lines]
"""
import os
import random
import sys
from datetime import datetime, timedelta, timezone

HUMAN_UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/112.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/109.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Android 12; Mobile) AppleWebKit/537.36 Chrome/112.0 Mobile Safari/537.36",
]

BOT_UAS = [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; Bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "curl/7.68.0",
    "python-requests/2.28.0",
    "Mozilla/5.0 (compatible; SemrushBot/7.0; +http://www.semrush.com/bot.html)",
    "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
]

PATHS = [
    "/", "/index.html", "/about", "/contact", "/products", "/blog",
    "/api/v1/users", "/api/v1/orders", "/static/main.css", "/static/app.js",
    "/images/logo.png", "/favicon.ico", "/robots.txt", "/sitemap.xml",
]

STATUSES = [200] * 70 + [301, 302] * 10 + [404] * 10 + [500] * 3 + [403] * 5 + [206] * 2

PUBLIC_IPS = [
    "8.8.8.8", "1.1.1.1", "185.220.101.1", "91.108.4.1", "104.244.42.1",
    "31.13.64.1", "172.217.1.1", "151.101.1.1", "198.41.0.1", "13.107.42.1",
    "52.94.236.248", "54.239.28.85", "205.251.242.103", "64.233.160.1",
    "66.249.64.1", "66.249.65.1", "74.125.224.1", "142.250.1.1",
]

HEAVY_IPS = ["203.0.113.42", "198.51.100.99"]  # outlier IPs
LOCALHOST_IPS = ["127.0.0.1", "::1"]


def random_ip(is_heavy: bool, is_bot: bool) -> str:
    if is_heavy:
        return random.choice(HEAVY_IPS)
    r = random.random()
    if r < 0.02:
        return random.choice(LOCALHOST_IPS)
    if r < 0.15:
        return f"192.168.{random.randint(0,2)}.{random.randint(1,254)}"
    return random.choice(PUBLIC_IPS)


def fmt_time(dt: datetime) -> str:
    return dt.strftime("%d/%b/%Y:%H:%M:%S %z")


def generate(output_path: str, num_lines: int) -> None:
    now = datetime.now(tz=timezone.utc)
    start = now - timedelta(hours=24)

    with open(output_path, "w") as f:
        for i in range(num_lines):
            ts = start + timedelta(seconds=random.randint(0, 86400))
            is_heavy = random.random() < 0.02
            is_bot = random.random() < 0.25
            ip = random_ip(is_heavy, is_bot)
            ua = random.choice(BOT_UAS if is_bot else HUMAN_UAS)
            path = random.choice(PATHS)
            method = "GET" if random.random() < 0.85 else random.choice(["POST", "PUT", "DELETE"])
            status = random.choice(STATUSES)
            size = random.randint(0, 50000) if status not in (301, 302) else 0
            referer = random.choice(["-", "https://google.com/", "https://example.com/"])
            line = (
                f'{ip} - - [{fmt_time(ts)}] '
                f'"{method} {path} HTTP/1.1" {status} {size} '
                f'"{referer}" "{ua}"\n'
            )
            f.write(line)

    # Inject many requests from heavy IPs to ensure they are genuine outliers
    with open(output_path, "a") as f:
        for ip in HEAVY_IPS:
            for _ in range(500):
                ts = now - timedelta(seconds=random.randint(0, 3600))
                f.write(
                    f'{ip} - - [{fmt_time(ts)}] '
                    f'"GET /api/v1/users HTTP/1.1" 200 1024 '
                    f'"-" "python-requests/2.28.0"\n'
                )

    print(f"Generated {num_lines + len(HEAVY_IPS) * 500} lines → {output_path}")


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/test_access.log"
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 5000
    generate(out, n)

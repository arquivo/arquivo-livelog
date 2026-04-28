import os
from dataclasses import dataclass, field
from typing import List


@dataclass
class Config:
    log_file: str = os.environ.get("LOG_FILE", "/var/log/apache2/access.log")
    tail_lines: int = int(os.environ.get("TAIL_LINES", 50_000))
    reset_interval: str = os.environ.get("RESET_INTERVAL", "none")
    heavy_usage_iqr_multiplier: float = float(os.environ.get("HEAVY_USAGE_IQR_MULTIPLIER", 1.5))
    heavy_usage_min_requests: int = int(os.environ.get("HEAVY_USAGE_MIN_REQUESTS", 10))
    refresh_interval: float = float(os.environ.get("REFRESH_INTERVAL", "2.0"))
    max_display_entries: int = int(os.environ.get("MAX_DISPLAY_ENTRIES", 10_000))
    ignore_ips: List[str] = field(
        default_factory=lambda: [
            ip.strip()
            for ip in os.environ.get(
                "IGNORE_IPS", "127.0.0.1,::1,0:0:0:0:0:0:0:1,localhost"
            ).split(",")
        ]
    )


config = Config()

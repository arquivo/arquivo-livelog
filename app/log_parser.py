import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

COMBINED_LOG_RE = re.compile(
    r'(?P<ip>\S+)'
    r' \S+ \S+'
    r' \[(?P<time>[^\]]+)\]'
    r' "(?P<request>[^"]*)"'
    r' (?P<status>\d+)'
    r' (?P<size>\S+)'
    r'(?: "(?P<referer>[^"]*)" "(?P<user_agent>[^"]*)")?'
    # %D (microseconds) and the ARQUIVO_BLOCK env var, both appended by the
    # arquivo vhost's combinedreqtime format. Optional: other formats omit them.
    r'(?:\s+(?P<duration>\d+))?'
    r'(?:\s+(?P<block_reason>\S+))?'
)


@dataclass
class LogEntry:
    ip: str
    time: datetime
    method: str
    path: str
    status: int
    size: int
    referer: str
    user_agent: str
    is_bot: bool = False
    country_code: str = "??"
    country_name: str = "Unknown"
    is_heavy_user: bool = False
    duration_us: int = 0
    # Which access rule produced a 403, from %{ARQUIVO_BLOCK}e. Empty when the
    # request was served, or when the log format does not carry the field.
    block_reason: str = ""

    def to_dict(self) -> dict:
        return {
            "ip": self.ip,
            "time": self.time.isoformat(),
            "method": self.method,
            "path": self.path,
            "status": self.status,
            "size": self.size,
            "referer": self.referer,
            "user_agent": self.user_agent,
            "is_bot": self.is_bot,
            "country_code": self.country_code,
            "country_name": self.country_name,
            "is_heavy_user": self.is_heavy_user,
            "duration_us": self.duration_us,
            "block_reason": self.block_reason,
        }


def parse_line(line: str) -> Optional[LogEntry]:
    line = line.strip()
    if not line:
        return None

    m = COMBINED_LOG_RE.match(line)
    if not m:
        return None

    try:
        time_str = m.group("time")
        parsed_time = datetime.strptime(time_str, "%d/%b/%Y:%H:%M:%S %z")
    except ValueError:
        parsed_time = datetime.now(tz=timezone.utc)

    request = m.group("request") or ""
    parts = request.split(" ", 2)
    method = parts[0] if len(parts) > 0 else "-"
    path = parts[1] if len(parts) > 1 else "-"

    size_str = m.group("size") or "-"
    size = int(size_str) if size_str.isdigit() else 0

    return LogEntry(
        ip=m.group("ip"),
        time=parsed_time,
        method=method,
        path=path,
        status=int(m.group("status")),
        size=size,
        duration_us=int(m.group("duration") or 0),
        block_reason=(lambda r: "" if not r or r == "-" else r)(m.group("block_reason")),
        referer=m.group("referer") or "",
        user_agent=m.group("user_agent") or "",
    )


def tail_file(filepath: str, n: int) -> list[str]:
    """Return the last n lines of a file without loading the whole file into memory."""
    try:
        with open(filepath, "rb") as f:
            f.seek(0, 2)
            file_size = f.tell()
            if file_size == 0:
                return []

            chunk_size = 65536
            blocks: list[bytes] = []
            pos = file_size
            newline_count = 0

            while pos > 0 and newline_count < n + 1:
                read_size = min(chunk_size, pos)
                pos -= read_size
                f.seek(pos)
                block = f.read(read_size)
                blocks.insert(0, block)
                newline_count += block.count(b"\n")

            content = b"".join(blocks).decode("utf-8", errors="replace")
            lines = content.split("\n")
            if lines and lines[-1] == "":
                lines = lines[:-1]

            return lines[-n:] if len(lines) > n else lines
    except (FileNotFoundError, PermissionError):
        return []

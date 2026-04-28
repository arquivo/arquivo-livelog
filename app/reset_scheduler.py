from datetime import datetime, timedelta


def next_reset_time(interval: str, from_time: datetime) -> datetime | None:
    """Return the next wall-clock reset instant for *interval*, or None for 'none'."""
    if interval == "daily":
        return (from_time + timedelta(days=1)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
    if interval == "monthly":
        if from_time.month == 12:
            return from_time.replace(
                year=from_time.year + 1, month=1, day=1,
                hour=0, minute=0, second=0, microsecond=0,
            )
        return from_time.replace(
            month=from_time.month + 1, day=1,
            hour=0, minute=0, second=0, microsecond=0,
        )
    if interval == "yearly":
        return from_time.replace(
            year=from_time.year + 1, month=1, day=1,
            hour=0, minute=0, second=0, microsecond=0,
        )
    return None

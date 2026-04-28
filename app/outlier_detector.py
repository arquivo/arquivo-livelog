from collections import Counter
from typing import Set


def find_heavy_users(
    ip_counter: Counter,
    iqr_multiplier: float = 1.5,
    min_requests: int = 10,
) -> Set[str]:
    """
    Identify outlier IPs using the IQR (interquartile range) method.
    An IP is a heavy user when its request count exceeds Q3 + iqr_multiplier * IQR
    AND meets the minimum requests threshold.
    """
    counts = list(ip_counter.values())
    if len(counts) < 4:
        return set()

    sorted_counts = sorted(counts)
    n = len(sorted_counts)
    q1 = sorted_counts[n // 4]
    q3 = sorted_counts[(3 * n) // 4]
    iqr = q3 - q1

    threshold = q3 + iqr_multiplier * iqr
    effective_threshold = max(threshold, min_requests)

    return {ip for ip, count in ip_counter.items() if count > effective_threshold}


def compute_threshold(
    ip_counter: Counter,
    iqr_multiplier: float = 1.5,
    min_requests: int = 10,
) -> float:
    counts = list(ip_counter.values())
    if len(counts) < 4:
        return float(min_requests)

    sorted_counts = sorted(counts)
    n = len(sorted_counts)
    q1 = sorted_counts[n // 4]
    q3 = sorted_counts[(3 * n) // 4]
    iqr = q3 - q1
    threshold = q3 + iqr_multiplier * iqr
    return max(threshold, min_requests)

from collections import Counter
from datetime import datetime

from behave import given, then, when

from app.config import Config
from app.reset_scheduler import next_reset_time


# ── Config field steps ────────────────────────────────────────────────────────

@given("a fresh Config object")
def step_fresh_config(context):
    context.cfg = Config()


@when('I set reset_interval to "{interval}"')
def step_set_reset_interval(context, interval):
    context.cfg.reset_interval = interval


@then('the config reset_interval should be "{expected}"')
def step_check_reset_interval(context, expected):
    assert context.cfg.reset_interval == expected, (
        f"Expected reset_interval={expected!r}, got {context.cfg.reset_interval!r}"
    )


# ── Timing logic steps ────────────────────────────────────────────────────────

@given('a reference time of "{dt_str}"')
def step_set_reference_time(context, dt_str):
    context.ref_time = datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")


@when('I compute the next reset time for interval "{interval}"')
def step_compute_next_reset(context, interval):
    context.next_reset = next_reset_time(interval, context.ref_time)


@then('the next reset datetime should be "{dt_str}"')
def step_check_next_reset(context, dt_str):
    expected = datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")
    assert context.next_reset == expected, (
        f"Expected next reset {expected}, got {context.next_reset}"
    )


@then("there should be no next reset time")
def step_no_next_reset(context):
    assert context.next_reset is None, (
        f"Expected None, got {context.next_reset}"
    )


@then("the next reset time is in the past")
def step_reset_time_in_past(context):
    assert datetime.now() >= context.next_reset, (
        f"Expected now ({datetime.now()}) >= next reset ({context.next_reset})"
    )


# ── Store reset steps ─────────────────────────────────────────────────────────

class _MinimalStore:
    """Minimal stand-in for Store to test reset_counters logic without importing main.py."""

    def __init__(self):
        from collections import deque
        self.entries = deque(maxlen=1000)
        self.ip_counter = Counter()
        self.ip_bot_counter = Counter()
        self.country_counter = Counter()
        self.rule_hit_counter = Counter()
        self.total = 0
        self.bots = 0
        self.humans = 0
        self.heavy_user_ips = set()

    def reset_counters(self):
        self.ip_counter.clear()
        self.ip_bot_counter.clear()
        self.country_counter.clear()
        self.rule_hit_counter.clear()
        self.total = 0
        self.bots = 0
        self.humans = 0
        self.heavy_user_ips = set()


@given("a Store with accumulated request counts")
def step_store_with_data(context):
    store = _MinimalStore()
    store.total = 10
    store.bots = 4
    store.humans = 6
    store.ip_counter = Counter({"1.1.1.1": 7, "2.2.2.2": 3})
    store.entries.append("dummy-entry-1")
    store.entries.append("dummy-entry-2")
    context.store = store


@when("I call reset_counters on the store")
def step_reset_counters(context):
    context.store.reset_counters()


@when("I clear the store entries")
def step_clear_entries(context):
    context.store.entries.clear()


@then("the store total should be {n:d}")
def step_check_store_total(context, n):
    assert context.store.total == n, (
        f"Expected total={n}, got {context.store.total}"
    )


@then("the store bots count should be {n:d}")
def step_check_store_bots(context, n):
    assert context.store.bots == n, (
        f"Expected bots={n}, got {context.store.bots}"
    )


@then("the store humans count should be {n:d}")
def step_check_store_humans(context, n):
    assert context.store.humans == n, (
        f"Expected humans={n}, got {context.store.humans}"
    )


@then("the store ip_counter should be empty")
def step_check_ip_counter_empty(context):
    assert len(context.store.ip_counter) == 0, (
        f"Expected empty ip_counter, got {dict(context.store.ip_counter)}"
    )


@then("the store entries should be empty")
def step_check_entries_empty(context):
    assert len(context.store.entries) == 0, (
        f"Expected empty entries, got {len(context.store.entries)} items"
    )

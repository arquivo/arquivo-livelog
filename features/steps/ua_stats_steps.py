from collections import Counter

from behave import given, then, when

from app.ua_stats import aggregate


def _counter_from_table(table, key="user_agent"):
    counter = Counter()
    for row in table:
        counter[row[key]] = int(row["count"])
    return counter


def _report(context, **kwargs):
    return aggregate(
        context.ua_counter,
        getattr(context, "ua_bot_counter", Counter()),
        getattr(context, "ua_ips", {}),
        **kwargs,
    )


@given("a User-Agent counter with the following counts:")
def step_ua_counter(context):
    context.ua_counter = _counter_from_table(context.table)
    context.ua_bot_counter = Counter()
    context.ua_ips = {}


@given("a User-Agent bot counter with the following counts:")
def step_ua_bot_counter(context):
    context.ua_bot_counter = _counter_from_table(context.table)


@given("the following User-Agent source IPs:")
def step_ua_ips(context):
    context.ua_ips = {
        row["user_agent"]: set(row["ips"].split(","))
        for row in context.table
    }


@when("I aggregate User-Agent statistics grouped by {group}")
def step_aggregate_grouped(context, group):
    context.report = _report(context, group=group)


@when("I aggregate User-Agent statistics for bots only")
def step_aggregate_bots_only(context):
    context.report = _report(context, group="token", bots_only=True)


@when("I aggregate User-Agent statistics with a minimum of {minimum:d} requests")
def step_aggregate_minimum(context, minimum):
    context.report = _report(context, group="token", min_requests=minimum)


@when('I aggregate User-Agent statistics filtered by "{query}"')
def step_aggregate_filtered(context, query):
    context.report = _report(context, group="token", query=query)


@then('the top User-Agent should be "{ua}" with {count:d} requests')
def step_top_ua(context, ua, count):
    top = context.report["user_agents"][0]
    assert top["user_agent"] == ua, f"Expected top User-Agent {ua!r}, got {top['user_agent']!r}"
    assert top["total"] == count, f"Expected {count} requests, got {top['total']}"


@then("the User-Agent report should contain {count:d} unique User-Agents")
def step_unique_uas(context, count):
    actual = context.report["unique_user_agents"]
    assert actual == count, f"Expected {count} unique User-Agents, got {actual}"


@then("the User-Agent report should list {count:d} User-Agents")
def step_listed_uas(context, count):
    actual = len(context.report["user_agents"])
    assert actual == count, f"Expected {count} listed User-Agents, got {actual}"


@then('the User-Agent "{ua}" should report {count:d} unique IPs')
def step_ua_unique_ips(context, ua, count):
    row = next((r for r in context.report["user_agents"] if r["user_agent"] == ua), None)
    assert row is not None, f"User-Agent {ua!r} not in report"
    assert row["unique_ips"] == count, f"Expected {count} unique IPs, got {row['unique_ips']}"


@when("I aggregate User-Agent statistics with an IP cap of {cap:d}")
def step_aggregate_ip_cap(context, cap):
    context.report = _report(context, group="token", ip_cap=cap)


@then('the User-Agent "{ua}" should be flagged as IP-capped')
def step_ua_capped(context, ua):
    row = next((r for r in context.report["user_agents"] if r["user_agent"] == ua), None)
    assert row is not None, f"User-Agent {ua!r} not in report"
    assert row["ips_capped"], f"Expected {ua!r} to be flagged as IP-capped"


@then('the User-Agent "{ua}" should not be flagged as IP-capped')
def step_ua_not_capped(context, ua):
    row = next((r for r in context.report["user_agents"] if r["user_agent"] == ua), None)
    assert row is not None, f"User-Agent {ua!r} not in report"
    assert not row["ips_capped"], f"Expected {ua!r} not to be flagged as IP-capped"


# ── Signature aggregation (UA + no Referer + configured path) ──────────────

@given("the following User-Agent no-referer counts:")
def step_ua_noref(context):
    context.ua_noref_counter = _counter_from_table(context.table)


@given("the following User-Agent signature counts:")
def step_ua_sig(context):
    context.ua_sig_counter = _counter_from_table(context.table)


def _sig_report(context, **kwargs):
    return aggregate(
        context.ua_counter,
        getattr(context, "ua_bot_counter", Counter()),
        getattr(context, "ua_ips", {}),
        ua_noref_counter=getattr(context, "ua_noref_counter", Counter()),
        ua_sig_counter=getattr(context, "ua_sig_counter", Counter()),
        ua_sig_ips=getattr(context, "ua_sig_ips", {}),
        **kwargs,
    )


@when("I aggregate User-Agent statistics with signature counts")
def step_aggregate_with_sig(context):
    context.report = _sig_report(context, group="full")


@when("I aggregate User-Agent statistics keeping only signature matches")
def step_aggregate_sig_only(context):
    context.report = _sig_report(context, group="full", signature_only=True)


@when("I aggregate User-Agent statistics with a minimum signature share of {share:d}%")
def step_aggregate_min_share(context, share):
    context.report = _sig_report(context, group="full", min_signature_share=float(share))


@when("I aggregate User-Agent statistics keeping only no-referer traffic")
def step_aggregate_noref_only(context):
    context.report = _sig_report(context, group="full", no_referer_only=True)


@then('the User-Agent "{ua}" should report {count:d} signature requests')
def step_ua_sig_count(context, ua, count):
    row = next((r for r in context.report["user_agents"] if r["user_agent"] == ua), None)
    assert row is not None, f"User-Agent {ua!r} not in report"
    assert row["signature"] == count, f"Expected {count} signature requests, got {row['signature']}"


@then('the User-Agent "{ua}" should report a signature share of {share:g}%')
def step_ua_sig_share(context, ua, share):
    row = next((r for r in context.report["user_agents"] if r["user_agent"] == ua), None)
    assert row is not None, f"User-Agent {ua!r} not in report"
    assert abs(row["signature_share"] - share) < 0.01, \
        f"Expected signature share {share}, got {row['signature_share']}"


@then('the User-Agent "{ua}" should report {count:d} no-referer requests')
def step_ua_noref_count(context, ua, count):
    row = next((r for r in context.report["user_agents"] if r["user_agent"] == ua), None)
    assert row is not None, f"User-Agent {ua!r} not in report"
    assert row["no_referer"] == count, f"Expected {count} no-referer requests, got {row['no_referer']}"

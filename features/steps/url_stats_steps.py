from collections import Counter

from behave import given, then, when

from app.url_stats import aggregate


def _counter_from_table(table, key="url"):
    counter = Counter()
    for row in table:
        counter[row[key]] = int(row["count"])
    return counter


@given("a URL counter with the following counts:")
def step_url_counter(context):
    context.url_counter = _counter_from_table(context.table)
    context.url_bot_counter = Counter()
    context.url_error_counter = Counter()


@given("a URL bot counter with the following counts:")
def step_url_bot_counter(context):
    context.url_bot_counter = _counter_from_table(context.table)


@when("I aggregate URL statistics grouped by {group}")
def step_aggregate_grouped(context, group):
    context.report = aggregate(
        context.url_counter,
        context.url_bot_counter,
        context.url_error_counter,
        group=group,
    )


@when('I aggregate URL statistics filtered by "{query}"')
def step_aggregate_filtered(context, query):
    context.report = aggregate(
        context.url_counter,
        context.url_bot_counter,
        context.url_error_counter,
        query=query,
    )


@then('the top URL should be "{url}" with {count:d} requests')
def step_top_url(context, url, count):
    top = context.report["urls"][0]
    assert top["url"] == url, f"Expected top URL {url!r}, got {top['url']!r}"
    assert top["total"] == count, f"Expected {count} requests, got {top['total']}"


@then("the URL report should contain {count:d} unique URLs")
def step_unique_urls(context, count):
    actual = context.report["unique_urls"]
    assert actual == count, f"Expected {count} unique URLs, got {actual}"


@then("the URL report should list {count:d} URLs")
def step_listed_urls(context, count):
    actual = len(context.report["urls"])
    assert actual == count, f"Expected {count} listed URLs, got {actual}"


@then('the URL "{url}" should show {bots:d} bot and {humans:d} human requests')
def step_url_split(context, url, bots, humans):
    row = next((r for r in context.report["urls"] if r["url"] == url), None)
    assert row is not None, f"URL {url!r} not in report"
    assert row["bots"] == bots, f"Expected {bots} bots, got {row['bots']}"
    assert row["humans"] == humans, f"Expected {humans} humans, got {row['humans']}"


@then('the URL "{url}" should have a share of {share:f} percent')
def step_url_share(context, url, share):
    row = next((r for r in context.report["urls"] if r["url"] == url), None)
    assert row is not None, f"URL {url!r} not in report"
    assert abs(row["share"] - share) < 0.01, f"Expected share {share}, got {row['share']}"

from collections import Counter

from behave import given, then, when

from app.domain_stats import aggregate, referer_domain, url_domain


def _counter_from_table(table):
    counter = Counter()
    for row in table:
        counter[row["domain"]] = int(row["count"])
    return counter


@when('I extract the referring domain from "{referer}"')
def step_extract_referer(context, referer):
    context.domain = referer_domain(referer)


@when('I extract the archived domain from "{path}"')
def step_extract_url_domain(context, path):
    context.domain = url_domain(path)


@then('the extracted domain should be "{expected}"')
def step_check_domain(context, expected):
    assert context.domain == expected, (
        f"Expected {expected!r}, got {context.domain!r}"
    )


@then("the extracted domain should be empty")
def step_check_domain_empty(context):
    assert context.domain == "", f"Expected empty domain, got {context.domain!r}"


@given("a domain counter with the following counts:")
def step_domain_counter(context):
    context.domain_counter = _counter_from_table(context.table)
    context.domain_bot_counter = Counter()
    context.domain_error_counter = Counter()


@given("a domain bot counter with the following counts:")
def step_domain_bot_counter(context):
    context.domain_bot_counter = _counter_from_table(context.table)


@given("a domain error counter with the following counts:")
def step_domain_error_counter(context):
    context.domain_error_counter = _counter_from_table(context.table)


@when('I aggregate domain statistics for source "{source}"')
def step_aggregate_domains(context, source):
    context.report = aggregate(
        context.domain_counter,
        context.domain_bot_counter,
        context.domain_error_counter,
        source=source,
    )


@then('the top domain should be "{domain}" with {count:d} requests')
def step_top_domain(context, domain, count):
    top = context.report["domains"][0]
    assert top["domain"] == domain, f"Expected top domain {domain!r}, got {top['domain']!r}"
    assert top["total"] == count, f"Expected {count} requests, got {top['total']}"


@then("the domain report should contain {count:d} unique domains")
def step_unique_domains(context, count):
    actual = context.report["unique_domains"]
    assert actual == count, f"Expected {count} unique domains, got {actual}"


@then('the domain "{domain}" should show {bots:d} bot and {humans:d} human requests')
def step_domain_split(context, domain, bots, humans):
    row = next((r for r in context.report["domains"] if r["domain"] == domain), None)
    assert row is not None, f"Domain {domain!r} not in report"
    assert row["bots"] == bots, f"Expected {bots} bots, got {row['bots']}"
    assert row["humans"] == humans, f"Expected {humans} humans, got {row['humans']}"


@then('the domain "{domain}" should show {count:d} errors')
def step_domain_errors(context, domain, count):
    row = next((r for r in context.report["domains"] if r["domain"] == domain), None)
    assert row is not None, f"Domain {domain!r} not in report"
    assert row["errors"] == count, f"Expected {count} errors, got {row['errors']}"

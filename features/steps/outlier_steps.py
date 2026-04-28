from collections import Counter

from behave import given, then, when

from app.outlier_detector import compute_threshold, find_heavy_users


@given("a request counter with the following IP counts:")
def step_build_counter(context):
    context.ip_counter = Counter()
    for row in context.table:
        context.ip_counter[row["ip"]] = int(row["count"])


@when("I compute heavy users with IQR multiplier {mult:f} and min requests {min_req:d}")
def step_compute_heavy(context, mult, min_req):
    context.heavy_users = find_heavy_users(
        context.ip_counter,
        iqr_multiplier=mult,
        min_requests=min_req,
    )


@then('the heavy users set should contain "{ip}"')
def step_contains_ip(context, ip):
    assert ip in context.heavy_users, (
        f"Expected {ip!r} in heavy users, got {context.heavy_users}"
    )


@then('the heavy users set should not contain "{ip}"')
def step_not_contains_ip(context, ip):
    assert ip not in context.heavy_users, (
        f"Did not expect {ip!r} in heavy users, got {context.heavy_users}"
    )


@then("the heavy users set should be empty")
def step_empty_set(context):
    assert len(context.heavy_users) == 0, (
        f"Expected empty set, got {context.heavy_users}"
    )


@when("I compute the threshold with IQR multiplier {mult:f} and min requests {min_req:d}")
def step_compute_threshold(context, mult, min_req):
    context.threshold = compute_threshold(
        context.ip_counter,
        iqr_multiplier=mult,
        min_requests=min_req,
    )


@then("the threshold should be at least {floor}")
def step_threshold_at_least(context, floor):
    floor = float(floor)
    assert context.threshold >= floor, (
        f"Expected threshold >= {floor}, got {context.threshold}"
    )

from behave import given, then, when

from app.geo_ip import lookup


@given('the IP address "{ip}"')
def step_set_ip(context, ip):
    context.ip = ip
    context.geo_result = None
    context.exception = None


@when("I perform a GeoIP lookup")
def step_geo_lookup(context):
    try:
        context.geo_result = lookup(context.ip)
    except Exception as exc:
        context.exception = exc


@then('the country code should not be "{val}"')
def step_code_not(context, val):
    assert context.geo_result is not None
    assert context.geo_result["country_code"] != val, (
        f"country_code was {val!r} for IP {context.ip}"
    )


@then('the country name should not be "{val}"')
def step_name_not(context, val):
    assert context.geo_result is not None
    assert context.geo_result["country_name"] != val


@then("the lookup should not raise an exception")
def step_no_exception(context):
    assert context.exception is None, f"Unexpected exception: {context.exception}"


@then('the country code should be "{val}"')
def step_code_equals(context, val):
    assert context.geo_result is not None
    assert context.geo_result["country_code"] == val, (
        f"Expected {val!r}, got {context.geo_result['country_code']!r}"
    )


@then('the result contains "{key}"')
def step_result_has_key(context, key):
    assert context.geo_result is not None
    assert key in context.geo_result, f"Key {key!r} missing from result {context.geo_result}"

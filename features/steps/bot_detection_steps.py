from behave import given, then, when

from app.bot_detector import is_bot


@given('the user agent ""')
def step_set_ua_empty(context):
    context.user_agent = ""


@given('the user agent "{ua}"')
def step_set_ua(context, ua):
    context.user_agent = ua


@when("I check if it is a bot")
def step_check_bot(context):
    context.result = is_bot(context.user_agent)


@then("the result should be {expected}")
def step_assert_result(context, expected):
    expected_bool = expected.strip().lower() == "true"
    assert context.result is expected_bool, (
        f"Expected {expected_bool} for UA={context.user_agent!r}, got {context.result}"
    )

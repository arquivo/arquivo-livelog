from behave import given, then, when

from app.bot_detector import (
    add_custom_rule, delete_custom_rule, get_bot_info, get_rules,
    is_bot, test_ua, update_rule,
)


# ── get_bot_info ─────────────────────────────────────────────────────────────

@when("I call get_bot_info")
def step_call_get_bot_info(context):
    context.bot_info = get_bot_info(context.user_agent)


@then("the bot info should have is_bot {expected}")
def step_bot_info_is_bot(context, expected):
    expected_bool = expected.strip().lower() == "true"
    assert context.bot_info["is_bot"] is expected_bool, (
        f"Expected is_bot={expected_bool}, got {context.bot_info}"
    )


@then('the bot info rule_id should be "{expected}"')
def step_bot_info_rule_id(context, expected):
    assert context.bot_info["rule_id"] == expected, (
        f"Expected rule_id={expected!r}, got {context.bot_info['rule_id']!r}"
    )


@then("the bot info rule_id should be None")
def step_bot_info_rule_id_none(context):
    assert context.bot_info["rule_id"] is None, (
        f"Expected rule_id=None, got {context.bot_info['rule_id']!r}"
    )


@then("the bot info rule_name should not be empty")
def step_bot_info_rule_name_not_empty(context):
    name = context.bot_info.get("rule_name")
    assert name, f"Expected non-empty rule_name, got {name!r}"


# ── test_ua ──────────────────────────────────────────────────────────────────

@when("I call test_ua")
def step_call_test_ua(context):
    context.test_result = test_ua(context.user_agent)


@then("the test result is_bot should be {expected}")
def step_test_result_is_bot(context, expected):
    expected_bool = expected.strip().lower() == "true"
    assert context.test_result["is_bot"] is expected_bool, (
        f"Expected is_bot={expected_bool}, got {context.test_result}"
    )


@then("the test result matched_term should not be empty")
def step_test_result_matched_term_not_empty(context):
    term = context.test_result.get("matched_term")
    assert term, f"Expected a matched_term, got {term!r}"


@then("the test result matched_term should be None")
def step_test_result_matched_term_none(context):
    term = context.test_result.get("matched_term")
    assert term is None, f"Expected matched_term=None, got {term!r}"


# ── Custom rule CRUD ──────────────────────────────────────────────────────────

def _find_custom_rule_id(name):
    for r in get_rules():
        if r.name == name and r.custom:
            return r.id
    return None


@given('a custom rule with name "{name}" pattern "{pattern}"')
def step_add_custom_rule(context, name, pattern):
    add_custom_rule(name, f"Test rule: {name}", pattern)


@given('I delete the custom rule "{name}"')
@then('I delete the custom rule "{name}"')
def step_delete_custom_rule(context, name):
    rule_id = _find_custom_rule_id(name)
    if rule_id:
        delete_custom_rule(rule_id)


@given('I disable the custom rule "{name}"')
@when('I disable the custom rule "{name}"')
def step_disable_custom_rule(context, name):
    rule_id = _find_custom_rule_id(name)
    assert rule_id, f"Custom rule {name!r} not found"
    update_rule(rule_id, enabled=False)


@given('I enable the custom rule "{name}"')
@when('I enable the custom rule "{name}"')
def step_enable_custom_rule(context, name):
    rule_id = _find_custom_rule_id(name)
    assert rule_id, f"Custom rule {name!r} not found"
    update_rule(rule_id, enabled=True)


@given('I update the custom rule "{name}" pattern to "{new_pattern}"')
@when('I update the custom rule "{name}" pattern to "{new_pattern}"')
def step_update_custom_rule_pattern(context, name, new_pattern):
    rule_id = _find_custom_rule_id(name)
    assert rule_id, f"Custom rule {name!r} not found"
    update_rule(rule_id, pattern=new_pattern)

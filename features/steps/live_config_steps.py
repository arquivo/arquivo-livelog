from behave import given, then, when

from app.config import Config
from app.log_parser import tail_file


@given("a Config object with tail_lines set to {n:d}")
def step_create_config(context, n):
    context.live_config = Config()
    context.live_config.tail_lines = n


@when("I update tail_lines to {n:d}")
def step_update_tail_lines(context, n):
    context.live_config.tail_lines = n


@then("the config tail_lines should be {n:d}")
def step_check_tail_lines(context, n):
    assert context.live_config.tail_lines == n, (
        f"Expected tail_lines={n}, got {context.live_config.tail_lines}"
    )


@when("I tail the file using config.tail_lines")
def step_tail_with_config(context):
    context.tail_result = tail_file(context.log_file_path, context.live_config.tail_lines)

import os
import tempfile

from behave import given, then, when

from app.log_parser import parse_line, tail_file

SAMPLE_LINE = (
    '1.2.3.4 - frank [10/Oct/2000:13:55:36 -0700] '
    '"GET /apache_pb.gif HTTP/1.0" 200 2326 '
    '"http://example.com/" "Mozilla/4.08 (Win98)"'
)


@given("a valid Apache Combined Log Format entry")
def step_valid_entry(context):
    context.log_line = SAMPLE_LINE


@given("the following log line:")
def step_set_log_line(context):
    context.log_line = context.text.strip()


@when("I parse the log line")
def step_parse_line(context):
    context.result = parse_line(context.log_line)


@then('the IP address should be "{expected}"')
def step_check_ip(context, expected):
    assert context.result is not None, "Entry was unexpectedly None"
    assert context.result.ip == expected, f"Got IP {context.result.ip!r}"


@then('the HTTP method should be "{expected}"')
def step_check_method(context, expected):
    assert context.result is not None
    assert context.result.method == expected, f"Got method {context.result.method!r}"


@then('the request path should be "{expected}"')
def step_check_path(context, expected):
    assert context.result is not None
    assert context.result.path == expected


@then("the status code should be {code:d}")
def step_check_status(context, code):
    assert context.result is not None
    assert context.result.status == code, f"Got status {context.result.status}"


@then("the response size should be {size:d}")
def step_check_size(context, size):
    assert context.result is not None
    assert context.result.size == size, f"Got size {context.result.size}"


@then('the user agent should be "{expected}"')
def step_check_ua(context, expected):
    assert context.result is not None
    assert context.result.user_agent == expected


@then("the parsed entry should be None")
def step_check_none(context):
    assert context.result is None, f"Expected None, got {context.result}"


@then('the parsed entry to_dict should contain key "{key}"')
def step_check_to_dict_key(context, key):
    assert context.result is not None, "Entry was unexpectedly None"
    d = context.result.to_dict()
    assert key in d, f"Key {key!r} missing from to_dict(); got keys: {list(d.keys())}"


# ---------------------------------------------------------------------------
# Tail tests
# ---------------------------------------------------------------------------

@given("a log file with {n:d} entries")
def step_create_log_file(context, n):
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".log", delete=False)
    for i in range(n):
        tmp.write(
            f'1.2.3.{i % 256} - - [01/Jan/2024:00:00:{i:02d} +0000] '
            f'"GET /page/{i} HTTP/1.1" 200 512 "-" "TestAgent/1.0"\n'
        )
    tmp.flush()
    tmp.close()
    context.log_file_path = tmp.name
    context.add_cleanup(os.unlink, tmp.name)


@given("a non-existent log file path")
def step_nonexistent_file(context):
    context.log_file_path = "/tmp/this_file_does_not_exist_xyz_12345.log"


@when("I tail the file requesting {n:d} lines")
def step_tail_file(context, n):
    context.tail_result = tail_file(context.log_file_path, n)


@then("I should receive exactly {n:d} lines")
def step_check_tail_count(context, n):
    got = len(context.tail_result)
    assert got == n, f"Expected {n} lines, got {got}"

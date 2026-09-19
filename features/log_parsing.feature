Feature: Apache Log File Parsing
  As a system administrator
  I want to parse Apache access log entries
  So that I can analyse web traffic patterns

  Background:
    Given a valid Apache Combined Log Format entry

  Scenario: Parse a complete Combined Log Format line
    Given the following log line:
      """
      1.2.3.4 - frank [10/Oct/2000:13:55:36 -0700] "GET /apache_pb.gif HTTP/1.0" 200 2326 "http://example.com/" "Mozilla/4.08 (Win98)"
      """
    When I parse the log line
    Then the IP address should be "1.2.3.4"
    And the HTTP method should be "GET"
    And the request path should be "/apache_pb.gif"
    And the status code should be 200
    And the response size should be 2326
    And the user agent should be "Mozilla/4.08 (Win98)"

  Scenario: Parse a log line with a dash size (no body)
    Given the following log line:
      """
      5.5.5.5 - - [01/Jan/2024:00:00:01 +0000] "HEAD / HTTP/1.1" 200 - "-" "curl/7.68"
      """
    When I parse the log line
    Then the response size should be 0
    And the HTTP method should be "HEAD"

  Scenario: Skip a malformed log line
    Given the following log line:
      """
      this is not a valid apache log line
      """
    When I parse the log line
    Then the parsed entry should be None

  Scenario: Skip an empty log line
    Given the following log line:
      """

      """
    When I parse the log line
    Then the parsed entry should be None

  Scenario: Tail returns last N lines from a file
    Given a log file with 50 entries
    When I tail the file requesting 20 lines
    Then I should receive exactly 20 lines

  Scenario: Tail a file requesting more lines than it contains
    Given a log file with 5 entries
    When I tail the file requesting 100 lines
    Then I should receive exactly 5 lines

  Scenario: Parse a log line with a query string in the path
    Given the following log line:
      """
      1.2.3.4 - - [10/Oct/2000:13:55:36 -0700] "GET /search?q=hello&page=2 HTTP/1.1" 200 512 "-" "Mozilla/5.0"
      """
    When I parse the log line
    Then the request path should be "/search?q=hello&page=2"
    And the status code should be 200

  Scenario: Parsed entry exposes required fields via to_dict
    Given the following log line:
      """
      9.8.7.6 - - [01/Jan/2024:12:00:00 +0000] "POST /api/data HTTP/1.1" 201 88 "-" "curl/7.68.0"
      """
    When I parse the log line
    Then the parsed entry to_dict should contain key "ip"
    And the parsed entry to_dict should contain key "method"
    And the parsed entry to_dict should contain key "path"
    And the parsed entry to_dict should contain key "status"
    And the parsed entry to_dict should contain key "size"
    And the parsed entry to_dict should contain key "user_agent"
    And the parsed entry to_dict should contain key "time"

  Scenario: Tail a missing file returns empty list
    Given a non-existent log file path
    When I tail the file requesting 100 lines
    Then I should receive exactly 0 lines

  Scenario: The block reason is read from the trailing ARQUIVO_BLOCK field
    Given the following log line:
      """
      1.2.3.4 - - [19/Sep/2026:13:20:57 +0100] "GET /noFrame/replay/x HTTP/1.1" 403 277 "-" "BotUA" 1331 signature
      """
    When I parse the log line
    Then the status code should be 403
    And the block reason should be "signature"
    And the request duration should be 1331 microseconds

  Scenario: A served request logs a dash for the block reason
    Given the following log line:
      """
      1.2.3.4 - - [19/Sep/2026:13:20:57 +0100] "GET / HTTP/1.1" 200 512 "-" "Firefox/156.0" 4321 -
      """
    When I parse the log line
    Then the status code should be 200
    And the block reason should be empty

  Scenario: A log format without the block field still parses
    Given the following log line:
      """
      1.2.3.4 - - [19/Sep/2026:13:20:57 +0100] "GET / HTTP/1.1" 200 512 "-" "Firefox/156.0"
      """
    When I parse the log line
    Then the status code should be 200
    And the block reason should be empty

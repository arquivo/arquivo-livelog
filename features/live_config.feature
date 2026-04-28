Feature: Live Configuration — Tail Lines
  As a system administrator
  I want to change the tail line count at runtime
  So that I can widen or narrow the history window without restarting the server

  Scenario: tail_lines field is mutable on the Config object
    Given a Config object with tail_lines set to 1000
    When I update tail_lines to 500
    Then the config tail_lines should be 500

  Scenario: tail_file respects a reduced tail_lines value
    Given a log file with 20 entries
    And a Config object with tail_lines set to 10
    When I tail the file using config.tail_lines
    Then I should receive exactly 10 lines

  Scenario: tail_file returns all lines when tail_lines exceeds file length
    Given a log file with 5 entries
    And a Config object with tail_lines set to 100
    When I tail the file using config.tail_lines
    Then I should receive exactly 5 lines

  Scenario: Changing tail_lines live affects subsequent tail_file calls
    Given a log file with 30 entries
    And a Config object with tail_lines set to 10
    When I tail the file using config.tail_lines
    Then I should receive exactly 10 lines
    When I update tail_lines to 20
    And I tail the file using config.tail_lines
    Then I should receive exactly 20 lines

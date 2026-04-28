Feature: Bot Rule Management
  As a system administrator
  I want to manage bot detection rules at runtime
  So that I can tune classification without restarting the server

  # Patterns in these scenarios deliberately avoid the words bot/crawl/spider/
  # scraper and all other built-in rule keywords so that custom-rule toggle and
  # delete tests are not confounded by other rules matching the same UA.

  Scenario: get_bot_info returns the matching rule id and name
    Given the user agent "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
    When I call get_bot_info
    Then the bot info should have is_bot True
    And the bot info rule_id should be "search_engines"
    And the bot info rule_name should not be empty

  Scenario: get_bot_info returns no rule for a human browser
    Given the user agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/112.0 Safari/537.36"
    When I call get_bot_info
    Then the bot info should have is_bot False
    And the bot info rule_id should be None

  Scenario: test_ua returns the matched term for a bot
    Given the user agent "curl/7.68.0"
    When I call test_ua
    Then the test result is_bot should be True
    And the test result matched_term should not be empty

  Scenario: test_ua returns no matched term for a human
    Given the user agent "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/109.0"
    When I call test_ua
    Then the test result is_bot should be False
    And the test result matched_term should be None

  Scenario: Adding a custom rule classifies matching user agents as bots
    Given a custom rule with name "AddRule" pattern "xzadduniq"
    And the user agent "XzAddUniq/1.0"
    When I check if it is a bot
    Then the result should be True
    And I delete the custom rule "AddRule"

  Scenario: Disabling a custom rule stops it from matching
    Given a custom rule with name "ToggleRule" pattern "xztgluniq"
    And I disable the custom rule "ToggleRule"
    And the user agent "XzTglUniq/1.0"
    When I check if it is a bot
    Then the result should be False
    And I delete the custom rule "ToggleRule"

  Scenario: Re-enabling a custom rule restores matching
    Given a custom rule with name "RestoreRule" pattern "xzrstuniq"
    And I disable the custom rule "RestoreRule"
    And I enable the custom rule "RestoreRule"
    And the user agent "XzRstUniq/1.0"
    When I check if it is a bot
    Then the result should be True
    And I delete the custom rule "RestoreRule"

  Scenario: Deleting a custom rule stops classification
    Given a custom rule with name "DeleteRule" pattern "xzdeluniq"
    And I delete the custom rule "DeleteRule"
    And the user agent "XzDelUniq/1.0"
    When I check if it is a bot
    Then the result should be False

  Scenario: Updating a rule pattern matches the new string
    Given a custom rule with name "EditRule" pattern "xzeditold"
    And I update the custom rule "EditRule" pattern to "xzeditnew"
    And the user agent "XzEditNew/1.0"
    When I check if it is a bot
    Then the result should be True
    And I delete the custom rule "EditRule"

  Scenario: Updating a rule pattern stops matching the old string
    Given a custom rule with name "ShiftRule" pattern "xzshiftold"
    And I update the custom rule "ShiftRule" pattern to "xzshiftnew"
    And the user agent "XzShiftOld/1.0"
    When I check if it is a bot
    Then the result should be False
    And I delete the custom rule "ShiftRule"

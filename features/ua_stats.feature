Feature: Block suggestions by User-Agent
  As a site operator
  I want to see which User-Agents drive the traffic and how spread out they are
  So that I can decide whether blocking a client is worth it before writing a rule

  Scenario: User-Agents are ranked by request count
    Given a User-Agent counter with the following counts:
      | user_agent                        | count |
      | Mozilla/5.0 (compatible; Bot/1.0) | 40    |
      | curl/8.5.0                        | 10    |
      | SemrushBot/7~bl                   | 25    |
    When I aggregate User-Agent statistics grouped by full
    Then the top User-Agent should be "Mozilla/5.0 (compatible; Bot/1.0)" with 40 requests
    And the User-Agent report should contain 3 unique User-Agents

  Scenario: Versions of the same client collapse into one product token
    Given a User-Agent counter with the following counts:
      | user_agent                                      | count |
      | Mozilla/5.0 (compatible; SemrushBot/6~bl; +url) | 30    |
      | Mozilla/5.0 (compatible; SemrushBot/7~bl; +url) | 20    |
      | curl/8.5.0                                      | 5     |
    When I aggregate User-Agent statistics grouped by token
    Then the top User-Agent should be "SemrushBot" with 50 requests
    And the User-Agent report should list 2 User-Agents

  Scenario: Browser boilerplate is not mistaken for a product token
    Given a User-Agent counter with the following counts:
      | user_agent                                                                           | count |
      | Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0 | 12    |
    When I aggregate User-Agent statistics grouped by token
    Then the top User-Agent should be "Chrome" with 12 requests

  Scenario: A client with no version number keeps its own name as the token
    Given a User-Agent counter with the following counts:
      | user_agent                                  | count |
      | politiquices (+https://example.org/about)   | 9     |
    When I aggregate User-Agent statistics grouped by token
    Then the top User-Agent should be "politiquices" with 9 requests

  Scenario: A v-prefixed version still collapses to one token
    Given a User-Agent counter with the following counts:
      | user_agent                               | count |
      | check_http/v2.2 (monitoring-plugins 2.2) | 7     |
      | check_http/v2.2.1 (nagios-plugins 2.2.1) | 5     |
    When I aggregate User-Agent statistics grouped by token
    Then the top User-Agent should be "check_http" with 12 requests

  Scenario: A missing User-Agent is reported as empty rather than dropped
    Given a User-Agent counter with the following counts:
      | user_agent | count |
      | -          | 17    |
    When I aggregate User-Agent statistics grouped by token
    Then the top User-Agent should be "(empty)" with 17 requests

  Scenario: Unique IP counts are unioned when rows collapse
    Given a User-Agent counter with the following counts:
      | user_agent      | count |
      | SemrushBot/6~bl | 3     |
      | SemrushBot/7~bl | 2     |
    And the following User-Agent source IPs:
      | user_agent      | ips                  |
      | SemrushBot/6~bl | 10.0.0.1,10.0.0.2    |
      | SemrushBot/7~bl | 10.0.0.2,10.0.0.3    |
    When I aggregate User-Agent statistics grouped by token
    Then the User-Agent "SemrushBot" should report 3 unique IPs

  Scenario: Only bot-classified User-Agents are offered when filtering
    Given a User-Agent counter with the following counts:
      | user_agent      | count |
      | SemrushBot/7~bl | 25    |
      | Chrome/120.0.0  | 60    |
    And a User-Agent bot counter with the following counts:
      | user_agent      | count |
      | SemrushBot/7~bl | 25    |
    When I aggregate User-Agent statistics for bots only
    Then the User-Agent report should list 1 User-Agents
    And the top User-Agent should be "SemrushBot" with 25 requests

  Scenario: Rare User-Agents are hidden below the minimum request count
    Given a User-Agent counter with the following counts:
      | user_agent      | count |
      | SemrushBot/7~bl | 25    |
      | AhrefsBot/7.0   | 4     |
    When I aggregate User-Agent statistics with a minimum of 10 requests
    Then the User-Agent report should list 1 User-Agents
    And the User-Agent report should contain 2 unique User-Agents

  Scenario: Filtering narrows the report to matching User-Agents
    Given a User-Agent counter with the following counts:
      | user_agent      | count |
      | SemrushBot/7~bl | 25    |
      | AhrefsBot/7.0   | 14    |
      | curl/8.5.0      | 50    |
    When I aggregate User-Agent statistics filtered by "bot"
    Then the User-Agent report should list 2 User-Agents

  Scenario: A unique-IP count is flagged only when its own source set saturated
    Given a User-Agent counter with the following counts:
      | user_agent      | count |
      | SemrushBot/6~bl | 3     |
      | SemrushBot/7~bl | 2     |
    And the following User-Agent source IPs:
      | user_agent      | ips                        |
      | SemrushBot/6~bl | 10.0.0.1,10.0.0.2          |
      | SemrushBot/7~bl | 10.0.0.3,10.0.0.4,10.0.0.5 |
    When I aggregate User-Agent statistics with an IP cap of 4
    Then the User-Agent "SemrushBot" should report 5 unique IPs
    And the User-Agent "SemrushBot" should not be flagged as IP-capped

  Scenario: A saturated source set is reported as a lower bound
    Given a User-Agent counter with the following counts:
      | user_agent      | count |
      | SemrushBot/7~bl | 9     |
    And the following User-Agent source IPs:
      | user_agent      | ips                        |
      | SemrushBot/7~bl | 10.0.0.3,10.0.0.4,10.0.0.5 |
    When I aggregate User-Agent statistics with an IP cap of 3
    Then the User-Agent "SemrushBot" should be flagged as IP-capped

  # A scraper forging a browser User-Agent is indistinguishable by that string
  # alone. What separates it is the conjunction: that UA, with no Referer, on
  # the configured paths. These scenarios cover the counters that expose it.

  Scenario: A forged browser UA is separated from the real one by its signature share
    Given a User-Agent counter with the following counts:
      | user_agent | count |
      | Chrome/131 | 1000  |
      | Firefox/待 | 40    |
    And the following User-Agent no-referer counts:
      | user_agent | count |
      | Chrome/131 | 990   |
      | Firefox/待 | 4     |
    And the following User-Agent signature counts:
      | user_agent | count |
      | Chrome/131 | 980   |
      | Firefox/待 | 2     |
    When I aggregate User-Agent statistics with a minimum signature share of 90%
    Then the User-Agent report should list 1 User-Agents
    And the User-Agent "Chrome/131" should report 980 signature requests
    And the User-Agent "Chrome/131" should report a signature share of 98%

  Scenario: No-referer counts are reported per User-Agent
    Given a User-Agent counter with the following counts:
      | user_agent | count |
      | Chrome/131 | 100   |
    And the following User-Agent no-referer counts:
      | user_agent | count |
      | Chrome/131 | 76    |
    When I aggregate User-Agent statistics with signature counts
    Then the User-Agent "Chrome/131" should report 76 no-referer requests

  Scenario: Rows with no signature traffic are dropped when filtering on it
    Given a User-Agent counter with the following counts:
      | user_agent | count |
      | Chrome/131 | 500   |
      | curl/8.5.0 | 20    |
    And the following User-Agent signature counts:
      | user_agent | count |
      | Chrome/131 | 480   |
    When I aggregate User-Agent statistics keeping only signature matches
    Then the User-Agent report should list 1 User-Agents
    And the User-Agent "Chrome/131" should report 480 signature requests

  Scenario: A User-Agent that always sends a Referer never matches the signature
    Given a User-Agent counter with the following counts:
      | user_agent | count |
      | Chrome/131 | 300   |
    When I aggregate User-Agent statistics keeping only signature matches
    Then the User-Agent report should list 0 User-Agents

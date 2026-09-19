Feature: Requests per Domain
  As a site operator
  I want to see request counts grouped by domain
  So that I know which sites refer traffic to me and which archived sites are replayed

  Scenario: Referring domain is extracted from the Referer header
    When I extract the referring domain from "https://www.Google.com/search?q=x"
    Then the extracted domain should be "google.com"

  Scenario: Requests without a referer are reported as direct
    When I extract the referring domain from "-"
    Then the extracted domain should be "(direct)"

  Scenario: A referer port is not part of the domain
    When I extract the referring domain from "http://example.com:8080/page"
    Then the extracted domain should be "example.com"

  Scenario: Archived domain is extracted from a replay URL
    When I extract the archived domain from "/wayback/20200101000000/http://example.com/page"
    Then the extracted domain should be "example.com"

  Scenario: Archived domain is extracted from a scheme-less replay URL
    When I extract the archived domain from "/wayback/20200101000000/publico.pt/noticia"
    Then the extracted domain should be "publico.pt"

  Scenario: Ordinary site paths carry no archived domain
    When I extract the archived domain from "/static/main.css"
    Then the extracted domain should be empty

  Scenario: Domains are ranked by request count
    Given a domain counter with the following counts:
      | domain      | count |
      | google.com  | 120   |
      | twitter.com | 45    |
      | (direct)    | 300   |
    When I aggregate domain statistics for source "referer"
    Then the top domain should be "(direct)" with 300 requests
    And the domain report should contain 3 unique domains

  Scenario: Bot and error counts are reported per domain
    Given a domain counter with the following counts:
      | domain      | count |
      | example.com | 50    |
    And a domain bot counter with the following counts:
      | domain      | count |
      | example.com | 20    |
    And a domain error counter with the following counts:
      | domain      | count |
      | example.com | 5     |
    When I aggregate domain statistics for source "url"
    Then the domain "example.com" should show 20 bot and 30 human requests
    And the domain "example.com" should show 5 errors

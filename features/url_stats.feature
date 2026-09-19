Feature: Requests per URL
  As a site operator
  I want to see how many times each URL was requested
  So that I can tell which pages carry the traffic and which are failing

  Scenario: URLs are ranked by request count
    Given a URL counter with the following counts:
      | url            | count |
      | /index.html    | 40    |
      | /about         | 10    |
      | /contact       | 25    |
    When I aggregate URL statistics grouped by path
    Then the top URL should be "/index.html" with 40 requests
    And the URL report should contain 3 unique URLs

  Scenario: Query strings are collapsed when grouping by path
    Given a URL counter with the following counts:
      | url            | count |
      | /search?q=cats | 6     |
      | /search?q=dogs | 4     |
      | /about         | 3     |
    When I aggregate URL statistics grouped by path
    Then the top URL should be "/search" with 10 requests
    And the URL report should contain 2 unique URLs

  Scenario: Query strings are kept separate when grouping by full URL
    Given a URL counter with the following counts:
      | url            | count |
      | /search?q=cats | 6     |
      | /search?q=dogs | 4     |
    When I aggregate URL statistics grouped by full
    Then the URL report should contain 2 unique URLs
    And the top URL should be "/search?q=cats" with 6 requests

  Scenario: Bot and human requests are split per URL
    Given a URL counter with the following counts:
      | url         | count |
      | /robots.txt | 30    |
    And a URL bot counter with the following counts:
      | url         | count |
      | /robots.txt | 28    |
    When I aggregate URL statistics grouped by path
    Then the URL "/robots.txt" should show 28 bot and 2 human requests

  Scenario: Each URL reports its share of total traffic
    Given a URL counter with the following counts:
      | url   | count |
      | /a    | 75    |
      | /b    | 25    |
    When I aggregate URL statistics grouped by path
    Then the URL "/a" should have a share of 75.0 percent

  Scenario: Filtering narrows the report to matching URLs
    Given a URL counter with the following counts:
      | url             | count |
      | /api/v1/users   | 10    |
      | /api/v1/orders  | 8     |
      | /index.html     | 50    |
    When I aggregate URL statistics filtered by "api"
    Then the URL report should list 2 URLs
    And the URL report should contain 3 unique URLs

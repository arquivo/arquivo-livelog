Feature: Bot vs Human Detection
  As a system administrator
  I want to distinguish bots from human visitors
  So that I can analyse real user traffic separately

  Scenario Outline: Classify known bots by user-agent
    Given the user agent "<ua>"
    When I check if it is a bot
    Then the result should be <result>

    Examples:
      | ua                                                                    | result |
      | Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html) | True   |
      | Mozilla/5.0 (compatible; Bingbot/2.0; +http://www.bing.com/bingbot.htm)  | True   |
      | curl/7.68.0                                                           | True   |
      | python-requests/2.28.0                                                | True   |
      | Scrapy/2.7.0 (+https://scrapy.org)                                    | True   |
      | Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0 Safari/537.36 | False  |
      | Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15 | False |
      | Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/109.0 | False  |

  Scenario: Empty user agent is classified as bot
    Given the user agent ""
    When I check if it is a bot
    Then the result should be True

  Scenario: Dash user agent is classified as bot
    Given the user agent "-"
    When I check if it is a bot
    Then the result should be True

  Scenario: SemrushBot is classified as bot
    Given the user agent "Mozilla/5.0 (compatible; SemrushBot/7.0; +http://www.semrush.com/bot.html)"
    When I check if it is a bot
    Then the result should be True

  Scenario: AhrefsBot is classified as bot
    Given the user agent "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)"
    When I check if it is a bot
    Then the result should be True

  Scenario Outline: Social media preview bots are classified as bots
    Given the user agent "<ua>"
    When I check if it is a bot
    Then the result should be True

    Examples:
      | ua                                                                 |
      | facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php) |
      | Twitterbot/1.0                                                     |
      | LinkedInBot/1.0 (compatible; Mozilla/5.0; Jakarta Commons-HttpClient/3.1 +http://www.linkedin.com) |
      | WhatsApp/2.19.71 A                                                 |

  Scenario Outline: Common HTTP scripting tools are classified as bots
    Given the user agent "<ua>"
    When I check if it is a bot
    Then the result should be True

    Examples:
      | ua                        |
      | Wget/1.21.1               |
      | python-urllib/3.10        |
      | Go-http-client/2.0        |
      | libwww-perl/6.43          |

  Scenario Outline: Generic crawler keywords are classified as bots
    Given the user agent "<ua>"
    When I check if it is a bot
    Then the result should be True

    Examples:
      | ua                                   |
      | MySiteCrawler/1.0                    |
      | DataSpider/2.0 (+https://example.com) |
      | CustomScraper/1.0                    |

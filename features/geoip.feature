Feature: GeoIP Resolution
  As a system administrator
  I want to resolve IP addresses to countries
  So that I can understand the geographic origin of traffic

  Scenario: Resolve a well-known public IP
    Given the IP address "8.8.8.8"
    When I perform a GeoIP lookup
    Then the country code should not be "??"
    And the country name should not be "Unknown"

  Scenario: Return unknown for private IP ranges
    Given the IP address "192.168.1.1"
    When I perform a GeoIP lookup
    Then the lookup should not raise an exception

  Scenario: Return unknown for localhost
    Given the IP address "127.0.0.1"
    When I perform a GeoIP lookup
    Then the lookup should not raise an exception

  Scenario: Return fallback for an invalid IP string
    Given the IP address "not-an-ip"
    When I perform a GeoIP lookup
    Then the lookup should not raise an exception
    And the country code should be "??"

  Scenario: Lookup result contains required fields
    Given the IP address "8.8.8.8"
    When I perform a GeoIP lookup
    Then the result contains "country_code"
    And the result contains "country_name"

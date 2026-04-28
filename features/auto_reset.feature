Feature: Auto Reset Schedule
  As a system administrator
  I want to configure an automatic stats reset schedule
  So that the dashboard shows fresh data each day, month, or year

  # ── Config field ────────────────────────────────────────────────────────────

  Scenario: reset_interval defaults to "none"
    Given a fresh Config object
    Then the config reset_interval should be "none"

  Scenario: reset_interval is mutable at runtime to "daily"
    Given a fresh Config object
    When I set reset_interval to "daily"
    Then the config reset_interval should be "daily"

  Scenario: reset_interval is mutable at runtime to "monthly"
    Given a fresh Config object
    When I set reset_interval to "monthly"
    Then the config reset_interval should be "monthly"

  Scenario: reset_interval is mutable at runtime to "yearly"
    Given a fresh Config object
    When I set reset_interval to "yearly"
    Then the config reset_interval should be "yearly"

  Scenario: reset_interval can be changed between valid values
    Given a fresh Config object
    When I set reset_interval to "daily"
    And I set reset_interval to "monthly"
    Then the config reset_interval should be "monthly"

  # ── Timing logic ─────────────────────────────────────────────────────────────

  Scenario: daily interval — next reset is next midnight
    Given a reference time of "2026-04-23 14:30:00"
    When I compute the next reset time for interval "daily"
    Then the next reset datetime should be "2026-04-24 00:00:00"

  Scenario: monthly interval — next reset is the 1st of next month
    Given a reference time of "2026-04-23 14:30:00"
    When I compute the next reset time for interval "monthly"
    Then the next reset datetime should be "2026-05-01 00:00:00"

  Scenario: monthly interval wraps from December to January next year
    Given a reference time of "2026-12-15 10:00:00"
    When I compute the next reset time for interval "monthly"
    Then the next reset datetime should be "2027-01-01 00:00:00"

  Scenario: yearly interval — next reset is January 1st of next year
    Given a reference time of "2026-04-23 14:30:00"
    When I compute the next reset time for interval "yearly"
    Then the next reset datetime should be "2027-01-01 00:00:00"

  Scenario: "none" interval returns no next reset time
    Given a reference time of "2026-04-23 14:30:00"
    When I compute the next reset time for interval "none"
    Then there should be no next reset time

  Scenario: daily reset fires when current time is past the next reset instant
    Given a reference time of "2020-01-01 00:00:00"
    When I compute the next reset time for interval "daily"
    Then the next reset time is in the past

  # ── Store reset ──────────────────────────────────────────────────────────────

  Scenario: reset clears all counters to zero
    Given a Store with accumulated request counts
    When I call reset_counters on the store
    Then the store total should be 0
    And the store bots count should be 0
    And the store humans count should be 0
    And the store ip_counter should be empty

  Scenario: reset clears the entries deque
    Given a Store with accumulated request counts
    When I clear the store entries
    Then the store entries should be empty

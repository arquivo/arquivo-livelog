Feature: Heavy Usage / Outlier Detection
  As a system administrator
  I want to detect IPs with abnormally high request counts
  So that I can identify potential abusers or DDoS sources

  Scenario: Detect a single clear outlier using IQR
    Given a request counter with the following IP counts:
      | ip        | count |
      | 1.1.1.1   | 5     |
      | 2.2.2.2   | 6     |
      | 3.3.3.3   | 4     |
      | 4.4.4.4   | 5     |
      | 5.5.5.5   | 7     |
      | 6.6.6.6   | 500   |
    When I compute heavy users with IQR multiplier 1.5 and min requests 10
    Then the heavy users set should contain "6.6.6.6"
    And the heavy users set should not contain "1.1.1.1"

  Scenario: No outliers when all counts are similar
    Given a request counter with the following IP counts:
      | ip        | count |
      | 1.1.1.1   | 10    |
      | 2.2.2.2   | 11    |
      | 3.3.3.3   | 10    |
      | 4.4.4.4   | 12    |
    When I compute heavy users with IQR multiplier 1.5 and min requests 10
    Then the heavy users set should be empty

  Scenario: Minimum request threshold is respected
    Given a request counter with the following IP counts:
      | ip        | count |
      | 1.1.1.1   | 1     |
      | 2.2.2.2   | 1     |
      | 3.3.3.3   | 1     |
      | 4.4.4.4   | 1     |
      | 5.5.5.5   | 8     |
    When I compute heavy users with IQR multiplier 1.5 and min requests 10
    Then the heavy users set should be empty

  Scenario: Fewer than 4 IPs returns empty set
    Given a request counter with the following IP counts:
      | ip      | count |
      | 1.1.1.1 | 100   |
      | 2.2.2.2 | 1     |
    When I compute heavy users with IQR multiplier 1.5 and min requests 10
    Then the heavy users set should be empty

  Scenario: compute_threshold returns the effective threshold value
    Given a request counter with the following IP counts:
      | ip      | count |
      | 1.1.1.1 | 5     |
      | 2.2.2.2 | 6     |
      | 3.3.3.3 | 4     |
      | 4.4.4.4 | 5     |
      | 5.5.5.5 | 7     |
      | 6.6.6.6 | 500   |
    When I compute the threshold with IQR multiplier 1.5 and min requests 10
    Then the threshold should be at least 10

  Scenario: compute_threshold respects the min requests floor
    Given a request counter with the following IP counts:
      | ip      | count |
      | 1.1.1.1 | 1     |
      | 2.2.2.2 | 1     |
      | 3.3.3.3 | 1     |
      | 4.4.4.4 | 1     |
      | 5.5.5.5 | 2     |
    When I compute the threshold with IQR multiplier 1.5 and min requests 50
    Then the threshold should be at least 50

  Scenario: Multiple outlier IPs are all detected
    # 8 normal IPs keep Q3 low (=8) so both outliers exceed the threshold
    Given a request counter with the following IP counts:
      | ip          | count |
      | 1.1.1.1     | 4     |
      | 2.2.2.2     | 5     |
      | 3.3.3.3     | 5     |
      | 4.4.4.4     | 6     |
      | 5.5.5.5     | 6     |
      | 6.6.6.6     | 7     |
      | 7.7.7.7     | 7     |
      | 8.8.8.8     | 8     |
      | 9.9.9.9     | 500   |
      | 10.10.10.10 | 600   |
    When I compute heavy users with IQR multiplier 1.5 and min requests 10
    Then the heavy users set should contain "9.9.9.9"
    And the heavy users set should contain "10.10.10.10"
    And the heavy users set should not contain "1.1.1.1"

  Scenario: IQR multiplier is configurable
    Given a request counter with the following IP counts:
      | ip      | count |
      | 1.1.1.1 | 5     |
      | 2.2.2.2 | 10    |
      | 3.3.3.3 | 15    |
      | 4.4.4.4 | 20    |
      | 5.5.5.5 | 50    |
    When I compute heavy users with IQR multiplier 0.5 and min requests 5
    Then the heavy users set should contain "5.5.5.5"
    When I compute heavy users with IQR multiplier 20.0 and min requests 5
    Then the heavy users set should be empty

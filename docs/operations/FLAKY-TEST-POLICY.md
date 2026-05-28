# Flaky Test Policy & CI Enforcement

## 1. Definitions

**Flaky Test:** A test that passes on some runs and fails on others without any code changes, typically due to:

- Race conditions / timing issues
- Async operation sequencing
- Mock/state isolation problems
- Resource contention (Redis, database connections)
- Non-deterministic external dependencies

**Intermittent Failure:** Test fails < 100% of the time but > 0% of the time.

## 2. Acceptable Flakiness Thresholds

### Per Test Suite

- **Unit Tests** (src/\*_/_.unit.test.ts): 0% flakiness tolerance
  - Must pass deterministically 100% of the time
  - No retries applied

- **Integration Tests** (tests/\*_/_.integration.test.ts): ≤ 2% flakiness tolerance
  - Async, IO, and state-dependent tests allowed
  - Automatic retry strategy applied (see Retry Policy)

- **Contract Tests** (tests/contracts/\*\*): 0% flakiness tolerance
  - Type alignment and API contracts must be deterministic

### Workspace-Level Target

- **Backend**: ≤ 1.5% overall test flakiness
  - Measured as: (failed-on-first-run-but-passed-on-retry) / total-runs

- **Frontend**: ≤ 2% overall test flakiness

- **Admin**: ≤ 2% overall test flakiness

## 3. Retry Policy

### Automatic Retry Strategy

Integration tests that fail on first run will be automatically retried:

- **Max retries:** 3 attempts
- **Backoff strategy:** Exponential (100ms, 300ms, 900ms)
- **Failure classification:**
  - Pass on retry → Logged as "flaky" (does not fail CI, added to monitoring)
  - Fail all retries → Hard failure (fails CI)

### Retry Eligibility

Only integration tests are eligible for automatic retry:

```
Pattern: tests/**/*.integration.test.ts
NOT pattern: tests/**/*.unit.test.ts
NOT pattern: tests/contracts/**/*.test.ts
```

Unit tests and contract tests must pass deterministically on first attempt.

## 4. CI Enforcement

### GitHub Actions Integration

Flaky test detection is enforced in CI pipeline:

```yaml
# In .github/workflows/test.yml (or equivalent)
- name: Run tests with flaky detection
  run: npm run test:ci
  continue-on-error: false # Fail if non-flaky tests fail
```

### Exit Codes

- **0 (Success):** All tests passed
- **1 (Hard Failure):** Non-flaky test failed or integration test failed all retries
- **2 (Flakiness Detected):** Tests passed but flakiness detected above threshold
  - Current: Only exit 0 (flakiness warning in output)
  - Future: May change to exit 2 to require investigation

### Flaky Test Reporting

Each CI run produces a flaky test report:

**File:** `coverage/flaky-tests-report.json`

```json
{
  "timestamp": "2025-04-29T12:00:00Z",
  "run_id": "abc123",
  "total_tests": 403,
  "retry_enabled_count": 250,
  "flaky_tests": [
    {
      "name": "multi-client-reconnect.integration.test.ts > concurrent fanout",
      "passed_on_attempt": 2,
      "failures": [{ "attempt": 1, "error": "Timeout" }],
      "frequency": "1 in 5 runs"
    }
  ],
  "flakiness_percentage": 0.8,
  "status": "WITHIN_THRESHOLD"
}
```

## 5. Flaky Test Lifecycle

### Detection & Triage

1. CI detects flaky test (passes after retry)
2. Flaky test added to `docs/operations/FLAKY-TESTS-REGISTRY.md`
3. Ticket created: "Investigate flaky test: [test-name]"
4. Assigned for investigation

### Investigation & Fix

1. Run test in isolation 10 times
2. Identify root cause:
   - Mock state leakage?
   - Async sequencing issue?
   - Timing assumption?
   - Resource contention?
3. Apply fix (refactor, add synchronization, improve mock isolation)
4. Verify: Run test 20x in CI to confirm stability
5. Remove from flaky registry once deterministic

### Escalation

If flaky test cannot be fixed:

- Move to "Accepted Flakiness" section of registry
- Document root cause and trade-off
- Add to monitoring dashboard
- Set alert if flakiness frequency increases

## 6. Monitoring & Metrics

### Weekly Report

- Count of flaky tests by category
- Flakiness frequency trend (regression detection)
- Most frequently flaky tests (prioritize fixes)

### Metrics Dashboard (Future)

- Flakiness percentage over time
- Mean time to fix (MTTF) for flaky tests
- Correlation with code changes

## 7. Implementation Status

### ✓ Completed

- [x] Policy definition (this doc)
- [x] Retry logic in Vitest config (max 3 retries for .integration.test.ts)
- [x] Per-file flaky test detection

### In Progress

- [ ] Flaky test reporting in coverage-report.mjs
- [ ] CI enforcement in GitHub Actions
- [ ] Flaky test registry (FLAKY-TESTS-REGISTRY.md)
- [ ] Dashboard/metrics tracking

### Planned

- [ ] Automated issue creation for new flaky tests
- [ ] Slack notifications for flakiness threshold breaches
- [ ] Dashboard UI for flaky test tracking

## 8. Running Tests with Flaky Detection

### Local Development

```bash
# Run with flaky detection (retries enabled)
npm run test:ci

# Run without retries (fast feedback)
npm run test

# Run specific test suite with retry
npx vitest run tests/integration/multi-client-reconnect.integration.test.ts --retry 3
```

### CI Environment

```bash
# Automatically detects flaky tests, retries, and generates report
npm run test:ci
# Generates: coverage/flaky-tests-report.json
```

## 9. Best Practices to Avoid Flaky Tests

### Test Isolation

- Clear mocks and state between tests
- Don't share state across test suites
- Use `beforeEach` and `afterEach` rigorously

### Async Handling

- Use `async/await` instead of callbacks
- Ensure all async operations complete before assertion
- Mock timers consistently

### Determinism

- Avoid `Math.random()` without seeding
- Mock `Date.now()` in tests that depend on timing
- Don't depend on execution order (tests should be runnable individually)

### Resource Management

- Close connections/resources in `afterEach`
- Use connection pooling with limits
- Mock external services (Redis, DB) rather than using real instances

## 10. References

- [Vitest Retry Documentation](https://vitest.dev/guide/debugging.html#retry)
- [Best Practices for Flaky Test Detection](https://engineering.fb.com/2023/flaky-tests-at-scale/)
- Related: [Testing Readiness Framework](TESTING-READINESS.md)

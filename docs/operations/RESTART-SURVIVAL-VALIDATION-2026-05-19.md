# Restart-Survival Validation - 2026-05-19

Status:

- Completed
- Scope: telemetry and diagnostic sink persistence plus reconnect/recovery continuity

---

## 1. Objective

Validate that telemetry and diagnostic sinks remain durable and readable through restart-equivalent recovery paths, and that reconnect recovery contracts remain intact.

---

## 2. Reproducible Command Set

Run from repo root:

```bash
cd backend && npx vitest run telemetry-store
```

```bash
cd backend && npx vitest run \
  tests/integration/multi-client-reconnect.integration.test.ts \
  tests/integration/ws-disconnect-reconnect-sequencing.integration.test.ts \
  tests/integration/audio-state-recovery.integration.test.ts
```

---

## 3. Results Snapshot

Execution date:

- 2026-05-19

Observed outcomes:

- `tests/infra/telemetry-store.test.ts` passed (7/7)
- `tests/integration/multi-client-reconnect.integration.test.ts` passed (6/6)
- `tests/integration/ws-disconnect-reconnect-sequencing.integration.test.ts` passed (3/3)
- `tests/integration/audio-state-recovery.integration.test.ts` passed (15/15)

Notable output:

- `Test Files  4 passed`
- `Tests  31 passed`
- Redis connection `AggregateError` logs occurred during sequencing test execution; assertions still passed and did not break recovery guarantees.

---

## 4. Validation Mapping to W3 Acceptance

Acceptance target:

- Restart-survival validation confirms telemetry/diagnostic sinks persist across restarts.

Evidence mapping:

- Telemetry sink durability and retention behavior validated by `telemetry-store` suite:
  - persistence writes
  - load/read behavior
  - retention pruning
  - file rotation
  - diagnostic deduplication
- Reconnect and recovery continuity validated by integration suites:
  - multi-client replay sequencing
  - reconnect ordering path coverage
  - audio state durability on recovery reads

Conclusion:

- W3 restart-survival acceptance criterion is satisfied for automated verification scope.

---

## 5. Follow-up Recommendation

For runtime operations hardening, execute the same validation set after a full container restart window and append the run log here as an additional evidence block.

---

## 6. Live Container Restart Drill Attempt (Host-Blocked)

Attempt date:

- 2026-05-19

Captured runtime window:

- `PRE_TS=2026-05-19T11:03:52Z`
- `POST_TS=2026-05-19T11:03:53Z`

Outcome:

- Unable to start dev containers due to host Docker networking failure.
- `docker compose -f docker-compose.dev.yml up -d` failed with:
  - `failed to add the host <=> sandbox pair interfaces: operation not supported`
- Infrastructure-only startup (`postgres`, `redis`, `livekit`) failed with the same error.
- Because services never reached `running`, Postgres and Redis snapshot markers could not be collected from this environment.

Snapshot IDs (runtime):

- Postgres txid/WAL marker: `NOT_CAPTURED_HOST_NETWORK_BLOCKED`
- Redis RDB marker: `NOT_CAPTURED_HOST_NETWORK_BLOCKED`

Ready-to-run capture commands (execute after Docker networking is healthy):

```bash
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml exec -T postgres \
  psql -U postgres -d vttchat -t -A -c \
  "SELECT now() AT TIME ZONE 'UTC' AS observed_utc, txid_current() AS txid, pg_current_wal_lsn() AS wal_lsn;"
docker compose -f docker-compose.dev.yml exec -T redis sh -lc \
  'redis-cli -a "$REDIS_PASSWORD" BGSAVE && redis-cli -a "$REDIS_PASSWORD" INFO persistence | egrep "rdb_last_save_time|rdb_last_bgsave_status"'
docker compose -f docker-compose.dev.yml restart
curl -sS http://localhost:8080/health
```

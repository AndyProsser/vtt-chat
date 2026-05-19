# Telemetry Matrix

Status:

- Phase 0 baseline telemetry matrix.
- Defines what is tracked, why it is tracked, and who consumes it.

---

## 1. Purpose

This matrix aligns operational telemetry with Phase 0 reliability goals:

- deterministic session lifecycle
- resilient reconnect and state rehydration
- observable Redis-first runtime behavior

---

## 2. Matrix

| Signal family             | Example signals                                             | Source                                                  | Primary consumer              | Why it matters                                                    |
| ------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------- |
| Session lifecycle         | state changed, cooldown started/extended/ended, end markers | Backend API + WS services                               | Operators, backend engineers  | Confirms valid lifecycle transitions and cooldown behavior        |
| Chat/system bookends      | session started/paused/resumed/ended markers                | Backend system message service + frontend chat timeline | Operators, QA                 | Verifies boundary persistence and reconnect hydration correctness |
| Presence/runtime topology | join, leave, ghost transitions, room membership updates     | Redis runtime state + WS events                         | Operators, backend engineers  | Detects divergence between runtime authority and client view      |
| WebSocket transport       | connect, reconnect, auth failure, dispatch errors           | WS client/server telemetry                              | Operators, frontend engineers | Detects sync degradation and reconnect regressions                |
| Cooldown controls         | cancel/extend authorization decisions, extension count      | Session cooldown services/routes                        | Operators, backend engineers  | Confirms cooldown guardrails and abuse protection                 |
| Redis runtime health      | keyspace growth, mutation latency, recovery replay volume   | Redis metrics + backend wrappers                        | Operators, infra              | Detects hot-path saturation and recovery risk                     |
| API reliability           | request counts, error rates, transition conflict responses  | API logs + metrics                                      | Operators                     | Identifies regressions and invalid action patterns                |

---

## 3. Collection and Ownership

Collection points:

- Backend lifecycle services and routes.
- WebSocket dispatcher and broadcast paths.
- Frontend websocket client and reconnect pathways.
- Redis runtime mutation wrappers.

Owners:

- Backend team owns server lifecycle/runtime instrumentation.
- Frontend team owns client reconnect and UI-sync diagnostics.
- Operators own alert routing and runbook execution.

---

## 4. Alerting Priorities

High priority:

- Session transition failures or repeated invalid transition conflicts.
- Missing lifecycle WS delivery with stale client state.
- Redis runtime unavailability affecting active sessions.

Medium priority:

- Elevated reconnect churn.
- Repeated cooldown-control authorization failures.
- Rising room topology divergence warnings.

Low priority:

- Non-blocking telemetry transport failures.
- Debug-only diagnostic counters in non-production environments.

---

## 5. Retention and Review

- Keep operationally relevant lifecycle and transport signals long enough for incident RCA windows.
- Review matrix coverage at each Phase 0/1 gate and after major lifecycle changes.
- Add new signal families whenever a cross-cutting runtime contract is introduced.

---

## 6. Restart-Survival Validation

Validation objective:

- Confirm telemetry and diagnostic sinks remain durable and queryable through restart-equivalent paths.

Validation command set:

```bash
cd backend && npx vitest run telemetry-store
```

```bash
cd backend && npx vitest run \
	tests/integration/multi-client-reconnect.integration.test.ts \
	tests/integration/ws-disconnect-reconnect-sequencing.integration.test.ts \
	tests/integration/audio-state-recovery.integration.test.ts
```

Expected pass signals:

- Telemetry sink persistence, rotation, and retention tests are all green.
- Reconnect/recovery integration suites are green with no assertion failures.

Recorded evidence:

- `docs/operations/RESTART-SURVIVAL-VALIDATION-2026-05-19.md`

Related docs:

- `docs/operations/TELEMETRY.md`
- `docs/architecture/RUNTIME-STATE-AND-AUDIT-CONTRACT.md`

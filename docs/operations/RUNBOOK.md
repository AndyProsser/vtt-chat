# Operator Runbook

Status:

- Phase 0 baseline runbook for day-to-day operations.
- This document is the primary quick-response path.
- Deep procedure references remain in the linked docs under `docs/operations/`.

---

## 1. Scope

This runbook covers the required operator workflows for Phase 0:

- restart
- backup and restore
- incident triage
- log analysis

---

## 2. Restart Procedure

Goal:

- Restore backend/frontend runtime while preserving Redis/Postgres state.

Steps:

1. Confirm current process health and active sessions.
2. Notify active operators that restart is starting.
3. Restart services using the environment-appropriate command path.
4. Verify API health endpoint, websocket connectivity, and session-state read endpoints.
5. Verify one DM action round-trip: API mutate -> WS broadcast -> UI convergence.

Validation checklist:

- Backend health endpoint is healthy.
- Frontend can establish websocket and receive `WS:CONNECTED`.
- Session list and active session state are readable.
- Presence topology rehydrates after reconnect.

Related docs:

- `docs/operations/DEPLOYMENT.md`
- `docs/operations/DEVELOPER-DEPLOYMENT.md`

---

## 3. Backup and Restore

Goal:

- Confirm campaign/session durability can be restored predictably.

Backup flow:

1. Capture Postgres backup snapshot.
2. Capture Redis persistence snapshot when configured for runtime recovery.
3. Record snapshot metadata: timestamp, environment, version, operator.

Restore flow:

1. Restore Postgres snapshot to the target environment.
2. Restore Redis runtime snapshot when runtime recovery validation is in scope.
3. Restart services and run smoke checks.
4. Validate key entities: campaigns, sessions, room topology, bookend system messages.

Drill evidence:

- Save drill date, operator, snapshot IDs, and validation outcome in run log.
- Record any mismatch and remediation actions.

Related docs:

- `docs/operations/BACKUP-RESTORE.md`

---

## 4. Incident Triage

Severity hints:

- Sev 1: Session lifecycle/control plane broken for active sessions.
- Sev 2: Partial degradation with workarounds.
- Sev 3: Non-critical errors or degraded diagnostics only.

Triage sequence:

1. Identify blast radius: campaign, session, role, region.
2. Classify by failure plane:
   - API validation/persistence
   - Redis runtime state
   - WebSocket delivery
   - Frontend rehydration
3. Capture timestamps and correlation identifiers.
4. Apply containment fix or rollback.
5. Record timeline and root-cause hypothesis.

Mandatory data to capture:

- Affected session IDs and campaign IDs.
- Last successful DM control action.
- Recent lifecycle transitions.
- Redis and websocket error indicators.

---

## 5. Log Analysis

Primary sources:

- Backend API and service logs.
- WebSocket server logs.
- Redis diagnostics and persistence logs.
- Frontend console diagnostics for affected role path.

Minimum queries:

- Session transition events and invalid transition rejections.
- `CHAT:MESSAGE_SENT` / bookend emission events.
- Cooldown start/extend/end events.
- Presence join/leave and reconnect behavior.

Escalation triggers:

- Repeated invalid transitions from a single session.
- Lost or delayed lifecycle WS events.
- Divergence between Redis runtime state and API/session snapshot.

Related docs:

- `docs/operations/TESTING-READINESS.md`
- `docs/operations/REQUEST-COUNT-VERIFICATION.md`

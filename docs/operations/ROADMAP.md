# VTT Chat Operations Roadmap and Progress Record

This document is the operations-focused roadmap snapshot for VTT Chat.
It is intentionally aligned with the root roadmap and tracks:

- What has been completed
- What is currently in progress
- What remains for each stage
- Operational exit criteria
- Immediate next operational milestones

Last updated: 2026-04-19

---

## 1) Executive Status

Current overall status: **Stages 0-6 complete, Stage 7 partially implemented, Stage 8 partially complete, Stages 9-13 planned**.

- Contract and architecture baseline are in place.
- Core backend/frontend spine is operational.
- Session lifecycle and chat vertical slices are implemented and building.
- Admin shell and readonly telemetry baseline are now implemented.
- Notes vertical slice is now operational with persisted CRUD + visibility controls.
- Presence/rooms vertical slice includes mounted APIs, Redis-first state, DB snapshot recovery, frontend indicators, and transition notifications; final hardening/e2e remains.
- Audio/livekit vertical slice is partially implemented (token issuance route + client/audio hooks), with runtime integration and hardening still pending.
- Remaining full-project scope now explicitly includes frontend command-center completion, admin feature completion, knowledge surfaces, portability workflows, and extension bridge integration.

Latest verification:

- Monorepo build passes (`backend`, `frontend`, `admin`).
- Backend tests pass for chat system-message protections, notes visibility transitions, notes websocket propagation, campaign/users API coverage, room recovery/transition sequencing integration coverage, and audio/livekit event envelope coverage.
- Current backend verification: `8` test files / `29` tests passing.

---

## 2) Stage-by-Stage Progress (Operations View)

### Stage 0: Contract Lock

Status: **Complete**

Operational impact:

- Shared contracts are the canonical runtime/API agreement for backend/frontend.
- Permission and error models are stable enough for infra hardening and monitoring.

---

### Stage 1: Backend Foundation

Status: **Complete**

Operational impact:

- Middleware baseline (security headers, CORS, request IDs) is active.
- REST and WS transport foundations are running and observable.

---

### Stage 2: Frontend Transport Spine

Status: **Complete**

Operational impact:

- WebSocket client/store pipeline is stable for realtime operations.
- Reconnect and reducer flow exists for operational recovery behavior.

---

### Stage 3: Session Lifecycle Vertical Slice

Status: **Complete**

Operational impact:

- DM-only lifecycle mutations reduce unintended state transitions.
- Session transitions can now be monitored and audited as first-class state changes.

---

### Stage 4: Chat Vertical Slice

Status: **Complete**

Operational impact:

- Privacy-safe chat and whisper behavior is productionized.
- System messages are immutable, reducing moderation ambiguity and audit drift.

---

### Stage 5: Notes Vertical Slice

Status: **Complete**

Operational impact:

- Notes visibility/privacy model is enforced server-side.
- Publish-to-chat actions are logged for admin telemetry and audit workflows.

---

### Stage 6: Presence and Rooms

Status: **Complete**

Operational impact:

- Redis-first realtime state with DB snapshot recovery is in place.
- Session transitions now drive bulk room reassignment with websocket transition events.
- Reconnect hydration is atomic for room/presence topology.

Remaining scope:

- Broader multi-client e2e/load coverage for reconnect/recovery and transition fanout behavior.

---

### Stage 7: Audio and LiveKit Integration

Status: **In progress (partial implementation)**

Completed so far:

- Audio event types are registered in backend/frontend WS dispatcher flows.
- LiveKit token issuance endpoint is implemented (`POST /api/livekit/token`) with auth/session-membership checks.
- LiveKit token generation service is implemented (server SDK integration + token grant construction).
- Frontend LiveKit connection hook is implemented (token fetch, connect/disconnect, participant/track lifecycle).
- Frontend audio engine hook is implemented with WebAudio graph setup and effect stack application logic.
- Environment configuration keys exist for LiveKit integration.

Remaining scope:

- Wire LiveKit/audio hooks into active frontend session UI flow (currently implemented but not mounted in runtime UI path).
- Complete backend WS audio handler registration for the full audio event set (`EFFECT_REMOVED`, `PRESET_LOADED`, `DM_OVERRIDE_REMOVED` are not currently dispatcher-registered).
- Implement room-scoped audio controls + DM override enforcement with persistent state/audit semantics.
- Add end-to-end integration tests for token flow and multi-client audio behavior beyond event-envelope shape validation.

---

### Stage 8: Admin and Ops Layer

Status: **In progress (partial completion)**

Completed so far:

- Admin SPA shell and section scaffolding are implemented.
- Backend telemetry endpoints are implemented:
  - `/api/admin/telemetry/dashboard`
  - `/api/admin/telemetry/status`
  - `/api/admin/telemetry/logs`
- Logs endpoint supports server-side filtering, pagination, and sorting.
- Admin logs table is wired to server-side pagination and sorting.
- Backend admin auth primitives exist (`createAdminToken`/`verifyAdminToken` + `adminAuthMiddleware`) but are not yet enforced on telemetry routes.
- Admin frontend auth store remains baseline-disabled (login returns "not enabled").

Remaining scope:

- Enforce admin authentication/authorization on admin API routes (telemetry is currently accessible without admin auth middleware).
- Moderation actions with audit trail (suspend/force logout/etc).
- Persistent telemetry sources (currently in-memory/baseline metrics in parts).
- Detail panels replacing placeholder actions (for example log entry expand UX).

Exit criteria:

- Authenticated admin workflows with readonly telemetry and controlled actions, fully auditable.

---

### Stage 9: Frontend UI Command-Center Completion

Status: **Planned**

Operational impact:

- Completes persona-aware DM/Player/Spectator UI surfaces and documented panel/tooling behavior.
- Brings UI theming/motion/loading/error/recovery specs into enforceable delivery scope.

Milestone checkpoints and target validation:

- **Stage 9.1: Layout and Persona Shell Parity**
  - Validation targets: persona visibility tests, right-panel interaction tests, responsive shell checks.
- **Stage 9.2: DM Controls and Realtime UX**
  - Validation targets: DM-only reducer/event tests, persona restriction tests, WS contract alignment checks.
- **Stage 9.3: UX Reliability and Spec Compliance**
  - Validation targets: reconnect/hydration integration tests, deterministic error-toast tests, theme/motion regression checks.
  - Implementation checklist: adopt frontend log-level controls and telemetry separation per [docs/operations/TELEMETRY.md](docs/operations/TELEMETRY.md#L102), [docs/operations/TELEMETRY.md](docs/operations/TELEMETRY.md#L174), and validation gates in [docs/operations/TELEMETRY.md](docs/operations/TELEMETRY.md#L430).

---

### Stage 10: Admin UI Feature Completion and Secure Operations

Status: **Planned**

Operational impact:

- Converts admin shell from readonly baseline to authenticated, auditable operations workflows.
- Closes remaining action and detail-panel gaps for users/rooms/settings/logs.

Milestone checkpoints and target validation:

- **Stage 10.1: Authentication and Guardrail Enforcement**
  - Validation targets: admin API authz tests, protected-route UI tests, pre-auth data exposure checks.
- **Stage 10.2: Operational Actions Activation**
  - Validation targets: moderation/action endpoint tests, action-dialog UX tests, audit-entry assertions per action.
- **Stage 10.3: Durable Telemetry and Drill-Down Workflows**
  - Validation targets: telemetry/audit persistence tests, logs detail/filter/sort/pagination integrity tests, end-to-end operator journey tests.
  - Implementation checklist: implement backend log stream/sink model from [docs/operations/TELEMETRY.md](docs/operations/TELEMETRY.md#L235), align endpoints with [docs/architecture/API-SPEC.md](docs/architecture/API-SPEC.md#L437), and verify admin observability outcomes using [docs/operations/TELEMETRY.md](docs/operations/TELEMETRY.md#L430).

---

### Stage 11: Metadata, Journal, History, and Search Surfaces

Status: **Planned**

Operational impact:

- Adds long-term campaign knowledge surfaces and discoverability workflows across sessions.

---

### Stage 12: Import/Export, Recordings Metadata, and Archival Workflows

Status: **Planned**

Operational impact:

- Enables campaign portability, retention, and durable archival operations.

---

### Stage 13: Extension and Overlay Integration (VTT Bridge)

Status: **Planned**

Operational impact:

- Integrates extension/overlay workflows with core event/state/privacy model for supported VTT platforms.

---

## 3) Current Priority Queue

Priority 1:

- Complete Stage 8 security closure: enforce admin auth on routes + role-gated ops actions + audit logging UX.

Priority 2:

- Stage 6 presence/rooms hardening: multi-client e2e/load validation + rollout strategy.

Priority 3:

- Stage 7 runtime integration: mount livekit/audio hooks in UI, complete WS handler registration, and add e2e validation.

Priority 4:

- Stage 9 frontend UI command-center completion and UI-spec conformance.

Priority 5:

- Stage 10 admin UI secure action workflows and durable auditability.

Priority 6:

- Stage 11/12 knowledge and portability domains (metadata/journal/history/search + import/export/recordings metadata).

---

## 4) Risks and Dependencies

Key risks:

- Admin telemetry endpoints are mounted without admin auth enforcement; internet-facing deployment risk until route guards are applied.
- Admin telemetry currently mixes real signals with baseline placeholders in some metrics.
- In-memory admin log history and WS recovery state are not durable across process restarts.
- UI specification breadth creates delivery/consistency risk without stage-specific checkpoints (layout, theming, motion, loading, error handling, recovery).
- Several documented domains (metadata timeline, journal/history/search, import/export, recordings metadata, extension bridge) remain planned rather than closed runtime slices.
- Contract-vs-concept terminology drift in docs must continue to be managed carefully.
- Custom-share recipient UX depends on session membership hydration (users appear after joining session).
- Prisma schema is updated, but migration history is not yet committed; DB rollout consistency risk remains.

Dependencies before later stages:

- Stage 6 depends on authoritative presence state model and reconnection strategy (complete).
- Stage 7 depends on stable room/presence semantics and token lifecycle reliability (ready).

---

## 5) Progress Log (Condensed)

- 2026-04: Stage 3 session lifecycle implemented and validated.
- 2026-04: Stage 4 chat baseline implemented (privacy-safe whisper filtering).
- 2026-04: Stage 5 notes vertical slice closed with visibility controls, custom-share selector UX, websocket propagation tests, and publish audit logging hooks.
- 2026-04: Stage 6 finalized with Redis-first presence/rooms, snapshot recovery, transition orchestration, authz hardening, and reconnect topology hydration.
- 2026-04: Stage 8 readonly telemetry endpoints + admin telemetry table pagination/sorting implemented.
- 2026-04: Stage 7 moved from scaffolded to partial implementation: LiveKit token route/service and frontend livekit/audio hooks are now present; runtime UI mounting and full WS audio registration remain pending.
- 2026-04: Latest backend verification: 8 test files / 29 tests passing.
- 2026-04: Roadmap scope expanded beyond Stage 8 to include Stages 9-13 for full UI/admin completion and remaining platform domains.

---

## 6) Definition of Done for Operations Roadmap

Operations roadmap complete when:

- Stages 0-13 all meet their exit criteria.
- Security and auditability requirements are met for internet-facing operation.
- Monorepo builds cleanly and stage-critical journeys are test-covered.
- Admin telemetry and moderation controls are authenticated, role-gated, and durably auditable.

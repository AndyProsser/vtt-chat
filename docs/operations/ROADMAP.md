# VTT Chat Operations Roadmap and Progress Record

This document is the operations-focused roadmap snapshot for VTT Chat.
It is intentionally aligned with the root roadmap and tracks:

- What has been completed
- What is currently in progress
- What remains for each stage
- Operational exit criteria
- Immediate next operational milestones

Last updated: 2026-04-21

Mirror reference: Keep this operations snapshot in sync with primary roadmap [ROADMAP.md](../../ROADMAP.md).

---

## 1) Executive Status

Current overall status: **Stages 0-8 complete (baseline), Stage 9 now in progress (9.1 started), Stages 10-13 planned remaining scope**.

- Contract and architecture baseline are in place.
- Core backend/frontend spine is operational.
- Session lifecycle and chat vertical slices are implemented and building.
- Admin shell and readonly telemetry baseline are now implemented.
- Notes vertical slice is now operational with persisted CRUD + visibility controls.
- Presence/rooms vertical slice includes mounted APIs, Redis-first state, DB snapshot recovery, frontend indicators, and transition notifications; final hardening/e2e remains.
- Audio/livekit vertical slice baseline is complete (token issuance route + mounted frontend hooks + backend audio control routes + websocket dispatcher coverage), while durable audio-state recovery and broader reconnect/e2e hardening remain pending.
- Frontend command-center Stage 9 is now underway with an initial 9.1 shell slice delivered (explicit left/center/right panel frame, persona-aware right-rail tab matrix, and panel toggle behavior).

Latest verification:

- Monorepo build passes (`backend`, `frontend`, `admin`).
- Workspace lint passes (`npm run lint`).
- Frontend tests pass for app shell, websocket dispatcher wiring, LiveKit hook race-safety behavior, audio engine behavior, store system wiring, and command-center shell persona/panel behavior.
- Current frontend verification: `7` test files / `21` tests passing.
- Backend tests pass for chat system-message protections, notes visibility transitions, notes websocket propagation, campaign/users API coverage, WS dispatcher/handlers/state-recovery units, room recovery/transition sequencing integration coverage, and audio/livekit event envelope coverage.
- Current backend verification: `13` passed + `1` skipped test files; `53` passing tests + `6` todo markers (`59` total).
- Admin test coverage gap: current automated coverage is still centered on shared backend/frontend runtime slices; there are not yet dedicated admin route suites or admin SPA interaction suites covering Stage 8/10 workflows end-to-end.

### Stage Completion Checklist (At a Glance)

| Stage | Area                                | Status      | Completion                | Immediate focus                                         |
| ----- | ----------------------------------- | ----------- | ------------------------- | ------------------------------------------------------- |
| 0     | Contract lock                       | Complete    | ✅                        | Maintain contract/source-of-truth discipline            |
| 1     | Backend foundation                  | Complete    | ✅                        | Ongoing hardening + reliability                         |
| 2     | Frontend transport spine            | Complete    | ✅                        | Keep reducer/event contract parity                      |
| 3     | Session lifecycle                   | Complete    | ✅                        | Regression coverage during later stage work             |
| 4     | Chat vertical slice                 | Complete    | ✅                        | UX/moderation polish as follow-up                       |
| 5     | Notes vertical slice                | Complete    | ✅                        | Advanced workflows and audit polish                     |
| 6     | Presence and rooms                  | Complete    | ✅                        | Multi-client e2e/load hardening                         |
| 7     | Audio + LiveKit                     | Complete    | ✅                        | Multi-client e2e + persistence hardening                |
| 8     | Admin + ops baseline                | Complete    | ✅                        | Stage 10 secure ops workflows + durable telemetry       |
| 9     | Frontend command-center completion  | In progress | 🟨 9.1 started            | Complete 9.1 parity, then begin 9.2 DM control surfaces |
| 10    | Admin UI feature completion         | Planned     | ⬜ Not started (as stage) | Secure ops actions + drill-down workflows               |
| 11    | Metadata/journal/history/search     | Planned     | ⬜ Not started            | Knowledge surfaces + discoverability                    |
| 12    | Import/export + recordings metadata | Planned     | ⬜ Not started            | Portability + archival workflows                        |
| 13    | Extension/overlay integration       | Planned     | ⬜ Not started            | VTT bridge contracts + privacy-safe sync                |

Legend: ✅ complete, 🟨 in progress, ⬜ planned/not started.

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

Status: **Complete (baseline)**

Completed so far:

- Audio event types are registered in backend/frontend WS dispatcher flows.
- LiveKit token issuance endpoint is implemented (`POST /api/livekit/token`) with auth/session-membership checks.
- LiveKit token generation service is implemented (server SDK integration + token grant construction).
- Frontend LiveKit connection hook is implemented (token fetch, connect/disconnect, participant/track lifecycle).
- Frontend audio engine hook is implemented with WebAudio graph setup and effect stack application logic.
- Frontend runtime mounts audio/livekit integration through `AudioPanel` in the active session room path.
- Backend audio control API routes are implemented and mounted (`/api/audio/presets`, `/api/audio/environment`, `/api/audio/dm-override/apply`, `/api/audio/dm-override/remove`, `/api/audio/state/:sessionId`).

Remaining scope:

- Persist room-scoped audio control state and DM overrides for durable restart recovery.
- Align LiveKit/recovery documentation to distinguish shipped baseline behavior from future-state reconnect and hydration flows.
- Add multi-client end-to-end validation for token flow, audio event fanout, and override behavior.
- Expand audit/telemetry detail for audio control mutations.

---

### Stage 8: Admin and Ops Layer

Status: **Complete (baseline)**

Completed so far:

- Admin setup/login/invite onboarding and app-admin handoff flows are operational.
- Backend telemetry endpoints are implemented and authenticated:
  - `/api/admin/telemetry/dashboard`
  - `/api/admin/telemetry/status`
  - `/api/admin/telemetry/logs`
- Moderation routes are implemented and role-gated (`suspend`, `restore`, `force-logout`, role promotion).
- Persistent admin audit trail is implemented and included in telemetry/log queries.
- Admin users and logs pages are wired to backend operations with filters, pagination, sorting, and inline detail views.

Residual work moved to Stage 10:

- Dashboard/status telemetry still mixes real signals with proxy/synthetic values in some cards/charts.
- Rooms & Campaigns and Settings remain scaffold-heavy and need real operational workflows.
- Durable telemetry sinks and broader admin-specific automated coverage remain follow-up work.

---

### Stage 9: Frontend UI Command-Center Completion

Status: **In progress (Stage 9.1 started)**

Operational impact:

- Completes persona-aware DM/Player/Spectator UI surfaces and documented panel/tooling behavior.
- Brings UI theming/motion/loading/error/recovery specs into enforceable delivery scope.

Completed so far:

- Stage 9.1 initial shell implementation is now in runtime:
  - Explicit three-panel command-center frame (left rail + center pane + right rail) mounted in active sessions.
  - Center pane toggle between chat and notes is implemented.
  - Persona-specific right-rail tab visibility matrix is implemented (DM/Player/Spectator).
  - Right-rail open/close lifecycle is implemented.
  - Component tests now cover tab visibility matrix and panel toggle behavior.

Milestone checkpoints and target validation:

- **Stage 9.1: Layout and Persona Shell Parity**
  - Current status: explicit three-panel frame, center chat/notes toggle, and persona tab visibility matrix are implemented; full toolbar/campaign/toast composition and responsive parity remain.
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

- Stage 9.1 completion: finish toolbar/campaign/toast parity and responsive behavior on top of the shipped three-panel command-center shell.

Priority 2:

- Stage 9.2 DM control surfaces and realtime flows: DM voice bar, advanced overrides, and room drag/drop polish.

Priority 3:

- Stage 10 admin UI secure action workflows and durable telemetry hardening.

Priority 4:

- Stage 6 presence/rooms hardening: multi-client e2e/load validation + rollout strategy.

Priority 5:

- Stage 7 runtime integration hardening: multi-client validation, reconnect coverage, and durable audio-state recovery.

Priority 6:

- Stage 11/12 knowledge and portability domains, then Stage 13 extension and overlay integration after Stage 10.4 external system authorization.

---

## 4) Risks and Dependencies

Key risks:

- Admin telemetry currently mixes real signals with baseline placeholders in some metrics.
- Some admin surfaces are still scaffold-heavy (`Rooms & Campaigns`, `Settings`) even though Stage 8 baseline auth/moderation/audit is complete.
- In-memory admin log history and WS recovery state are not durable across process restarts.
- Admin-specific automated coverage remains thinner than core runtime slices.
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

- 2026-04: Stage 9.1 started in frontend runtime. Added explicit three-panel command-center shell (left rail + center pane + right rail), role-aware right-rail tab visibility for DM/Player/Spectator, and right-rail open/close behavior. Added component coverage for persona matrix and panel toggles via `frontend/src/tests/components/CommandCenterFrame.test.tsx`; frontend verification now reports `7` files / `21` tests passing.
- 2026-04: Stage 3 session lifecycle implemented and validated.
- 2026-04: Stage 4 chat baseline implemented (privacy-safe whisper filtering).
- 2026-04: Stage 5 notes vertical slice closed with visibility controls, custom-share selector UX, websocket propagation tests, and publish audit logging hooks.
- 2026-04: Stage 6 finalized with Redis-first presence/rooms, snapshot recovery, transition orchestration, authz hardening, and reconnect topology hydration.
- 2026-04: Stage 8 readonly telemetry endpoints + admin telemetry table pagination/sorting implemented.
- 2026-04: Stage 7 baseline completed with runtime-mounted livekit/audio hooks, backend audio control routes, and dispatcher coverage; remaining durability/e2e concerns are tracked as hardening follow-up.
- 2026-04: Latest backend verification: `13` passed + `1` skipped test files; `53` passing tests + `6` todo markers (`59` total).
- 2026-04: Roadmap scope expanded beyond Stage 8 to include Stages 9-13 for full UI/admin completion and remaining platform domains.

---

## 6) Definition of Done for Operations Roadmap

Operations roadmap complete when:

- Stages 0-13 all meet their exit criteria.
- Security and auditability requirements are met for internet-facing operation.
- Monorepo builds cleanly and stage-critical journeys are test-covered.
- Admin telemetry and moderation controls are authenticated, role-gated, and durably auditable.

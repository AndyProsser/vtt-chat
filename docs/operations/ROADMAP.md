# VTT Chat Operations Roadmap and Progress Record

This document is the operations-focused roadmap snapshot for VTT Chat.
It is intentionally aligned with the root roadmap and tracks:

- What has been completed
- What is currently in progress
- What remains for each stage
- Operational exit criteria
- Immediate next operational milestones

Last updated: 2026-04-29

Mirror reference: Keep this operations snapshot in sync with primary roadmap [ROADMAP.md](../../ROADMAP.md).

---

## 1) Executive Status

Current overall status: **Stages 0-10 complete (baseline + command-center + secure admin ops), Stage 11 in progress, Stages 12-13 planned remaining scope**.

- Contract and architecture baseline are in place.
- Core backend/frontend spine is operational.
- Session lifecycle and chat vertical slices are implemented and building.
- Admin shell and readonly telemetry baseline are now implemented.
- Notes vertical slice is now operational with persisted CRUD + visibility controls.
- Presence/rooms vertical slice includes mounted APIs, Redis-first state, DB snapshot recovery, frontend indicators, and transition notifications; final hardening/e2e remains.
- Audio/livekit vertical slice baseline is complete (token issuance route + mounted frontend hooks + backend audio control routes + websocket dispatcher coverage), while durable audio-state recovery and broader reconnect/e2e hardening remain pending.
- Frontend command-center Stage 9.1 layout/persona shell parity is now complete (three-panel shell, toolbar action model, extracted shell components, persona tab matrix, and responsive layout tests).
- Stage 9.2 is now advanced beyond the initial slice: DM control surfaces now include advanced player overrides (distance/condition/filter), DM voice preset controls, and authoritative drag/drop room movement via backend room-move endpoint + websocket reconciliation.
- Stage 11 has now started in the frontend runtime with real command-center search, journal, and history panels backed by persisted chat, notes, and session-log data.
- A UI modernization track is now defined to standardize frontend core UI on Radix/Tailwind/tokens and admin UI on MUI, delivered incrementally to avoid disrupting active stage work.
- WP2 framework foundations are complete.
- WP3 token/theme normalization is complete with root theme-class support and Tailwind token mapping.
- WP4 shell and primitive migration is complete for frontend shell/auth surfaces and admin MUI-driven shell controls.
- WP5 feature surface migration is complete across command-center, chat/notes/audio-room controls, and key admin operations pages.
- WP6 cleanup/enforcement is complete with removal of obsolete CSS and infra path/documentation cleanup.

Latest verification:

- Monorepo build passes (`backend`, `frontend`, `admin`).
- Workspace lint passes (`npm run lint`).
- Frontend tests pass for app shell, websocket dispatcher wiring, LiveKit hook race-safety behavior, audio engine behavior, store system wiring, and command-center shell persona/panel behavior.
- Current frontend verification: `15` test files / `115` tests passing.
- Backend tests pass for chat system-message protections, notes visibility transitions, notes websocket propagation, campaign/users API coverage, WS dispatcher/handlers/state-recovery units, room recovery/transition sequencing integration coverage, and audio/livekit event envelope coverage.
- Current backend verification: `13` passed + `1` skipped test files; `57` passing tests + `6` todo markers (`63` total).
- Admin tests now include dedicated suites for auth-store lifecycle and admin API utility behavior.
- Current admin verification: `2` passed test files; `9` passing tests.
- Admin SPA interaction and admin route integration/e2e suites remain planned follow-up work.

### Stage Completion Checklist (At a Glance)

| Stage | Area                                | Status      | Completion     | Immediate focus                                    |
| ----- | ----------------------------------- | ----------- | -------------- | -------------------------------------------------- |
| 0     | Contract lock                       | Complete    | ✅             | Maintain contract/source-of-truth discipline       |
| 1     | Backend foundation                  | Complete    | ✅             | Ongoing hardening + reliability                    |
| 2     | Frontend transport spine            | Complete    | ✅             | Keep reducer/event contract parity                 |
| 3     | Session lifecycle                   | Complete    | ✅             | Regression coverage during later stage work        |
| 4     | Chat vertical slice                 | Complete    | ✅             | UX/moderation polish as follow-up                  |
| 5     | Notes vertical slice                | Complete    | ✅             | Advanced workflows and audit polish                |
| 6     | Presence and rooms                  | Complete    | ✅             | Multi-client e2e/load hardening                    |
| 7     | Audio + LiveKit                     | Complete    | ✅             | Multi-client e2e + persistence hardening           |
| 8     | Admin + ops baseline                | Complete    | ✅             | Stage 10 secure ops workflows + durable telemetry  |
| 9     | Frontend command-center completion  | Complete    | ✅             | Maintain regression coverage during Stage 10+ work |
| 10    | Admin UI feature completion         | Complete    | ✅             | Stage 11 knowledge surfaces + Stage 13 guest prep  |
| 11    | Metadata/journal/history/search     | In Progress | 🟨 Started     | Knowledge panels + metadata follow-through         |
| 12    | Import/export + recordings metadata | Planned     | ⬜ Not started | Portability + archival workflows                   |
| 13    | Extension/overlay integration       | Planned     | ⬜ Not started | VTT bridge contracts + privacy-safe sync           |

Legend: ✅ complete, 🟨 in progress, ⬜ planned/not started.

### UI Modernization Track (Operations Snapshot)

| Work package | Scope                         | Status   | Operational gate                                                     |
| ------------ | ----------------------------- | -------- | -------------------------------------------------------------------- |
| WP1          | Spec alignment                | Complete | Planning docs agree on repo layout and migration order               |
| WP2          | Framework foundations         | Complete | New dependencies install/build cleanly on stable releases            |
| WP3          | Token/theme normalization     | Complete | Theme systems are framework-backed without runtime regressions       |
| WP4          | Shell and primitive migration | Complete | Core shells/providers move to the new framework layers               |
| WP5          | Feature surface migration     | Complete | High-traffic surfaces migrate incrementally with low regression risk |
| WP6          | Cleanup and enforcement       | Complete | Legacy layers removed only after verification                        |

### Appendix A) Target Files by Work Package

For exact PR slicing, use the root roadmap appendix in `ROADMAP.md` as the canonical file-target map for WP1-WP6.

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

Status: **Complete (Stages 9.1, 9.2, and 9.3 complete)**

Operational impact:

- Completes persona-aware DM/Player/Spectator UI surfaces and documented panel/tooling behavior.
- Brings UI theming/motion/loading/error/recovery specs into enforceable delivery scope.

Completed so far:

- Stage 9.1 layout/persona shell parity is complete in runtime:
  - Explicit three-panel command-center frame (left rail + center pane + right rail) mounted in active sessions.
  - `Toolbar`, `CampaignInfo`, `SystemToasts`, and `LeftRailSummary` shell surfaces are implemented as dedicated components.
  - Toolbar controls now use a minimal globally addressable store slice (`commandCenter`) for center-pane and right-rail actions.
  - Center pane toggle between chat and notes is implemented.
  - Persona-specific right-rail tab visibility matrix is implemented (DM/Player/Spectator).
  - Right-rail open/close lifecycle is implemented.
  - Component tests now cover persona matrix, panel toggles, and responsive desktop/tablet layout mode changes.
- Stage 9.2 DM control surfaces are now complete in runtime:
  - Audio right-rail tab now mounts a DM-only control surface (`DMAudioControls`) instead of placeholder-only copy.
  - DM voice bar now supports DM voice presets and advanced player overrides (distance, condition, filter) in addition to mute/gain controls.
  - Room drag/drop movement now calls an authoritative DM-only backend endpoint (`POST /api/rooms/:roomId/move-user`) and reconciles via websocket room events.
  - Frontend component coverage now includes DM-only gating, advanced override request behavior, drag/drop move request behavior, and optimistic/reconciliation assertions.
  - Backend API coverage now includes DM-only authorization/success-path tests and websocket emission payload assertions for authoritative room movement.
  - Frontend integration coverage now includes full DM drag/drop move flow validation against live room/presence websocket updates.
  - Frontend reducer/store coverage now includes distance/condition/filter transition assertions and DM override state transitions.
- Stage 9.3 reliability/spec-compliance work is now complete in runtime:
  - Added reconnect/hydration UX banner (`ReconnectBanner`) with deterministic state messaging for `connecting`, `reconnecting`, `disconnected`, and post-reconnect hydration.
  - Added reusable severity-based toast system (`Toast`) and wired `SystemToasts` to variant-driven non-blocking rendering semantics.
  - Added design-token + motion foundation (`theme.css`) and migrated command-center shell styles to tokenized surface/border/motion variables.
  - Added frontend logger level controls with runtime/browser/env precedence (`window.__VTT_LOG_LEVEL__`, `localStorage['vtt.log.level']`, `VITE_LOG_LEVEL`, safe fallback).
  - Replaced remaining direct frontend WS `console.*` calls with context-rich shared logger usage.
  - Added privacy-safe telemetry client utility with bounded queue, interval/unload/session-end flushing hooks, and sanitization of sensitive property keys.
  - Added Stage 9.3 validation coverage for toast semantics, reconnect/hydration lifecycle UI behavior, theme token/keyframe parity, logger controls, and telemetry separation checks.

Milestone checkpoints and target validation:

- **Stage 9.1: Layout and Persona Shell Parity**
  - Current status: complete. Three-panel shell, extracted shell components, toolbar action model, persona visibility matrix, and responsive layout checks are in place.
  - Validation targets: persona visibility tests, right-panel interaction tests, responsive shell checks.
- **Stage 9.2: DM Controls and Realtime UX**
  - Current status: complete. Advanced DM overrides, authoritative room drag/drop, websocket emission payload validation, websocket-driven move reconciliation integration coverage, and reducer/store-level audio transition coverage are now in place.
  - Validation targets: DM-only reducer/event tests, persona restriction tests, WS contract alignment checks.
  - Closure notes:
    - Backend route tests now assert websocket `ROOM:USER_LEFT`/`ROOM:USER_JOINED` emission payloads for `move-user`.
    - Integration coverage now exercises full DM drag/drop move flow against live room/presence websocket updates.
    - Reducer/store-level tests now cover distance/condition/filter transitions beyond request-level component assertions.
- **Stage 9.3: UX Reliability and Spec Compliance**
  - Validation targets: reconnect/hydration integration tests, deterministic error-toast tests, theme/motion regression checks.
  - Implementation checklist: adopt frontend log-level controls and telemetry separation per [docs/operations/TELEMETRY.md](docs/operations/TELEMETRY.md#L102), [docs/operations/TELEMETRY.md](docs/operations/TELEMETRY.md#L174), and validation gates in [docs/operations/TELEMETRY.md](docs/operations/TELEMETRY.md#L430).

---

### Stage 10: Admin UI Feature Completion and Secure Operations

Status: **Complete**

Operational impact:

- Converts admin shell from readonly baseline to authenticated, auditable operations workflows.
- Closes remaining action and detail-panel gaps for users/rooms/settings/logs.

Milestone checkpoints and target validation:

- **Stage 10.1: Authentication and Guardrail Enforcement**
  - Current status: in execution. Initial backend and admin SPA guardrail coverage is now in place.
  - Validation targets: admin API authz tests, protected-route UI tests, pre-auth data exposure checks.
- **Stage 10.2: Operational Actions Activation**
  - Current status: in execution. `Rooms & Campaigns` now uses authenticated live data/actions, with campaign archive/restore and room move-player operations added as the next active surface.
  - Validation targets: moderation/action endpoint tests, action-dialog UX tests, audit-entry assertions per action.
- **Stage 10.3: Durable Telemetry and Drill-Down Workflows**
  - Current status: kickoff started. Durable telemetry ingest persistence and persisted log-detail drill-down are now in initial implementation.
  - Validation targets: telemetry/audit persistence tests, logs detail/filter/sort/pagination integrity tests, end-to-end operator journey tests.
  - Implementation checklist: implement backend log stream/sink model from [docs/operations/TELEMETRY.md](docs/operations/TELEMETRY.md#L235), align endpoints with [docs/architecture/API-SPEC.md](docs/architecture/API-SPEC.md#L437), and verify admin observability outcomes using [docs/operations/TELEMETRY.md](docs/operations/TELEMETRY.md#L430).

  - Expansion tasks now active:
    - Persist runtime diagnostic stream entries so all log sources support durable drill-down retrieval.
    - Expose telemetry/diagnostic sink retention + rotation controls through admin settings workflows.
    - Keep logs UI interaction coverage green for filter/sort/pagination/detail surfaces.

  - Admin review findings now tracked as explicit Stage 10 tasks:
    - Remaining extraction/debt focus: split oversized pages into focused components/hooks while preserving existing operation coverage.

  - Stage 10 UI completion delivered (current increment):
    - `admin/src/pages/Analytics.tsx` placeholder replaced with telemetry-backed analytics workflows and route-level loading/error handling.
    - `admin/src/pages/Dashboard.tsx` scaffold note removed with explicit telemetry data-provenance messaging.
    - `admin/src/pages/PlatformStatus.tsx` chart placeholders replaced by real telemetry trend chart components.
    - `CampaignManagement.tsx`, `Settings.tsx`, `UserManagement.tsx`, and `Logs.tsx` decomposed into focused feature hooks/components while preserving validated behavior.

- **Stage 10.4: External System Authorization Panel**
  - Current status: complete.
  - Delivered runtime controls and tests for:
    - `GET/POST/PATCH /api/admin/integrations/systems` authorization routes.
    - Guest-auth and external-log-ingestion rejection for blocked/unrecognized systems (`INTEGRATION_NOT_AUTHORIZED`).
    - Admin `Integrations` UI workflows for authorize/log-only/block and notes updates.

- **Stage 10.5: UI Style Externalization Workstream (Ongoing)**
  - Scope: progressively migrate inline styles to external stylesheet files (`styles/`) where practical, starting with Stage 10 admin surfaces and all newly touched components.
  - Validation targets: new/updated Stage 10 components avoid inline `style={{ ... }}` unless styles must be computed dynamically at runtime; preserve visual parity for theme/responsive/interaction states; run lint/build/test checks after extraction batches.
  - Delivery note: this is an incremental, non-blocking stream that continues across Stage 10+.

Stage 10 closure note:

- Stage 10 exit criteria are now met; remaining observability hardening and broader UX depth continue under Stage 11+ workstreams.

---

### Stage 11: Metadata, Journal, History, and Search Surfaces

Status: **In Progress**

Operational impact:

- Adds long-term campaign knowledge surfaces and discoverability workflows across sessions.

Stage 11 frontend execution tasks:

- Replace placeholder frontend room components with production UI:
  - `frontend/src/components/rooms/AvatarOverlay.tsx` (speaking/muted/condition indicators)
  - `frontend/src/components/rooms/RoomSelector.tsx` (room list + occupancy + selection context)
- Complete command-center left-rail participant status visibility (DM/player presence + speaking/muted/condition state).
- Extend the new search/journal/history command-center surfaces beyond the current session runtime data sources and read-only baseline.
- Continue Stage 11 frontend CSS externalization by migrating remaining non-command-center inline surfaces to dedicated stylesheets with parity checks.
- Frontend review findings now tracked as explicit Stage 11 tasks:
  - Continue decomposition of oversized frontend session components (`SessionInit.tsx`, `DMAudioControls.tsx`) into focused subcomponents/hooks.
  - Continue iterating on the newly-wired `search`, `journal`, and `history` right-rail surfaces in `SessionInit` to close the remaining contract and UX gaps.
  - Close baseline placeholder component debt in metadata/audio/ui modules:
    - metadata: `MetadataCard.tsx`, `MetadataTimeline.tsx`
    - audio: `EnvironmentPanel.tsx`, `ConditionsPanel.tsx`, `DMVoicePanel.tsx`, `AudioStateSlideout.tsx`
    - UI primitives: `Button.tsx`, `Icon.tsx`, `Panel.tsx`
  - Resolve placeholder utility/type modules (`frontend/src/types/*.types.ts`, `frontend/src/utils/api.ts`, `frontend/src/utils/format.ts`, `frontend/src/utils/ws-events.ts`) by implementing concrete contracts or removing unused stubs.

Completed in latest Stage 11 increment:

- Consolidated frontend component CSS into centralized style paths under `frontend/src/styles/components/**`.
- Removed remaining inline SessionInit campaign/session/session-list styles and replaced with stylesheet classes.
- Added SessionInit integration test coverage for left-rail room switch behavior and participant status rendering.
- Replaced `SessionInit` right-rail placeholder copy for `search`, `journal`, and `history` with real Stage 11 panels backed by persisted chat history, visible notes, and session logs.
- Added shared Stage 11 panel styling plus focused panel tests and SessionInit integration coverage for the new right-rail workflows.
- Expanded the player command-center right rail to include `search`, `journal`, and `history` tabs in read-only mode.

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

- Stage 11 frontend command-center completion (avatar overlay, room selector, participant status UX, and CSS externalization).

Priority 2:

- Stage 13 guest-auth preparation (extension contracts, external identity/linking, and controlled rollout guardrails).

Priority 3:

- Cross-stage observability hardening (telemetry durability operations, export/rotation controls, and restart verification).

Priority 4:

- Stage 6 presence/rooms hardening: multi-client e2e/load validation + rollout strategy.

Priority 5:

- Stage 7 runtime integration hardening: multi-client validation, reconnect coverage, and durable audio-state recovery.

Priority 6:

- Stage 12/13 knowledge + extension integration after Stage 10.4 external system authorization.

Priority 7:

- Stage 9 regression hardening while Stage 10/11 scope expands.

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

- 2026-04: Stage 10.2 kickoff delivered. Activated `Rooms & Campaigns` with live backend campaign/session/room data and authenticated session-end action path; style externalization rule applied through a dedicated page stylesheet.
- 2026-04: Stage 10.2 expansion delivered. Added backend campaign archive/restore + room move-player admin actions with audit hooks and authz coverage, added dedicated admin interaction tests for live Rooms & Campaigns flows (filters, selection, end-session success/failure), and activated Settings with authenticated backend save/backup workflows plus externalized page styling.
- 2026-04: Stage 10.3 kickoff started with durable telemetry ingest sink persistence plus persisted log drill-down route (`GET /api/admin/telemetry/logs/:logId`) for telemetry and admin-audit entries.
- 2026-04: Stage 10.3 durability hardening increment delivered. Added persisted diagnostic stream drill-down parity, sink retention/rotation policy controls in admin settings, and logs UI interaction tests for filter/sort/pagination/detail flows.
- 2026-04: Stage 11 frontend scope expanded. Placeholder `AvatarOverlay` and `RoomSelector` are now tracked as explicit Stage 11 deliverables, along with left-rail participant status completion and Stage 11 frontend CSS externalization.
- 2026-04: Stage 11 CSS consolidation increment delivered. Migrated frontend component CSS into `frontend/src/styles/components/**`, extracted remaining inline SessionInit campaign/session/session-list styles, and added SessionInit left-rail room-switch integration test coverage.
- 2026-04: Stage 10.1 execution pass delivered. Added backend admin authz regression tests for public vs protected route boundaries and invalid-token rejection, plus admin SPA guard tests covering login routing, authenticated dashboard rendering, and forced logout when session validation returns unauthorized.
- 2026-04: Stage 10 commenced. Added Stage 10.5 as a tracked workstream for incremental CSS externalization (`styles/`) and began first-pass admin inline-style extraction to separate visuals from component logic.
- 2026-04: Stage 9.3 completed and Stage 9 closed. Implemented frontend logger controls (`setLevel`, `getLevel`, `enableConsole`) with precedence model, migrated remaining WS path ad-hoc `console.*` calls to shared logger contexts, added privacy-safe telemetry client batching/sanitization utilities, and added validation tests for logger controls + telemetry/console separation checks. Frontend verification now reports `15` passed test files / `115` passing tests.
- 2026-04: Stage 9.3 started in frontend runtime. Added reconnect/hydration status banner UX, variant-based non-blocking toast rendering, tokenized theming foundation with motion keyframes, and Stage 9.3 regression tests for reconnect lifecycle, toast semantics, and theme-token parity. Frontend verification now reports `13` passed test files / `106` passing tests.
- 2026-04: Full verification snapshot: build ✅ (`npm run build` at repo root), lint ✅ (`npm run lint` at repo root), tests ✅ (backend `57` passing + `6` todo, frontend `36` passing, admin `9` passing).
- 2026-04: Standardized Vitest coverage reporting delivered across backend/frontend/admin. Added per-package `test:coverage` scripts, root `test:coverage` aggregator, V8 coverage reporters (`text`, `html`, `json-summary`), and enforced baseline thresholds (backend: branches `18`, functions `24`, lines/statements `22`; frontend: branches `20`, functions/lines/statements `25`; admin: branches `6`, functions/lines/statements `7`).
- 2026-04: Stage 9.1 started in frontend runtime. Added explicit three-panel command-center shell (left rail + center pane + right rail), role-aware right-rail tab visibility for DM/Player/Spectator, and right-rail open/close behavior. Added component coverage for persona matrix and panel toggles via `frontend/src/tests/components/CommandCenterFrame.test.tsx`; frontend verification now reports `7` files / `21` tests passing.
- 2026-04: Stage 9.1 completed. Added toolbar action model backed by global `commandCenter` store slice, extracted `CampaignInfo`/`SystemToasts`/`LeftRailSummary` components, and extended responsive layout testing for desktop/tablet breakpoint transitions. Frontend verification now reports `7` files / `24` tests passing.
- 2026-04: Stage 9.2 started with the first DM command-center audio control surface. Added API-backed DM audio controls (`DMAudioControls`) to the right-rail audio tab for room environment apply plus per-player mute/gain overrides, with DM-only gating and component tests. Frontend verification now reports `8` files / `27` tests passing.
- 2026-04: Stage 9.2 advanced pass delivered. Extended `DMAudioControls` with DM voice presets plus distance/condition/filter overrides, and switched drag/drop room movement to authoritative backend control via `POST /api/rooms/:roomId/move-user` with websocket reconciliation. Added backend authz/success coverage for `move-user` and expanded frontend component coverage; verification now reports frontend `8` files / `30` tests and backend `55` passing tests + `6` todo markers (`61` total).
- 2026-04: Stage 9.2 completion pass delivered. Added backend websocket payload assertions for `ROOM:USER_LEFT`/`ROOM:USER_JOINED` on `POST /api/rooms/:roomId/move-user`, added integration coverage for full DM drag/drop flow against live room/presence websocket updates, and added reducer/store-level coverage for distance/condition/filter + DM override state transitions.
- 2026-04: Full-suite verification refresh run completed. Frontend now reports `9` passed test files with `36` passing tests. Backend now reports `13` passed + `1` skipped test files with `57` passing tests + `6` todo markers (`63` total).
- 2026-04: Stage 3 session lifecycle implemented and validated.
- 2026-04: Stage 4 chat baseline implemented (privacy-safe whisper filtering).
- 2026-04: Stage 5 notes vertical slice closed with visibility controls, custom-share selector UX, websocket propagation tests, and publish audit logging hooks.
- 2026-04: Stage 6 finalized with Redis-first presence/rooms, snapshot recovery, transition orchestration, authz hardening, and reconnect topology hydration.
- 2026-04: Stage 8 readonly telemetry endpoints + admin telemetry table pagination/sorting implemented.
- 2026-04: Stage 7 baseline completed with runtime-mounted livekit/audio hooks, backend audio control routes, and dispatcher coverage; remaining durability/e2e concerns are tracked as hardening follow-up.
- 2026-04: Latest backend verification: `13` passed + `1` skipped test files; `57` passing tests + `6` todo markers (`63` total).
- 2026-04: Roadmap scope expanded beyond Stage 8 to include Stages 9-13 for full UI/admin completion and remaining platform domains.

---

## 6) Definition of Done for Operations Roadmap

Operations roadmap complete when:

- Stages 0-13 all meet their exit criteria.
- Security and auditability requirements are met for internet-facing operation.
- Monorepo builds cleanly and stage-critical journeys are test-covered.
- Admin telemetry and moderation controls are authenticated, role-gated, and durably auditable.

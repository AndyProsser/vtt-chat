# VTT Chat Roadmap and Progress Record

This document is the active roadmap and delivery log for VTT Chat.
It tracks:

- What has been completed
- What is currently in progress
- What remains for each stage
- Exit criteria for stage completion
- Immediate next milestones

Last updated: 2026-04-19

---

## 1) Executive Status

Current overall status: **Stages 0-6 complete, Stage 7 partially implemented, Stage 8 partially complete, Stages 9-13 now defined as planned remaining scope**.

- Contract and architecture baseline are in place.
- Core backend/frontend spine is operational.
- Session lifecycle and chat vertical slices are implemented and building.
- Admin shell and readonly telemetry baseline are now implemented.
- Notes vertical slice is now operational with persisted CRUD + visibility controls.
- Presence/rooms vertical slice now includes mounted APIs, Redis-first state, DB snapshot recovery, frontend indicators, and transition notifications; final hardening/e2e remains.
- Audio/livekit vertical slice is now partially implemented (token issuance route + client/audio hooks), with runtime integration and hardening still pending.
- Frontend command-center UI and admin operations UI scope are now explicitly tracked as post-Stage 8 delivery stages.

Latest verification:

- Monorepo build passes (`backend`, `frontend`, `admin`).
- Backend tests pass for chat system-message protections, notes visibility transitions, notes websocket propagation, campaign/users API coverage, room recovery/transition sequencing integration coverage, and audio/livekit event envelope coverage.
- Current backend verification: `8` test files / `29` tests passing.

---

## 2) Stage-by-Stage Progress

### Stage 0: Contract Lock

Status: **Complete**

Goal:

- Define and freeze event names, payload schemas, and permission checks.

Completed:

- Shared package contracts established under `shared/`.
- Core event envelope, validators, permission matrix, and error model implemented.
- Documentation alignment pass completed, with compatibility notes added where conceptual docs differ from runtime contracts.

Exit criteria:

- Shared contract package is canonical and consumed by backend/frontend.

---

### Stage 1: Backend Foundation

Status: **Complete**

Goal:

- Minimal REST and WebSocket handshake contracts.

Completed:

- Backend bootstrap and middleware stack active.
- Health/auth/session baseline endpoints in place.
- WebSocket manager with auth handshake and dispatcher pipeline.
- Baseline hardening applied (security headers, CORS, rate limits, request IDs).

Exit criteria:

- Deterministic error model and baseline transport contracts operational.

---

### Stage 2: Frontend Transport Spine

Status: **Complete**

Goal:

- UI -> Event -> Reducer -> Store -> UI pipeline running end-to-end.

Completed:

- WebSocket client and dispatcher flow operational.
- Zustand root store and domain slices wired.
- App-level auth/session bootstrap path connected.

Exit criteria:

- Frontend transport and state flow proven with live event handling.

---

### Stage 3: Session Lifecycle Vertical Slice

Status: **Complete**

Goal:

- Role-aware session transitions: `IDLE -> ACTIVE -> PAUSED -> ENDED`.

Completed:

- DM-only session mutation enforcement on backend routes.
- Session list hydration and lifecycle controls on frontend.
- Session state transitions with role-gated controls.

Exit criteria:

- End-to-end session lifecycle flow validated for DM/player/spectator views.

---

### Stage 4: Chat Vertical Slice

Status: **Complete**

Goal:

- IC/OOC/public messaging and whispers with strict visibility filtering.

Completed:

- Chat REST endpoints for send/edit/delete/history.
- Prisma-backed chat service with whisper visibility filtering and soft-delete/edit support.
- Session boundary system messages (started/paused/resumed/ended) are persisted and broadcast.
- System messages are immutable (not editable/deletable).
- WS broadcast support with optional recipient filtering.
- Frontend chat window/input/list wired to backend telemetry and event flow.
- Frontend WS client now supports backend wrapper messages (`WS:EVENT`, `WS:CONNECTED`, `WS:ACK`, `WS:ERROR`).
- Frontend whisper flow supports recipient targeting via `recipientId`.

Notes:

- Current implementation is complete for privacy-safe chat behavior and transport compatibility.
- Advanced UX and moderation enhancements may be added in later polish passes.

Exit criteria:

- Room-safe public chat + whisper privacy behavior operational.

---

### Stage 5: Notes Vertical Slice

Status: **Complete**

Goal:

- Private notes, then shared/DM notes with role-filtered selectors.

Completed:

- Notes CRUD routes are implemented and mounted.
- Notes visibility model is enforced (DM_ONLY, PLAYERS_VISIBLE, CUSTOM).
- Notes publish-to-chat flow is implemented.
- Frontend notes panel/card UX is implemented and connected to APIs/store.
- Notes custom-share UX now supports session-user selection with username labels (manual ID fallback retained).
- Notes persistence is backed by Prisma repository/service layers.
- Notes visibility transition tests are in place.
- Notes route-level websocket propagation tests are in place for create/publish flows.
- Notes publish actions are logged for admin telemetry/audit workflows.

Exit criteria:

- Privacy model validated for note ownership and visibility transitions.
- Persisted notes flow is productionized with websocket propagation coverage and publish audit hooks.

---

### Stage 6: Presence and Rooms

Status: **Complete**

Goal:

- Presence state machine and room membership transitions.

Completed so far:

- Rooms and presence APIs are implemented and mounted (`/api/rooms`, `/api/presence`).
- Redis-first realtime presence state is implemented for room membership and activity updates.
- Presence persistence is implemented via Prisma `PresenceSnapshot` records.
- Redis failure recovery path now restores session presence from DB snapshots when realtime state is empty.
- WebSocket lifecycle now marks users online/offline and persists periodic presence snapshots.
- Room and presence schema/repository/service layers are implemented (no longer placeholders).
- Session state transitions now orchestrate bulk room membership semantics for session members (ACTIVE -> Main Room, PAUSED/ENDED -> Green Room) with presence state alignment.
- Explicit websocket transition events are broadcast for bulk session-room moves (`ROOM:SESSION_TRANSITION_APPLIED`).
- Frontend room/presence store now hydrates from APIs on connect/reconnect and applies room/presence websocket updates.
- Frontend presence-and-rooms indicators are implemented with live member presence states.
- Frontend transition notification banner/toast is implemented with subtle enter/exit animation and stable layout slot.
- Integration tests now cover Redis-empty snapshot recovery and repeated transition sequencing behavior.
- Presence and room APIs now enforce session-member authorization for read and membership-transition endpoints.
- Shared event contracts now include `ROOM:SESSION_TRANSITION_APPLIED` typing end-to-end.
- UI reconnect recovery now applies atomic room+presence topology hydration.
- Prisma migration status validates DB/schema alignment for Stage 6 changes (no new schema migration required).

Remaining scope:

- Broader multi-client e2e/load coverage for reconnect/recovery and transition fanout behavior (post-Stage hardening).

Exit criteria:

- Reliable session/room scoped state synchronization and reconnection behavior.

---

### Stage 7: Audio and LiveKit Integration

Status: **In progress (partial implementation)**

Goal:

- Token flow, room connect/disconnect, controlled audio states and DM overrides.

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

Exit criteria:

- Stable audio baseline without advanced effects dependency.

---

### Stage 8: Admin and Ops Layer

Status: **In progress (partial completion)**

Goal:

- Admin auth, readonly telemetry first, then controlled moderation actions.

Completed so far:

- Admin SPA redesigned to a full-window, two-column, theme-aware shell.
- Admin sections scaffolded: Dashboard, Users, Rooms & Campaigns, System Health, Logs & Activity, Settings.
- Backend telemetry endpoints implemented:
  - `/api/admin/telemetry/dashboard`
  - `/api/admin/telemetry/status`
  - `/api/admin/telemetry/logs`
- Logs endpoint now supports server-side filtering, pagination, and sorting.
- Admin logs table wired to server-side pagination and sorting.
- Backend admin auth primitives exist (`createAdminToken`/`verifyAdminToken` + `adminAuthMiddleware`) but are not yet enforced on telemetry routes.
- Admin frontend auth store remains intentionally baseline-disabled (login returns "not enabled"), preserving read-only shell behavior.

Remaining scope:

- Enforce admin authentication/authorization on admin API routes (telemetry is currently accessible without admin auth middleware).
- Moderation actions with audit trail (suspend/force logout/etc).
- Persistent telemetry sources (currently in-memory/baseline metrics in parts).
- Detail panels replacing placeholder actions (for example log entry expand UX).

Exit criteria:

- Authenticated admin workflows with readonly telemetry and controlled actions, fully auditable.

---

### Stage 9: Frontend UI Command-Center Completion

Status: **Planned (not started as a consolidated stage)**

Goal:

- Deliver the full persona-aware command-center UX (DM, Player, Spectator) described in UI specifications.

Completed so far:

- Core transport/store flow exists and supports live session/chat/notes/presence updates.
- Notes/chat baseline surfaces exist and are connected to backend APIs/events.
- Presence indicators and transition notifications are implemented.

Remaining scope:

- Implement complete three-panel layout shell and supporting components (`Toolbar`, `CampaignInfo`, `SystemToasts`, `LeftRail`, `CenterPane`, `RightRail`).
- Implement persona-specific right-panel tab sets and slide-in panel behavior (Rooms, Audio, Search, Notes, Journal, History, Settings).
- Implement DM-only control surfaces from UI specs (`DMVoiceBar`, advanced `PlayerOverrides`, room drag/drop workflow polish).
- Implement metadata/timeline/tags and environment indicator surfaces defined in the implementation plan and UI docs.
- Implement complete UI event/reducer coverage for search, journal, history, and settings panel flows.
- Implement deterministic loading, UI-error, and UI-state-recovery behaviors from dedicated UI specs.
- Implement full theming token application (dark/light parity), persona accents, and motion-spec conformance.

Milestone checkpoints:

- **Stage 9.1: Layout and Persona Shell Parity**
  - Scope: three-panel shell completion (`Toolbar`, `CampaignInfo`, `SystemToasts`, `LeftRail`, `CenterPane`, `RightRail`) and persona tab availability/visibility.
  - Target validation tests:
    - Frontend component tests for persona visibility matrix (DM/Player/Spectator) across left rail, center controls, and right-tab sets.
    - Frontend interaction tests for right-panel open/close lifecycle and center chat/notes toggle consistency.
    - Basic responsive layout checks for desktop/tablet breakpoints used by current app shell.

- **Stage 9.2: DM Control Surfaces and Realtime Flows**
  - Scope: `DMVoiceBar`, advanced `PlayerOverrides`, room drag/drop UX polish, and environment indicators.
  - Target validation tests:
    - Reducer/store tests for DM-only event handling (`players/dragDrop`, `audio/setCondition`, `audio/setDistance`, bulk audio actions).
    - Frontend integration tests asserting DM controls are unavailable to Player/Spectator personas.
    - Backend/frontend contract tests ensuring emitted events map to existing permission and WS dispatch behavior.

- **Stage 9.3: Recovery, Loading, Error, Theming, and Motion Compliance**
  - Scope: spec-conformant loading states, non-blocking error toasts, atomic reconnect hydration UX, theme-token parity, and motion rules.
  - Target validation tests:
    - Reconnect/hydration integration tests validating atomic domain snapshot application and UI-only state restoration.
    - UI error-handling tests validating deterministic toast rendering and persona-safe message exposure.
    - Theme/motion regression tests (visual or snapshot-based) covering dark/light token parity and critical transitions (toasts, rails, slide-in panels).
  - Implementation checklist (logging/telemetry alignment):
    - Adopt frontend logger control model and level precedence from [docs/operations/TELEMETRY.md](docs/operations/TELEMETRY.md#L102).
    - Ensure frontend telemetry emission remains privacy-safe and decoupled from console verbosity as defined in [docs/operations/TELEMETRY.md](docs/operations/TELEMETRY.md#L174).
    - Validate Stage 9.3 deliverables against the logging+telemetry quality gates in [docs/operations/TELEMETRY.md](docs/operations/TELEMETRY.md#L430).

Exit criteria:

- DM, Player, and Spectator command-center journeys match documented layout, behavior, and permission boundaries end-to-end.

---

### Stage 10: Admin UI Feature Completion and Secure Operations

Status: **Planned (builds on Stage 8 baseline)**

Goal:

- Complete admin UI from readonly telemetry baseline to secure operational control center.

Completed so far:

- Admin shell/navigation and primary pages exist.
- Dashboard/status/logs telemetry views are wired (with logs filtering/pagination/sorting).
- Baseline action affordances exist in Users/Rooms/Settings pages.

Remaining scope:

- Enforce admin authentication and role guardrails on all admin API routes and UI routes.
- Implement working user operations (suspend, force logout, detail panel with recent activity/warnings).
- Implement working room/campaign operations (view/close/move players/archive/export/delete) with confirmations.
- Implement settings workflows (feature flags, maintenance mode, API key handling, backup/restore).
- Add log detail expansion UX and drill-down panels with audit-friendly context.
- Ensure all admin actions are auditable, persisted, and queryable via telemetry/log pipelines.

Milestone checkpoints:

- **Stage 10.1: Authentication and Route Guard Closure**
  - Scope: enforce admin auth on admin APIs/UI routes and complete baseline login/session lifecycle.
  - Target validation tests:
    - Backend API authz tests proving unauthenticated/invalid-token requests are rejected for all admin telemetry and action endpoints.
    - Admin SPA integration tests for login, protected navigation, token expiry handling, and logout.
    - Security regression checks confirming no admin data is exposed prior to auth.

- **Stage 10.2: User and Campaign Operations Activation**
  - Scope: operational actions for users/rooms/campaigns (suspend, force logout, view/close/move/archive/export/delete) with confirmations.
  - Target validation tests:
    - Backend endpoint tests for role-gated moderation/action routes with success/failure path coverage.
    - Admin UI interaction tests for action dialogs, optimistic/loading states, and rollback behavior on errors.
    - Audit-log assertions verifying each action emits durable structured audit entries.

- **Stage 10.3: Settings, Drill-Down UX, and Durable Telemetry**
  - Scope: settings workflows, logs detail drill-down, persistent telemetry signals, and audit queryability.
  - Target validation tests:
    - Backend persistence tests for telemetry/audit durability across process restarts.
    - Admin logs tests for filter/sort/pagination + expandable detail content integrity.
    - End-to-end ops journey tests (authenticate -> perform action -> verify audit trail -> verify dashboard/log reflection).
  - Implementation checklist (admin observability/log streams):
    - Implement backend stream separation and sink strategy from [docs/operations/TELEMETRY.md](docs/operations/TELEMETRY.md#L235).
    - Align admin telemetry/audit endpoint behavior with [docs/architecture/API-SPEC.md](docs/architecture/API-SPEC.md#L437).
    - Verify admin filterability, audit trace completeness, and telemetry durability against [docs/operations/TELEMETRY.md](docs/operations/TELEMETRY.md#L430).

Exit criteria:

- Admin UI provides authenticated, auditable, least-privilege operational actions and reliable telemetry workflows.

---

### Stage 11: Metadata, Journal, History, and Search Surfaces

Status: **Planned**

Goal:

- Deliver long-term campaign knowledge surfaces and cross-session discoverability.

Remaining scope:

- Implement metadata cards/timeline/tag flows defined in architecture and UI docs.
- Implement journal and history panel data pipelines and role-aware read/write behavior.
- Implement search services and UI for messages, notes, and recording metadata.
- Align API endpoints and store slices with documented contracts for journal/history/search.

Exit criteria:

- Campaign knowledge surfaces are role-safe, searchable, and integrated into primary UX flows.

---

### Stage 12: Import/Export, Recordings Metadata, and Archival Workflows

Status: **Planned**

Goal:

- Support durable campaign portability and long-term operational retention workflows.

Remaining scope:

- Implement campaign import/export endpoints and UI dialogs with validation and audit trails.
- Implement recordings metadata and journal linkage paths described in architecture specs.
- Add admin archival workflows for campaign/session assets and operational logs.

Exit criteria:

- Campaigns can be safely exported/imported, and long-term records are traceable and recoverable.

---

### Stage 13: Extension and Overlay Integration (VTT Bridge)

Status: **Planned**

Goal:

- Deliver documented browser-extension/overlay integration for supported VTT environments.

Remaining scope:

- Implement extension bridge contracts for Foundry/Roll20/Owlbear interaction normalization.
- Implement overlay UX and event synchronization with core app state/privacy constraints.
- Validate extension-side role/privacy enforcement and reconnection/state recovery behavior.

Exit criteria:

- Extension workflows integrate cleanly with core state/event architecture without privacy regressions.

---

## 3) Current Priority Queue

Priority 1:

- Complete Stage 8 security closure: enforce admin auth on routes + role-gated ops actions + audit logging UX.

Priority 2:

- Stage 6 presence/rooms hardening: multi-client e2e/load validation + rollout strategy.

Priority 3:

- Stage 7 runtime integration: mount livekit/audio hooks in UI, complete WS handler registration, and add e2e validation.

Priority 4:

- Stage 9 frontend UI command-center completion: persona layouts, right-rail tools, theming/motion/loading/error/recovery compliance.

Priority 5:

- Stage 10 admin UI feature completion: authenticated ops actions, detail panels, and durable auditability.

Priority 6:

- Stage 11/12 knowledge and portability surfaces: metadata/journal/history/search plus import/export and recordings metadata.

---

## 4) Risks and Dependencies

Key risks:

- Admin telemetry endpoints are mounted without admin auth enforcement; internet-facing deployment risk until route guards are applied.
- Admin telemetry currently mixes real signals with baseline placeholders in some metrics.
- In-memory admin log history and WS recovery state are not durable across process restarts.
- UI specification breadth is large (layout, motion, theming, loading, recovery, error handling) and may drift without stage-specific delivery checkpoints.
- Several documented domains (metadata timeline, journal/history/search, import/export, recordings metadata, extension bridge) are defined in docs but not yet represented as complete runtime slices.
- Contract-vs-concept terminology drift in docs must continue to be managed carefully.
- Custom-share recipient UX depends on session membership hydration (users appear after joining session).
- Prisma schema is updated, but migration history is not yet committed; DB rollout consistency risk remains.

Dependencies before later stages:

- Stage 6 depends on authoritative presence state model and reconnection strategy (✓ complete).
- Stage 7 depends on stable room/presence semantics and token lifecycle reliability (✓ ready).

## 4.1) Validation Notes

The following references support the corrected stage labels and current model terminology.

| Claim                                       | Status                                    | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stage 5 (Notes) vertical slice              | Complete                                  | Notes routes mounted: [backend/src/api/index.ts](backend/src/api/index.ts), [backend/src/api/notes.routes.ts](backend/src/api/notes.routes.ts). Persisted service/repository flow: [backend/src/core/notes/notes.service.ts](backend/src/core/notes/notes.service.ts), [backend/src/repositories/notes.repository.ts](backend/src/repositories/notes.repository.ts). Frontend panel/card wiring and custom-share selector UX: [frontend/src/components/notes/NotesPanel.tsx](frontend/src/components/notes/NotesPanel.tsx), [frontend/src/components/notes/NoteCard.tsx](frontend/src/components/notes/NoteCard.tsx), [frontend/src/state/notesSlice.ts](frontend/src/state/notesSlice.ts). Tests: [backend/tests/notes-visibility.test.ts](backend/tests/notes-visibility.test.ts), [backend/tests/notes-routes-ws.test.ts](backend/tests/notes-routes-ws.test.ts). Publish audit hook: [backend/src/api/notes.routes.ts](backend/src/api/notes.routes.ts).                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Stage 6 (Presence and Rooms) vertical slice | Complete                                  | Mounted APIs: [backend/src/api/rooms.routes.ts](backend/src/api/rooms.routes.ts), [backend/src/api/presence.routes.ts](backend/src/api/presence.routes.ts), [backend/src/api/index.ts](backend/src/api/index.ts). Redis-first room/presence service + transition orchestration: [backend/src/core/rooms/room.service.ts](backend/src/core/rooms/room.service.ts), [backend/src/api/session.routes.ts](backend/src/api/session.routes.ts), [backend/src/infra/redis/index.ts](backend/src/infra/redis/index.ts). DB snapshots + schema: [backend/src/repositories/room.repository.ts](backend/src/repositories/room.repository.ts), [backend/prisma/schema.prisma](backend/prisma/schema.prisma). Frontend sync/indicators and atomic reconnect hydration: [frontend/src/state/roomSlice.ts](frontend/src/state/roomSlice.ts), [frontend/src/hooks/useWebSocket.ts](frontend/src/hooks/useWebSocket.ts), [frontend/src/components/session/SessionInit.tsx](frontend/src/components/session/SessionInit.tsx). Tests: [backend/tests/room-service-recovery-integration.test.ts](backend/tests/room-service-recovery-integration.test.ts), [backend/tests/session-room-transition.test.ts](backend/tests/session-room-transition.test.ts), [backend/tests/presence-rooms-authz.test.ts](backend/tests/presence-rooms-authz.test.ts). Validation: `prisma migrate status` reports "Database schema is up to date". |
| Stage 7 (Audio and LiveKit) vertical slice  | In progress (partial implementation)      | Token route and service are implemented: [backend/src/api/livekit.routes.ts](backend/src/api/livekit.routes.ts), [backend/src/infra/livekit/token.service.ts](backend/src/infra/livekit/token.service.ts). Frontend lifecycle/audio hooks are implemented: [frontend/src/hooks/useLiveKit.ts](frontend/src/hooks/useLiveKit.ts), [frontend/src/hooks/useAudioEngine.ts](frontend/src/hooks/useAudioEngine.ts). WS audio handlers exist, but dispatcher registration is partial: [backend/src/ws/handlers/audio.handler.ts](backend/src/ws/handlers/audio.handler.ts), [backend/src/ws/index.ts](backend/src/ws/index.ts). Tests currently validate event envelope coverage: [backend/tests/audio-livekit-integration.test.ts](backend/tests/audio-livekit-integration.test.ts).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Stage 8 (Admin and Ops) security closure    | In progress (guardrails not yet enforced) | Telemetry endpoints are implemented and mounted: [backend/src/api/admin.routes.ts](backend/src/api/admin.routes.ts), [backend/src/api/index.ts](backend/src/api/index.ts). Admin auth primitives exist: [backend/src/infra/http/middleware.ts](backend/src/infra/http/middleware.ts), [backend/src/utils/auth.ts](backend/src/utils/auth.ts). Current gap: admin middleware is not applied to mounted admin telemetry routes and frontend auth remains baseline-disabled: [admin/src/store.ts](admin/src/store.ts).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Stage 4 chat boundary/system behavior       | Complete                                  | Session boundary/system message emission: [backend/src/core/chat/session-boundaries.ts](backend/src/core/chat/session-boundaries.ts), [backend/src/core/chat/system-messages.ts](backend/src/core/chat/system-messages.ts), [backend/src/api/session.routes.ts](backend/src/api/session.routes.ts). System-message immutability: [backend/src/core/chat/chat.service.ts](backend/src/core/chat/chat.service.ts). Frontend WS wrapper compatibility: [frontend/src/ws/client.ts](frontend/src/ws/client.ts). Tests: [backend/tests/chat-system-messages.test.ts](backend/tests/chat-system-messages.test.ts).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Character status field terminology          | Aligned                                   | Data-model terminology: [docs/architecture/DATA-MODEL.md](docs/architecture/DATA-MODEL.md) ("status" values: alive, dead, left, unknown). Persisted schema enum: [backend/prisma/schema.prisma](backend/prisma/schema.prisma) (`CharacterStatus`: `ALIVE`, `DEAD`, `LEFT`, `UNKNOWN`). API validation and persistence path: [backend/src/api/campaign.routes.ts](backend/src/api/campaign.routes.ts), [backend/src/repositories/campaign.repository.ts](backend/src/repositories/campaign.repository.ts), [backend/tests/campaign-users-api.test.ts](backend/tests/campaign-users-api.test.ts).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Frontend command-center UI scope            | Planned and now explicitly tracked        | UI layout/components/flows/recovery/theming/motion specs define broader SPA surface than currently closed stages: [docs/ui/UI-LAYOUT.md](docs/ui/UI-LAYOUT.md), [docs/ui/UI-COMPONENTS.md](docs/ui/UI-COMPONENTS.md), [docs/ui/UI-FLOWS.md](docs/ui/UI-FLOWS.md), [docs/ui/UI-STATE-RECOVERY.md](docs/ui/UI-STATE-RECOVERY.md), [docs/ui/UI-LOADING-STATES.md](docs/ui/UI-LOADING-STATES.md), [docs/ui/UI-ERROR-HANDLING.md](docs/ui/UI-ERROR-HANDLING.md), [docs/ui/UI-THEMING.md](docs/ui/UI-THEMING.md), [docs/ui/UI-MOTION.md](docs/ui/UI-MOTION.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Post-Stage knowledge/portability domains    | Planned and now explicitly tracked        | Implementation/architecture docs include metadata timeline, journal/history, search, import/export, and recordings metadata domains: [docs/IMPLEMENTATION-PLAN.md](docs/IMPLEMENTATION-PLAN.md), [docs/architecture/API-SPEC.md](docs/architecture/API-SPEC.md), [docs/architecture/DATA-MODEL.md](docs/architecture/DATA-MODEL.md). Backend still includes not-implemented placeholders for some mapped domains: [backend/src/api/index.ts](backend/src/api/index.ts).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

---

## 5) Progress Log (Condensed)

- 2026-04: Stage 3 session lifecycle implemented and validated.
- 2026-04: Stage 4 chat baseline implemented (privacy-safe whisper filtering).
- 2026-04: Chat/session/notes services moved to Prisma-backed persistence.
- 2026-04: User/campaign/character persistence and campaign-scoped session APIs implemented.
- 2026-04: Character model expanded with persisted status field (data-model terms: alive/dead/left/unknown; persisted via `CharacterStatus` enum in schema).
- 2026-04: Stage 4 completed for session-boundary system messages, system-message immutability, frontend WS wrapper compatibility, and whisper recipient targeting.
- 2026-04: Stage 5 notes vertical slice closed with visibility controls, custom-share selector UX, websocket propagation tests, and publish audit logging hooks.
- 2026-04: Stage 6 backend foundation implemented with Redis-first room/presence state, Prisma presence snapshots, and DB-backed recovery restore paths.
- 2026-04: Stage 6 session-state room transition orchestration added (session members auto-routed between Main Room and Green Room).
- 2026-04: Stage 6 frontend sync delivered for room/presence hydration + live indicators, including `ROOM:SESSION_TRANSITION_APPLIED` transition notifications.
- 2026-04: Stage 6 integration tests added for Redis-empty recovery and repeated transition sequencing under load-like state flips.
- 2026-04: Stage 6 finalized with session-member authz hardening on presence/rooms APIs, shared transition event typing, atomic reconnect topology hydration, and green backend/frontend/monorepo build validation.
- 2026-04: UI and architecture docs consolidated, expanded, and cross-linked.
- 2026-04: Admin UI design integrated into documentation set.
- 2026-04: Stage 8 readonly telemetry endpoints + admin telemetry table pagination/sorting implemented.
- 2026-04: Stage 7 moved from scaffolded to partial implementation: LiveKit token route/service and frontend livekit/audio hooks are now present; runtime UI mounting and full WS audio registration remain pending.
- 2026-04: Backend circular dependency refactoring completed: `SessionLogsService` extracted, `RoomService`/`RoomRecoveryService`/`PresenceService` converted to dependency injection pattern. Latest backend verification: 8 test files / 29 tests passing; monorepo builds cleanly. Infrastructure hardening improves testability and maintainability.
- 2026-04: Roadmap expanded to track remaining full-project scope beyond Stage 8, including frontend command-center completion, admin feature completion, knowledge surfaces (metadata/journal/history/search), import/export + recordings metadata, and extension bridge integration.

---

## 6) Definition of Done for This Roadmap

Roadmap complete when:

- Stages 0-13 all meet their exit criteria.
- Security and auditability requirements are met for internet-facing operation.
- Monorepo builds cleanly and stage-critical user journeys are test-covered.

# VTT Chat Roadmap and Progress Record

This document is the active roadmap and delivery log for VTT Chat.
It tracks:

- What has been completed
- What is currently in progress
- What remains for each stage
- Exit criteria for stage completion
- Immediate next milestones

Last updated: 2026-04-29

Mirror reference: Keep this file in sync with operations snapshot [docs/operations/ROADMAP.md](docs/operations/ROADMAP.md).

---

## 1) Executive Status

Current overall status: **Stages 0-11 complete (baseline + command-center + secure admin ops + knowledge surfaces), Stages 12-13 planned remaining scope**.

- Shared runtime contract baseline is in place; several architecture/API docs remain broader conceptual references and still require continued contract-alignment follow-up. See [docs/README.md](docs/README.md#runtime-source-of-truth).
- Core backend/frontend spine is operational.
- Session lifecycle and chat vertical slices are implemented and building.
- Admin auth, moderation, invite onboarding, audit logging, and readonly telemetry baseline are now implemented.
- Notes vertical slice is now operational with persisted CRUD + visibility controls.
- Presence/rooms vertical slice now includes mounted APIs, Redis-first state, DB snapshot recovery, frontend indicators, and transition notifications; final hardening/e2e remains.
- Audio/livekit vertical slice baseline is now complete (token issuance route + mounted frontend hooks + backend audio control routes + websocket dispatcher coverage), while durable audio-state recovery and broader reconnect/e2e hardening remain pending.
- Frontend command-center Stage 9.1 layout/persona shell parity is now complete (three-panel shell, toolbar action model, extracted shell components, persona tab matrix, and responsive layout tests).
- Stage 9.2 is now advanced beyond the initial slice: DM control surfaces now include advanced player overrides (distance/condition/filter), DM voice preset controls, and authoritative drag/drop room movement via backend room-move endpoint + websocket reconciliation.
- Stage 11 is now complete in the frontend runtime with command-center search, journal, and history panels backed by persisted chat, notes, and session-log data, with placeholder module debt removed across metadata/audio/ui/types/utils surfaces.
- A dedicated UI modernization track is now defined to standardize frontend core UI on Radix UI + Tailwind + tokens and admin UI on MUI, without blocking active feature-stage delivery.

UI modernization status:

- WP1 spec alignment is complete in `docs/changes`
- WP2 framework foundations are complete with frontend Tailwind/Radix scaffolding and admin MUI/theme entrypoint in place
- WP3 token and theme normalization is complete with root theme-class strategy and Tailwind token mappings in place
- WP4 shell and primitive migration is complete for frontend shell/auth surfaces and admin MUI-driven shell controls
- WP5 feature-surface migration is complete across command-center, chat, notes, audio/room controls, and key admin operations pages
- WP6 cleanup/enforcement is complete with obsolete session/non-session CSS cleanup and infra path/documentation normalization

Latest verification:

- Monorepo build passes (`backend`, `frontend`, `admin`).
- Workspace lint passes (`npm run lint`).
- Frontend tests pass for app shell, websocket dispatcher wiring, LiveKit hook race-safety behavior, audio engine behavior, store system wiring, and command-center shell persona/panel behavior.
- Current frontend verification: `18` test files / `123` tests passing.
- Backend tests pass for chat system-message protections, notes visibility transitions, notes websocket propagation, campaign/users API coverage, WS dispatcher/handlers/state-recovery units, room recovery/transition sequencing integration coverage, and audio/livekit event envelope coverage.
- Current backend verification: `18` passed + `1` skipped test files; `87` passing tests + `6` todo markers (`93` total).
- Admin tests now include dedicated suites for auth-store lifecycle and admin API utility behavior.
- Current admin verification: `8` passed test files; `47` passing tests.
- Admin SPA interaction and admin route integration/e2e suites remain planned follow-up work.

### Stage Completion Checklist (At a Glance)

| Stage | Area                                | Status   | Completion     | Immediate focus                                        |
| ----- | ----------------------------------- | -------- | -------------- | ------------------------------------------------------ |
| 0     | Contract lock                       | Complete | ✅             | Maintain contract/source-of-truth discipline           |
| 1     | Backend foundation                  | Complete | ✅             | Ongoing hardening + reliability                        |
| 2     | Frontend transport spine            | Complete | ✅             | Keep reducer/event contract parity                     |
| 3     | Session lifecycle                   | Complete | ✅             | Regression coverage during later stage work            |
| 4     | Chat vertical slice                 | Complete | ✅             | UX/moderation polish as follow-up                      |
| 5     | Notes vertical slice                | Complete | ✅             | Advanced workflows and audit polish                    |
| 6     | Presence and rooms                  | Complete | ✅             | Multi-client e2e/load hardening                        |
| 7     | Audio + LiveKit                     | Complete | ✅             | Multi-client e2e + persistence hardening               |
| 8     | Admin + ops baseline                | Complete | ✅             | Stage 10 secure ops workflows + durable telemetry      |
| 9     | Frontend command-center completion  | Complete | ✅             | Maintain regression coverage during Stage 10+ work     |
| 10    | Admin UI feature completion         | Complete | ✅             | Stage 11 knowledge surfaces + Stage 13 guest auth prep |
| 11    | Metadata/journal/history/search     | Complete | ✅             | Maintain coverage + contract parity                    |
| 12    | Import/export + recordings metadata | Complete | ✅             | Maintain schema + portability regression coverage      |
| 13    | Extension + guest auth integration  | Planned  | ⬜ Not started | Guest auth, invite flow, external identity, VTT bridge |

Legend: ✅ complete, 🟨 in progress, ⬜ planned/not started.

### UI Modernization Track

| Work package | Scope                         | Status   | Exit criteria                                                                  |
| ------------ | ----------------------------- | -------- | ------------------------------------------------------------------------------ |
| WP1          | Spec alignment                | Complete | Design, roadmap, and implementation docs agree on structure and sequencing     |
| WP2          | Framework foundations         | Complete | Frontend Tailwind/Radix and admin MUI install/build cleanly on stable releases |
| WP3          | Token/theme normalization     | Complete | Tokens are normalized and theme systems are framework-backed                   |
| WP4          | Shell and primitive migration | Complete | App shells and adopted primitives use the new framework layers                 |
| WP5          | Feature surface migration     | Complete | High-use frontend/admin surfaces migrate incrementally                         |
| WP6          | Cleanup and enforcement       | Complete | Legacy CSS/components removed after verification and docs/tests updated        |

## 1.1) UI Modernization Deliverables

This workstream runs in parallel with stage delivery because it standardizes frameworks and architecture across already-shipped surfaces.

### WP1: Spec Alignment

Status: **Complete**

Deliverables:

- Design change docs aligned to the multi-app repository layout
- Stable-package policy documented
- Migration ordering and architecture boundaries documented

Acceptance criteria:

- No doc instructs contributors to create a shared frontend `src/admin/`
- File locations and ownership boundaries match the repository
- Roadmap and implementation docs reference the same migration order

### WP2: Framework Foundations

Status: **Complete**

Deliverables:

- Frontend Tailwind/PostCSS setup
- Frontend Radix package installation, wrapper directories, and helper utilities
- Admin MUI installation and `admin/src/theme.ts`

Acceptance criteria:

- Frontend and admin install/build cleanly with the new stable dependencies
- No user-facing behavior change is required to land infrastructure setup

### WP3: Token and Theme Normalization

Status: **Complete**

Deliverables:

- Frontend token contract normalized and mapped into Tailwind
- Admin theme values defined through the MUI theme
- Root theme-class strategy added without regressing current light/dark behavior

Acceptance criteria:

- Theme behavior remains correct in light and dark modes
- Hardcoded-color drift does not increase during migration

### WP4: Shell and Primitive Migration

Status: **Complete**

Deliverables:

- Adopted Radix primitives wrapped under `frontend/src/core-ui/`
- Frontend app shell/auth surfaces migrated to tokenized styling
- Admin shell and shared controls migrated to MUI

Acceptance criteria:

- Adopted Radix primitives are only consumed through project wrappers
- Admin shell is MUI-driven and theme-provider backed

### WP5: Feature Surface Migration

Status: **Complete**

Deliverables:

- Frontend command-center, notes, chat, audio, and room surfaces migrated incrementally
- Admin pages migrated page-by-page to MUI

Completed scope:

- Frontend command-center session surfaces migrated (toolbar, summary, toasts, right-rail tabs, DM audio controls)
- Frontend chat and notes feature surfaces migrated off inline styles to tokenized utility classes
- Frontend audio panel migrated to tokenized utility classes (dynamic connection dot remains runtime-driven)
- Admin high-use operations pages migrated to MUI page primitives (`Dashboard`, `Analytics`, `Users`, `Logs`, `Settings`)

Acceptance criteria:

- Migrated frontend surfaces use the new core UI layer
- Migrated admin pages use MUI primitives instead of CSS-first custom controls

### WP6: Cleanup and Enforcement

Status: **Complete**

Deliverables:

- Superseded CSS/components removed after verification
- Contributor docs and verification guidance updated

Completed scope:

- Removed obsolete unreferenced session CSS selectors in `SessionInit.css` and `CommandCenterFrame.css`
- Removed additional dead non-session admin CSS and obsolete style files after usage sweep
- Consolidated infra config/script assets under `infra/` and updated compose/script/doc references

Acceptance criteria:

- Runtime and tests validate replacements before cleanup
- Architecture boundaries remain clear in docs and review guidance

## Appendix A) Target Files by Work Package

Use this appendix to keep PR slicing concrete and scoped.

### WP1: Spec Alignment

- `docs/changes/AI-CONTEXT-DESIGN-CHANGES.md`
- `docs/changes/DESIGN-SYSTEM-CHANGES.md`
- `ROADMAP.md`
- `docs/operations/ROADMAP.md`
- `docs/IMPLEMENTATION-PLAN.md`
- `docs/DEV-QUICK-REFERENCE.md`
- `docs/README.md`

### WP2: Framework Foundations

- `frontend/package.json`
- `frontend/postcss.config.mjs`
- `frontend/vite.config.ts`
- `frontend/tsconfig.json`
- `frontend/src/main.tsx`
- `frontend/src/styles/tailwind.css`
- `frontend/src/utils/cn.ts`
- `frontend/src/core-ui/**`
- `admin/package.json`
- `admin/src/main.tsx`
- `admin/src/theme.ts`
- `admin/vite.config.ts`

### WP3: Token and Theme Normalization

- `frontend/src/styles/components/session/theme.css`
- `frontend/src/tokens/**`
- `frontend/src/styles/**`
- `frontend/src/main.tsx`
- `admin/src/theme.ts`
- `admin/src/styles/App.css`

### WP4: Shell and Primitive Migration

- `frontend/src/App.tsx`
- `frontend/src/components/auth/LoginForm.tsx`
- `frontend/src/core-ui/**`
- `frontend/src/components/ui/**`
- `admin/src/App.tsx`
- `admin/src/components/**`
- `admin/src/styles/App.css`

### WP5: Feature Surface Migration

- `frontend/src/components/session/**`
- `frontend/src/components/chat/**`
- `frontend/src/components/notes/**`
- `frontend/src/components/audio/**`
- `frontend/src/components/rooms/**`
- `admin/src/pages/**`
- `admin/src/features/**`
- `admin/src/components/**`

### WP6: Cleanup and Enforcement

- `frontend/src/styles/**`
- `frontend/src/components/ui/**`
- `admin/src/styles/**`
- `docs/changes/**`
- `docs/DEV-QUICK-REFERENCE.md`
- `docs/README.md`

---

## 2) Stage-by-Stage Progress

### Stage 0: Contract Lock

Status: **Complete**

Goal:

- Define and freeze event names, payload schemas, and permission checks.

Completed:

- Shared package contracts established under `shared/`.
- Core event envelope, validators, permission matrix, and error model implemented.
- Backend/frontend runtime now consume the shared contract package as the canonical source of truth.
- Documentation source-of-truth guidance is indexed in [docs/README.md](docs/README.md#runtime-source-of-truth) to keep roadmap, architecture, and runtime references aligned.
- Contract-facing roadmap references are aligned to the shipped runtime baseline; broader architecture/API docs still include conceptual or future-state material that requires continued follow-up.

Exit criteria:

- Shared contract package is canonical and consumed by backend/frontend, even where higher-level architecture docs still describe future-state behavior beyond the shipped runtime.

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

Completed:

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

Status: **Complete (baseline)**

Goal:

- Token flow, room connect/disconnect, realtime audio control events, and DM overrides at baseline scope.

Completed so far:

- Audio event types are registered in backend/frontend WS dispatcher flows.
- LiveKit token issuance endpoint is implemented (`POST /api/livekit/token`) with auth/session-membership checks.
- LiveKit token generation service is implemented (server SDK integration + token grant construction).
- Frontend LiveKit connection hook is implemented (token fetch, connect/disconnect, participant/track lifecycle).
- Frontend audio engine hook is implemented with WebAudio graph setup and effect stack application logic.
- Frontend runtime mounts audio/livekit integration through `AudioPanel` in the active session room path.
- Environment configuration keys exist for LiveKit integration.
- Backend audio control API routes are now implemented and mounted (`/api/audio/presets`, `/api/audio/environment`, `/api/audio/dm-override/apply`, `/api/audio/dm-override/remove`, `/api/audio/state/:sessionId`).
- `/api/audio/state/:sessionId` currently provides a stable baseline API surface, but not yet durable persisted room/environment/override recovery.
- Backend API tests now cover role gating and websocket event emission for audio control routes.

Remaining scope:

- Persist room-scoped audio control state and DM overrides for durable restart recovery.
- Align LiveKit/recovery documentation to distinguish shipped baseline behavior from future-state reconnect and hydration flows.
- Add multi-client end-to-end validation for token flow, audio event fanout, and override behavior.
- Expand audit/telemetry detail for audio control mutations.

Exit criteria:

- Stable realtime audio baseline without advanced effects dependency or durable persisted recovery. ✅

---

### Stage 8: Admin and Ops Layer

Status: **Complete**

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
- Backend admin auth primitives implemented and now enforced (`createAdminToken`/`verifyAdminToken` + `adminAuthMiddleware` applied to all telemetry routes).
- **Unified user-admin model implemented**:
  - `AdminUser` table removed from runtime model and merged into `User` via nullable `adminRole` + `password` + `isActive` fields.
  - New `AdminRole` enum added: `SUPER_ADMIN`, `ADMIN`, `CAMPAIGN_DM`, `READ_ONLY`.
  - `POST /api/admin/setup` now creates or promotes a unified `User` as first `SUPER_ADMIN` (blocked after first super admin exists).
  - `GET /api/admin/setup-status` endpoint checks if setup is required (public, no auth).
  - `POST /api/admin/login` now authenticates unified users and issues admin JWT tokens with role claims (`userId`, `username`, `adminRole`).
  - `GET /api/admin/me` endpoint added for authenticated admin profile retrieval.
  - `POST /api/admin/users/:userId/promote` endpoint added for `SUPER_ADMIN` role grants.
  - Campaign/domain user writes now auto-assign `CAMPAIGN_DM` to DM users without overriding elevated admin roles.
  - Linked-auth implementation delivered for frontend <-> admin launch handoff (single identity, no double login for full accounts with admin rights).
  - Guest DM launch policy implemented as "button visible, admin access blocked until account upgrade" (`GUEST_UPGRADE_REQUIRED`).
  - New handoff endpoints implemented:
    - `POST /api/auth/handoff/admin`
    - `POST /api/admin/auth/handoff/exchange`
    - `POST /api/admin/handoff/app`
    - `POST /api/auth/handoff/exchange`
  - Frontend and admin UI now include launch buttons and one-time token exchange flows (`/launch?handoff=...`) for seamless cross-app authentication.
  - Password validation utility enforces 12+ character length, uppercase, lowercase, numbers, and special characters.
  - Support for password managers and password strength indicator component.
- **Frontend setup and auth now complete**:
  - `Setup` page with welcome wizard and form validation.
  - `PasswordStrengthIndicator` component with real-time feedback.
  - `Login` page with credential validation and remember-me toggle.
  - Updated `useAuthStore` to manage admin tokens in sessionStorage/localStorage.
  - `App.tsx` now routes through setup → login → dashboard based on auth state.
  - Complete CSS styling for login, setup, and password validation UI.
- Admin frontend now properly routes: setup (if needed) → login (if not auth) → dashboard (if authenticated).
- Both backend and frontend build successfully with full TypeScript type coverage.

Stage completion updates:

- Moderation workflows implemented with permission gates:
  - `PATCH /api/admin/users/:userId/suspend`
  - `PATCH /api/admin/users/:userId/restore`
  - `POST /api/admin/users/:userId/force-logout`
- Persistent audit trail implemented via `AdminAuditLog` (Prisma model + migration), and moderation actions now write auditable entries.
- Invite-link admin onboarding implemented for non-existing users:
  - `POST /api/admin/invites`
  - `GET /api/admin/invites/validate`
  - `POST /api/admin/invites/redeem`
  - Admin UI invite onboarding route at `/admin/onboard?invite=...`.
- Token invalidation support added (`User.tokenInvalidBefore`) and now enforced in auth middleware for both user and admin JWTs.
- Admin telemetry/logs now include persisted admin audit events (`admin-audit` source) and dashboard surfaces moderation/user aggregate metrics.
- Admin users page now supports real backend-driven moderation actions and invite generation.
- Admin logs page now uses an inline detail panel instead of placeholder alert dialogs.

Residual work moved to later stages:

- Dashboard and status telemetry still mix real signals with proxy/synthetic values in some cards and charts.
- Rooms & Campaigns and Settings pages remain mostly scaffolded UI and are tracked under Stage 10 secure operations completion.
- Durable telemetry sinks, richer drill-down workflows, and broader admin-specific automated coverage remain follow-up work rather than Stage 8 blockers.

Exit criteria:

- Authenticated admin workflows with readonly telemetry and admin-gated access. ✅
- Controlled moderation actions with full audit trail. ✅

---

### Stage 9: Frontend UI Command-Center Completion

Status: **Complete (Stages 9.1, 9.2, and 9.3 complete)**

Goal:

- Deliver the full persona-aware command-center UX (DM, Player, Spectator) described in UI specifications.

Completed so far:

- Core transport/store flow exists and supports live session/chat/notes/presence updates.
- Notes/chat baseline surfaces exist and are connected to backend APIs/events.
- Presence indicators and transition notifications are implemented.
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

Residual scope moved beyond Stage 9 closure:

- Metadata/timeline/tags, history, journal, and search surfaces remain Stage 11 scope.
- Additional command-center feature expansion and persona tooling depth continues under later stage milestones.

Milestone checkpoints:

- **Stage 9.1: Layout and Persona Shell Parity**
  - Scope: three-panel shell completion (`Toolbar`, `CampaignInfo`, `SystemToasts`, `LeftRail`, `CenterPane`, `RightRail`) and persona tab availability/visibility.
  - Current status: complete. Three-panel shell, extracted shell components, toolbar action model, persona visibility matrix, and responsive layout checks are in place.
  - Target validation tests:
    - Frontend component tests for persona visibility matrix (DM/Player/Spectator) across left rail, center controls, and right-tab sets.
    - Frontend interaction tests for right-panel open/close lifecycle and center chat/notes toggle consistency.
    - Basic responsive layout checks for desktop/tablet breakpoints used by current app shell.

- **Stage 9.2: DM Control Surfaces and Realtime Flows**
  - Scope: `DMVoiceBar`, advanced `PlayerOverrides`, room drag/drop UX polish, and environment indicators.
  - Current status: complete. Advanced DM overrides, authoritative room drag/drop, websocket emission payload validation, websocket-driven move reconciliation integration coverage, and reducer/store-level audio transition coverage are now in place.
  - Target validation tests:
    - Reducer/store tests for DM-only event handling (`players/dragDrop`, `audio/setCondition`, `audio/setDistance`, bulk audio actions).
    - Frontend integration tests asserting DM controls are unavailable to Player/Spectator personas.
    - Backend/frontend contract tests ensuring emitted events map to existing permission and WS dispatch behavior.
  - Closure notes:
    - Backend route tests now assert websocket `ROOM:USER_LEFT`/`ROOM:USER_JOINED` emission payloads for `move-user`.
    - Integration coverage now exercises full DM drag/drop move flow against live room/presence websocket updates.
    - Reducer/store-level tests now cover distance/condition/filter state transitions alongside request-level component tests.

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

Status: **Complete**

Goal:

- Complete admin UI from readonly telemetry baseline to secure operational control center.

Completed so far:

- Stage 8 auth/session baseline is already complete: setup, login, invite onboarding, protected navigation, and app/admin handoff flows are implemented.
- Backend-complete or mostly backend-complete admin pages:
  - `Users`: real moderation and invite generation wired to backend routes (`promote`, `suspend`, `restore`, `force-logout`, `invites`).
  - `Logs & Activity`: wired to telemetry/audit backend with filtering, pagination, sorting, and inline detail expansion.
  - `Dashboard`: wired to telemetry backend and surfaces live/admin aggregate metrics, though some cards still rely on proxy values.
  - `System Health`: wired to telemetry backend, though several cards/charts still use proxy or synthetic values.
- Scaffold-only or mostly scaffold-only admin pages:
  - `Rooms & Campaigns`: currently static/mock operational table and detail content.
  - `Settings`: currently static controls without persisted backend workflows.
- Stage 10 style-refactor kickoff started: low-risk inline admin styles are now being externalized into `admin/src/styles/` to separate UI visuals from application logic as Stage 10 progresses.
- Stage 10.1 execution has started: backend admin authz guardrail tests now cover public vs protected admin routes and invalid-token rejection behavior; admin SPA guard tests now cover setup/login routing, authenticated route rendering, and forced logout on expired admin sessions.
- Stage 10.2 execution has started: `Rooms & Campaigns` now consumes real admin backend data (campaign/session/room occupancy), and supports authenticated session-end operations instead of static placeholder content.
- Stage 10.2 expanded action surface delivered: campaign archive/restore and admin move-player room operations are now implemented with audit logging hooks and authz coverage.
- Settings activation started in Stage 10.2: settings page now reads/writes backend runtime settings and triggers authenticated backup actions (with audit logging) rather than static placeholder controls.
- Stage 10.3 kickoff started: telemetry client-events now persist to durable backend sink storage and admin logs drill-down now supports source-backed detail retrieval for persisted telemetry/audit entries.
- Stage 10.3 expansion delivered: admin logs now have dedicated UI interaction coverage (filtering, sorting, pagination, drill-down), runtime diagnostic events are persisted into durable stream storage for drill-down parity, and settings now expose retention/rotation controls for telemetry/diagnostic sink policies.
- Stage 10.4 delivered in runtime:
  - Backend admin authorization routes now implemented: `GET /api/admin/integrations/systems`, `POST /api/admin/integrations/systems/:system/authorize`, `POST /api/admin/integrations/systems/:system/block`, `PATCH /api/admin/integrations/systems/:system`.
  - Guest-auth and external-log-ingestion guardrails now enforce integration authorization state (`INTEGRATION_NOT_AUTHORIZED`) for blocked/unrecognized systems.
  - Admin UI now includes an `Integrations` page with authorize/log-only/block actions plus notes updates.
  - Automated coverage added for route authorization/state transitions, endpoint guardrails, and admin UI interactions.

Remaining scope moved forward:

- Stage 10 exit criteria are now satisfied.
- Follow-on observability hardening and advanced operations ergonomics continue under Stage 11+ execution tracks.

- Stage 10 UI completion delivered (current increment):
  - `admin/src/pages/Analytics.tsx` now provides telemetry-backed analytics workflows with live loading/error handling.
  - `admin/src/pages/Dashboard.tsx` scaffold-note debt removed and data provenance explicitly documented against telemetry contract.
  - `admin/src/pages/PlatformStatus.tsx` now renders real telemetry trend charts instead of placeholder text.
  - `admin/src/pages/CampaignManagement.tsx`, `admin/src/pages/Settings.tsx`, `admin/src/pages/UserManagement.tsx`, and `admin/src/pages/Logs.tsx` have been decomposed into focused feature hooks/components to reduce page-level orchestration complexity without changing behavior.

Milestone checkpoints:

- **Stage 10.1: Authentication and Route Guard Closure**
  - Scope: add dedicated automated coverage proving the already-implemented admin auth/session lifecycle and route guards remain intact as Stage 10 expands the surface area.
  - Target validation tests:
    - Backend API authz tests proving unauthenticated/invalid-token requests are rejected for all admin telemetry and action endpoints.
    - Admin SPA integration tests for login, protected navigation, token expiry handling, and logout.
    - Security regression checks confirming no admin data is exposed prior to auth.

- **Stage 10.2: User and Campaign Operations Activation**
  - Scope: expand beyond the shipped user moderation baseline into richer user detail workflows and activate real room/campaign operations (view/close/move/archive/export/delete) with confirmations.
  - Target validation tests:
    - Backend endpoint tests for existing and new role-gated moderation/action routes with success/failure path coverage.
    - Admin UI interaction tests for moderation dialogs, room/campaign actions, optimistic/loading states, and rollback behavior on errors.
    - Audit-log assertions verifying each action emits durable structured audit entries.

- **Stage 10.3: Settings, Drill-Down UX, and Durable Telemetry**
  - Scope: replace scaffolded settings with real workflows, deepen drill-down UX, and move telemetry/audit views toward persistent signals and queryability.
  - Target validation tests:
    - Backend persistence tests for telemetry/audit durability across process restarts.
    - Admin logs tests for filter/sort/pagination + expandable detail content integrity.
    - End-to-end ops journey tests (authenticate -> perform action -> verify audit trail -> verify dashboard/log reflection).
  - Implementation checklist (admin observability/log streams):
    - Implement backend stream separation and sink strategy from [docs/operations/TELEMETRY.md](docs/operations/TELEMETRY.md#L235).
    - Align admin telemetry/audit endpoint behavior with [docs/architecture/API-SPEC.md](docs/architecture/API-SPEC.md#L437).
    - Verify admin filterability, audit trace completeness, and telemetry durability against [docs/operations/TELEMETRY.md](docs/operations/TELEMETRY.md#L430).

- **Stage 10.4: External System Authorization Panel**
  - Status: complete.
  - Delivered: backend route surface + audit logging + endpoint guardrails + admin UI interaction coverage.

- **Stage 10.5: UI Style Externalization Workstream (Ongoing)**
  - Scope: progressively refactor inline component styles into external stylesheet files (`styles/`) where practical, prioritizing Stage 10 admin surfaces and new work first.
  - Target validation checks:
    - New/updated Stage 10 components avoid inline `style={{ ... }}` unless dynamic runtime values make externalization impractical.
    - Visual parity checks on refactored pages (theme states, responsive behavior, and interaction states).
    - Lint/build/test verification after each style extraction batch.
  - Notes:
    - This workstream is incremental and intentionally non-blocking for functional delivery.
    - Existing inline styles in lower-priority surfaces can be migrated in follow-up passes.

Exit criteria:

- Admin UI provides authenticated, auditable, least-privilege operational actions and reliable telemetry workflows. ✅
- External system authorization panel is functional and guards Stage 13 guest auth endpoints. ✅

---

### Stage 11: Metadata, Journal, History, and Search Surfaces

Status: **Complete**

Goal:

- Deliver long-term campaign knowledge surfaces and cross-session discoverability.

Completed scope:

- Implemented production command-center knowledge surfaces for `search`, `journal`, and `history`, replacing prior right-rail placeholder copy and wiring panels to persisted runtime state.
- Completed left-rail Stage 11 UX for room switching and participant status visibility via production `AvatarOverlay` + `RoomSelector` surfaces.
- Consolidated component styles under `frontend/src/styles/components/**` and removed remaining inline `SessionInit` campaign/session/session-list styles.
- Closed all tracked frontend Stage 11 placeholder module debt by replacing stubs with concrete implementations:
  - metadata: `frontend/src/components/metadata/MetadataCard.tsx`, `frontend/src/components/metadata/MetadataTimeline.tsx`
  - audio adjuncts: `frontend/src/components/audio/EnvironmentPanel.tsx`, `frontend/src/components/audio/ConditionsPanel.tsx`, `frontend/src/components/audio/DMVoicePanel.tsx`, `frontend/src/components/audio/AudioStateSlideout.tsx`
  - shared UI primitives: `frontend/src/components/ui/Button.tsx`, `frontend/src/components/ui/Icon.tsx`, `frontend/src/components/ui/Panel.tsx`
  - utility/type contracts: `frontend/src/utils/api.ts`, `frontend/src/utils/format.ts`, `frontend/src/utils/ws-events.ts`, `frontend/src/types/*.types.ts`
- Added and maintained integration/component coverage for Stage 11 interaction paths, including right-rail knowledge panels and left-rail room-switch behavior.

Completed in latest Stage 11 increment:

- Frontend component CSS has been consolidated into `frontend/src/styles/components/**` and component imports now resolve from the centralized styles tree.
- Stage 11 session-shell extraction advanced by removing remaining inline styling from `SessionInit` campaign/session forms and session list surfaces.
- Added integration coverage for left-rail room switching in active sessions (`frontend/src/tests/components/SessionInit.integration.test.tsx`).
- Replaced `SessionInit` right-rail placeholder copy for `search`, `journal`, and `history` with real Stage 11 panels backed by persisted chat history, visible notes, and session logs.
- Added a shared Stage 11 panel stylesheet plus focused component coverage for search/journal/history behavior and player-facing read-only access.
- Expanded the player command-center right rail to include `search`, `journal`, and `history` tabs, with integration coverage proving the SessionInit wiring path.

Exit criteria:

- Campaign knowledge surfaces are role-safe, searchable, and integrated into primary UX flows. ✅
- Left-panel command-center UX is complete with production avatar overlays, room selector controls, and live participant status visibility for DM/player workflows. ✅
- Frontend Stage 11 surfaces have externalized maintainable CSS with parity-verified visuals. ✅

---

### Stage 12: Import/Export, Recordings Metadata, and Archival Workflows

Status: **Complete**

Goal:

- Support durable campaign portability and long-term operational retention workflows.

Completed scope:

- Implemented admin campaign portability workflows with audit trails:
  - `GET /api/admin/campaigns/:campaignId/export`
  - `POST /api/admin/campaigns/import`
- Added persisted recording metadata model + APIs:
  - `RecordingMetadata` model in Prisma schema
  - `GET /api/admin/campaigns/:campaignId/recordings`
  - `POST /api/admin/campaigns/:campaignId/recordings`
- Added operations archival/export workflow:
  - `GET /api/admin/settings/backup/export`
  - Persisted artifact tracking via `ImportExportArtifact`
- Activated admin UI controls in `Rooms & Campaigns` and `Settings` for export/import, recording metadata entry, and operations export payload capture.

Exit criteria:

- Campaigns can be exported/imported through authenticated admin workflows; recording metadata and operational export artifacts are persisted and audit-logged. ✅

---

### Stage 13: Extension and Guest Auth Integration

Status: **Planned**

Goal:

- Deliver the browser extension integration with the vtt-chat backend: guest/invite-link authentication, external identity management, data sync, pre-flight validation, and VTT overlay contracts.
- The extension front-end and D&D Beyond scraping layer already exist at https://github.com/AndyProsser/vtt-chat-extension. This stage delivers the backend integration surface and wires the extension to the vtt-chat platform.

Design reference: [docs/extension/GUEST-AUTH.md](docs/extension/GUEST-AUTH.md), [docs/extension/EXTENSION-INTEGRATION.md](docs/extension/EXTENSION-INTEGRATION.md), [docs/extension/THIRD-PARTY-INTEGRATIONS.md](docs/extension/THIRD-PARTY-INTEGRATIONS.md)

---

**Stage 13.1: Backend Guest Auth, Spectator Access, and Invite Flow**

- Scope: All backend endpoints required for player guest auth (extension) and spectator access (web). Includes spectator policy enforcement, slot management, and waitlist.
- Prerequisite: Stage 10.4 external system authorization panel must be complete so production systems are gated from day one.
- Endpoints to implement (player path):
  - `GET /api/platform/status` — public, returns platform health + active users/campaigns/sessions
  - `GET /api/campaigns/invite/:code/validate` — public, validates player invite code + returns campaign display info
  - `POST /api/auth/extension/preflight` — public, account status check for email without issuing token
  - `POST /api/auth/extension/guest-login` — creates or resumes guest player account from extension-scraped identity; validates invite code and authorized external system
  - `POST /api/auth/upgrade` — guest token required; sets password and converts account to FULL
- Endpoints to implement (spectator path):
  - `GET /api/campaigns/watch/:code/validate` — public, validates spectator invite code + returns campaign info, character roster, slot availability
  - `POST /api/auth/spectator/guest-join` — public, creates guest spectator account and issues token (or waitlist position)
  - `GET /api/campaigns/:id/spectator/waitlist-status` — poll for waitlist promotion using `waitlistToken`
  - `GET /api/campaigns/browse` — authenticated (full account only), lists discoverable campaigns with spectator slots
- Data changes required:
  - `User.authType` enum: add `GUEST` variant
  - `ExternalIdentity` table: `(userId, externalSystem, externalUserId, email, lastSeenAt)`
  - `Campaign.inviteActive`, `Campaign.spectatorInviteCode`, `Campaign.spectatorInviteActive`
  - `Campaign.spectatorPolicy` (`NONE | GUESTS | USERS`), `spectatorMax`, `spectatorWaitlistEnabled`, `spectatorReconnectGraceSecs`, `discoverable`
  - `Campaign.extensionSyncPolicy` (`NONE | DM_ONLY | DM_AND_PLAYERS`)
  - `SpectatorWaitlist` table: `(campaignId, userId, joinedAt, waitlistToken, promoted, promotedAt)`
  - `ExternalSystem` registry table (links to Stage 10.4 admin controls)
- Target validation tests:
  - Unit tests for guest-login: new user creation, returning guest match by email+system, invite code validation, blocked system rejection.
  - Unit tests for preflight: all four `accountStatus` variants and correct `suggestedFlow` mapping.
  - Unit tests for spectator guest-join: slot available → token issued; at capacity + waitlist enabled → waitlist entry created; `spectatorPolicy = NONE` → 403; `spectatorPolicy = USERS` + guest account → 403.
  - Tests for waitlist auto-promotion: slot released (disconnect + grace period) → first waitlist entry promoted → token issued.
  - Tests for reconnect grace period: disconnected spectator slot not released until grace period expires.
  - Integration tests for invite/watch validate endpoints: valid/expired/nonexistent codes.
  - Integration tests for campaign browse: only discoverable campaigns returned; private campaigns excluded; guest player accounts rejected.
  - Tests asserting guest token has reduced lifetime and `authType: GUEST` claim.
  - Tests for account upgrade: password set, `authType` change, token reissued, campaign/character history preserved.
  - Tests asserting DMs with guest accounts cannot call invite-link generation endpoints.

---

**Stage 13.2: External Identity and Campaign Linking**

- Scope: Persistence and retrieval of external identities and campaign-to-external-system links.
- Endpoints to implement:
  - `POST /api/integrations/external/sync` — push character or campaign updates from extension; applies per `extensionSyncPolicy` and caller role
  - `GET /api/campaigns/:campaignId/external-links` — DM-only; list linked external systems
  - `POST /api/campaigns/:campaignId/external-links` — DM-only; manually link an external campaign ID
- Data changes required:
  - `CampaignExternalLink` table: `(campaignId, externalSystem, externalId, linkedAt, linkedBy)`
  - `Character.externalSystem`, `Character.externalId` fields
- Target validation tests:
  - Tests for sync endpoint respecting `NONE`, `DM_ONLY`, and `DM_AND_PLAYERS` policy variants.
  - Tests asserting campaign-level fields (name, structure) can only be updated by DM-role callers regardless of sync policy.
  - Tests preventing duplicate `ExternalIdentity` records for same (email, system) pair.
  - Tests preventing duplicate character records for same `(externalSystem, externalId)` pair.
  - Tests asserting email-based user matching links identities from different external systems to the same vtt-chat user.

---

**Stage 13.3: Frontend Guest Auth UX, Spectator Invite Page, and Account Upgrade**

- Scope: SPA-side support for guest player sessions, the spectator invite/watch page, campaign browse, and account upgrade flow.
- Changes required:
  - Auth store must handle `authType: GUEST` tokens (player and spectator) and expose upgrade affordance.
  - App header/profile panel: persistent (but dismissible) upgrade prompt for guest users, hidden during active session play.
  - Account upgrade flow: email pre-filled (read-only), password entry, `POST /api/auth/upgrade`, token swap.
  - **Player invite route** (`/join/:code`): initiates extension pre-flight or falls back to standard invite join for non-extension users.
  - **Spectator invite page** (`/watch/:code`): no extension required. Shows campaign name, DM display name, character roster with connection status, session status, slot count, and waitlist position. Provides name + email form for guest spectators. Full-account users see login prompt if not already authenticated.
  - **Campaign browse page** (`/browse`): lists active discoverable campaigns for full-account users. Shows campaign name, DM, session status, slot availability. Campaigns with `spectatorPolicy = NONE` or `discoverable = false` appear as private (no join option). Guest player accounts cannot access this page.
  - **Waitlist UX**: guest spectators placed on the waitlist see their position and a live status indicator. Auto-promoted when a slot opens (no user action required); JWT issued and session view loads.
  - **Invite link management UI** in Campaign Settings: separate controls for player invite and spectator invite. Spectator controls include: spectatorPolicy selector (None / Guests / Full Accounts Only), max spectator count input, waitlist toggle, and discoverable toggle.
- Target validation tests:
  - Frontend store tests for guest token handling and `authType` awareness (player and spectator variants).
  - Component tests for upgrade prompt visibility (shown outside active session, hidden during play, dismissible).
  - Integration tests for `/join/:code`: valid invite → correct auth branch; invalid invite → user-friendly error.
  - Integration tests for `/watch/:code`: valid spectator invite → invite page render; slots available → guest join; at capacity + waitlist → waitlist UX; `spectatorPolicy = NONE` → "spectators not enabled" message.
  - Frontend tests for campaign browse: discoverable campaigns visible; private campaigns shown but join disabled; guest player accounts redirected away.
  - Frontend tests for spectator controls visibility (DM only; full-account DM only for invite generation).

---

**Stage 13.4: Extension Backend Contract Integration (D&D Beyond)**

- Scope: Wire the existing https://github.com/AndyProsser/vtt-chat-extension front-end and scraping layer to the vtt-chat backend endpoints implemented in 13.1–13.3.
- Extension changes required (in extension repo):
  - Background script: implement pre-flight sequence (`/api/platform/status` → `/api/campaigns/invite/:code/validate` → `/api/auth/extension/preflight`).
  - Background script: implement guest-login call and in-memory JWT storage with silent renewal.
  - Background script: implement sync update calls on character level-up/class change events.
  - Popup UI: display pre-flight results (platform status, invite validity, account status branch).
  - Popup UI: login form for full-account users (email pre-filled, password entry).
  - Popup UI: display "platform not enabled" message for blocked systems.
- Backend contract requirements (already specified in Stage 13.1–13.3, no new endpoints).
- Target validation tests:
  - Contract tests asserting extension-submitted payloads match backend schema (character fields, invite code format, externalSystem enum).
  - Integration tests for the full pre-flight → guest-login → token storage sequence against a local backend.
  - Tests for silent token renewal behavior when guest JWT is within renewal window.
  - Tests asserting extension handles backend errors gracefully (platform offline, invite expired, system blocked).

---

**Stage 13.5: VTT Overlay Bridge Contracts (Roll20, Foundry, Others)**

- Scope: Extend the integration layer to Roll20 and Foundry VTT once D&D Beyond integration is validated. Add platform-level support for additional external systems via the ExternalSystem registry.
- Remaining scope:
  - Register Roll20 and Foundry as systems in the ExternalSystem registry (initially in `LOG_ONLY` or `BLOCKED` state).
  - Implement bridge contracts for Roll20/Foundry log ingestion normalization.
  - Implement overlay UX and event synchronization with core app state/privacy constraints for those platforms.
  - Validate extension-side role/privacy enforcement and reconnection/state recovery behavior for each new system.
- This milestone is intentionally deferred until Stage 13.4 (D&D Beyond end-to-end) is validated.

Exit criteria:

- Platform status, invite validation, pre-flight, guest login, and account upgrade endpoints are implemented and tested.
- External identity and campaign linking persistence is in place with correct sync policy enforcement.
- SPA handles guest tokens, shows the upgrade prompt, and provides invite-link management for DMs.
- The existing D&D Beyond extension is wired end-to-end to the vtt-chat backend.
- All new endpoints are guarded by external system authorization checks (ExternalSystem registry from Stage 10.4).
- Extension workflows integrate cleanly with core state/event architecture without privacy regressions.

---

## 3) Current Priority Queue

Priority 1:

- Stage 11 frontend command-center completion: avatar overlays, room selector UX, left-rail status visibility, and CSS externalization.

Priority 2:

- Stage 13 guest-auth preparation: extension bridge contracts, external identity wiring, and guarded rollout sequencing.

Priority 3:

- Cross-stage observability hardening: telemetry durability operations (rotation/export/restart verification) and operator drill-down ergonomics.

Priority 4:

- Stage 6 presence/rooms hardening: multi-client e2e/load validation + rollout strategy.

Priority 5:

- Stage 7 runtime integration hardening: multi-client validation, reconnect coverage, and durable audio-state recovery.

Priority 6:

- Stage 13 extension and guest auth integration after Stage 10.4 external system authorization.

Priority 7:

- Stage 9.3 UX reliability and spec compliance (loading/error/recovery/theming/motion) after 9.2 control-surface delivery stabilizes.

---

## 4) Risks and Dependencies

Key risks:

- Admin telemetry currently mixes real signals with baseline placeholders in some metrics.
- Some admin surfaces are still scaffolds (`Rooms & Campaigns`, `Settings`) even though Stage 8 auth/moderation/invite baseline is complete.
- In-memory admin log history and WS recovery state are not durable across process restarts.
- Admin-specific automated coverage is thinner than the core runtime slices; current verification is stronger on builds and shared backend/frontend flows than on dedicated admin route/UI tests.
- UI specification breadth is large (layout, motion, theming, loading, recovery, error handling) and may drift without stage-specific delivery checkpoints.
- Metadata timeline and extension bridge domains remain documented target architecture and are not yet represented as complete runtime slices.
- Contract-vs-concept terminology drift in docs must continue to be managed carefully.
- Custom-share recipient UX depends on session membership hydration (users appear after joining session).
- Prisma schema is updated, but migration history is not yet committed; DB rollout consistency risk remains.

Dependencies before later stages:

- Stage 6 depends on authoritative presence state model and reconnection strategy (✓ complete).
- Stage 7 depends on stable room/presence semantics and token lifecycle reliability (✓ ready).
- Stage 13 depends on Stage 10.4 (external system authorization panel) being in place before guest auth endpoints are safely deployable to production.

## 4.1) Validation Notes

The following references support the corrected stage labels and current model terminology.

| Claim                                       | Status                                 | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stage 5 (Notes) vertical slice              | Complete                               | Notes routes mounted: [backend/src/api/index.ts](backend/src/api/index.ts), [backend/src/api/notes.routes.ts](backend/src/api/notes.routes.ts). Persisted service/repository flow: [backend/src/core/notes/notes.service.ts](backend/src/core/notes/notes.service.ts), [backend/src/repositories/notes.repository.ts](backend/src/repositories/notes.repository.ts). Frontend panel/card wiring and custom-share selector UX: [frontend/src/components/notes/NotesPanel.tsx](frontend/src/components/notes/NotesPanel.tsx), [frontend/src/components/notes/NoteCard.tsx](frontend/src/components/notes/NoteCard.tsx), [frontend/src/state/notesSlice.ts](frontend/src/state/notesSlice.ts). Tests: [backend/tests/core/notes/notes-visibility.test.ts](backend/tests/core/notes/notes-visibility.test.ts), [backend/tests/integration/notes-routes-ws.integration.test.ts](backend/tests/integration/notes-routes-ws.integration.test.ts). Publish audit hook: [backend/src/api/notes.routes.ts](backend/src/api/notes.routes.ts).                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Stage 6 (Presence and Rooms) vertical slice | Complete                               | Mounted APIs: [backend/src/api/rooms.routes.ts](backend/src/api/rooms.routes.ts), [backend/src/api/presence.routes.ts](backend/src/api/presence.routes.ts), [backend/src/api/index.ts](backend/src/api/index.ts). Redis-first room/presence service + transition orchestration: [backend/src/core/rooms/room.service.ts](backend/src/core/rooms/room.service.ts), [backend/src/api/session.routes.ts](backend/src/api/session.routes.ts), [backend/src/infra/redis/index.ts](backend/src/infra/redis/index.ts). DB snapshots + schema: [backend/src/repositories/room.repository.ts](backend/src/repositories/room.repository.ts), [backend/prisma/schema.prisma](backend/prisma/schema.prisma). Frontend sync/indicators and atomic reconnect hydration: [frontend/src/state/roomSlice.ts](frontend/src/state/roomSlice.ts), [frontend/src/hooks/useWebSocket.ts](frontend/src/hooks/useWebSocket.ts), [frontend/src/components/session/SessionInit.tsx](frontend/src/components/session/SessionInit.tsx). Tests: [backend/tests/integration/room-service-recovery.integration.test.ts](backend/tests/integration/room-service-recovery.integration.test.ts), [backend/tests/integration/session-room-transition.integration.test.ts](backend/tests/integration/session-room-transition.integration.test.ts), [backend/tests/api/presence-rooms-authz.test.ts](backend/tests/api/presence-rooms-authz.test.ts). Validation: `prisma migrate status` reports "Database schema is up to date". |
| Stage 7 (Audio and LiveKit) vertical slice  | Complete (baseline)                    | Token route and service are implemented: [backend/src/api/livekit.routes.ts](backend/src/api/livekit.routes.ts), [backend/src/infra/livekit/token.service.ts](backend/src/infra/livekit/token.service.ts). Frontend lifecycle/audio hooks are implemented and runtime-mounted via [frontend/src/components/audio/AudioPanel.tsx](frontend/src/components/audio/AudioPanel.tsx) and [frontend/src/App.tsx](frontend/src/App.tsx): [frontend/src/hooks/useLiveKit.ts](frontend/src/hooks/useLiveKit.ts), [frontend/src/hooks/useAudioEngine.ts](frontend/src/hooks/useAudioEngine.ts). WS audio handlers are dispatcher-registered: [backend/src/ws/handlers.ts](backend/src/ws/handlers.ts), [backend/src/ws/index.ts](backend/src/ws/index.ts). Audio control API routes are implemented and mounted: [backend/src/api/audio.routes.ts](backend/src/api/audio.routes.ts), [backend/src/api/index.ts](backend/src/api/index.ts). Tests validate envelope + route role gating/emission behavior: [backend/tests/contracts/audio-livekit-integration.test.ts](backend/tests/contracts/audio-livekit-integration.test.ts), [backend/tests/api/audio-routes.test.ts](backend/tests/api/audio-routes.test.ts).                                                                                                                                                                                                                                                                                      |
| Stage 8 (Admin and Ops) baseline            | Complete (baseline)                    | Authenticated admin routes, invite onboarding, moderation actions, audit logging, and telemetry are implemented in [backend/src/api/admin.routes.ts](backend/src/api/admin.routes.ts), [backend/src/infra/http/middleware.ts](backend/src/infra/http/middleware.ts), [backend/src/services/admin.service.ts](backend/src/services/admin.service.ts), and [backend/prisma/schema.prisma](backend/prisma/schema.prisma). Admin SPA setup/login/handoff and operational pages are wired in [admin/src/App.tsx](admin/src/App.tsx), [admin/src/pages/UserManagement.tsx](admin/src/pages/UserManagement.tsx), [admin/src/pages/InviteOnboarding.tsx](admin/src/pages/InviteOnboarding.tsx), [admin/src/pages/Logs.tsx](admin/src/pages/Logs.tsx), [admin/src/pages/Dashboard.tsx](admin/src/pages/Dashboard.tsx), and [admin/src/pages/PlatformStatus.tsx](admin/src/pages/PlatformStatus.tsx). Remaining gaps are Stage 10 concerns: scaffold-only room/settings surfaces, more durable telemetry, and deeper admin-specific automated coverage.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Stage 9 (Command-center UI)                 | In progress (9.2 advanced)             | Stage 9.1 shell parity is complete and Stage 9.2 DM control-surface work is active in runtime. Command-center frame and session integration are implemented in [frontend/src/components/session/CommandCenterFrame.tsx](frontend/src/components/session/CommandCenterFrame.tsx) and [frontend/src/components/session/SessionInit.tsx](frontend/src/components/session/SessionInit.tsx), with advanced DM controls mounted via [frontend/src/components/session/DMAudioControls.tsx](frontend/src/components/session/DMAudioControls.tsx). Authoritative drag/drop room movement is now backed by [backend/src/api/rooms.routes.ts](backend/src/api/rooms.routes.ts) (`POST /api/rooms/:roomId/move-user`) with DM-only authz coverage in [backend/tests/api/presence-rooms-authz.test.ts](backend/tests/api/presence-rooms-authz.test.ts). Current automated coverage for this slice includes [frontend/src/tests/components/CommandCenterFrame.test.tsx](frontend/src/tests/components/CommandCenterFrame.test.tsx) and [frontend/src/tests/components/DMAudioControls.test.tsx](frontend/src/tests/components/DMAudioControls.test.tsx). Remaining Stage 9.2/9.3 work includes websocket emission contracts, richer realtime integration coverage, and recovery/theming/motion compliance.                                                                                                                                                                                                  |
| Stage 4 chat boundary/system behavior       | Complete                               | Session boundary/system message emission: [backend/src/core/chat/session-boundaries.ts](backend/src/core/chat/session-boundaries.ts), [backend/src/core/chat/system-messages.ts](backend/src/core/chat/system-messages.ts), [backend/src/api/session.routes.ts](backend/src/api/session.routes.ts). System-message immutability: [backend/src/core/chat/chat.service.ts](backend/src/core/chat/chat.service.ts). Frontend WS wrapper compatibility: [frontend/src/ws/client.ts](frontend/src/ws/client.ts). Tests: [backend/tests/core/chat/chat-system-messages.test.ts](backend/tests/core/chat/chat-system-messages.test.ts).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Character status field terminology          | Aligned                                | Data-model terminology: [docs/architecture/DATA-MODEL.md](docs/architecture/DATA-MODEL.md) ("status" values: alive, dead, left, unknown). Persisted schema enum: [backend/prisma/schema.prisma](backend/prisma/schema.prisma) (`CharacterStatus`: `ALIVE`, `DEAD`, `LEFT`, `UNKNOWN`). API validation and persistence path: [backend/src/api/campaign.routes.ts](backend/src/api/campaign.routes.ts), [backend/src/repositories/campaign.repository.ts](backend/src/repositories/campaign.repository.ts), [backend/tests/api/campaign-users-api.test.ts](backend/tests/api/campaign-users-api.test.ts).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Frontend command-center UI scope            | Planned and now explicitly tracked     | UI layout/components/flows/recovery/theming/motion specs define broader SPA surface than currently closed stages: [docs/ui/UI-LAYOUT.md](docs/ui/UI-LAYOUT.md), [docs/ui/UI-COMPONENTS.md](docs/ui/UI-COMPONENTS.md), [docs/ui/UI-FLOWS.md](docs/ui/UI-FLOWS.md), [docs/ui/UI-STATE-RECOVERY.md](docs/ui/UI-STATE-RECOVERY.md), [docs/ui/UI-LOADING-STATES.md](docs/ui/UI-LOADING-STATES.md), [docs/ui/UI-ERROR-HANDLING.md](docs/ui/UI-ERROR-HANDLING.md), [docs/ui/UI-THEMING.md](docs/ui/UI-THEMING.md), [docs/ui/UI-MOTION.md](docs/ui/UI-MOTION.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Post-Stage knowledge/portability domains    | Stage 12 implemented; Stage 13 planned | Stage 12 portability/recordings workflows are implemented in admin runtime routes and schema: [backend/src/api/admin.routes.ts](backend/src/api/admin.routes.ts), [backend/src/core/portability/admin-portability.ts](backend/src/core/portability/admin-portability.ts), [backend/prisma/schema.prisma](backend/prisma/schema.prisma), [admin/src/pages/CampaignManagement.tsx](admin/src/pages/CampaignManagement.tsx), [admin/src/pages/Settings.tsx](admin/src/pages/Settings.tsx). Remaining placeholder runtime domain in API index is metadata-only: [backend/src/api/index.ts](backend/src/api/index.ts).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

---

## 5) Progress Log (Condensed)

- 2026-04: Stage 10.2 kickoff delivered. Added authenticated admin campaign operations endpoints (`GET /api/admin/campaigns`, `GET /api/admin/campaigns/:campaignId/rooms`, `POST /api/admin/campaigns/:campaignId/sessions/:sessionId/end`) and replaced static `Rooms & Campaigns` page content with live list/detail/action workflows. Style extraction rule preserved via dedicated external stylesheet for the activated page.
- 2026-04: Stage 10.2 expansion pass delivered. Added campaign archive/restore and room move-player admin endpoints with audit entries, added dedicated admin interaction tests for live `Rooms & Campaigns` filter/selection/end-session flows (success/failure), and activated `Settings` with backend-backed save/backup workflows using externalized stylesheet rules.
- 2026-04: Stage 10.3 kickoff delivered initial durability/drill-down increment. Added durable telemetry ingest sink persistence for client events, merged persisted telemetry into `/api/admin/telemetry/logs`, and added new `/api/admin/telemetry/logs/:logId` drill-down endpoint for persisted telemetry and admin-audit entries.
- 2026-04: Stage 10.3 durability hardening increment delivered. Added persisted diagnostic stream support for runtime log drill-down parity, retention/rotation policy controls surfaced in admin settings, and dedicated admin logs UI coverage for filter/sort/pagination/detail workflows.
- 2026-04: Stage 11 scope expanded for frontend command-center parity. Identified `AvatarOverlay` and `RoomSelector` as baseline placeholders and elevated them to explicit Stage 11 deliverables, including left-rail participant status UX completion and frontend CSS externalization for Stage 11 surfaces.
- 2026-04: Stage 11 CSS consolidation increment delivered. Migrated frontend component CSS into centralized `frontend/src/styles/components/**`, completed inline-style extraction for `SessionInit` campaign/session/session-list surfaces, and added end-to-end SessionInit left-rail room-switch integration coverage.
- 2026-04: Stage 11 frontend knowledge-surface kickoff delivered. Replaced `SessionInit` right-rail placeholder copy for `search`/`journal`/`history` with real panels backed by persisted chat, notes, and session-log APIs; expanded player right-rail access to the new read-only knowledge tabs; and added focused panel + integration coverage.
- 2026-04: Stage 12 delivered. Added admin campaign export/import routes with persisted portability artifacts and audit trails, added persisted `RecordingMetadata` + admin recording APIs, activated admin UI export/import and recording metadata controls, and added operations export workflow (`/api/admin/settings/backup/export`) with associated backend/admin test coverage.
- 2026-04: Stage 10.1 execution pass delivered. Added backend admin authz regression coverage for protected routes (`/api/admin/telemetry/status`, `/api/admin/users`, `/api/admin/me`) and explicit public-route assertion for `/api/admin/setup-status`. Added admin SPA guard tests covering setup/login routing, authenticated dashboard rendering, and session-expiry logout handling.
- 2026-04: Stage 9.3 completed and Stage 9 closed. Implemented frontend logger controls (`setLevel`, `getLevel`, `enableConsole`) with precedence model, migrated remaining WS path ad-hoc `console.*` calls to shared logger contexts, added privacy-safe telemetry client batching/sanitization utilities, and added validation tests for logger controls + telemetry/console separation checks. Frontend verification now reports `15` passed test files / `115` passing tests.
- 2026-04: Stage 9.3 started in frontend runtime. Added reconnect/hydration status banner UX, variant-based non-blocking toast rendering, tokenized theming foundation with motion keyframes, and Stage 9.3 regression tests for reconnect lifecycle, toast semantics, and theme-token parity. Frontend verification now reports `13` passed test files / `106` passing tests.
- 2026-04: Full verification snapshot: build ✅ (`npm run build` at repo root), lint ✅ (`npm run lint` at repo root), tests ✅ (backend `57` passing + `6` todo, frontend `36` passing, admin `9` passing).
- 2026-04: Standardized Vitest coverage reporting delivered across backend/frontend/admin. Added per-package `test:coverage` scripts, root `test:coverage` aggregator, V8 coverage reporters (`text`, `html`, `json-summary`), and enforced baseline thresholds (backend: branches `18`, functions `24`, lines/statements `22`; frontend: branches `20`, functions/lines/statements `25`; admin: branches `6`, functions/lines/statements `7`).
- 2026-04: Stage 9.1 started in frontend runtime. Added explicit three-panel command-center shell (left rail + center pane + right rail), role-aware right-rail tab visibility for DM/Player/Spectator, and right-rail open/close behavior. Added component coverage for persona matrix and panel toggles via `frontend/src/tests/components/CommandCenterFrame.test.tsx`; frontend verification now reports `7` files / `21` tests passing.
- 2026-04: Stage 9.1 completed. Added toolbar action model backed by global `commandCenter` store slice, extracted `CampaignInfo`/`SystemToasts`/`LeftRailSummary` components, and extended responsive layout testing for desktop/tablet breakpoint transitions. Frontend verification now reports `7` files / `24` tests passing.
- 2026-04: Stage 9.2 started with the first DM command-center audio control surface. Added API-backed DM audio controls (`DMAudioControls`) to the right-rail audio tab for room environment apply plus per-player mute/gain overrides, with DM-only gating and component tests. Frontend verification now reports `8` files / `27` tests passing.
- 2026-04: Stage 9.2 advanced pass delivered. Extended `DMAudioControls` with DM voice presets plus distance/condition/filter overrides, and switched drag/drop room movement to authoritative backend control via `POST /api/rooms/:roomId/move-user` with websocket reconciliation. Added backend authz/success coverage for `move-user` and expanded frontend component coverage; verification now reports frontend `8` files / `30` tests and backend `55` passing tests + `6` todo markers (`61` total).
- 2026-04: Full-suite verification refresh run completed. Frontend now reports `9` passed test files with `36` passing tests. Backend now reports `13` passed + `1` skipped test files with `57` passing tests + `6` todo markers (`63` total).
- 2026-04: Stage 9.2 completion pass delivered. Added backend websocket payload assertions for `ROOM:USER_LEFT`/`ROOM:USER_JOINED` on `POST /api/rooms/:roomId/move-user`, added integration coverage for full DM drag/drop flow against live room/presence websocket updates, and added reducer/store-level coverage for distance/condition/filter + DM override state transitions.
- 2026-04: Bidirectional frontend/admin authentication handoff is now implemented end-to-end. Added one-time token endpoints (`/api/auth/handoff/admin`, `/api/admin/auth/handoff/exchange`, `/api/admin/handoff/app`, `/api/auth/handoff/exchange`), frontend/admin launch-route exchange handling (`/launch?handoff=...`), `Open Admin` and `Open App` UI actions, and guest-DM admin launch blocking via `GUEST_UPGRADE_REQUIRED` until full-account upgrade.
- 2026-04: Roadmap Stage 8 status reviewed against shipped code. Stage 8 is now treated as complete baseline because admin auth, moderation, invite onboarding, audit logging, telemetry pages, and app/admin handoff flows are implemented; remaining scaffolded admin operations and telemetry durability concerns are tracked under Stage 10 rather than Stage 8 blockers.
- 2026-04: Stage 8 admin architecture redesign implemented in backend runtime: `AdminUser` table merged into `User` (`password`, `isActive`, `adminRole`), new `AdminRole` enum added, migration applied (`20260420033808_merge_admin_user_into_user`), admin JWT claims expanded (`userId`, `username`, `adminRole`), admin service refactored to unified user accounts, DM auto-assignment to `CAMPAIGN_DM` added for DM user write paths, and `POST /api/admin/users/:userId/promote` + `GET /api/admin/me` endpoints added. Backend/frontend/admin builds pass.
- 2026-04: Documentation aligned for linked frontend/admin authentication flows: full-account users with admin rights should launch admin from frontend already authenticated and launch frontend from admin already authenticated via one-time handoff tokens. Guest DMs may see the admin entry point but must upgrade to full account before admin access.
- 2026-04: Stage 8 admin auth closure and initial sysadmin setup process completed. Implemented `AdminUser` Prisma model, `/api/admin/setup` endpoint, `/api/admin/login` endpoint, admin authentication middleware enforcement on telemetry routes, password validation utility with 12+ char + uppercase/lowercase/number/special requirements, frontend Setup wizard with `PasswordStrengthIndicator` component, Login form with remember-me support, updated `useAuthStore` for real auth (sessionStorage/localStorage), and updated `App.tsx` routing through setup→login→dashboard based on auth state. Backend and admin frontend builds pass with full TypeScript coverage. All components styled and ready for ops action implementation.
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
- 2026-04: Stage 7 baseline completed: LiveKit token route/service, runtime-mounted frontend livekit/audio hooks, dispatcher-registered WS audio handlers, and concrete `/api/audio` control routes with role-gated event emission tests.
- 2026-04: Frontend test baseline expanded and centralized under `frontend/src/tests` with real suites for app shell, websocket dispatcher wiring, useWebSocket, useLiveKit race-safety behavior, and useAudioEngine behavior.
- 2026-04: Backend test coverage expanded and reorganized into `api`, `integration`, `core`, `ws`, and `contracts` domains with normalized `*.integration.test.ts` naming for integration suites.
- 2026-04: Backend circular dependency refactoring completed: `SessionLogsService` extracted, `RoomService`/`RoomRecoveryService`/`PresenceService` converted to dependency injection pattern. Latest verification now reports frontend `6` files / `15` tests passing and backend `13` passed + `1` skipped files with `53` passing tests + `6` todo markers; monorepo builds cleanly. Infrastructure hardening improves testability and maintainability.
- 2026-04: Roadmap expanded to track remaining full-project scope beyond Stage 8, including frontend command-center completion, admin feature completion, knowledge surfaces (metadata/journal/history/search), import/export + recordings metadata, and extension bridge integration.
- 2026-04: Extension/guest auth system fully designed and documented: [docs/extension/GUEST-AUTH.md](docs/extension/GUEST-AUTH.md) created covering invite links, pre-flight sequence, four auth path variants, external identity model, data sync policy, and account upgrade flow. [docs/extension/EXTENSION-INTEGRATION.md](docs/extension/EXTENSION-INTEGRATION.md), [docs/extension/THIRD-PARTY-INTEGRATIONS.md](docs/extension/THIRD-PARTY-INTEGRATIONS.md), [docs/architecture/DATA-MODEL.md](docs/architecture/DATA-MODEL.md), [docs/architecture/API-SPEC.md](docs/architecture/API-SPEC.md), and [docs/architecture/PERMISSIONS-MATRIX.md](docs/architecture/PERMISSIONS-MATRIX.md) updated to reflect `ExternalIdentity`, `CampaignExternalLink`, `ExternalSystem` registry, guest `authType`, `extensionSyncPolicy`, and all new endpoints. Stage 10 expanded with Stage 10.4 (external system authorization panel as prerequisite for Stage 13). Stage 13 expanded from a placeholder into five concrete sub-milestones (13.1 backend guest auth, 13.2 external identity/linking, 13.3 frontend guest UX, 13.4 D&D Beyond extension wiring, 13.5 Roll20/Foundry bridge). Extension repository noted: https://github.com/AndyProsser/vtt-chat-extension.

---

## 6) Definition of Done for This Roadmap

Roadmap complete when:

- Stages 0-13 all meet their exit criteria.
- Security and auditability requirements are met for internet-facing operation.
- Monorepo builds cleanly and stage-critical user journeys are test-covered.

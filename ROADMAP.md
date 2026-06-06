# VTT-Chat Product Roadmap

**Last Updated**: 2026-06-05
**Purpose**: Track work items prioritized by importance and urgency. Acceptance criteria drive completion; detailed implementation notes and designs live in supporting docs.
**Archive**: Historical delivery notes and detailed phase descriptions → [docs/DEVELOPMENT-ROADMAP-2026-05.md](docs/DEVELOPMENT-ROADMAP-2026-05.md)

---

## Summary

| Phase                                  |  Items | 🟢 Done | 🟡 In Progress | ⚪ Not Started | Phase Status   |
| -------------------------------------- | -----: | ------: | -------------: | -------------: | -------------- |
| Phase 0: Core Reliability & Resilience |      5 |       5 |              0 |              0 | 🟢 Done        |
| Phase 1: UI/UX Foundation              |      4 |       4 |              0 |              0 | 🟢 Done        |
| Phase 2: Audio Experiences             |      5 |       5 |              0 |              0 | 🟢 Done        |
| Phase 3: Notes & Journal Foundation    |      5 |       0 |              0 |              5 | 🔴 Blocked     |
| Phase 4: Future Enhancements           |      5 |       0 |              0 |              5 | ⚪ Not Started |
| Phase 5: Optional / Far Future         |      5 |       0 |              0 |              5 | ⚪ Not Started |
| **Total**                              | **29** |  **14** |          **0** |         **15** |                |

**MVP-blocking items remaining**: Phase 3 (Notes & Journal Foundation) — all items ⚪ Not Started.

---

## Roadmap Overview

VTT-Chat is a real-time voice and chat platform for TTRPGs. The roadmap focuses on **core reliability first**, then **UI/UX**, then **audio experiences**, then **notes/journal**. Each phase unlocks the next.

**Legend**: 🟢 Done | 🟡 In Progress | 🔴 Blocked | ⚪ Not Started

---

## Phase 0: Core Reliability & Resilience 🟡

_Prerequisite for all runtime work. State machine must be solid or the rest cascades with failures._

### W0-State-Machine: Session State Determinism

**Status**: 🟢 Done
**Priority**: 🔴 Critical (blocking)
**Depends on**: (none)

**Scope**: Finalize and enforce the canonical session state machine so all subsystems (session lifecycle, presence, audio, groups) transition deterministically with no ambiguity.

**Acceptance Criteria**:

- [x] State machine contract is locked (`IDLE`, `ACTIVE`, `PAUSED`, `COOLDOWN`, `ENDED`, `CLEANUP`)
- [x] Transition rules are enforced at API layer (current implementation returns 409 on invalid transitions)
- [x] Backend persists state transitions as system chat bookends (`[Session Started]`, etc.)
- [x] Frontend renders bookends correctly after refresh/reconnect
- [x] Spectator lifecycle rules are enforced (observe-only during `ACTIVE`; during `COOLDOWN` can chat/speak with players and DM if DM has enabled it in campaign settings; excluded from all other states)
- [x] Post-session chat timer and cooldown window work end-to-end

Evidence snapshot (2026-05-18):

- Backend now enforces spectator chat lifecycle at API level in `POST /api/chat/message`:
  - observe-only during `ACTIVE`
  - spectator chat allowed only during `COOLDOWN`
  - spectator cooldown chat requires campaign `postSessionChatEnabled`
- Added backend route coverage for these paths in `backend/tests/api/chat-routes.test.ts`.
- Backend now enforces spectator voice lifecycle at API level in `POST /api/livekit/token`:
  - observe-only voice during `ACTIVE` (`canPublish=false`)
  - spectator voice in `COOLDOWN` requires campaign `postSessionChatEnabled`
  - spectator voice is rejected in non-active/non-cooldown states
- Added backend route coverage for these paths in `backend/tests/api/livekit-routes.test.ts`.
- Spectator center-pane lifecycle screens now map state explicitly:
  - `IDLE` + `PAUSED` show a "Please wait" hold screen.
  - `ENDED` + `CLEANUP` show a "Session Closed" screen.
  - `COOLDOWN` continues to show the post-session countdown panel.
- Greenroom chat hydration now avoids new-session over-filtering and loads deterministically:
  - initial load requests campaign greenroom page without startup over-filtering
  - lazy scroll-up pagination still backfills older history via `before`
  - backend campaign chat page supports server-side boundary filtering when requested.
- Cooldown countdown controls remain verified by frontend coverage (`frontend/tests/components/SessionToolbar.test.tsx`).
- Cooldown timer anchor is backend-authoritative end-to-end:
  - backend now emits and returns `cooldownExpiresAt` in session cooldown flows (`SESSION:COOLDOWN_STARTED`, `SESSION:COOLDOWN_EXTENDED`, `GET /api/session/:id`, `GET /api/campaigns/:campaignId/sessions`).
  - frontend stores `cooldownExpiresAt` in session state and renders cooldown remaining time from that server-provided anchor.
  - frontend runs a low-frequency authoritative session sync poll (30s) to correct drift if WS timing updates are delayed or missed.

**Related Docs**:

- [docs/changes/STATE-MACHINE.md](docs/changes/STATE-MACHINE.md)
- [docs/changes/STATE-MACHINE-IMPLEMENTATION.md](docs/changes/STATE-MACHINE-IMPLEMENTATION.md)
- [docs/architecture/SESSION-LIFECYCLE.md](docs/architecture/SESSION-LIFECYCLE.md)

---

### W1-Runtime-Recovery: Runtime State Persistence and Recovery

**Status**: 🟢 Done
**Priority**: 🔴 Critical (blocking)
**Depends on**: W0-State-Machine

**Scope**: Adopt Redis as the first write layer for runtime state (presence, room membership, audio effects). Backend mutations follow: validate → Redis update → audit log → WS broadcast → optional Postgres durability.

**Acceptance Criteria**:

- [x] Redis-first mutation flow is documented and implemented for: presence, room membership, audio effects (environment, conditions, distance)
- [x] All websocket-visible domain routes classify into Class A (Redis durable) / Class B (Redis w/ bounded flush) / Class C (ephemeral)
- [x] Session audit trail captures all meaningful control-plane actions (join/leave, move, mute, lifecycle boundaries)
- [x] Reconnect recovery uses backend-authoritative sources (Redis runtime state + Postgres fallback)
- [x] Multi-client reconnect soak suite passes consistently

**Related Docs**:

- [docs/architecture/RUNTIME-STATE-AND-AUDIT-CONTRACT.md](docs/architecture/RUNTIME-STATE-AND-AUDIT-CONTRACT.md)
- [docs/changes/RUNTIME-RECOVERY-AUDIT-2026-05-18.md](docs/changes/RUNTIME-RECOVERY-AUDIT-2026-05-18.md)

**Current Evidence Snapshot (2026-05-18):**

- Redis runtime projection writes added for audio environment + DM override/broadcast mutation flows in `backend/src/services/audio/presets.service.ts` and `backend/src/services/audio/effects.service.ts`.
- Session audio rehydration now prefers Redis (`audio:session:{sessionId}:environments`, `audio:session:{sessionId}:overrides`) with Postgres fallback in `backend/src/services/audio/presets.service.ts`.
- Focused coverage expanded in `backend/tests/services/audio-state.service.test.ts` for Redis write-through and Redis-first read behavior.
- Added a typed runtime route classification registry for WS-visible mutation surfaces in `backend/src/services/runtime/runtime-route-classification.service.ts`.
- Registry coverage now includes `presence`, `rooms`, `audio`, `session`, `chat`, `notes`, and `integrations` mutation routes with focused validation in `backend/tests/services/runtime-route-classification.service.test.ts`.
- Session audit envelope normalization now runs through `backend/src/services/runtime/runtime-streams.service.ts`, with focused helper coverage in `backend/tests/services/runtime-streams.service.unit.test.ts`.
- Notes mutation routes now append standardized audit events for create/update/publish/delete flows in `backend/src/api/notes.routes.ts`, covered by `backend/tests/api/notes-routes.test.ts`.
- All remaining WS-visible mutation families (audio, rooms, session, presence, chat, notes, integrations) now have `appendSessionAuditEvent` coverage. Chat audit flows through `chat.service.ts` (MESSAGE_SENT/EDITED/DELETED). `integrations.routes.ts` now appends one audit event per affected session for extension-driven profile sync.
- Multi-client reconnect soak evidence exists in `backend/tests/integration/multi-client-reconnect.integration.test.ts` (4 scenarios: concurrent reconnect slices, session isolation, FIFO cap, full-replay fallback) and `backend/tests/integration/ws-disconnect-reconnect-sequencing.integration.test.ts` (same-user multi-tab sequencing).

---

### W2-Testing: Release Gates and Regression Coverage

**Status**: 🟢 Done
**Priority**: 🟡 High (gating Phase 1)
**Depends on**: W0-State-Machine, W1-Runtime-Recovery

**Scope**: Lock in release gates for backend/frontend/admin. Add integration coverage for session lifecycle, audio state recovery, multi-client reconnect, and state-machine transitions.

**Acceptance Criteria**:

- [x] Backend test suite passes with ≥60% coverage statement baseline; zero critical-path test failures (2026-05-18: 83/83 test files, 660/660 tests, 65.26% statements, 53.67% branches, 66.96% functions, 65.62% lines)
- [x] Frontend test suite passes with ≥60% coverage statement baseline; zero critical-path test failures
- [x] Release-gate reporting is automated and enforced in CI (enforced by `.github/workflows/qa-gates.yml` with lint/build/coverage/flaky gates + artifact reports)
- [x] Session lifecycle coverage includes: start → pause → resume → end → cleanup (covered by `backend/tests/integration/session-room-transition.integration.test.ts`, `backend/tests/integration/session-cooldown-handoff.integration.test.ts`, `backend/tests/services/session-cleanup-job.service.test.ts`)
- [x] Audio state recovery coverage includes: environment + conditions + distance + mute (covered by `backend/tests/integration/audio-state-recovery.integration.test.ts`)
- [x] Multi-client reconnect coverage includes: concurrent reconnect, session isolation, FIFO recovery (`backend/tests/integration/multi-client-reconnect.integration.test.ts`)

**Related Docs**:

- [backend/tests/](backend/tests/)
- [frontend/tests/](frontend/tests/)

---

### W3-Operatisation: Runbooks and Telemetry Matrix

**Status**: 🟢 Done
**Priority**: 🟡 High
**Depends on**: W0-State-Machine, W1-Runtime-Recovery

**Scope**: Document and validate operator workflows, backup/restore drills, and telemetry signal definitions.

**Acceptance Criteria**:

- [x] Operator runbook exists for: restart, backup/restore, incident triage, log analysis
- [x] Telemetry matrix documents what is tracked, why, and how it is consumed
- [x] Restart-survival validation confirms telemetry/diagnostic sinks persist across restarts
- [x] Backup/restore drill is executed and documented as reproducible

**Related Docs**:

- [docs/operations/](docs/operations/)
- [docs/operations/RUNBOOK.md](docs/operations/RUNBOOK.md)
- [docs/operations/TELEMETRY-MATRIX.md](docs/operations/TELEMETRY-MATRIX.md)
- [docs/operations/RESTART-SURVIVAL-VALIDATION-2026-05-19.md](docs/operations/RESTART-SURVIVAL-VALIDATION-2026-05-19.md)
- [docs/operations/BACKUP-RESTORE-DRILL-2026-05-19.md](docs/operations/BACKUP-RESTORE-DRILL-2026-05-19.md)

Evidence snapshot (2026-05-19):

- Restart-survival validation suite executed:
  - `backend/tests/infra/telemetry-store.test.ts` (7/7)
  - `backend/tests/integration/multi-client-reconnect.integration.test.ts` (6/6)
  - `backend/tests/integration/ws-disconnect-reconnect-sequencing.integration.test.ts` (3/3)
  - `backend/tests/integration/audio-state-recovery.integration.test.ts` (15/15)
- Backup/restore drill suite executed:
  - `backend/tests/services/admin-portability.service.test.ts` (7/7)
  - `backend/tests/api/admin-campaign-operations.test.ts` (8/8)
  - `backend/tests/api/admin-settings-routes.test.ts` (15/15)
  - `backend/tests/api/admin-telemetry-diagnostic-retention.test.ts` (7/7)
- Drill records and reproducible command sets are now documented in:
  - `docs/operations/RESTART-SURVIVAL-VALIDATION-2026-05-19.md`
  - `docs/operations/BACKUP-RESTORE-DRILL-2026-05-19.md`

Evidence snapshot (2026-05-25):

- Frontend runtime freeze triage guidance was added to developer docs with an explicit churn-debug flow (`docs/DEV-QUICK-REFERENCE.md`, `docs/subsystems/STATE-STORES.md`).
- Opt-in store churn diagnostics now emit `store.churn` totals/deltas for high-churn collections (`VITE_DEBUG_CHURN_METRICS=1` or `window.__VTT_DEBUG_CHURN__ = true`).
- High-frequency frontend reducers in chat/presence/greenroom/room/livekit were hardened with additional no-op guards and lower-allocation update paths to reduce GC pressure during WS-heavy sessions.

Evidence snapshot (2026-05-28, v0.8.5):

- Per-user transient UI state (speaking, presence online/offline, ghost mode, mic mute) was extracted into memoized leaf indicator components under `frontend/src/components/workspaces/session/rooms/` (`SpeakingIndicator`, `PresenceIndicator`, `GhostIndicator`, `MicMutedIndicator`), each subscribing to a single primitive Zustand selector. Flips no longer invalidate parent participant projections or rebuild surrounding Radix Tooltip/Popover subtrees.
- `AvatarOverlay` API simplified to a single `presence` bundle prop; `GroupParticipantStatus` no longer carries `presenceState` / `ghost` / `isMuted`; cascading styles driven by CSS `:has()` instead of parent className threading.
- `PartyPanel.PartyMemberCard` wrapped in `React.memo` so a single member's HERE/AWAY/NOT-HERE flip re-renders only that card.
- Leaf-isolation pattern documented as a non-negotiable in `.github/copilot-instructions.md` and `docs/subsystems/STATE-STORES.md`; freeze triage flow in `docs/DEV-QUICK-REFERENCE.md` now includes a leaf-isolation check.

Evidence snapshot (2026-05-29):

- Frontend workspace runtime now includes a beta memory-pressure recovery guard (`frontend/src/hooks/session/useWorkspacesMemoryPressureGuard.ts`) that warns before a guarded reload so rehydration can recover the session instead of letting the browser tab crash.
- The guard emits lightweight client telemetry for warning/display and refresh-trigger events, so runtime triage can quantify how often the fallback is intervening.
- Memory threshold, poll interval, grace window, and reload cooldown are beta-tunable through `VITE_MEMORY_PRESSURE_*` env values, and development builds support a manual simulator toggle via `window.__VTT_DEBUG_MEMORY_PRESSURE__ = 'warn' | 'reload'`.

---

### W4-Conversation-Authority: Campaign-Scoped Conversation, Session-Scoped Routing

**Status**: 🟢 Done
**Priority**: 🟡 High
**Depends on**: W0-State-Machine, W1-Runtime-Recovery

**Scope**: Decouple conversation authority from session lifecycle. Campaign membership/role determines whether a user can participate in conversation; session lifecycle determines room assignment, policy gates, and recording boundaries.

**Acceptance Criteria**:

- [x] Contracts explicitly define campaign as conversation authority and session as routing/policy authority.
- [x] API validation order is enforced: campaign authorization → lifecycle policy → room routing.
- [x] Session transitions reassign rooms without implying participant transport identity teardown.
- [x] Audio continuity across session transitions is documented and implemented as policy remap (not reconnect/reset), while preserving whisper/spectator privacy rules.
- [x] Recording boundaries remain session-authoritative via persisted bookends and transcript/summary consumption rules.

**Related Docs**:

- [docs/CONTRACTS.md](docs/CONTRACTS.md)
- [docs/architecture/SESSION-LIFECYCLE.md](docs/architecture/SESSION-LIFECYCLE.md)
- [docs/architecture/RUNTIME-STATE-AND-AUDIT-CONTRACT.md](docs/architecture/RUNTIME-STATE-AND-AUDIT-CONTRACT.md)

Evidence snapshot (2026-06-04):

- Contracts locked in `docs/CONTRACTS.md` (Campaign Conversation Authority Contract, Session Room Assignment Contract, Audio Runtime Persistence and Session Policy Contract) and `docs/architecture/SESSION-LIFECYCLE.md` (sections 1.0 authority split, 1.6 recording boundaries, 1.7 audio continuity).
- `backend/src/services/session/authz.service.ts` enforces campaign membership as primary gate before session membership in `resolveEffectiveSessionRole` and `resolveRoleForSessionJoin`; covered by `backend/tests/services/session-authz.service.test.ts`.
- All conversation-surface API endpoints (chat, livekit/token, rooms join/move) go through campaign authorization before lifecycle policy before room routing.
- Backend `applySessionStateRoomTransition` reassigns room topology on state change without disconnecting LiveKit or WebSocket transport — session members retain transport identity across PAUSED/COOLDOWN transitions.
- Fixed frontend `ROOM:SESSION_TRANSITION_APPLIED` WS handler: `resetSessionAudioState()` and `clearActiveEffects()` are now conditional on teardown states (`IDLE`, `ENDED`, `CLEANUP`) only. ACTIVE, PAUSED, and COOLDOWN transitions no longer reset audio state, preserving effects and environments across pause/resume cycles.
- Added 11 focused tests in `frontend/tests/state/sessionTransition.audio.test.ts` covering: non-teardown states preserve audio, teardown states clear audio, PAUSED→ACTIVE resume retains environment, COOLDOWN→ENDED clears audio, `roomEnvironmentNames` survives all transitions.
- Recording bookends (`[Session Started]`, `[Session Paused]`, `[Session Resumed]`, `[Session Ended]`) remain session-authoritative end-to-end (persisted, broadcast, frontend-rendered, refresh-durable) from W0-State-Machine.

---

## Phase 1: UI/UX Foundation 🟡

_Unblock user experience. DMs need clean, responsive controls. Players/spectators need clarity on state._

### W0-Rightbar: Info Panels and Settings Toolbar

**Status**: 🟢 Done
**Priority**: 🟡 High
**Depends on**: W0-State-Machine

**Scope**: Implement a rightbar toolbar with one button per surface in this canonical order: INFO, PARTY, ROOMS, JOURNAL, NOTES, HISTORY, SETTINGS. Replace the single Information tab model with dedicated panel entry points. Keep topbar Settings for user profile/system defaults; rightbar SETTINGS remains campaign/session/character context.

**Acceptance Criteria**:

- [x] Rightbar toolbar renders buttons in canonical order: INFO, PARTY, ROOMS, JOURNAL, NOTES, HISTORY, SETTINGS (PARTY is 2nd; JOURNAL comes before NOTES)
- [x] Rightbar uses an icon-first dock with tooltip labels and centralized role-aware panel visibility policy
- [x] INFO panel shows campaign overview: name, description, player count, session count, completed sessions, next session ETA
- [x] INFO is readable by all personas; DM can edit campaign name/description/poster
- [x] PARTY panel lists all campaign players, including disconnected users and users not currently in-session
- [x] PARTY row fields include: name, class, level, race, presence status (`HERE` | `AWAY` | `LOBBY` | `NOT HERE` | `OFFLINE`), last seen, stats, and active conditions (same visible fields for players and spectators)
- [x] PARTY/Lobby presence labels and transitions follow the shared model in `docs/ui/PRESENCE-STATUS-MODEL.md`
- [x] ROOMS panel is DM-only and hidden entirely for non-DM personas
- [x] JOURNAL panel is a reverse-chronological list of sessions; each session has exactly one markdown journal entry with a hashtag list for search
- [x] JOURNAL is readable by all personas; DM-only edit
- [x] NOTES panel is a note list where each note includes name, markdown content, image attachments (multiple), and hashtags for search
- [x] NOTES is readable by all personas; DM can add/edit/delete/share notes to one or more players
- [x] NOTES supports Post to Chat, which creates a chat card in the selected group and auto-shares that note with all players in that group
- [x] HISTORY is a lightweight mirror of chat logs from previous sessions only, grouped by visible session boundaries
- [x] HISTORY never includes messages from the current active session
- [x] SETTINGS opens role-specific surfaces: DM gets Campaign + Session settings, players get Character settings (own character only), spectators do not see rightbar SETTINGS
- [x] Player action: PARTY > Edit switches panel focus to SETTINGS > Character and auto-focuses the first editable field
- [x] Character settings include editable character profile fields (name, race, class, level, stats, avatar)
- [x] Character settings race/class fields provide autocomplete suggestions from D&D 5.5e SRD data by default, allow free-text player overrides, and support admin-configured pluggable source providers
- [x] DM Campaign/Session settings include only safe editable fields in rightbar SETTINGS; sync-complex campaign fields remain managed in dedicated surfaces
- [x] Right-panel dismisses on backdrop click
- [x] Mobile responsive: collapse/expand at <680px; side-panel at ≥1080px

**Related Docs**:

- [docs/ui/UI-LAYOUT.md](docs/ui/UI-LAYOUT.md)
- [docs/ui/DM-CAMPAIGN-SETTINGS.md](docs/ui/DM-CAMPAIGN-SETTINGS.md)
- [docs/ui/PRESENCE-STATUS-MODEL.md](docs/ui/PRESENCE-STATUS-MODEL.md)

**Evidence snapshot (2026-05-22):**

- PARTY panel now backed by live `GET /api/campaigns/:campaignId/party-presence` snapshot; placeholder mock data removed from normal operation.
- PARTY row renders name, character name, class, level, race, ability scores (STR/DEX/CON/INT/WIS/CHA), presence label, last-seen timestamp, and manual away toggle.
- Presence labels `HERE`, `AWAY`, `LOBBY`, `NOT HERE`, `OFFLINE` are derived from authoritative runtime/session state via the shared `PRESENCE-STATUS-MODEL`; manual AWAY toggle writes through `PUT /api/presence/:sessionId/state`; inactivity auto-away fires after 8-minute idle window.
- `CAMPAIGN:PARTY_PRESENCE_UPDATED` WS signal triggers immediate PARTY panel refetch on any presence or session change.
- Role-based tab visibility moved to a single canonical policy file (`workspacePanelPolicy.constants.ts`); `rooms` and `audio` tabs are hidden for PLAYER; `party`, `rooms`, `notes`, `audio`, `settings` are hidden for SPECTATOR — enforced at runtime, not scattered across components.
- Right-rail overlay click-outside handler (`handleRightRailClickOutside`) closes the panel on backdrop click with animation guard.
- Frontend workspace structure normalization: toolbar, modals, and session orchestration files moved to dedicated domain folders; `CampaignInformationPanel` and `CampaignSettingsPanel` families moved to named subfolders with stripped prefixes (`CampaignInformationPanel/index.tsx`, `Header.tsx`, etc.).
- Screenshot diagnostics mode added (`?debugUi=1`) for layout verification and component ownership mapping.
- Active conditions are not yet shown in PARTY rows; that field depends on W-Audio-Condition.

Evidence snapshot (2026-05-23):

- Settings surface is now unified through a shared role-aware panel entrypoint in `frontend/src/components/workspaces/shared/panels/WorkspaceSettingsPanel.tsx`.
- Editor and session now open the same settings system from the rightbar settings icon:
  - DM sees Campaign settings with session-specific controls available as contextual extras.
  - Player sees Character/Player settings only.
  - Spectator remains excluded from editable rightbar settings.
- Player/character settings were extracted into `frontend/src/components/workspaces/shared/panels/PlayerSettingsPanel.tsx`.
- Legacy workspace-specific settings panel wrappers and the standalone route-level campaign settings flow (`/campaigns/:id/settings`) were removed to prevent parallel settings implementations.

Evidence snapshot (2026-05-27):

- Right-rail panel availability and order are now enforced through centralized policy helpers (`frontend/src/constants/workspacePanelPolicy.constants.ts`, `frontend/src/utils/workspacePanelPolicy.ts`) and consumed by the session dock renderer.
- Session right-rail interaction now uses an icon-first dock with tooltip labels and role-filtered tab sets; click toggles are handled consistently by the shared workspace frame.
- HISTORY panel now renders prior-session transcripts only (excluding current session) with visible session boundary separators and in-panel search/sort controls for compact timeline browsing.
- PARTY panel now shows active condition chips from DM condition overrides, and Party/Handouts tabs are visible to spectators in read-only mode.
- Player PARTY edit now opens the SETTINGS character surface directly and auto-focuses the first editable field for immediate character updates.
- Character settings now include SRD-backed race/class suggestions and a reusable avatar upload flow with circular preview plus zoom/crop controls before save.
- Topbar user settings now reuse the same shared avatar upload/crop flow as character settings, so player profile and character profile avatar edits follow the same client-side crop pipeline.
- Notes mutation controls are now DM-only in the right rail (create/edit/delete/share/publish), while players and spectators retain read access.
- Notes publish is now always manual: the handout publisher offers `Everyone` plus occupied MAIN/GROUP rooms only, excludes whisper/greenroom/empty rooms, and auto-shares room-targeted handouts to the players currently in that room.
- Notes now support in-panel search across handout title, markdown content, and hashtags, and the right-rail handout editor now stores multiple image attachments with thumbnail preview/removal in create and edit flows.
- Journal creation now upserts `_journal` notes per session in the backend, so the journal browser remains reverse chronological while enforcing exactly one markdown journal entry per session.

Evidence snapshot (2026-05-30):

- Right-rail handouts now persist image attachments through the shared note contract, Prisma `Note.attachments`, notes API create/update routes, websocket note payloads, and the right-rail create/edit UI.
- Handout cards render stored attachment thumbnails in read mode and allow DM add/remove attachment edits without leaving the panel.
- Lobby discovery now returns both PUBLIC and PRIVATE non-member campaign cards; private cards stay dimmed and locked when no live spectator path exists.
- Full-account WATCH entry now uses `POST /api/campaigns/:id/watch` for both PUBLIC and PRIVATE live campaigns and no longer depends on spectator invite codes in the lobby card action resolver.

Evidence snapshot (2026-06-01):

- Removed the redundant right-rail `Audio` panel from canonical tab policy and session right-rail rendering.
- Right-rail mobile behavior now uses compact overlay mode below `680px` with explicit collapse/expand interaction instead of persistent docked paneling.
- Right-rail behavior at desktop widths now treats `>=1080px` as expanded mode with a selected panel kept open by default.
- Crossing from `>=1080px` down to `<1080px` now auto-collapses the right panel to preserve compact layout behavior.
- Desktop right-panel width now has a hard maximum of `440px`.

Evidence snapshot (2026-06-02):

- Environment apply optimistic flow implemented in `frontend/src/components/workspaces/session/GroupsPanel.session.tsx`:
  - Frontend now applies environment changes optimistically (local state updated immediately), calls `POST /api/audio/environments/apply`, and reverts to the previous environment on failure with a user-facing toast.
  - Added local applying-tracking to avoid UI races during concurrent applies.
  - Server WS broadcasts remain authoritative; optimistic updates improve perceived latency while preserving correctness on eventual server confirmation.

  Acceptance notes:
  - Optimistic apply reduces perceived latency for DM environment changes.
  - Revert-on-failure ensures clients do not drift if the backend rejects the change.
  - Next: add visual loading affordance on group cards and unit tests for revert flows.

**Evidence snapshot (2026-05-20):**

- CampaignInformationPanel now integrates toast-based error handling (vs. inline error state) for consistent UX with rest of app.
- Campaign name and description editing now use controlled input with draft state and cancel/save flow.
- Poster image upload validation: file type check (images only), size limit (≤2MB), immediate user feedback via toast.
- Campaign info panel layout refined with responsive scrolling and workspace mode integration.
- Markdown rendering support for campaign descriptions with improved styling visibility.
- All campaign edit errors now surface via `useToast()` instead of inline state management.
- PARTY panel now consumes a real campaign party-presence snapshot (`GET /api/campaigns/:campaignId/party-presence`) and renders canonical labels (`HERE`, `AWAY`, `LOBBY`, `NOT HERE`, `OFFLINE`) from authoritative runtime/session presence data.
- PARTY panel now supports a client-side manual away toggle and lightweight inactivity auto-away timer (maps to runtime `PresenceState.IDLE`/`ONLINE` via existing presence API; no new persistence fields required).

---

### W0-Lobby: Campaign Discovery and Join Flow

**Status**: 🟢 Done
**Priority**: 🟡 High
**Depends on**: W0-State-Machine

**Scope**: Home lobby shows: your campaigns (with DM indicator, last-active date, player count), join-via-code/invite, and create-campaign CTA. Campaign edit/review runs as an in-page offline workspace (not a modal and not a separate route), with campaign-screen-style rightbar tool switching.

**Acceptance Criteria**:

- [x] Home shows: your campaigns as cards (name, banner, DM, players, last active)
- [x] Campaign edit/review opens as an in-page offline workspace (no modal; topbar preserved)
- [x] Campaign card action labels are role-aware: DM `EDIT`, Player `REVIEW`, Spectator `LAUNCH` only
- [x] Create Campaign dialog uses right-aligned `CANCEL | EDIT | LAUNCH` actions and no description field
- [x] Join dialog is top-offset and uses right-aligned actions (`CANCEL | JOIN`)
- [x] Lobby body is full-height fixed layout with campaign-card list scroll only (topbar and page frame stay fixed)
- [x] Compact lobby stats strip is shown between topbar and card list (active sessions, connected personas, total played, extra rollups)
- [x] Campaign visibility: PRIVATE campaigns show a dimmed locked card to non-members when spectators are disabled or no session is active; show a normal card with a lock icon + WATCH when spectators are enabled and an active session has DM/players present
- [x] Non-member + PUBLIC campaign → REQUEST TO JOIN button; requires optional message; DM approves/rejects via notification badge on their card
- [x] DM lobby card shows a badge with pending join-request count; clicking opens inline approval panel (username, avatar, timestamp, message)
- [x] Non-member + PRIVATE campaign without active watchable session → dimmed card, lock icon, no action (no invite link = no entry)
- [x] Full user + campaign with spectators enabled + active session with DM/players present → WATCH button (applies to both PUBLIC and PRIVATE campaigns; no invite link required)
- [x] Players can join via invite link or code
- [x] Spectators can only access active campaigns and cannot edit
- [x] Late-join policy (Open | Screened | Blocked) is configurable with grace period
- [x] DM can RETIRE a campaign from the offline workspace header (confirm dialog required); retired campaigns removed from main lobby list
- [x] DM can RESUME a retired campaign from a dedicated "Retired" drawer in the lobby (no confirm dialog); DM cannot delete campaigns
- [x] Guest accounts are not shown the campaign discovery list; on session exit they see the upgrade prompt only
- [x] Guest upgrade: `POST /api/auth/upgrade` (email + password); email matching another guest → merge accounts; email matching a full account → block with clear message
- [x] Campaign invite URL paths use `/join/:code` (player) and `/watch/:code` (spectator); backend and frontend call sites are consistent

**Related Docs**:

- [docs/ui/UI-FLOWS.md](docs/ui/UI-FLOWS.md)
- [docs/CONTRACTS.md](docs/CONTRACTS.md) — Campaign Visibility Model, Guest Upgrade Flow, Campaign Lifecycle: RETIRE and RESUME

Evidence snapshot (2026-05-18):

- Lobby campaign cards now render a visible "Last active" date using campaign `updatedAt`/`createdAt` fallback metadata in the card surface.
- Greenroom chat timeline now hydrates on first screen load (no initial `todayOnly` bootstrap gate), so users see recent persisted greenroom messages immediately without waiting for the first outbound chat event.

Evidence snapshot (2026-05-20 - Part 1):

- Lobby create flow now removes description input and supports intent-based create actions: `EDIT` (save + open offline workspace) or `LAUNCH` (save + enter runtime).
- Join dialog and create dialog now use top-offset placement and right-aligned button rows to match other dialogs.
- Lobby supports in-page offline campaign edit/review mode with campaign-like right-side icon dock and default `INFO` panel.
- Offline mode hides rightbar `SETTINGS` and keeps role-based panel visibility aligned with campaign context.
- Lobby card list now owns vertical scrolling while surrounding shell stays fixed-height.
- Discovery routing is now stable: `/api/campaigns/discover` resolves ahead of generic `/:campaignId` routes, and guest accounts no longer request the discovery list.
- Lobby campaign cards now show a smaller DM `ONLINE`/`OFFLINE` status pill with color-coded tooltip text and vertically aligned DM metadata.
- Lobby campaign state indicators now map runtime presence to user-facing states: `OFFLINE` when no DM/player is connected, `READY` for connected `IDLE`, `ACTIVE` for connected `ACTIVE`/`PAUSED`, `FINISHING` for connected `COOLDOWN`, and `ENDED` for connected `ENDED`.
- Post-session cleanup no longer pre-provisions an IDLE session in the background; after the 60 second DM/player disconnect buffer elapses, the next DM/player reconnect creates the fresh IDLE session.

Evidence snapshot (2026-05-20 - Part 2):

- Campaign description popover now renders markdown-formatted descriptions with improved styling for visibility and readability.
- Campaign settings management in `LobbyCampaignSettingsPanel` streamlined: removed unused invite URL duplication, consolidated form controls.
- Error handling migration complete for campaign operations: all validation/save errors now surface via toast notifications instead of inline error states.
- Session lobby workspace panel layout refined with CSS grid and flex adjustments to maintain full-height viewport without overflow leakage to document scroll.
- Campaign info panel now supports edit mode with textarea for description (height increased for better usability) and poster image upload with validation (type check, size limit ≤2MB).

Evidence snapshot (2026-05-30):

- DM lobby cards now expose an inline join-request review panel from the pending badge, with requester avatar, username, requested-at timestamp, optional message, and approve/reject actions directly in the lobby card surface.
- Added a DM-only pending-request read endpoint (`GET /api/campaigns/:id/join-request`) so the lobby panel reads authoritative request data instead of relying on stale badge counts.
- Frontend lobby refresh now treats `CAMPAIGN:JOIN_REQUEST_RECEIVED` and `CAMPAIGN:JOIN_REQUEST_RESOLVED` as campaign-list invalidation signals so badge counts reconcile without a manual reload.

---

### W0-Lobby-Admin: Campaign Export and Import

**Status**: 🟢 Done
**Priority**: 🟢 Low
**Depends on**: W0-Lobby

**Scope**: Admin-only campaign export (JSON) and import (creates new campaign from file). This covers the privileged operator surface only — member emails are included for account re-linking during import. DM self-service portability (no emails, invite-only rejoin) is tracked separately in Phase 4 as W-DM-Campaign-Portability.

**Acceptance Criteria**:

- [x] `GET /api/admin/campaigns/:id/export` returns campaign JSON (metadata, groups/environments, session history/chat, notes/journal, member list)
- [x] Export does not include passwords; member emails are included for re-linking
- [x] `POST /api/admin/campaigns/import` creates a new campaign with fresh IDs from the export JSON
- [x] Admin may optionally map member emails to existing accounts during import; unmapped members become stubs
- [x] Import never overwrites an existing campaign
- [x] Admin UI surfaces Export and Import actions in campaign management panel

**Related Docs**:

- [docs/CONTRACTS.md](docs/CONTRACTS.md) — Campaign Export and Import section

Evidence snapshot (2026-06-04):

- Export endpoint (`GET /api/admin/campaigns/:id/export`) and import endpoint (`POST /api/admin/campaigns/import`) are implemented in `backend/src/api/admin.routes.ts`, service logic in `backend/src/services/admin/admin-portability.service.ts` and `admin-campaign-operations.service.ts`.
- Added `email` field to `CampaignTransferBundle.members[]` in `backend/src/types/portability.types.ts` and to the Prisma user select in `buildCampaignExport` so member emails are included in every export for cross-instance re-linking.
- Import now supports optional `memberEmailMap: { "source-email": "target-user-id" }` in the request body. When provided, resolution order is: email-map lookup → ID match → stub creation. Stubs are created for any unresolved source user so content authorship is never lost.
- Admin UI (`admin/src/features/campaigns/CampaignDetail.tsx`) surfaces Export Bundle (read-only textarea), Import Bundle (paste area), and the new optional Member Email Map textarea with placeholder and hint label. Import button submits all three together.
- State hook (`useCampaignManagement.ts`) parses and validates the email map JSON before sending; surfaces a clear error for non-object JSON. API client (`campaignManagementApi.ts`) sends `memberEmailMap` only when it is non-empty.
- Backend tests updated and expanded in `backend/tests/api/admin-campaign-operations.test.ts` (10 tests): export now asserts email presence in the bundle; two new import tests cover email-map acceptance and array-typed map rejection (ignored, not a crash).

---

### W4-UX-Polish: Accessibility and Responsive Hardening

**Status**: 🟢 Done
**Priority**: 🟡 High
**Depends on**: W0-Rightbar, W0-Lobby

**Scope**: WCAG AA compliance pass, keyboard navigation, reduced-motion support, dark/light theme validation, cross-browser testing.

**Acceptance Criteria**:

- [x] All UI surfaces pass WCAG AA keyboard navigation and screen-reader testing
- [x] Dark and light themes render correctly across all components
- [x] Reduced-motion preferences are respected
- [x] No hard-coded one-mode colors in shared user-facing UI
- [x] Responsive testing passes at breakpoints: <680px (mobile), 680-1080px (tablet), ≥1080px (desktop)

**Related Docs**:

- [docs/ui/ACCESSIBILITY.md](docs/ui/ACCESSIBILITY.md)

Evidence snapshot (2026-06-01):

- Added global keyboard focus-visible baseline in `frontend/src/styles/components/session/theme.css` so keyboard navigation has deterministic visible focus styling.
- Added global reduced-motion baseline in `frontend/src/styles/components/session/theme.css` under `@media (prefers-reduced-motion: reduce)` to minimize animations/transitions and disable smooth-scroll behavior.
- Added focused keyboard interaction coverage for lobby campaign cards in `frontend/tests/components/CampaignCard.keyboard.test.tsx` (Enter and Space activation).
- Added automated accessibility smoke checks in `frontend/tests/components/Accessibility.smoke.test.tsx` using axe for key lobby/session surfaces (`CampaignCard`, `SessionToolbar`).
- Fixed CampaignCard ARIA issues identified by smoke checks in `frontend/src/components/workspaces/lobby/LobbyView.CampaignCard.tsx` (valid state-dot semantics and removal of invalid `aria-expanded` on non-control element).

Evidence snapshot (2026-06-04):

- Tokenized all hard-coded dark-only hex colors in `frontend/src/styles/components/workspaces/session/chat/MessageList.messages.css`: bubble backgrounds, borders, avatar backgrounds, type-icon backgrounds, and self-message bubbles now use `var(--color-surface)`, `var(--color-surface-raised)`, `var(--color-surface-subtle)`, `var(--color-border-soft)`, `var(--color-text-primary)`, `var(--color-brand)`, and `var(--color-warn)` tokens so light and dark mode both render correctly.
- Fixed mobile breakpoint in `frontend/src/styles/components/workspaces/Workspaces.responsive.css`: workspace shell column stack now triggers at `680px` (canonical mobile breakpoint) instead of the legacy `768px`.
- Expanded axe smoke test coverage in `frontend/tests/components/Accessibility.smoke.test.tsx`: added `WorkspaceToolbar` (shared top bar with icon-only buttons, verifies `aria-label` correctness) and `ReconnectBanner` in both `reconnecting` and `isHydrating` states (verifies status banner semantics). Total smoke surfaces now: `CampaignCard`, `SessionToolbar`, `WorkspaceToolbar`, `ReconnectBanner` (×2 states).

---

## Phase 2: Audio Experiences 🟢

_DM superpowers: move players between groups, apply conditions, set environments, control distance. All within 2 clicks._

### W-Groups-Panel: Editor Mode + Session Mode Groups Management

**Status**: 🟢 Done
**Priority**: 🟡 High (blocking all audio work)
**Depends on**: W0-Rightbar

**Scope**: Implement comprehensive Groups (Rooms) panel for both editor (pre-session planning) and session (runtime) modes. Editor allows DM to pre-create groups and set default environments before players join. Session mode allows DM to drag players between groups, close groups (empty to MAIN), delete empty groups (permanent campaign deletion), and apply/change environments. Groups persist across sessions at campaign level; environment clears on pause and reapplies on resume.

**Acceptance Criteria**:

- [x] Editor mode: DM can view, create, delete campaign-level groups before session starts
- [x] Editor mode: DM can set default environment per group (persistent, survives session boundaries)
- [x] Editor mode: Player list is not visible (players only joinable in-session)
- [x] Session mode: Group cards show member count, environment icon, and player list (collapsible)
- [x] Session mode: DM drag player from one group card to another (one player at a time)
- [x] Session mode: DM drag to WHISPER auto-targets DM voice to WHISPER (locks DM until whisper ends)
- [x] Session mode: Environment icon in group header; click to open environment picker control
- [x] Session mode: Environment selection applies to all players in group (optimistic apply with revert-on-failure)
- [x] Session mode: "Close" button empties group (moves all members to MAIN), group remains but empty
- [x] Session mode: "Delete" button appears only when group is empty; deletes group from campaign permanently
- [x] Session mode: MAIN, WHISPER, GREENROOM are reserved names (cannot be created by DM)
- [x] Session pause: all players move to MAIN, pre-pause group membership snapshotted in presence `previousGroupId`
- [x] Session resume: players restored to pre-pause groups via `isResumeFromPause` + `previousGroupId` in `applySessionStateRoomTransition`
- [x] Session pause/resume: environments are preserved (not cleared) across pause — deliberate design from W4-Conversation-Authority; players re-enter their group and its environment is still active
- [x] Session end: all members moved to greenroom (COOLDOWN/ENDED); PRIVATE room deleted; GROUP rooms persist campaign-scoped for next session
- [x] DM audio override via player context menu: "Adjust Audio" submenu with Boost/Normal/Lower Mic (GAIN), Enable/Disable Noise Filter (FILTER); calls existing `POST /api/audio/overrides/dm/apply|remove` endpoints
- [x] Spectators: can see groups (read-only), cannot drag or interact
- [x] WS events: `ROOM:CREATED`, `ROOM:DELETED`, `ROOM:CLOSED`, `AUDIO:ENVIRONMENT_SET`
- [x] Zustand slices: `campaignGroupsSlice`, `sessionGroupsSlice`, `groupPanelUISlice`
- [x] API: Editor routes for campaign groups; session routes for runtime groups; close and environment endpoints
- [x] Documentation: `docs/architecture/GROUPS-PANEL-ARCHITECTURE.md` complete
- [x] Documentation: `docs/CONTRACTS.md` updated with group close, environment, DM audio override contracts

Evidence snapshot (2026-06-02 - Groups Panel progress):

- Drag-and-drop member moves implemented (frontend):
  - `frontend/src/components/workspaces/session/GroupCard.session.tsx` supports HTML5 DnD for member tiles.
  - `frontend/src/components/workspaces/session/GroupsPanel.session.tsx` implements `handleMoveMember` with optimistic remove/add, API call `moveRoomMember()`, canonical refresh, and revert on failure.
- DM whisper auto-target: moving a player into a `PRIVATE` room sets DM voice target locally via `setDmVoiceTarget()` for immediate UX lock; server WS confirms authoritative state.
- Optimistic environment apply: frontend applies environment locally immediately, tracks `applyingEnvironments`, calls `POST /api/audio/environments/apply`, and reverts on failure with toast (see Evidence snapshot 2026-06-02 above).
- Spectator gating: drop handlers and group visibility respect `canManage` so spectators are read-only and cannot drag/interact.

Evidence snapshot (2026-06-04 - DM audio override + panel completion):

- Reserved room name guard: `handleCreateGroup` in `GroupsPanelSession.tsx` rejects MAIN, WHISPER, GREENROOM at creation time.
- Pause membership snapshot: `resolvePausePreviousGroupId` in `backend/src/services/room/lifecycle.service.ts` stores `previousGroupId` in presence on PAUSED transition.
- Resume restore: `isResumeFromPause` check in `applySessionStateRoomTransition` restores users to `previousGroupId` room on ACTIVE resume.
- Session end: `applySessionStateRoomTransition` routes users to greenroom on ENDED/COOLDOWN; `deletePrivateRoomsForEndedSession` removes PRIVATE room; GROUP rooms persist (campaign-scoped per W1-Runtime-Recovery design).
- DM audio override context menu: "Adjust Audio" submenu added to `PlayerContextMenuContent.tsx` with Boost Mic / Normal Mic / Lower Mic (GAIN override) and Enable/Disable Noise Filter (FILTER override). Prop threaded through `PlayerContextMenu` → `GroupMemberList` → `RoomGroupCard` → `RoomSelector`. Handler `handleApplyAudioOverride` in `RoomSelector.tsx` calls `POST /api/audio/dm-override/apply|remove`. A DM can never truly unmute a self-muted player — the GAIN/FILTER overrides are independent of mute state; removing the DM MUTE override does not affect the player's own `AUDIO:MUTE_STATE_CHANGED` self-mute.

Next work for Groups Panel:

- Formalize 200ms environment apply SLA or add server-side fast-paths; add unit/integration tests for revert-on-failure cases.
- Write documentation: `docs/architecture/GROUPS-PANEL-ARCHITECTURE.md` and update `docs/CONTRACTS.md` with group close and environment contracts.

**Related Docs**:

- [docs/architecture/GROUPS-PANEL-ARCHITECTURE.md](docs/architecture/GROUPS-PANEL-ARCHITECTURE.md)
- [docs/CONTRACTS.md](docs/CONTRACTS.md)
- [.github/copilot-instructions.md](.github/copilot-instructions.md) (Whisper Bubble, Group Visibility Rules sections)

Evidence snapshot (2026-05-24):

- Editor-mode groups planner is already live under `frontend/src/components/workspaces/shared/panels/GroupsPanel/GroupsPanel.tsx`:
  - DM can load, create, delete, and configure campaign-level groups before session start.
  - Default environments are editable through the shared environment picker modal.
  - Player lists are intentionally absent in editor mode.
- Session-mode right-rail groups overview is now live as a separate component path from the left voice-groups panel:
  - `frontend/src/components/workspaces/session/GroupsPanel.session.tsx` owns the right-side runtime list.
  - `frontend/src/components/workspaces/session/GroupCard.session.tsx` renders compact member cards with DM-first ordering, environment glyphs, and collapsible room member lists.
  - Green Room is hidden during `ACTIVE` / `PAUSED` / `COOLDOWN`, and when shown in greenroom state it is listed first and starts collapsed.
  - Green Room cannot be drained, deleted, or assigned an environment from the right panel.
  - Whisper uses the end-to-main flow from this panel and the action is hidden when Whisper is empty.
- Runtime room-management service surface exists in `frontend/src/services/groupsPanel.service.ts` for create, close, delete, and environment apply flows.
- Runtime + editor state scaffolding exists in Zustand via `campaignGroupsSlice`, `sessionGroupsSlice`, and `groupPanelUISlice`.
- Backend/WS contract surface exists for `ROOM:CREATED`, `ROOM:DELETED`, `ROOM:CLOSED`, and `AUDIO:ENVIRONMENT_SET`; remaining gaps are primarily drag/drop behavior, lifecycle cleanup/restore guarantees, spectator exposure policy, and docs completion.

---

### W-Audio-Voice: DM Voice Targeting and Broadcast Mode

**Status**: 🟢 Done
**Priority**: 🟡 High
**Depends on**: W1-Runtime-Recovery

**Scope**: DM can select which group(s) hear their voice. Broadcast mode sends to all groups; targeted mode sends to selected group only.

**Acceptance Criteria**:

- [x] DM audio control panel shows: current target group, broadcast toggle, mute button
- [x] Broadcast mode routes DM voice to all groups in session
- [x] Targeted mode routes DM voice to selected group only
- [x] Broadcast toggle is unavailable (greyed out) while in Whisper group
- [x] WS event `AUDIO:DM_VOICE_TARGET_CHANGED` broadcasts to all clients
- [x] Frontend renders DM voice status with icon + tooltip

**Related Docs**:

- [docs/CONTRACTS.md](docs/CONTRACTS.md) (audio section)

Evidence snapshot (2026-06-04):

- `AUDIO:DM_VOICE_TARGET_CHANGED` added to `shared/events/audio.ts` and emitted by backend `handleSetDmVoiceMode` (TARGET_GROUP case). Frontend registers handler in `useWebSocket.ts` → `handleDmVoiceTargetChanged` updates `dmVoiceTargetGroupId` and `broadcastModeEnabled: false` in `audioOverridesSlice`.
- Targeted voice mode: `LeftRail.tsx` passes `dmVoiceTargetGroupId` as `roomId` to `AudioPanel`. `useLiveKit` reconnects to the target group's LiveKit room when the ID changes — players in that room hear the DM directly. No explicit presence move; the LiveKit room change is frontend-only.
- Broadcast mode: `AudioPanel.tsx` holds a second `broadcastLivekit` instance connected to `dm-broadcast:{sessionId}` when `broadcastModeEnabled` is true. DM publishes there (`canPublish: true`); all players subscribe (`canPublish: false`). A `useEffect` in `AudioPanel` auto-publishes/unpublishes broadcast audio as `broadcastModeEnabled` changes.
- DM voice status: `DmVoiceTargetIndicator` in `RoomSelector.tsx` (leaf component, stable ref, subscribes only to `dmVoiceTargetGroupId`) shows the current voice target group name below the DM avatar card. Broadcast button in `GroupsHeaderActions` highlights with the `active` class when broadcast is on.
- Broadcast unavailable during Whisper: `whisperModeLocked` prop disables the broadcast button in `GroupsHeaderActions`.
- DM voice presets (voice changer): `DmVoicePanel` in `GroupsHeaderActions` opens a 3-column preset grid (9 presets: Narrator, Voice of God, Demon, Dragon, Angel, Ghost, Robot, Ancient, Whisper). Selecting a preset calls `POST /api/audio/voice-preset` → `AUDIO:DM_VOICE_MODE_CHANGED` → `useDmVoiceProcessor` builds a Web Audio chain (EQ, distortion, reverb via synthetic impulse) and calls `LocalAudioTrack.replaceTrack()`. Tap button when active = one-click dismiss (restores raw mic, tears down AudioContext).

---

### W-Audio-Condition: Apply/Remove Conditions (Drunk, Confused, Silenced)

**Status**: 🟢 Done
**Priority**: 🟡 High
**Depends on**: W1-Runtime-Recovery

**Scope**: DM can apply audio conditions to players (Drunk: slurred pitch, Confused: scrambled audio, Silenced: routed only to DM + spectators). Conditions are visible in AudioPanel. System message appears in chat when applied/removed.

**Acceptance Criteria**:

- [x] DM right-click player → Condition → select from list
- [x] Condition applies to player and broadcasts to all clients (`AUDIO:DM_OVERRIDE_APPLIED` with `overrideType: CONDITION`)
- [x] Silenced player hears themselves normally but others hear nothing (server-side LiveKit mute enforcement)
- [x] AudioPanel shows active condition with icon and explanation (via `effectItems` in `AudioPanelFooter`)
- [x] System message appears in chat: `[{player} is {condition}]` when condition applied
- [x] System message appears when condition removed: `[{player}'s condition was cleared]`
- [x] Multiple conditions stack visually but primary is highlighted in AudioPanel
- [x] Server-side mute enforcement: silenced players cannot publish audio to other players

Evidence snapshot (2026-06-05):

- Context menu Condition submenu wired end-to-end: `PlayerContextMenuContent.tsx` → `RoomSelector.tsx` `handleApplyConditionOverride` → `POST /api/audio/dm-override/apply` with `overrideType: CONDITION`.
- Backend validates preset names against `AUDIO_CONDITION_PRESET_NAMES` before persisting; rejects unknown conditions with 400.
- `AUDIO:DM_OVERRIDE_APPLIED` WS handler extended in `useWebSocket.ts`: when `overrideType === CONDITION` for the current user, looks up DSP from `findConditionPreset` (shared catalog) and calls `store.setCondition(...)`. `useAudioEngine.applyEffectStack` immediately applies the DSP chain (lowpass, gain, mute) to all incoming participant tracks.
- `AUDIO:DM_OVERRIDE_REMOVED` handler calls `store.clearCondition()` when targeted at current user.
- `emitConditionSystemMessage` service function in `system-messages.service.ts` persists and broadcasts a `CHAT:MESSAGE_SENT` system message on every apply/remove. Best-effort (failures swallowed so the audio route always succeeds).

Evidence snapshot (2026-06-05 — stacking, primary highlight, SILENCED enforcement):

- `AudioDetailItem` interface in `AudioDevicePanel.tsx` now exported with `isPrimary?: boolean`. CONDITION items are built with `isPrimary: true` in `AudioPanelFooter.tsx`'s `effectItems` memo. The `AudioDevicePanel` applies `--primary` CSS modifier to the list item, rendering it with a warm-tinted background and highlighted name — visually distinct from secondary effects (distance, environment, etc.).
- Deduplication fix: CONDITION and DISTANCE override types are now skipped in the `currentUserOverrides` loop since both are already covered by dedicated `currentCondition`/`currentDistance` slots above the loop. No more duplicate entries when both a condition and a DM override record are active.
- Server-side SILENCED enforcement: `backend/src/infra/livekit/room.service.ts` created with `enforceParticipantPublishPermission` wrapping `RoomServiceClient.updateParticipant`. When SILENCED is applied, `handleApplyDmOverride` in `audio.routes.ts` looks up the player's `primaryRoomId` from session presence and calls `updateParticipant(roomId, userId, {canPublish: false})`. When the condition is removed, `canPublish` is restored to `true` (unless the player is already DM-muted or self-muted). `getServerMuteEnforcementState` in `effects.service.ts` also reads the active CONDITION override to include SILENCED in token-based enforcement — reconnecting clients receive `canPublish: false` in the LiveKit token if silenced.

**Related Docs**:

- [docs/CONTRACTS.md](docs/CONTRACTS.md) (condition effects)
- [.github/copilot-instructions.md](.github/copilot-instructions.md) (Condition: SILENCED section)

---

### W-Audio-Distance: Distance Modifier (Nearby, Visible, Far)

**Status**: 🟢 Done
**Priority**: 🟡 High
**Depends on**: W1-Runtime-Recovery

**Scope**: DM can set player distance (Default | Nearby | Visible | Far). Each applies audio processing (lowpass, reverb, volume). System message in chat when distance changes.

**Acceptance Criteria**:

- [x] DM right-click player → Distance → select from list
- [x] Distance applies and broadcasts to all clients within one WS round-trip
- [x] AudioPanel shows active distance with icon (via `effectItems` in `AudioPanelFooter`)
- [x] System message appears in chat: `[{player} is {distance}]` when distance changes
- [x] Audio processing matches distance preset (muffling, volume reduction, reverb) — DSP applied via `useAudioEngine.applyEffectStack` → `applyDistanceToNode`
- [x] Distance clears when player changes groups or condition applied

Evidence snapshot (2026-06-05):

- Context menu Distance submenu wired end-to-end: `PlayerContextMenuContent.tsx` → `RoomSelector.tsx` `handleApplyDistanceOverride` → `POST /api/audio/dm-override/apply` with `overrideType: DISTANCE`.
- Backend validates preset names against `AUDIO_DISTANCE_PRESET_NAMES`; "Default" is handled client-side as a removal (calls remove endpoint instead).
- `useWebSocket.ts` handler: when `overrideType === DISTANCE` for the current user, looks up DSP via `findDistancePreset` (shared catalog) and calls `store.setDistance(...)`. Selecting "Default" triggers the remove endpoint → `clearDistance()`.
- System messages emitted via `emitConditionSystemMessage` on apply and remove.

Evidence snapshot (2026-06-05 — distance auto-clear):

- `moveRoomMemberHandler` in `rooms.routes.ts` now checks for an active `DISTANCE` override on the moved player after a successful group change. If found, it removes it, broadcasts `AUDIO:DM_OVERRIDE_REMOVED`, and emits the distance-cleared system message.
- `handleApplyDmOverride` in `audio.routes.ts` does the same when `overrideType === CONDITION`: any existing `DISTANCE` override for the same player is cleared before returning.

**Related Docs**:

- [docs/CONTRACTS.md](docs/CONTRACTS.md) (audio effects)

---

### W-Audio-Environment: Group Environment (Tavern, Cave, Forest, Underwater)

**Status**: 🟢 Done
**Priority**: 🟡 High
**Depends on**: W1-Runtime-Recovery

**Scope**: DM sets environment for each group (affects all members). Environment persists across session boundaries (campaign-level setting). Environment icon in group header; DM click to change.

**Acceptance Criteria**:

- [x] Group header shows environment icon
- [x] DM click environment icon → popover to select environment
- [x] Optimistic environment apply with revert-on-failure toast (implemented in W-Groups-Panel, 2026-06-02)
- [x] WS event `AUDIO:ENVIRONMENT_SET` broadcasts to affected clients
- [x] AudioPanel shows active environment with icon (via `effectItems` in `AudioPanelFooter` reading `currentEnvironment`)
- [x] Environment persists in campaign when session ends
- [x] Environment restores when new session starts (campaign-scoped)
- [x] Greenroom environment is always neutral (locked, no modification)
- [x] Pause snapshot: environments preserved across pause/resume by design (deliberate — see W-Groups-Panel evidence 2026-06-04)

Evidence snapshot (2026-06-05):

- `handleEnvironmentSet` in `audioPresetsSlice.ts` fixed: always updates `roomEnvironmentNames` (drives Groups Panel icons), then checks if the affected room matches the current user's `primaryRoomId` before setting `currentEnvironment`. DSP is resolved from the shared `ENVIRONMENT_PRESETS` catalog via `findEnvironmentPreset` rather than relying on the (often empty) WS event `parameters`. Players in the affected group now hear the environment DSP (lowpass + reverb) as soon as the DM applies it.

Evidence snapshot (2026-06-05 — environment persistence + greenroom lock):

- `restoreCampaignRoomsForSession` in `lifecycle.service.ts` fixed: previously skipped environment restoration for rooms that already existed in the new session (created in editor mode). Now restores the environment from the previous session for any pre-existing room that has no environment set, so campaign groups always start the new session with their last configured environment.
- `handleSetEnvironment` in `audio.routes.ts` now rejects (403) any attempt to set an environment on the greenroom by name check via `isGreenRoomName`. Frontend `GroupCard.session.tsx` already guards this via `canChangeEnvironment = canManage && !isWhisper && !isGreenRoom`.

**Related Docs**:

- [docs/CONTRACTS.md](docs/CONTRACTS.md) (audio section)
- W-Groups-Panel (evidence snapshot 2026-06-02) — environment apply UI landed here first

---

## Phase 3: Notes & Journal Foundation ✅

_DM reference and player communication. DMDX markdown editor, pop-out windows, system message cards._

### W-Notes-Editor: DMDX Markdown Editor Integration

**Status**: 🟡 In Progress
**Priority**: 🟡 High
**Depends on**: W0-Rightbar

**Scope**: Notes panel uses DMDX markdown editor with syntax highlighting, helper toolbar, and raw-markdown toggle. Support hashtags, attachments (images, PDFs), and required fields (Name, Content, Hashtags, Attachments).

**Acceptance Criteria**:

- [x] Notes editor integrates DMDX library for markdown syntax highlighting and editing
- [x] Helper toolbar includes: bold, italic, lists, headings, code (external links blocked; internal links only)
- [x] Raw markdown toggle allows editing source directly
- [x] Required fields enforced: Name is required; Content required by form validation
- [x] External links are blocked in toolbar and render pipeline
- [x] Hashtag autocomplete from campaign tag history
- [x] Notes are searchable by Name + Content + Hashtags
- [ ] Attachments support: drag-and-drop or file picker for images and PDFs
- [ ] PDFs render as inline cards; images render inline

**Evidence snapshot (2026-06-05)**:

- `frontend/src/utils/dmdx/dmdxParser.ts` — DMDX markdown parser (9 block types: npc, monster, encounter, loot, spell, session, roll, map, timeline). Markdown is stored as-is; DMDX blocks are rendered only in read-only view.
- `frontend/src/components/workspaces/shared/panels/dmdx/` — all 9 block renderers + `DmdxMarkdownRenderer` + `DmdxInsertMenu` (toolbar Insert Block button).
- `MarkdownEditor.tsx` — split into `MarkdownEditorEditable` (edit mode with DMDX insert toolbar) + `MarkdownEditor` dispatcher (read-only delegates to `DmdxMarkdownRenderer`). Both `NoteCard` and `NotesCreateForm` already used `MarkdownEditor`, so DMDX rendering activated automatically.
- `NotesPanel.compact.tsx` — in-session compact view: dense stacked-card list → full-panel overlay on tap (180ms slide-in animation). `NotesPanel.tsx` renders `NotesPanelCompact` when `compactPicker={true}`.
- `HashtagAutocompleteInput.tsx` — inline autocomplete for hashtag fields in `NoteCard` and `NotesCreateForm`. Derives unique tags from Zustand store (no extra API call). Keyboard-navigable (ArrowDown/Up, Enter/Tab to confirm, Escape to dismiss).

**Related Docs**:

- [docs/changes/NOTES-JOURNAL-IMPLEMENTATION-CHECKLIST.md](docs/changes/NOTES-JOURNAL-IMPLEMENTATION-CHECKLIST.md)

---

### W-Notes-Visibility: Sharing and Handout Distribution

**Status**: ✅ Done (SPECTATORS scope deferred)
**Priority**: 🟡 High
**Depends on**: W-Notes-Editor

**Scope**: DM can share notes to players with scopes (Private | Party | Selected | Spectators). Shared notes surface as one-time chat cards to recipients.

**Acceptance Criteria**:

- [x] Share modal allows selecting scope: Private (DM only) | Party (all players) | Selected (choose specific players) — `NoteSurfaceDialog` (PARTY/SELECTED). `NoteSharePopover` labels now Private/Party/Selected. SPECTATORS deferred (needs enum + migration).
- [x] Shared notes surface as one-time recipients-only chat card via `NOTES:HANDOUT_SURFACED` WS event
- [x] Card includes note excerpt (auto-generated or DM override) and link to full note
- [x] Duplicate cards are not surfaced on reconnect/hydration (persisted system chat message with unique ID; HANDOUT_SURFACED is real-time only)
- [x] Players can always find shared notes in Notes tab (filtered by visibility) — `canViewNote` on backend enforces this; players only receive notes visible to them via API and WS.
- [x] Private notes only visible to DM and owner — enforced by `canViewNote` in `backend/src/services/notes/shared.ts`.

**Related Docs**:

- [docs/changes/NOTES-JOURNAL-IMPLEMENTATION-CHECKLIST.md](docs/changes/NOTES-JOURNAL-IMPLEMENTATION-CHECKLIST.md)

---

### W-Journal-and-Popouts: Separate Windows for Notes and Journal

**Status**: ✅ Done
**Priority**: 🟡 High
**Depends on**: W-Notes-Visibility

**Scope**: Notes and Journal can pop out into separate windows for side-by-side reading. Journal is one per session chapter; players can read but not edit. Info panel remains compact.

**Acceptance Criteria**:

- [x] Notes detail view has "Pop Out" button (`open_in_new` icon) → `window.open('/popout/note/:noteId', ...)`
- [x] Journal detail view has "Pop Out" button (`open_in_new` icon) → `window.open('/popout/journal/:sessionId', ...)`
- [x] Pop-out windows are resizable (native OS window management)
- [x] Journal links to session chapter name and uses same editor as Notes (`sessionName` prop → title)
- [x] Journal visibility: DM + players + spectators can read — `GET /api/journals/:sessionId` enforces this
- [x] Only DM can edit Journal — `POST /api/journals/:sessionId` requires DM role; `JournalEditor` is read-only for non-DM
- [x] Pop-out state persists during session — browser keeps windows open; `window.open` with named target reuses existing window if already open

**Evidence snapshot (2026-06-05)**:

- `frontend/src/utils/route-view.ts` — `popout-note` and `popout-journal` route kinds; `openNotePopout()` / `openJournalPopout()` helpers store auth token in `sessionStorage` (same-origin; inherited by new window) and call `window.open`.
- `frontend/src/components/routes/PopoutRouteView.tsx` — minimal layout: note pop-out fetches `GET /api/notes/by-id/:noteId` and renders `MarkdownEditor` read-only; journal pop-out renders `JournalPanel` in focused mode (DM gets editable, others get read-only).
- `backend/src/api/notes.routes.ts` — `GET /api/notes/by-id/:noteId` endpoint added (before `:sessionId` catch-all) with `canViewNote` visibility check.
- `frontend/src/components/workspaces/shared/panels/NotesPanel/NoteCard.tsx` — pop-out button added to note header.
- `frontend/src/components/workspaces/shared/panels/JournalPanel.tsx` — pop-out button added to journal header alongside save/cancel.

**Related Docs**:

- [docs/changes/NOTES-JOURNAL-IMPLEMENTATION-CHECKLIST.md](docs/changes/NOTES-JOURNAL-IMPLEMENTATION-CHECKLIST.md)

---

### W-System-Messages: Condition and Distance Change Cards

**Status**: ✅ Done
**Priority**: 🟡 Medium
**Depends on**: W-Audio-Condition, W-Audio-Distance

**Scope**: When DM applies/removes conditions or changes distance, a small system message minimalistic card appears in chat timeline so players see what is happening. Cards are compact and non-intrusive.

**Acceptance Criteria**:

- [x] System message card appears in chat when condition is applied: `[{player} is now {condition}]`
- [x] System message card appears when condition is removed: `[{player}'s condition cleared]`
- [x] System message card appears when distance changes: `[{player} is {distance}]`
- [x] Cards are compact (one line) and styled consistently
- [x] Cards appear for all viewers (DM, players, spectators)
- [x] Cards persist in chat history for later reference and AI summary processing
- [x] Cards include explanation tooltip — condition icon wrapped in Radix `Tooltip`; shows `conditionPreset.description` on hover

**Evidence snapshot (2026-06-05)**:

- `backend/src/services/system-messages.service.ts` — `emitOverrideSystemMessage()` emits `CHAT:MESSAGE_SENT` for both condition and distance changes; persists as a standard chat message so it survives refresh.
- `frontend/src/components/workspaces/session/chat/MessageList.virtualized.tsx` — renders `conditionMessage` metadata as a compact amber-tinted card with icon.
- Condition icon pulled from `findConditionPreset()` (falls back to `psychology`). Distance uses same flow with a distance preset name.

**Related Docs**:

- [docs/CONTRACTS.md](docs/CONTRACTS.md)

---

### W-DM-Notes-to-Chat: Share Note to Chat Timeline

**Status**: ✅ Done
**Priority**: 🟡 Medium
**Depends on**: W-Notes-Visibility

**Scope**: DM can send a note directly to the chat timeline (system message) so it appears as a chat message note card. Players find it in Notes tab for later reference.

**Acceptance Criteria**:

- [x] DM can send note to chat via "Send Handout" button → `NoteSurfaceDialog` (PARTY / SELECTED scope, optional manual excerpt) → `POST /api/notes/:noteId/surface`
- [x] Note appears as system message in chat (card-style via `NoteSharedCard`) for all recipients
- [x] Message surfaces note excerpt (auto-generated or DM override) + "Full note available in the Notes tab" hint; `noteId` threaded through `ParsedNoteSharedMessage` for future deep-link navigation
- [x] Note remains accessible in Notes tab — `/surface` updates note visibility to match scope (PARTY → PLAYERS_VISIBLE; SELECTED → CUSTOM + allowedUsers)
- [x] Message timestamp shown on `NoteSharedCard` footer; `noteId` available in `metadata.noteHandout` for history reference

**Evidence snapshot (2026-06-05)**:

- `NoteSharedCard.tsx` — excerpt cards show "Full note available in the Notes tab" below the excerpt body; `excerptSource` badge shows AUTO or MANUAL source.
- `noteSharedMessage.ts` — `ParsedNoteSharedMessage.noteId` populated from both `noteHandout` and legacy `noteShared` metadata.
- `POST /api/notes/:noteId/surface` — persists system chat message, broadcasts `NOTES:HANDOUT_SURFACED` + `CHAT:MESSAGE_SENT` to recipients only, updates note visibility.

---

## Phase 4: Future Enhancements ⚪

### W-Queues: Durable Queue Manager (BullMQ)

**Status**: ⚪ Not Started
**Priority**: 🟡 Medium (post-MVP)
**Depends on**: Core Reliability complete

**Scope**: Introduce BullMQ in a separate container for durable, long-running jobs: cleanup, transcription staging, email, summary processing. Enables restart-safe job handling.

**Acceptance Criteria**:

- [ ] BullMQ container runs alongside backend
- [ ] Job types: cleanup-old-sessions, process-recording, send-email, generate-summary
- [ ] Failed jobs have retry policy with exponential backoff
- [ ] Dead-letter queue for failed jobs after max retries
- [ ] Operator can inspect/retry/clear jobs via admin API

**Related Docs**:

- [docs/architecture/QUEUE-JOB-MANAGER.md](docs/architecture/QUEUE-JOB-MANAGER.md)

---

### W-Admin-Platform: User, Campaign, and Ops Management

**Status**: ⚪ Not Started
**Priority**: 🟡 Medium (post-MVP)
**Depends on**: Core Reliability complete

**Scope**: Admin console for: user management (suspend/restore/ban), campaign management (archive/restore), logs/telemetry viewing, system status, backup/restore, platform monitoring integration.

**Sub-domains**:

- User Management (suspend, restore, ban, view history)
- Campaign Management (archive, restore, view members)
- Logs & Telemetry (search logs, view metrics, event history)
- System Status (health checks, service status, performance)
- Import/Export (user data export, campaign archive)
- Backup/Restore (manual backup, restore from backup)
- Platform Monitoring (Prometheus/Grafana integration)

**Acceptance Criteria**:

- [ ] Admin can suspend/restore/ban users
- [ ] Admin can archive/restore campaigns
- [ ] Admin can search logs by user/campaign/date range
- [ ] Admin can view system health and service status
- [ ] Manual backup and restore workflows are documented and tested
- [ ] Monitoring integration displays uptime, request rate, error rate

**Related Docs**:

- (Admin-specific docs to be created)

---

### W-Extension-MVP: Guest Login and Campaign Access via Extension

**Status**: ⚪ Not Started
**Priority**: 🟡 Medium (post-MVP, MVP distribution channel)
**Depends on**: Core Reliability + W0-UI complete

**Scope**: VS Code or browser extension allows launching app, guest login, campaign access, and data sync. One-click launch from invite link or code.

**Acceptance Criteria**:

- [ ] Extension can launch app via POST to `/api/auth/extension/guest-login`
- [ ] Guest DM/Player/Spectator accounts are created on first launch
- [ ] Campaign membership is auto-granted via invite link or code
- [ ] Guest account can be upgraded to full account later without losing campaign history
- [ ] Extension stays synced with app state during session

**Related Docs**:

- [docs/extension/EXTENSION-ROADMAP.md](docs/extension/EXTENSION-ROADMAP.md)

---

### W-DM-Handoff: Campaign Ownership Transfer

**Status**: ⚪ Not Started
**Priority**: 🔵 Low (post-MVP)
**Depends on**: Core Reliability complete

**Scope**: Campaign owner (DM) can resign and assign another existing campaign member as the new DM. Ensures campaigns survive DM unavailability without platform intervention.

**Acceptance Criteria**:

- [ ] DM can initiate handoff to any current campaign member from campaign settings
- [ ] Target player must accept the handoff before ownership transfers
- [ ] Handoff is not permitted during an active session (must be from greenroom/IDLE)
- [ ] All campaign-scoped data (groups, notes, history) is preserved on transfer
- [ ] Former DM is demoted to PLAYER role automatically
- [ ] Handoff is logged as a campaign system event

**Related Docs**:

- (To be created when work begins)

---

### W-DM-Campaign-Portability: DM Self-Service Campaign Export and Import

**Status**: ⚪ Not Started
**Priority**: 🔵 Low (post-MVP)
**Depends on**: W0-Lobby-Admin (shares export format), Core Reliability complete

**Scope**: DMs can export their own campaign as a portable JSON file and import a previously exported file to create a new campaign — no admin involvement required. The DM export format omits member emails and passwords; imported campaigns start with the DM as the sole member and players rejoin via the normal invite flow.

This is the DM-facing counterpart to the admin-only W0-Lobby-Admin export/import. The admin route remains the privileged path (with email re-linking and full member stubs); this route is a lighter self-service backup/restore for DMs.

**Acceptance Criteria**:

- [ ] `GET /api/campaigns/:id/export` — DM-authenticated (campaign owner only). Returns portable JSON: campaign metadata, groups/environments, session history/chat (IC, OOC, system bookends), notes/journal. Member list includes display names and roles but no emails or passwords.
- [ ] Export respects campaign privacy: Whisper, paused-ephemeral, and cooldown-ephemeral content excluded by default; DM may opt in to include paused/cooldown chat.
- [ ] `POST /api/campaigns/import` — authenticated user. Creates a new campaign with fresh UUIDs from the export file; the caller becomes the new DM. Import never overwrites an existing campaign.
- [ ] Import is idempotent for the same file: re-importing always creates a new campaign, never patches an existing one.
- [ ] Lobby offline workspace surfaces "Export Campaign" in the campaign header actions (DM-only, not visible to players or spectators).
- [ ] Lobby surfaces "Import Campaign" alongside the existing "Create Campaign" and "Join Campaign" actions (DM-only).
- [ ] Export and import progress/result surfaces as a toast; errors include a human-readable reason.
- [ ] Imported campaign appears in the DM's lobby list immediately; players must be re-invited via the normal invite flow.

**Related Docs**:

- [docs/CONTRACTS.md](docs/CONTRACTS.md) — Campaign Export and Import section (admin variant; DM contract to be appended when implemented)

---

## Phase 5: Optional and Far Future ⚪

### W-Desktop-App: Tauri-based Desktop Client

**Status**: ⚪ Not Started
**Priority**: 🔵 Low (future distribution channel)

**Scope**: Desktop app built with Tauri for Windows, macOS, Linux. Uses same backend as web.

---

### W-PWA-App: Progressive Web App for Mobile

**Status**: ⚪ Not Started
**Priority**: 🔵 Low (future distribution channel)

**Scope**: PWA for mobile and desktop browsers. Installable, works offline for basic navigation.

---

### W-Accessibility-Advanced: Full WCAG AAA and Assistive Tech

**Status**: ⚪ Not Started
**Priority**: 🔵 Low (optional polish)

**Scope**: Beyond WCAG AA. Enhanced screen reader, voice control, adaptive input.

---

### W-Localization: i18n Support (Multiple Languages)

**Status**: ⚪ Not Started
**Priority**: 🔵 Low (optional, post-launch)

**Scope**: Translation framework, extraction tooling, multi-language support.

---

### W-Recording-Transcription-Summary: Async Post-Session Processing

**Status**: ⚪ Not Started
**Priority**: 🔵 Low (far future, requires Queue Manager)

**Scope**: After session ends, record finalization, transcription, and AI summary generation via durable queue.

**Acceptance Criteria**:

- [ ] Recording finalizes after session ENDED state
- [ ] Transcription processes asynchronously with retry/dead-letter
- [ ] Summary generation uses transcript + boundary markers + player actions
- [ ] Off-the-record content (Whisper, Paused runtime content) is excluded from transcript

**Related Docs**:

- [docs/architecture/TRANSCRIPTION-RECORDING-SYSTEM.md](docs/architecture/TRANSCRIPTION-RECORDING-SYSTEM.md)

---

## Status Legend

- 🟢 Done (closed, no more work)
- 🟡 In Progress (actively being worked on)
- 🔴 Blocked (waiting for something)
- ⚪ Not Started (ready to be picked up)

**Priority**:

- 🔴 Critical (blocks everything else)
- 🟡 High (core to MVP)
- 🟡 Medium (nice to have for MVP, can defer)
- 🔵 Low (post-MVP or truly optional)

---

## See Also

- [docs/DEVELOPMENT-ROADMAP-2026-05.md](docs/DEVELOPMENT-ROADMAP-2026-05.md) — Historical delivery notes and detailed phase descriptions
- [docs/CONTRACTS.md](docs/CONTRACTS.md) — API and WS event contracts
- [docs/architecture/](docs/architecture/) — Architecture docs for each subsystem
- [CHANGELOG.md](CHANGELOG.md) — Delivered features and fixes

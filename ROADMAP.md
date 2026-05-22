# VTT-Chat Product Roadmap

**Last Updated**: 2026-05-22
**Purpose**: Track work items prioritized by importance and urgency. Acceptance criteria drive completion; detailed implementation notes and designs live in supporting docs.
**Archive**: Historical delivery notes and detailed phase descriptions → [docs/DEVELOPMENT-ROADMAP-2026-05.md](docs/DEVELOPMENT-ROADMAP-2026-05.md)

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

---

## Phase 1: UI/UX Foundation 🟡

_Unblock user experience. DMs need clean, responsive controls. Players/spectators need clarity on state._

### W0-Rightbar: Info Panels and Settings Toolbar

**Status**: 🟡 In Progress
**Priority**: 🟡 High
**Depends on**: W0-State-Machine

**Scope**: Implement a rightbar toolbar with one button per surface in this canonical order: INFO, PARTY, ROOMS, JOURNAL, NOTES, HISTORY, SETTINGS. Replace the single Information tab model with dedicated panel entry points. Keep topbar Settings for user profile/system defaults; rightbar SETTINGS remains campaign/session/character context.

**Acceptance Criteria**:

- [x] Rightbar toolbar renders buttons in canonical order: INFO, PARTY, ROOMS, JOURNAL, NOTES, HISTORY, SETTINGS (PARTY is 2nd; JOURNAL comes before NOTES)
- [x] INFO panel shows campaign overview: name, description, player count, session count, completed sessions, next session ETA
- [x] INFO is readable by all personas; DM can edit campaign name/description/poster
- [x] PARTY panel lists all campaign players, including disconnected users and users not currently in-session
- [ ] PARTY row fields include: name, class, level, race, presence status (`HERE` | `AWAY` | `LOBBY` | `NOT HERE` | `OFFLINE`), last seen, stats, and active conditions (same visible fields for players and spectators)
- [x] PARTY/Lobby presence labels and transitions follow the shared model in `docs/ui/PRESENCE-STATUS-MODEL.md`
- [x] ROOMS panel is DM-only and hidden entirely for non-DM personas
- [ ] JOURNAL panel is a reverse-chronological list of sessions; each session has exactly one markdown journal entry with a hashtag list for search
- [ ] JOURNAL is readable by all personas; DM-only edit
- [ ] NOTES panel is a note list where each note includes name, markdown content, image attachments (multiple), and hashtags for search
- [ ] NOTES is readable by all personas; DM can add/edit/delete/share notes to one or more players
- [ ] NOTES supports Post to Chat, which creates a chat card in the selected group and auto-shares that note with all players in that group
- [ ] HISTORY is a lightweight mirror of chat logs from previous sessions only, grouped by visible session boundaries
- [ ] HISTORY never includes messages from the current active session
- [x] SETTINGS opens role-specific surfaces: DM gets Campaign + Session settings, players get Character settings (own character only), spectators do not see rightbar SETTINGS
- [ ] Player action: PARTY > Edit switches panel focus to SETTINGS > Character and auto-focuses the first editable field
- [ ] Character settings include editable character profile fields (name, race, class, level, stats, avatar)
- [ ] Character settings race/class fields provide autocomplete suggestions from D&D 5.5e SRD data by default, allow free-text player overrides, and support admin-configured pluggable source providers
- [x] DM Campaign/Session settings include only safe editable fields in rightbar SETTINGS; sync-complex campaign fields remain managed in dedicated surfaces
- [x] Right-panel dismisses on backdrop click
- [ ] Mobile responsive: collapse/expand at <768px; side-panel at ≥1280px

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

**Status**: 🟡 In Progress
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
- [ ] Campaign visibility: PRIVATE campaigns show a dimmed locked card to non-members when spectators are disabled or no session is active; show a normal card with a lock icon + WATCH when spectators are enabled and an active session has DM/players present
- [ ] Non-member + PUBLIC campaign → REQUEST TO JOIN button; requires optional message; DM approves/rejects via notification badge on their card
- [ ] DM lobby card shows a badge with pending join-request count; clicking opens inline approval panel (username, avatar, timestamp, message)
- [ ] Non-member + PRIVATE campaign without active watchable session → dimmed card, lock icon, no action (no invite link = no entry)
- [ ] Full user + campaign with spectators enabled + active session with DM/players present → WATCH button (applies to both PUBLIC and PRIVATE campaigns; no invite link required)
- [x] Players can join via invite link or code
- [x] Spectators can only access active campaigns and cannot edit
- [ ] Late-join policy (Open | Screened | Blocked) is configurable with grace period
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

---

### W0-Lobby-Admin: Campaign Export and Import

**Status**: ⚪ Not Started
**Priority**: 🟢 Low
**Depends on**: W0-Lobby

**Scope**: Admin-only campaign export (JSON) and import (creates new campaign from file). DMs cannot self-export.

**Acceptance Criteria**:

- [ ] `GET /api/admin/campaigns/:id/export` returns campaign JSON (metadata, groups/environments, session history/chat, notes/journal, member list)
- [ ] Export does not include passwords; member emails are included for re-linking
- [ ] `POST /api/admin/campaigns/import` creates a new campaign with fresh IDs from the export JSON
- [ ] Admin may optionally map member emails to existing accounts during import; unmapped members become stubs
- [ ] Import never overwrites an existing campaign
- [ ] Admin UI surfaces Export and Import actions in campaign management panel

**Related Docs**:

- [docs/CONTRACTS.md](docs/CONTRACTS.md) — Campaign Export and Import section

---

### W4-UX-Polish: Accessibility and Responsive Hardening

**Status**: ⚪ Not Started
**Priority**: 🟡 High
**Depends on**: W0-Rightbar, W0-Lobby

**Scope**: WCAG AA compliance pass, keyboard navigation, reduced-motion support, dark/light theme validation, cross-browser testing.

**Acceptance Criteria**:

- [ ] All UI surfaces pass WCAG AA keyboard navigation and screen-reader testing
- [ ] Dark and light themes render correctly across all components
- [ ] Reduced-motion preferences are respected
- [ ] No hard-coded one-mode colors in shared user-facing UI
- [ ] Responsive testing passes at breakpoints: <768px (mobile), 768-1279px (tablet), ≥1280px (desktop)

**Related Docs**:

- [docs/ui/ACCESSIBILITY.md](docs/ui/ACCESSIBILITY.md) (to be created)

---

## Phase 2: Audio Experiences 🔴

_DM superpowers: move players between groups, apply conditions, set environments, control distance. All within 2 clicks._

### W-Audio-Voice: DM Voice Targeting and Broadcast Mode

**Status**: ⚪ Not Started
**Priority**: 🟡 High
**Depends on**: W1-Runtime-Recovery

**Scope**: DM can select which group(s) hear their voice. Broadcast mode sends to all groups; targeted mode sends to selected group only.

**Acceptance Criteria**:

- [ ] DM audio control panel shows: current target group, broadcast toggle, mute button
- [ ] Broadcast mode routes DM voice to all groups in session
- [ ] Targeted mode routes DM voice to selected group only
- [ ] Broadcast toggle is unavailable (greyed out) while in Whisper group
- [ ] WS event `AUDIO:DM_VOICE_TARGET_CHANGED` broadcasts to all clients
- [ ] Frontend renders DM voice status with icon + tooltip

**Related Docs**:

- [docs/CONTRACTS.md](docs/CONTRACTS.md) (audio section)

---

### W-Audio-Condition: Apply/Remove Conditions (Drunk, Confused, Silenced)

**Status**: ⚪ Not Started
**Priority**: 🟡 High
**Depends on**: W1-Runtime-Recovery

**Scope**: DM can apply audio conditions to players (Drunk: slurred pitch, Confused: scrambled audio, Silenced: routed only to DM + spectators). Conditions are visible in AudioPanel. System message appears in chat when applied/removed.

**Acceptance Criteria**:

- [ ] DM right-click player → Condition → select from list
- [ ] Condition applies within 200ms and broadcasts to all clients
- [ ] Silenced player hears themselves normally but others hear nothing
- [ ] AudioPanel shows active condition with icon and explanation
- [ ] System message appears in chat: `[{player} was silenced]` when condition applied
- [ ] System message appears when condition removed: `[{player}'s condition cleared]`
- [ ] Multiple conditions stack visually but primary is highlighted in AudioPanel
- [ ] Server-side mute enforcement: silenced players cannot publish audio to other players

**Related Docs**:

- [docs/CONTRACTS.md](docs/CONTRACTS.md) (condition effects)
- [.github/copilot-instructions.md](.github/copilot-instructions.md) (Condition: SILENCED section)

---

### W-Audio-Distance: Distance Modifier (Nearby, Visible, Far)

**Status**: ⚪ Not Started
**Priority**: 🟡 High
**Depends on**: W1-Runtime-Recovery

**Scope**: DM can set player distance (Default | Nearby | Visible | Far). Each applies audio processing (lowpass, reverb, volume). System message in chat when distance changes.

**Acceptance Criteria**:

- [ ] DM right-click player → Distance → select from list
- [ ] Distance applies within 200ms and broadcasts to all clients
- [ ] AudioPanel shows active distance with icon
- [ ] System message appears in chat: `[{player} is far away]` when distance changes
- [ ] Audio processing matches distance preset (muffling, volume reduction, reverb)
- [ ] Distance clears when player changes groups or condition applied

**Related Docs**:

- [docs/CONTRACTS.md](docs/CONTRACTS.md) (audio effects)

---

### W-Audio-Environment: Group Environment (Tavern, Cave, Forest, Underwater)

**Status**: ⚪ Not Started
**Priority**: 🟡 High
**Depends on**: W1-Runtime-Recovery

**Scope**: DM sets environment for each group (affects all members). Environment persists across session boundaries (campaign-level setting). Environment icon in group header; DM click to change.

**Acceptance Criteria**:

- [ ] Group header shows environment icon
- [ ] DM click environment icon → popover to select environment
- [ ] Environment broadcasts to all players in that group
- [ ] AudioPanel shows active environment with icon
- [ ] Environment persists in campaign when session ends
- [ ] Environment restores when new session starts (campaign-scoped)
- [ ] Greenroom environment is always neutral (locked, no modification)
- [ ] WS event `AUDIO:ENVIRONMENT_SET` broadcasts to affected clients

**Related Docs**:

- [docs/CONTRACTS.md](docs/CONTRACTS.md) (audio section)

---

## Phase 3: Notes & Journal Foundation 🔴

_DM reference and player communication. DMDX markdown editor, pop-out windows, system message cards._

### W-Notes-Editor: DMDX Markdown Editor Integration

**Status**: ⚪ Not Started
**Priority**: 🟡 High
**Depends on**: W0-Rightbar

**Scope**: Notes panel uses DMDX markdown editor with syntax highlighting, helper toolbar, and raw-markdown toggle. Support hashtags, attachments (images, PDFs), and required fields (Name, Content, Hashtags, Attachments).

**Acceptance Criteria**:

- [ ] Notes editor integrates DMDX library for markdown syntax highlighting and editing
- [ ] Helper toolbar includes: bold, italic, lists, headings, link, code
- [ ] Raw markdown toggle allows editing source directly
- [ ] Required fields enforced: Name, markdown Content, space-separated Hashtags
- [ ] Attachments support: drag-and-drop or file picker for images and PDFs
- [ ] PDFs render as inline cards; images render inline
- [ ] External links are blocked in toolbar and render pipeline
- [ ] Hashtag autocomplete from campaign tag history
- [ ] Notes are searchable by Name + Content + Hashtags

**Related Docs**:

- [docs/changes/NOTES-JOURNAL-IMPLEMENTATION-CHECKLIST.md](docs/changes/NOTES-JOURNAL-IMPLEMENTATION-CHECKLIST.md)

---

### W-Notes-Visibility: Sharing and Handout Distribution

**Status**: ⚪ Not Started
**Priority**: 🟡 High
**Depends on**: W-Notes-Editor

**Scope**: DM can share notes to players with scopes (Private | Party | Selected | Spectators). Shared notes surface as one-time chat cards to recipients.

**Acceptance Criteria**:

- [ ] Share modal allows selecting scope: Private (DM only) | Party (all players) | Selected (choose specific players) | Spectators (if enabled)
- [ ] Shared notes surface as one-time recipients-only chat card
- [ ] Card includes note excerpt (auto-generated or DM override) and link to full note
- [ ] Duplicate cards are not surfaced on reconnect/hydration
- [ ] Players can always find shared notes in Notes tab (filtered by visibility)
- [ ] Private notes only visible to DM and owner

**Related Docs**:

- [docs/changes/NOTES-JOURNAL-IMPLEMENTATION-CHECKLIST.md](docs/changes/NOTES-JOURNAL-IMPLEMENTATION-CHECKLIST.md)

---

### W-Journal-and-Popouts: Separate Windows for Notes and Journal

**Status**: ⚪ Not Started
**Priority**: 🟡 High
**Depends on**: W-Notes-Visibility

**Scope**: Notes and Journal can pop out into separate windows for side-by-side reading. Journal is one per session chapter; players can read but not edit. Info panel remains compact.

**Acceptance Criteria**:

- [ ] Notes detail view has "Pop Out" button to open in separate window
- [ ] Journal detail view has "Pop Out" button to open in separate window
- [ ] Pop-out windows are resizable and can stay open while user navigates main app
- [ ] Journal links to session chapter name and uses same editor as Notes
- [ ] Journal visibility: DM + players + spectators can read
- [ ] Only DM can edit Journal (other than that, read-only for all)
- [ ] Pop-out state persists during session (windows remain open on navigation)

**Related Docs**:

- [docs/changes/NOTES-JOURNAL-IMPLEMENTATION-CHECKLIST.md](docs/changes/NOTES-JOURNAL-IMPLEMENTATION-CHECKLIST.md)

---

### W-System-Messages: Condition and Distance Change Cards

**Status**: ⚪ Not Started
**Priority**: 🟡 Medium
**Depends on**: W-Audio-Condition, W-Audio-Distance

**Scope**: When DM applies/removes conditions or changes distance, a small system message card appears in chat timeline so players see what is happening. Cards are compact and non-intrusive.

**Acceptance Criteria**:

- [ ] System message card appears in chat when condition is applied: `[{player} is now {condition}]`
- [ ] System message card appears when condition is removed: `[{player}'s condition cleared]`
- [ ] System message card appears when distance changes: `[{player} is {distance}]`
- [ ] Cards include icon and explanation tooltip
- [ ] Cards are compact (one line) and styled consistently
- [ ] Cards appear for all viewers (DM, players, spectators)
- [ ] Cards persist in chat history for later reference and AI summary processing

**Related Docs**:

- [docs/CONTRACTS.md](docs/CONTRACTS.md)

---

### W-DM-Notes-to-Chat: Share Note to Chat Timeline

**Status**: ⚪ Not Started
**Priority**: 🟡 Medium
**Depends on**: W-Notes-Visibility

**Scope**: DM can send a note directly to the chat timeline (IC message) so it appears as a chat message. Players find it in Notes tab for later reference.

**Acceptance Criteria**:

- [ ] DM can send note to chat via Share > Chat Timeline option
- [ ] Note appears as DM message in chat (IC-style with note content)
- [ ] Message surfaces note excerpt and full-note link
- [ ] Note remains accessible in Notes tab for all participants
- [ ] Message timestamp links to note in history

**Related Docs**:

- (None yet; small scope feature)

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

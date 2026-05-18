# VTT-Chat Product Roadmap

**Last Updated**: 2026-05-18
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

**Status**: 🟡 In Progress
**Priority**: 🔴 Critical (blocking)
**Depends on**: (none)

**Scope**: Finalize and enforce the canonical session state machine so all subsystems (session lifecycle, presence, audio, groups) transition deterministically with no ambiguity.

**Acceptance Criteria**:

- [x] State machine contract is locked (`IDLE`, `ACTIVE`, `PAUSED`, `COOLDOWN`, `ENDED`, `CLEANUP`)
- [x] Transition rules are enforced at API layer (current implementation returns 409 on invalid transitions)
- [x] Backend persists state transitions as system chat bookends (`[Session Started]`, etc.)
- [x] Frontend renders bookends correctly after refresh/reconnect
- [ ] Spectator lifecycle rules are enforced (observe-only during `ACTIVE`; during `COOLDOWN` can chat/speak with players and DM if DM has enabled it in campaign settings; excluded from all other states)
- [ ] Post-session chat timer and cooldown window work end-to-end

Evidence snapshot (2026-05-18):

- Backend now enforces spectator chat lifecycle at API level in `POST /api/chat/message`:
  - observe-only during `ACTIVE`
  - spectator chat allowed only during `COOLDOWN`
  - spectator cooldown chat requires campaign `postSessionChatEnabled`
- Added backend route coverage for these paths in `backend/tests/api/chat-routes.test.ts`.
- Spectator center-pane lifecycle screens now map state explicitly:
  - `IDLE` + `PAUSED` show a "Please wait" hold screen.
  - `ENDED` + `CLEANUP` show a "Session Closed" screen.
  - `COOLDOWN` continues to show the post-session countdown panel.
- Greenroom chat hydration now avoids new-session over-filtering and loads deterministically:
  - initial load requests campaign greenroom page with `todayOnly=1`
  - lazy scroll-up pagination still backfills older history via `before`
  - backend campaign chat page now supports server-side `todayOnly` boundary filtering.
- Cooldown countdown controls remain verified by frontend coverage (`frontend/tests/components/SessionToolbar.test.tsx`).
- Voice participation policy in cooldown is still pending explicit backend enforcement and test proof.

**Related Docs**:

- [docs/changes/STATE-MACHINE.md](docs/changes/STATE-MACHINE.md)
- [docs/changes/STATE-MACHINE-IMPLEMENTATION.md](docs/changes/STATE-MACHINE-IMPLEMENTATION.md)
- [docs/architecture/SESSION-LIFECYCLE.md](docs/architecture/SESSION-LIFECYCLE.md)

---

### W11-Redis-First: Runtime State Persistence and Recovery

**Status**: 🟡 In Progress
**Priority**: 🔴 Critical (blocking)
**Depends on**: W0-State-Machine

**Scope**: Adopt Redis as the first write layer for runtime state (presence, room membership, audio effects). Backend mutations follow: validate → Redis update → audit log → WS broadcast → optional Postgres durability.

**Acceptance Criteria**:

- [ ] Redis-first mutation flow is documented and implemented for: presence, room membership, audio effects (environment, conditions, distance)
- [ ] All websocket-visible domain routes classify into Class A (Redis durable) / Class B (Redis w/ bounded flush) / Class C (ephemeral)
- [ ] Session audit trail captures all meaningful control-plane actions (join/leave, move, mute, lifecycle boundaries)
- [ ] Reconnect recovery uses backend-authoritative sources (Redis runtime state + Postgres fallback)
- [ ] Multi-client reconnect soak suite passes consistently

**Related Docs**:

- [docs/architecture/RUNTIME-STATE-AND-AUDIT-CONTRACT.md](docs/architecture/RUNTIME-STATE-AND-AUDIT-CONTRACT.md)
- [docs/changes/W11-REDIS-FIRST-AUDIT-2026-05-18.md](docs/changes/W11-REDIS-FIRST-AUDIT-2026-05-18.md)

---

### W2-Testing: Release Gates and Regression Coverage

**Status**: 🟡 In Progress
**Priority**: 🟡 High (gating Phase 1)
**Depends on**: W0-State-Machine, W11-Redis-First

**Scope**: Lock in release gates for backend/frontend/admin. Add integration coverage for session lifecycle, audio state recovery, multi-client reconnect, and state-machine transitions.

**Acceptance Criteria**:

- [x] Backend test suite passes with ≥60% coverage statement baseline; zero critical-path test failures (2026-05-18: 83/83 test files, 660/660 tests, 65.26% statements, 53.67% branches, 66.96% functions, 65.62% lines)
- [x] Frontend test suite passes with ≥60% coverage statement baseline; zero critical-path test failures
- [ ] Release-gate reporting is automated and enforced in CI
- [x] Session lifecycle coverage includes: start → pause → resume → end → cleanup (covered by `backend/tests/integration/session-room-transition.integration.test.ts`, `backend/tests/integration/session-cooldown-handoff.integration.test.ts`, `backend/tests/services/session-cleanup-job.service.test.ts`)
- [ ] Audio state recovery coverage includes: environment + conditions + distance + mute
- [x] Multi-client reconnect coverage includes: concurrent reconnect, session isolation, FIFO recovery (`backend/tests/integration/multi-client-reconnect.integration.test.ts`)

**Related Docs**:

- [backend/tests/](backend/tests/)
- [frontend/tests/](frontend/tests/)

---

### W3-Operatisation: Runbooks and Telemetry Matrix

**Status**: 🟡 In Progress
**Priority**: 🟡 High
**Depends on**: W0-State-Machine, W11-Redis-First

**Scope**: Document and validate operator workflows, backup/restore drills, and telemetry signal definitions.

**Acceptance Criteria**:

- [x] Operator runbook exists for: restart, backup/restore, incident triage, log analysis
- [x] Telemetry matrix documents what is tracked, why, and how it is consumed
- [ ] Restart-survival validation confirms telemetry/diagnostic sinks persist across restarts
- [ ] Backup/restore drill is executed and documented as reproducible

**Related Docs**:

- [docs/operations/](docs/operations/)
- [docs/operations/RUNBOOK.md](docs/operations/RUNBOOK.md)
- [docs/operations/TELEMETRY-MATRIX.md](docs/operations/TELEMETRY-MATRIX.md)

---

## Phase 1: UI/UX Foundation 🟡

_Unblock user experience. DMs need clean, responsive controls. Players/spectators need clarity on state._

### W0-Rightbar: Info Panels and Settings Toolbar

**Status**: 🟡 In Progress
**Priority**: 🟡 High
**Depends on**: W0-State-Machine

**Scope**: Implement the rightbar icon toolbar and single tabbed info panel (Campaign | Notes | Journal | History). Settings cascade: topbar (user profile) → rightbar (campaign/session) → character (player-only).

**Acceptance Criteria**:

- [ ] Rightbar toolbar with icons for Info, Campaign Settings, Session Settings, Character Settings
- [ ] Single info panel with tabs: Campaign (stats, edit DM capability) | Notes (add/edit/delete/share) | Journal (per-session artifact, DM-only edit) | History (searchable chat archive)
- [ ] Campaign tab shows: name, description, player count, session count, completed sessions, next session ETA
- [ ] DM can edit campaign name/description/poster in Campaign tab
- [ ] Campaign Settings tab shows: default session duration, audio auto-target toggle, allow-conditions toggle
- [ ] Session Settings tab shows: name, planned duration (DM edit only), timer (readonly for players)
- [ ] Character Settings tab shows: name, race, class, level, stats, avatar (player edit only)
- [ ] All panels respect persona permissions (DM sees more, players/spectators read-only where applicable)
- [ ] Right-panel dismisses on backdrop click
- [ ] Mobile responsive: collapse/expand at <768px; side-panel at ≥1280px

**Related Docs**:

- [docs/ui/UI-LAYOUT.md](docs/ui/UI-LAYOUT.md)
- [docs/ui/DM-CAMPAIGN-SETTINGS.md](docs/ui/DM-CAMPAIGN-SETTINGS.md)

---

### W0-Lobby: Campaign Discovery and Join Flow

**Status**: ⚪ Not Started
**Priority**: 🟡 High
**Depends on**: W0-State-Machine

**Scope**: Home lobby shows: your campaigns (with DM indicator, last-active date, player count), join-via-code/invite, and create-campaign CTA. DM can access campaign settings from lobby dialog (not separate route).

**Acceptance Criteria**:

- [ ] Home shows: your campaigns as cards (name, banner, DM, players, last active)
- [ ] Campaign cards are private by default; only DM + joined members see them
- [ ] DM can edit campaign via modal dialog from lobby (not separate route)
- [ ] Players can join via invite link or code
- [ ] Spectators can only access active campaigns and cannot edit
- [ ] Late-join policy (Open | Screened | Blocked) is configurable with grace period

**Related Docs**:

- [docs/ui/UI-FLOWS.md](docs/ui/UI-FLOWS.md)

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
**Depends on**: W11-Redis-First

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
**Depends on**: W11-Redis-First

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
**Depends on**: W11-Redis-First

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
**Depends on**: W11-Redis-First

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

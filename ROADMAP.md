# Testing and Operatisation Roadmap

This roadmap tracks test-readiness, operatisation, hardening, and release-gate work for the current platform baseline.

Last updated: 2026-05-18

Related roadmap:

- Development roadmap (feature-stage history and delivery log): [docs/DEVELOPMENT-ROADMAP.md](docs/DEVELOPMENT-ROADMAP.md)

---

## Recent Delivery Update (2026-05-18)

Completed across recent chat/runtime polish work:

- Chat composer and message-type UX now support canonical `IC | OOC | WHISPER | DM` flows, including DM message routing and whisper recipient selection improvements.
- Whisper timeline rendering was refined so outgoing/incoming whisper route metadata has distinct layout behavior and improved readability in long threads.
- DEV mock chat simulation now supports all selectable chat types (`IC`, `OOC`, `WHISPER`, `DM`) with room-scoped whisper targeting and DM-only message routing semantics.
- DEV mock message pools are now normalized to at least 50 templates per selectable type for more realistic repetition resistance.
- Session info-panel connected-player count in greenroom now derives from live greenroom roster membership (excluding spectators/system), and user-facing copy now consistently uses "Connected Players" naming.

---

## Recent Delivery Update (2026-05-14)

Completed today across frontend and backend:

- Frontend architectural refactor and centralization:
  - Moved component-local helper/type/style files into central `src/utils`, `src/types`, and `src/styles/components` locations.
  - Refactored invite/join and history flows to use centralized constants/types/helpers (`inviteJoin`, `history`) and removed local duplication.
  - Refactored room/group and DM audio controls to use centralized `groupPanel` and `dmAudioControls` contracts/utilities.
- Frontend stability and test-hardening:
  - Stabilized integration/hook/component tests for session boundaries and audio/livekit behavior.
  - Updated auth/guest route tests and knowledge panel tests to current UX contracts.
  - Full frontend suite now passes in current workspace state.
- Backend service and route refactors:
  - Session service decomposition (`session/core.service.ts`) and route/service wiring cleanup.
  - Guest-auth/audio/session import-path and index reorganization.
  - Access control and session logging wiring expanded through route and middleware pathways.

Current readiness notes from local verification (2026-05-14):

- Frontend tests: `45` files / `392` tests passing.
- Backend tests: `69` files / `545` tests run; `6` currently failing in:
  - `tests/api/rooms-routes.test.ts` (delete/move-members flow)
  - `tests/infra/telemetry-store.test.ts` (path/retention/rotation assertions)

Immediate next cleanup priorities:

- Align backend telemetry-store tests for cross-platform path behavior (Windows path handling and retention pruning expectations).
- Resolve room-delete member-move API test contract mismatch (`500` vs expected `200`).

---

## 0) Campaign/User Flow Implementation Track (Current Build Focus)

This is a lightweight implementation tracker for the next product-flow stage.
It is intentionally simple (single-developer friendly) and not a formal backlog process.

### Goal

Deliver the pre-launch campaign flow so users move cleanly from login/register to home/dashboard and into launch/watch entry points with correct DM/player/spectator permissions and behavior.

Current boundary for this stage:

- In scope: login/register, invite/code handling, home/dashboard visibility, launch/watch CTA behavior, and pre-launch campaign settings/invite UX.
- Out of scope (deferred): runtime behavior inside campaigns after launch (greenroom/session chat, group movement, pause/stop runtime gates, in-session notes/audio behavior).

### Confirmed Product Rules

- Campaign canonical state is `ACTIVE|INACTIVE`; `GREENROOM|PAUSED` are derived from session/runtime state.
- Session Start always auto-creates a new session chapter with clean session chat.
- Session chapter names are auto-generated (e.g. Session N + date) and DM can rename later (including after end).
- Greenroom chat defaults to ephemeral and is configurable per campaign.
- DM presence on campaign cards is `Online|Offline`.
- Home dashboard metrics are privacy-limited/rounded (signal of activity, not exact counts).
- Players can join any campaign they are a member of; membership is permanent until DM/Admin removal.
- Player join via code/invite link grants immediate campaign membership.
- DM/Player guest access is allowed only when launched via extension POST invite flow (`POST /api/auth/extension/guest-login`).
- Guest DM/Player access is campaign-scoped; outside extension launch, DM/Player guest access is not granted.
- DM/Player guests can upgrade to full account later without losing campaign linkage/history.
- Spectator invites can be created by DM and Admin.
- Direct spectator watch links can create temporary guest spectator accounts.
- Spectators can only access active campaigns.
- Spectators wait if campaign is active but no DM/player is online yet.
- During Pause, spectators see paused screen only (no voice/chat access).
- During End/Stop, spectators lose voice/chat and are sent to waiting/end screen.
- On Start, only currently connected players are force-moved to Main group.
- Late-join policy for missed session start: `Open|Screened|Blocked`, with configurable grace period (default 30 minutes).
- Screened mode includes private DM chat gate; Blocked mode still respects grace period.
- Players only see campaign-linked note copies; templates/unlinked notes are DM-side only.
- Outside campaign membership context, authenticated identity is simply `User`; DM/Player/Spectator are campaign-scoped roles.
- Campaign owner DM handoff (resign and assign another player as DM) is planned.

### Connection Status Icon Rules

Status indicator simplification and behavior rules for frontend UX:

- Audio/LiveKit status should be subtle in the UI.
- Audio connection failures should influence the main status icon only when there is an audio/LiveKit connection issue.

Outside campaign:

- Green: connected to Core WS.
- Yellow: connecting.
- Red: error.

Inside campaign:

- Green: connected to Core WS and LiveKit.
- Pale green: connected to Core WS, LiveKit connecting.
- Yellow: connecting to both Core WS and LiveKit.
- Orange: Core WS connected, LiveKit failed.
- Red: both failed, or Core WS failed (regardless of LiveKit).

### Connection Status Implementation Checklist

Use the following canonical naming so frontend/backend/admin all refer to the same state keys.

1. Canonical connection enums:
   - `coreWsState`: `CONNECTED | CONNECTING | ERROR`
   - `livekitState`: `CONNECTED | CONNECTING | ERROR | NOT_APPLICABLE`
   - `statusContext`: `OUTSIDE_CAMPAIGN | INSIDE_CAMPAIGN`
2. Canonical aggregate icon enum:
   - `statusIconState`: `OK | OK_PARTIAL | CONNECTING | DEGRADED_AUDIO | ERROR`
3. Canonical color mapping keys:
   - `statusColorKey`: `GREEN | PALE_GREEN | YELLOW | ORANGE | RED`
4. Canonical mapping table (primary icon):
   - `OUTSIDE_CAMPAIGN` + `coreWsState=CONNECTED` -> `statusIconState=OK`, `statusColorKey=GREEN`
   - `OUTSIDE_CAMPAIGN` + `coreWsState=CONNECTING` -> `statusIconState=CONNECTING`, `statusColorKey=YELLOW`
   - `OUTSIDE_CAMPAIGN` + `coreWsState=ERROR` -> `statusIconState=ERROR`, `statusColorKey=RED`
   - `INSIDE_CAMPAIGN` + `coreWsState=CONNECTED` + `livekitState=CONNECTED` -> `statusIconState=OK`, `statusColorKey=GREEN`
   - `INSIDE_CAMPAIGN` + `coreWsState=CONNECTED` + `livekitState=CONNECTING` -> `statusIconState=OK_PARTIAL`, `statusColorKey=PALE_GREEN`
   - `INSIDE_CAMPAIGN` + `coreWsState=CONNECTING` + `livekitState=CONNECTING` -> `statusIconState=CONNECTING`, `statusColorKey=YELLOW`
   - `INSIDE_CAMPAIGN` + `coreWsState=CONNECTED` + `livekitState=ERROR` -> `statusIconState=DEGRADED_AUDIO`, `statusColorKey=ORANGE`
   - `INSIDE_CAMPAIGN` + `coreWsState=ERROR` + any `livekitState` -> `statusIconState=ERROR`, `statusColorKey=RED`
   - `INSIDE_CAMPAIGN` + `coreWsState=CONNECTING` + `livekitState=ERROR` -> `statusIconState=ERROR`, `statusColorKey=RED`
5. Shared contract placement:
   - Put enum/type definitions in `shared/` for frontend/backend parity.
   - Keep admin UI presentation constants in admin-local constants, but map to the same shared enum names.
6. UX guardrail:
   - Keep LiveKit/audio as a subtle secondary indicator; only escalate the primary icon for `DEGRADED_AUDIO` and `ERROR` states.

---

## 1) Scope and Goal

Goal: move from feature-complete core scope to production-confidence execution.

This stage covers:

- Remaining hardening tasks
- Testing and release-gate execution
- Operatisation and runbook maturity
- UI modernization follow-through and regression control
- User documentation completion for DM, player, spectator, and operators

Out of scope:

- Net-new major feature domains beyond current roadmap baseline
- Extension-repository implementation milestones (tracked in extension docs)

---

## 2) Current Readiness Snapshot

- Build and lint: green at workspace level
- Backend tests (local run 2026-05-14): 69 files / 545 tests run, 6 failing
- Frontend tests (local run 2026-05-14): 45 files / 392 tests passing
- Admin tests: 17 files / 139 tests passing (last known baseline)
- Backend coverage snapshot: statements 60.99, branches 51.69, functions 60.17, lines 61.35
- Admin coverage snapshot: statements 86.72, branches 71.85, functions 83.49, lines 88.2

Known readiness gap classes:

- Redis-first runtime-state consistency and session-audit coverage across websocket-visible mutations
- Cross-platform backend telemetry-store test determinism (path and retention windows)
- Group-delete member-move API parity and regression guard coverage
- Multi-client reconnect and soak hardening (presence/groups-audio topology; runtime rooms)
- Telemetry durability and restart-survival operational checks
- Telemetry signal definition clarity (what is tracked, why it matters, and how it is consumed)
- Admin console operations UX review against best-practice operator workflows
- Docs parity and operator-facing playbook consistency

---

## 3) Workstreams

| ID  | Workstream                       | Status                      | Scope                                                                                                                                       |
| --- | -------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| W0  | Frontend Surface Completion      | In Progress                 | Right-panel screen completion, topbar Settings/Information panel rollout, settings/profile usability, connection status UX                  |
| W11 | Runtime State and Audit Contract | In Progress (High Priority) | Redis-first runtime-state adoption, websocket mutation persistence policy, and session-audit trail enforcement across domain flows          |
| W1  | Hardening and Reliability        | In Progress                 | Reconnect/recovery soak, fanout/load validation, audio durability, env validation, structured logging                                       |
| W2  | Testing Program and Gates        | In Progress                 | Cross-package test gates, regression matrix, perf/security checks                                                                           |
| W3  | Operatisation and Runbooks       | Planned                     | Telemetry durability checks, backup/restore drills, migration parity checks                                                                 |
| W4  | UI Modernization Completion      | In Progress                 | Regression hardening, accessibility and visual consistency follow-through                                                                   |
| W5  | User Documentation               | Planned                     | DM/player/spectator guides, onboarding, troubleshooting, operational quickstarts                                                            |
| W6  | Refactor and Simplification      | Completed                   | Baseline completed; follow-up hardening/coverage/deprecation tracked in W1/W2/W3                                                            |
| W7  | Admin Operations UX Review       | Planned                     | Best-practice operations review for admin information architecture and workflows                                                            |
| W8  | Localization Foundation          | Planned                     | i18n/l10n architecture, translation key rollout, language switch scaffolding, and localization QA gates                                     |
| W9  | DEV Mock Players                 | In Progress                 | Always-on seeded mock player accounts in DEV mode so the developer can test DM superpowers without needing real players                     |
| W10 | Voice Group Panel Follow-up      | Planned                     | Deferred accessibility, close-group reconciliation, styling polish, and remaining hardening items from W0 Voice Group Panel                 |
| W12 | Temporal API Migration           | Planned (Future)            | Phased migration from legacy `Date` to `Temporal` API; Phase 1 (pure timestamps) is low-risk; Phases 2–4 blocked on Prisma Temporal support |
| W13 | Durable Queue and Async Workers  | Planned (Future)            | Durable queue manager for scheduled and long-running jobs with restart-safe retry/checkpointing for cleanup, transcription, and summaries   |

---

### W0 Subtask: State Machine Contract Lock (Critical Prerequisite)

**Purpose:** Define and finalize the canonical state machine contract before Stage 1+ implementation. This ensures all subsystems (session lifecycle, presence, audio, group management) operate with consistent state authority, transition rules, and error recovery.

**Status:** Lock-in approved; backend/state-authority implementation mostly complete

**Current focus:** Post-session chat timer window + frontend bookend integration test alignment.

**Deliverables:**

- [x] Contract document: [docs/changes/STATE-MACHINE.md](docs/changes/STATE-MACHINE.md) — State layers, session transitions, presence rules, disconnect timers, group semantics, audio routing, mute enforcement, boundary markers, spectator cooldown
- [x] Implementation mapping: [docs/changes/STATE-MACHINE-IMPLEMENTATION.md](docs/changes/STATE-MACHINE-IMPLEMENTATION.md) — Codebase locations, current status, action items, phasing, testing checklist
- [x] Codebase clarifications (from feedback/review)
- [x] Shared session-lifecycle compatibility helpers + greenroom normalization
- [x] Lock-in gate (approval from Andy + team)
- [x] Ghost-mode WS event contract + frontend/backend handler wiring
- [x] W0 roadmap update to reference state machine as blocking upstream for later W0/W1 reliability work

**Key Clarifications (From Review 2026-05-09):**

| Area                         | Clarification                                                                                                                                                                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **State naming**             | IDLE (codebase) ≡ INACTIVE (contract). Add CLEANUP state. Keep ENDED as the explicit post-stop processing window; the backend must trigger stop/summary work immediately and may advance to INACTIVE without waiting for that work to finish. |
| **Ghost-mode storage**       | Authoritative in Redis presence hash. Frontend caches via `PRESENCE:USER_GHOST_MODE_CHANGED` WS event. Backend enforces timers (5s entry, 60s TTL).                                                                                           |
| **Disconnect cascade**       | Player intentional: immediate DISCONNECTED → 5s ghost-mode → 60s remove. DM intentional: immediate DISCONNECTED + session PAUSE. Everyone leaves: 60s → auto-stop to INACTIVE → 20min CLEANUP with greenroom purge.                           |
| **Cleanup state visibility** | Backend-only (clients never see CLEANUP state). Silent cleanup on 20min TTL expiry.                                                                                                                                                           |
| **Boundary markers**         | Backend-authoritative only. Created as SYSTEM chat on state transition, persisted to DB, broadcast via WS. Frontend must not create markers (eliminates duplicates on refresh).                                                               |
| **Reconnect authority**      | Optimistic frontend: holds intent during session; trusts backend snapshot on reconnect (replaces, not merges).                                                                                                                                |
| **Mute enforcement**         | Defense-in-depth: client-side UI + audio mute; server-side validation before audio packet accept.                                                                                                                                             |
| **Previous group tracking**  | One-level only (previousGroupId = last non-greenroom group). Restored on private group exit (runtime private room exit) or populated on each non-greenroom join.                                                                              |
| **Post-session chat**        | Part of ENDED state, not separate CLEANUP. Default enabled, 5 mins, slider min 1 min max 60 mins. DM can disable, extend, or end early. When disabled, ENDED only triggers processing and then advances.                                      |

**Exit Criteria:**

- [x] Contract reviewed and approved by team
- [x] Codebase entry points documented in implementation map
- [x] No ambiguities in state authority or transition rules
- [x] Testing charter defined (unit + integration coverage per subsystem)
- [ ] Blocking items resolved before Stage 1 implementation begins (post-session chat timer window still open)

**Blockers for Stage 1+:**

- ✅ Contract finalized
- ✅ Codebase updates for CLEANUP state + INACTIVE compatibility alias + timer cascade (full DB rename IDLE→INACTIVE deferred behind compatibility)
- ✅ Disconnect timer implementation (5s ghost, 60s TTL, auto-stop, 20min cleanup)
- ✅ Ghost-mode WS event handlers
- ✅ Previous group ID tracking
- ✅ Backend-authoritative boundary marker creation (persisted + WS-broadcast, frontend local synthesis removed)
- ⬜ Post-session chat timer logic and ENDED processing window

**Related Docs:**

- [CONTRACTS.md](docs/CONTRACTS.md) — Event and permission contracts
- [SESSION-LIFECYCLE.md](docs/architecture/SESSION-LIFECYCLE.md) — Session state semantics
- [PRESENCE-STATE-MACHINE.md](docs/subsystems/PRESENCE-STATE-MACHINE.md) — Presence model (legacy; see STATE-MACHINE.md § 3)
- [copilot-instructions.md](.github/copilot-instructions.md) — Session lifecycle rules and recording policy

---

### W0 Subtask: Voice Group Panel (Campaign Screen)

**Status**: Closed out for current build scope; residual non-blocking follow-up items deferred to W10
**Related Docs**: [UI-COMPONENT-CHANNELS.md](docs/ui/UI-COMPONENT-CHANNELS.md), [DM-CAMPAIGN-SETTINGS.md](docs/ui/DM-CAMPAIGN-SETTINGS.md)

Recent runtime follow-through (2026-05-08):

- Audio panel behavior is aligned with the current session-flow rules.
- Active-session group visibility now keeps Main plus other groups visible to players, including empty groups.
- Greenroom/session chat carry-over and lifecycle markers were hardened for repeated `Greenroom -> Session -> Greenroom -> Session Restart` cycles.
- Fixed a frontend chat-state bug where a restarted session could miss its immediate `Session Start` marker until the next start/stop cycle because the marker was emitted before the new session topology had hydrated into Zustand state.
- Frontend integration coverage now includes repeated restart chronology assertions and start-transition topology re-hydration coverage.
- Runtime hardening priority remains group/session lifecycle determinism: group CRUD sync (runtime room CRUD), greenroom-only rendering out of session, greenroom default-effect lock, deterministic transition routing, and reconnect-safe presence/status state.
- Deferred UI debt for follow-up: Create Group popover styling has intermittent selector/specificity fragility in-session; short-term guard styles are acceptable for now, and a proper shared popover/panel styling pass is queued for post-hardening review.

**Scope**: Enhance Group selector/left-rail voice group UI with modern UX patterns (legacy component alias: `RoomSelector`): permission-aware player context menu, mobile-responsive collapse/expand, enhanced drag-n-drop feedback, environment icons, create group CTA, and full accessibility support.

Player context-menu spec alignment (2026-05-10):

- Canonical option matrix is documented in [docs/ui/UI-PLAYER-CONTEXT-MENU.md](docs/ui/UI-PLAYER-CONTEXT-MENU.md).
- Shared actions for all users: `Send Private Message`, `View Profile`.
- DM/Assistant DM actions: `Mute/Unmute`, `Clear Effects`, `Distance >`, `Condition >`, `Kick Player`, `Ban Player`.
- DM-only action: `Grant/Revoke DM Priv`.
- `Distance >` submenu options: `Default`, `Nearby`, `Visible`, `Far`.
- `Condition >` submenu includes `Default` and the full condition set, including `Silenced` routing behavior.
- Phase 2 delivered the baseline radial action surface; W0 follow-through now tracks parity with the full hierarchical menu contract.

Terminology note for this stage:

- User-facing term is **Group** (for example, Main, Scouts, In Jail).
- Existing technical component/API naming may still use `Room`/`rooms` during migration.
- Audio transport mapping reminder: a Group in product UX maps to a LiveKit Room for audio subscription/routing.

**Implementation Phases**:

| Phase                           | Timeline | Deliverables                                                                                                 | Status          |
| ------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ | --------------- |
| Phase 1: Core UI & Layout       | Week 1   | Group headers (env icon, create button), global broadcast icon+popover, condition badge+popover, env tooltip | Done            |
| Phase 2: Interactions           | Week 2   | Baseline context actions (right-click/long-press), condition picker, move selector, enhanced drag-n-drop     | Done            |
| Phase 3: Mobile & Adaptive      | Week 3   | Mobile collapse/expand (<768px), touch interactions, responsive popover positioning                          | Done            |
| Phase 4: Accessibility & Polish | Week 4   | ARIA labels, keyboard nav, reduced-motion support, WCAG AA contrast audit, screen reader testing             | Deferred to W10 |
| Phase 5: Testing & Hardening    | Week 5   | Error handling, reconnection edge cases, cross-browser testing, performance audit, E2E coverage              | Deferred to W10 |

**Key Decisions** (from UX review 2026-05-07):

- Mobile-first adaptive collapse (auto-collapse <768px, expand on desktop)
- Three viewport modes: Minimalist Mobile (`<=767px`), Balanced Player (`768px-1279px`, target `~900px`), DM Desktop Command (`>=1280px`)
- DM Desktop Command: keep exactly one right panel pinned open at all times and switch via right-edge icons
- DM Desktop Command defaults to last-used panel; DM auto-enabled and non-DM users can opt in
- Minimalist Mobile: compact left column (group icons + avatars + mute/meter), expandable full-width left overlay, bottom-docked right-panel icons
- Minimalist Mobile DM warning: one-time dismissible banner for non-optimal DM command experience
- Topbar popout model: Settings and Information are primary panel entry points
- Settings sections: `System | Profile` in topbar, with campaign/session/character settings in rightbar
- Campaign settings access: DM edits duration/auto-target in rightbar; players/spectators read-only by default
- Campaign metadata (name/description/banner) is edited in Information > Campaign
- Session settings popover: legacy path from session-header cog; canonical path is rightbar campaign/session settings
- Session timer override: may exceed campaign default with warning-only UX
- Information tabs: `Campaign | Notes | Journal | History` (Journal feature-flagged off by default)
- Search panel removed; search is built into Notes, Journal, and History tabs
- Tabbed panel/dialog contract: user-facing campaign/session screens use Radix UI Tabs (especially main/home campaign settings dialog)
- Admin tab contract: admin UI uses MUI Tabs (or approved MUI-equivalent tabs)
- UI decomposition contract: avoid monolithic component files; split tabbed screens into focused subcomponents
- Notes handout permissions: `PRIVATE | PARTY | SELECTED` (selected players may be offline)
- Campaign panel extension sync: enabled by default; DM can disable external updates
- Full drag-n-drop feedback: highlight zones + dim invalid + ghost preview
- Player context menu (right-click desktop / long-press mobile) with role-gated action visibility and grouped sections
- Distance submenu with `Default`, `Nearby`, `Visible`, `Far`
- Condition submenu with `Default` + full condition catalog, including `Silenced`
- Environment icons (compact, hover tooltip, DM click to edit)
- Broadcast state: global header icon control (DM only, hidden in greenroom)
- Create Group: icon button in group header (top-right)
- Sticky DM widget (always visible at top)
- Primary condition only visible + tooltip/popover for others
- Screen reader support priority (full ARIA labels)
- Greenroom policy: no additional groups can be created while session state is `IDLE`
- Greenroom rendering: DM appears in the same participant list as other users (no separate DM widget)
- Greenroom routing: treat greenroom as the only out-of-session group in the panel; it cannot be closed or moved into "Other Groups"
- Greenroom audio: neutral-only (no environment modifier, no DM condition/mute/broadcast overrides)
- Group close behavior (interim safety mode 2026-05-11): first close on a non-empty non-main group migrates remaining members to `MAIN` without deleting; a second close when empty deletes the group.

Naming conventions contract (2026-05-11):

- Product/UI naming is Group-first; Room remains legacy compatibility naming where runtime contracts still require it.
- New non-store modules should use Manager/Service/System/Engine naming by responsibility.
- New module/file naming should not use Slice unless the file is a direct Zustand slice implementation.
- Hard rule: any existing non-Zustand `*Slice` file must be renamed in the next refactor cycle when in scope.
- See [docs/meta/NAMING-CONVENTIONS.md](docs/meta/NAMING-CONVENTIONS.md).

Interim issue note and follow-up tasks (deferred to W10, 2026-05-11):

- Issue observed: delete-while-members-move sequencing in the group selector flow (`RoomSelector` legacy component) can produce race-prone UX under real multi-client timing.
- Temporary product behavior: two-step close for non-main groups (evacuate first, delete when empty) to protect player topology consistency.
- Follow-up task: replace local UI sequencing with a server-authoritative close-group contract + explicit WS reconciliation event for all clients.
- Follow-up task: add integration coverage for cross-client close-group reconciliation (initiator + observer clients) including retry/failure branches.
- Follow-up task: add backend audit/log hooks so group-close/evacuation transitions are captured for transcript and alignment pipelines.

**New Feature**: Campaign-scoped "Allow Conditions" setting (DM can disable conditions UI).

**Deferred W10 Follow-up**: Campaign-scoped DM setting for one-way group audio monitoring.

- Secondary groups (for example, "In Jail") may be configured to hear Main group audio.
- This is listen-only (no return audio path to Main by default).
- Intended as a narrative tool and should be opt-in per group.

**Backend Requirements (deferred to W10)**:

- Confirm condition apply/remove API endpoints exist
- Confirm DM broadcast mode toggle endpoint exists
- Create `CampaignSettings` table for allow/disallow features
- Add `GET/PATCH /api/campaigns/{id}/settings` endpoints

**Frontend Components** (existing + new):

- ✅ RoomSelector.tsx (group selector; enhanced — Phase 1–3 complete: env icons, broadcast, create, radial menu, drag-n-drop, mobile collapse)
- ✅ AvatarOverlay.tsx (exists, reuse for DM + players)
- ✅ Tooltip infrastructure (exists, enhanced for env icons)
- ✅ ConditionPopover.tsx (implemented via RadialMenu condition mode)
- ✅ RadialMenu.tsx (exists — right-click + long-press, condition/move/mute, viewport clamping)
- ✅ CreateGroupModal.tsx (exists, functional)
- 🆕 CampaignSettingsPanel.tsx (new, with condition toggle)
- 🆕 PlayerContextMenu parity pass (align baseline radial interaction to canonical option matrix + nested submenus)

**Closeout Summary**:

- Phase 1–3 delivered and retained in the current build baseline.
- Voice group interactions now cover group headers, context actions, drag-and-drop, mobile collapse/expand, whisper handling, and DM voice routing.
- The remaining validation and polish items are non-blocking and have been deferred to W10.

**Deferred to W10**:

- Accessibility polish: ARIA labels, keyboard nav, reduced-motion support, WCAG AA audit, and screen reader passes.
- Hardening pass: reconnection edge cases, cross-browser verification, performance audit, and E2E coverage.
- UI follow-up: create-group popover selector/specificity polish and any remaining shared panel token cleanup.
- Close-group follow-up: server-authoritative close-group contract, explicit WS reconciliation event, and cross-client retry/failure coverage.
- Audit follow-up: backend audit/log hooks for group close and evacuation transitions.
- Optional narrative follow-up: campaign-scoped one-way group audio monitoring.

**Note**: The prior W0 checklist items above are intentionally closed out here instead of remaining as open W0 backlog.

---

### W0 Subtask: Topbar Settings and Information Panels

**Status**: First-pass scaffold delivered; cleanup and role-gating pass completed (2026-05-13)
**Related Docs**: [UI-LAYOUT.md](docs/ui/UI-LAYOUT.md), [UI-FLOWS.md](docs/ui/UI-FLOWS.md), [UI-COMPONENTS.md](docs/ui/UI-COMPONENTS.md), [UI-COMPONENT-PROPS.md](docs/ui/UI-COMPONENT-PROPS.md), [UI-COMPONENT-INTERFACES.md](docs/ui/UI-COMPONENT-INTERFACES.md)

**Scope**: Implement and harden the topbar-driven popout panel model with Settings as primary entry points.

Current implementation boundary (2026-05-08 first pass):

- Non-Journal/History surfaces are being reset to campaign-scoped placeholder scaffolds to reduce UI noise while final information architecture is built.
- Session context is intentionally restricted to Journal/History (and the small DM session popover for name/timer controls).
- Campaign UI surfaces currently tracked in this workstream are the topbar timer, topbar Settings panel, chat start/stop and pause/resume bookends, chat message visibility, chat message creation, and the rightbar Notes/Journal panels.

**Delivery checklist**:

- [x] Topbar timer is visible and state-accurate (`INACTIVE`, `ACTIVE`, `PAUSED`, `ENDED`).
- [x] `INACTIVE` timer starts from first DM/player greenroom join for next-session readiness and has no timer popper.
- [x] `ACTIVE` timer resets to zero on session start and remains synchronized across reconnect/refresh.
- [x] `PAUSED` switches primary timer to paused elapsed (distinct color) while active elapsed remains available in timer popper.
- [x] `ENDED` shows cooldown countdown and supports extend/cancel controls (player fallback rights if DM disconnects).
- [x] Timer popper (enabled in `ACTIVE|PAUSED|ENDED`) shows start time, cumulative pause time, pause count, expected end (rounded to nearest 15 mins), and time left.
- [ ] **Topbar Layer** (`<SettingsPanel />` and `<UserProfile />`):
  - [x] User profile settings (name, avatar, email/password) editable outside campaigns.
  - [ ] System defaults templates editable only outside campaigns (never mutate existing campaigns).
  - [x] All personas can edit own user profile settings.
- [ ] **Rightbar Layer** (`<CampaignRightbarSettings />`):
  - [x] Campaign settings (default session duration, audio auto-target toggle) DM-editable.
  - [x] Session settings (name, planned duration) DM-editable only during `INACTIVE|ACTIVE|PAUSED` states.
  - [x] Session values persist in backend and restore for next session.
  - [x] Players can view but not edit session planned duration.
  - [x] Character settings (name, race, class, level, stats, avatar) player-editable in rightbar.
  - [x] Character defaults fallback to Human/Fighter/Level 1/8 (all stats) if blank.
  - [x] Character values supersede user profile defaults when present.
- [ ] Information Campaign tab owns campaign metadata editing (name, description, poster image) for DM.
- [ ] Information Campaign tab edits happen in-panel with explicit Save/Cancel (no autosave).
- [ ] Information Campaign description editor remains intentionally simple (bold/italic/lists only).
- [x] Information Campaign tab shows compact read-only campaign stats for all personas:
  - total campaign length (sum of active session durations)
  - player count
  - session count
  - completed session count
  - next session ETA (when available)
- [ ] Campaign stat explanatory copy is hidden in tooltip/popper help (definition only).
- [x] Chat lifecycle bookends render for `Session Started`, `Session Ended`, `Session Paused`, and `Session Resumed` transitions.
- [x] Chat message visibility matches persona and group membership rules (runtime room membership).
- [x] Chat message creation uses the canonical composer surface.
- [ ] Information tab order is canonical: `Campaign | Notes | Journal | History`.
- [ ] Search panel is removed; per-tab search exists in Notes, Journal, and History.
- [ ] Journal is feature-flagged off by default.
- [ ] Notes panel supports `ADD | DELETE | EDIT | SHARE`, required fields (`Name`, `Content`, `Hashtags`, `Attachments`), markdown helper toolbar, and hashtag autocomplete from campaign tag history.
- [ ] Notes handout permissions enforce `PRIVATE | PARTY | SELECTED | SPECTATORS` with offline roster targeting support.
- [ ] Notes handout shares emit a one-time recipients-only chat card (surface event) without changing note visibility.
- [ ] Notes support attached images and PDFs with inline markdown rendering via attachment tokens.
- [ ] Notes detail view has a clear `X` close action and can expand to support list + note view while preserving 900px target shell behavior.
- [ ] Journal is one entry per session chapter (`Name` bound to session name), uses the same markdown editor contract as Notes, and supports hashtags + attachments.
- [ ] Journal visibility defaults to DM, players, and spectators; DM is the canonical author/editor.
- [ ] Notes and Journal use basic text search only (`Name + Content + Hashtags`) in this stage; advanced filters are deferred.
- [ ] History is read-only, searchable, starts from bottom, and dynamically loads one session at a time while preserving privacy rules.
- [ ] Rightbar Notes panel remains available from the Information surface.
- [ ] Rightbar Journal panel remains available from the Information surface.
- [ ] DM home campaign settings dialog includes Notes and Journal in dedicated tabs.
- [x] Campaign-specific rightbar settings are mirrored in DM home campaign settings dialog.
- [ ] User-facing campaign/session tabbed panel/dialog screens use Radix UI Tabs (main campaign settings dialog is mandatory).
- [ ] Admin tabbed screens use MUI Tabs (or approved MUI-equivalent tabs).
- [ ] Tabbed screens and info/rightbar implementations are split into focused components (no monolithic files).
- [ ] Naming migrations follow Group-first UI terminology and Manager/Service/System/Engine module naming guidance.
- [ ] Any non-Zustand `*Slice` file in refactor scope is renamed in that cycle.
- [ ] Dark and light themes adapt correctly across all UI elements, including chat bubbles and campaign poster/banner backgrounds.
- [ ] Theme switch validation is completed for all touched surfaces before sign-off.
- [ ] No hard-coded one-mode colors remain in shared user-facing UI surfaces.

Recent delivery notes:

- Topbar timer and user settings modal are now live and server-synced.
- Topbar Information now shows a real campaign panel with stats and a DM edit entry point into campaign settings.
- Rightbar campaign settings now has a dedicated component for DM auto-target, session name/description/planned-duration editing, and character settings editing.
- Session metadata persistence is wired via backend `PATCH /api/session/:id` for name, description, and planned duration.
- Campaign home settings dialog now mirrors rightbar character settings for DM workflow parity.
- SearchPanel component removed from UI (search now integrated into Notes/Journal/History tabs).
- Right-rail panel now dismisses on click-outside (backdrop click closes the panel).
- Settings panel is now role-gated: DM sees Session + Voice Targeting sections, Player/Spectator see Character section only.
- All targeted tests passing for right-rail behavior, session integration, and knowledge panel functionality.

Notes/Journal contract lock-in (2026-05-14):

- Journal is a single per-session artifact; it links to the session chapter name and uses the same editor model as Notes.
- Notes and Journal require `Name`, markdown `Content`, space-separated `Hashtags`, and `Attachments` (images + PDFs).
- Editor UX defaults to rich markdown with helper toolbar and an explicit raw-markdown toggle.
- External links are blocked in both toolbar affordances and markdown render/sanitize pipeline.
- Notes sharing supports `PRIVATE | PARTY | SELECTED | SPECTATORS`.
- DM handout shares surface as one-time recipients-only chat cards to improve timeline discoverability.
- Search scope for this stage is intentionally basic: text search over `Name`, `Content`, and `Hashtags`.

Campaign Info panel contract lock-in (2026-05-14):

- Panel is visible to DM, players, and spectators.
- DM can edit campaign name, description, and poster in this panel only.
- Description editing is intentionally minimal and supports only bold, italic, bullet list, and numbered list formatting.
- Poster controls support upload, replace, and remove.
- Stats are intentionally compact and include total campaign length, players, sessions, completed sessions, and next session ETA.
- Stat definitions are hidden behind popper/tooltip help to keep the surface visually simple.

**Definition of done**:

- All checklist items marked complete.
- All contract documents updated and validated.
- Frontend component stubs created and wired to state.
- Backend API endpoints implemented and tested.
- Integration tests cover session transitions and persona visibility.

**Documentation References**:

- [SESSION-LIFECYCLE.md](docs/architecture/SESSION-LIFECYCLE.md) — Session state machine and timer contract
- [STATE-MACHINE.md](docs/changes/STATE-MACHINE.md) — Backend field definitions and spectator rules
- [UI-COMPONENTS.md](docs/ui/UI-COMPONENTS.md) — Component visibility matrix and behavior specs
- [UI-LAYOUT.md](docs/ui/UI-LAYOUT.md) — Topbar/rightbar layout and timer display rules
- [DM-CAMPAIGN-SETTINGS.md](docs/ui/DM-CAMPAIGN-SETTINGS.md) — Three-layer settings architecture (topbar/rightbar/toggles)
- [CHAT-CONTRACT.md](docs/architecture/CHAT-CONTRACT.md) — Canonical live-session chat contract, delivery metadata, remembered timeline, typing indicators, and boundary markers

---

- UX behavior matches W0 key decisions.
- Access control rules are enforced in UI behavior and API contract usage.
- Cross-persona/read-only behaviors are covered by UI tests and docs parity checks.

---

### W0 Substask: Radix UI Component Audit and Migration

**Status**: Discovery + initial implementation (2026-05-12); ongoing migration pathway
**Related Docs**: [core-ui/index.ts](frontend/src/core-ui/index.ts), [UI-COMPONENTS.md](docs/ui/UI-COMPONENTS.md)

**Scope**: Audit existing custom and legacy UI components; establish a standardized Radix UI-first component library to improve accessibility, consistency, and maintainability across the codebase.

**Replacement decision policy (required before migration)**:

- Radix adoption is **default-preferred**, not blanket-mandatory for every feature component.
- For each audited component, explicitly classify as one of:
  - **Replace**: move fully to Radix wrapper(s).
  - **Hybridize**: keep feature shell logic but replace eligible interaction primitives (tooltip/menu/popover/dialog) with Radix wrappers.
  - **Retain**: keep existing implementation when replacement would break behavior, role-gating, timing semantics, or complex interaction contracts.
- Each decision must be documented in the migration PR summary with rationale and regression checks.
- High-risk surfaces (especially toolbars) require a behavior parity checklist before any replacement begins.

**Rationale**:

- Current UI is a mix of custom components, Radix primitives, and Material UI (admin only). Consolidation on Radix for frontend UX surfaces reduces maintenance burden and improves accessibility/WCAG compliance.
- Radix provides unstyled, accessible primitives that scale with the codebase and avoid vendor lock-in to framework-specific component libraries.
- Component inventory audit enables roadmap prioritization and prevents ad-hoc reimplementation of existing functionality.

**Phase 1: Component Inventory & Assessment** (2026-05-12)

**Toolbar caution (special-usecase exception)**:

- Toolbars often coordinate persona-aware controls, live connection indicators, keyboard shortcuts, focus choreography, and DM/spectator gating.
- Do **not** force a full toolbar primitive swap if it risks regressions.
- Prefer **Hybridize** for toolbars: retain orchestration/container logic and migrate only safe internal primitives to Radix wrappers.
- Full toolbar replacement is allowed only after parity is verified for role visibility, state transitions, shortcut behavior, and responsive collapse/overflow behavior.

**Current core-ui exports**:

- `dialog` — Radix Dialog wrapper (modal behavior)
- `separator` — Radix Separator wrapper (visual divider)
- `tabs` — Radix Tabs wrapper (tabbed interface)
- `tooltip` — Radix Tooltip wrapper (hover/focus disclosure)

**Identified custom/legacy components requiring audit**:

- `RadialMenu.tsx` (custom context-menu radial widget) — **Completed replacement** with Radix Context Menu (2026-05-12)
  - New: `PlayerContextMenu.tsx` + `PlayerContextMenuContent.tsx` (nested submenus for Move, Distance, Condition)
  - Benefit: keyboard navigation, full accessibility, semantic menu role structure
  - Dependency added: `@radix-ui/react-context-menu@^2.2.16`
  - Tests updated for Radix `menuitem` role (replaced custom button role)
- `CreateGroupModal.tsx` (existing, likely needs audit for form patterns)
- `EnvironmentPicker.tsx` (if exists; needs assessment for combobox vs custom selector)
- Audio/Broadcast/Condition popovers (assess for Radix Popover migration)
- Chat composer and message bubbles (assess for potential Radix form/composition improvements)

**Phase 2: Migration Roadmap**

| Priority | Component                | Target Radix Primitive               | Estimated Effort | Timeline      |
| -------- | ------------------------ | ------------------------------------ | ---------------- | ------------- |
| 1        | Environment picker       | Radix Select or custom Popover       | Medium           | W0 (ongoing)  |
| 2        | Audio settings popover   | Radix Popover                        | Small            | W0 finish     |
| 3        | Broadcast state toggle   | Radix Toggle or custom button        | Small            | W0 finish     |
| 4        | Create Group modal form  | Radix Dialog + form patterns         | Medium           | W0 finish     |
| 5        | Chat composer textarea   | Radix Textarea (if available) or btn | Small            | W0/W4 buffer  |
| 6        | Session settings popover | Radix Popover                        | Small            | W0 finish     |
| 7        | Player list filters      | Radix Select or custom checkbox list | Medium           | W1 (optional) |

**Phase 3: Standardization Guidelines**

- **core-ui patterns**: Each Radix primitive gets a thin frontend-specific wrapper in `frontend/src/core-ui/` that applies theming, dark-mode support, and VTT-Chat design tokens.
- **Naming convention**: Wrappers use PascalCase component names matching Radix conventions (e.g., `Dialog`, `Popover`, `Select`).
- **Token consistency**: All Radix-wrapped components consume shared CSS variables (`--color-*`, `--radius-*`, `--shadow-*`) from [frontend/src/styles/tokens.css](frontend/src/styles/tokens.css).
- **Accessibility first**: Every migrated component must pass WCAG AA keyboard nav, focus management, and screen-reader tests.
- **Deprecation path**: Mark legacy custom components as deprecated in comments with migration guidance, but retain until replacement is shipped and tested.

**Phase 4: Testing and Validation**

- [ ] Migrated components pass existing interaction/role tests without modification.
- [ ] New Radix-wrapped components have unit tests for state, keyboard nav, and accessibility attributes.
- [ ] Integration tests verify role-gated visibility (DM-only actions, persona permissions).
- [ ] Dark/light theme adaptation validated for all new surfaces.
- [ ] No regressions in existing contextual-menu test suite after initial `PlayerContextMenu` replacement.

**Definition of done (per migration)**:

- Component has explicit decision outcome: Replace, Hybridize, or Retain (with rationale).
- If Replace/Hybridize: adopted interaction primitives use Radix equivalents via core-ui wrappers.
- All usages updated to new component interface.
- Tests updated for new accessibility role attributes and keyboard behavior.
- Theme/token validation confirmed.
- Legacy custom component is marked deprecated or removed (depending on usage extent) when Replace is selected.
- PR includes migration summary and any breaking changes to component API.

**Latest Delivered (Phase 1, 2026-05-12)**:

- ✅ Replaced custom `RadialMenu` context-menu widget with `PlayerContextMenu` + `PlayerContextMenuContent` Radix-based components.
  - Added `@radix-ui/react-context-menu@^2.2.16` dependency.
  - Implemented nested submenus for Move (room targets), Distance (Default/Nearby/Visible/Far), and Condition (condition catalog).
  - Wired player-only context-menu trigger (role label = PLAYER) with DM-gated action sections (Mute/Unmute, Clear Effects, Kick, Ban, Grant/Revoke DM Priv).
  - Shared action items for all viewers: Send Private Message, View Profile (currently placeholder "not wired yet" handlers).
  - Added Radix context-menu styles to [frontend/src/styles/components/rooms/RoomSelector.css](frontend/src/styles/components/rooms/RoomSelector.css).
  - Updated [frontend/src/tests/components/RoomPresenceUi.test.tsx](frontend/src/tests/components/RoomPresenceUi.test.tsx) to query by `menuitem` role (Radix semantic role) instead of `button`.
  - Frontend tests pass: 30 tests, 0 failures.
  - Frontend build passes: no TypeScript or bundler errors.

**Next Steps (Phase 2)**:

1. Audit environment-picker interaction patterns for Radix Select vs custom Popover (depends on expected interaction breadth).
2. Assess audio settings popover for Radix Popover + form primitive migration.
3. Review create-group modal form for Radix Dialog + Radix Form patterns (Radix does not have built-in form; consider Zod + react-hook-form).
4. Schedule broader accessibility pass on topbar/rightbar surfaces as part of W4 regression hardening.

---

### Latest Delivered (W0 Radix Audit) — 2026-05-12

- ✅ **W0 Substask: Player Context Menu Radix Migration** — Replaced custom `RadialMenu` with Radix-based `PlayerContextMenu` + `PlayerContextMenuContent` providing semantic nested submenus (Move, Distance, Condition), full keyboard navigation, and ARIA accessibility attributes. Shared actions (`Send Private Message`, `View Profile`) and DM-gated actions (`Mute/Unmute`, `Clear Effects`, `Distance >`, `Condition >`, `Kick`, `Ban`, `Grant/Revoke DM Priv`) now use Radix `ContextMenu`, `SubTrigger`, `SubContent`, and `Item` primitives. Tests updated for Radix `menuitem` role. All 30 RoomPresence UI tests pass; frontend build green. Component audit inventory established; Phase 2 migration roadmap (environment picker, audio settings, broadcast toggle, create group form) scheduled for W0 close-out.

### Latest Delivered (W1/W2) — 2026-05-09

- Enforced strict session/greenroom boundary marker separation in frontend runtime: session boundary bookends (`[Session Started|Paused|Resumed|Ended]`) are now MAIN-room only and no longer written, restored, or carried into Greenroom (`frontend/src/components/session/SessionInit.tsx`, `frontend/src/components/chat/ChatWindow.tsx`, `frontend/src/tests/components/SessionBookends.integration.test.tsx`).
- Implemented DEV-only auto-mock session population for DM testing flows: when DM joins a session in development, 3–5 randomized mock players are auto-enrolled using normal session membership + room presence pathways (`backend/src/api/session.routes.ts`, `backend/src/services/dev-mock-players.service.ts`).
- Added D&D-style randomized mock profile generation (>=20 archetype variations with race/class/subclass + level metadata constrained within a 2-level band) and campaign character/membership hydration so mocks appear as realistic players in DM UI (`backend/src/services/dev-mock-players.service.ts`).
- Fixed backend session membership lifecycle integration tests: added missing `ensureSessionWhisperRoomForSession` and `deletePrivateRoomsForEndedSession` mocks to `room.service`, and added `resolveEffectiveSessionRole` mock (with `ok: true`) to `session-authz.service` — all 3 membership lifecycle tests now pass (`backend/tests/integration/session-membership-role-lifecycle.integration.test.ts`).
- Expanded audio WS event handler test coverage: added `handleEnvironmentSet` (with/without `parameters` branches), `handleDMOverrideApplied`, `handleDMOverrideRemoved`, `handleBroadcastStateChanged`, `resetSessionAudioState` (preserves `roomEnvironmentNames`), and `replaceDMOverrides` tests (`frontend/src/tests/state/audioSlice.test.ts` — 19 tests).
- Added new WS event dispatcher test suite covering exact-match dispatch, namespace wildcard (`CHAT:*`), global wildcard (`*`), multi-handler fanout, unregister, envelope validation (bad version/missing fields/zero timestamp), and handler error isolation (`frontend/src/tests/ws/dispatcher.test.ts` — 14 tests).

### Latest Delivered (W1/W2) — 2026-05-08

- Hardened frontend session-flow runtime behavior and chat-bookend rendering: session topology now re-hydrates on state transitions, active players can see empty voice groups, and restarted sessions no longer lose their immediate `Session Start` marker due to pre-hydration Zustand timing (`frontend/src/components/session/SessionInit.tsx`, `frontend/src/components/session/SessionLeftRailPanel.tsx`, `frontend/src/tests/components/SessionInit.integration.test.tsx`, `frontend/src/tests/components/SessionBookends.integration.test.tsx`).
- Fixed session bookend dedupe so repeated pause/resume cycles are no longer suppressed after reconnect/refresh: dedupe now collapses only near-duplicate boundary echoes and allows legitimate later markers (`frontend/src/state/chatSlice.ts`, `frontend/src/components/session/SessionInit.tsx`, `frontend/src/tests/state/chatSlice.test.ts`).
- Added a small debug-visible failed outgoing chat queue surface with per-message retry/dismiss controls so local send failures are visible and operable in UI (`frontend/src/components/chat/ChatWindow.tsx`, `frontend/src/styles/components/chat/ChatWindow.css`).
- Added backend multi-client reconnect soak suite for concurrent reconnect fanout, session isolation, and FIFO recovery behavior (`backend/tests/integration/multi-client-reconnect.integration.test.ts`).
- Added backend audio-state persistence/recovery soak suite for environment + DM override + broadcast lifecycle recovery (`backend/tests/integration/audio-state-recovery.integration.test.ts`).
- Added expanded API coverage for presence and rooms route auth/validation/edge paths (`backend/tests/api/presence-routes.test.ts`, `backend/tests/api/rooms-routes.test.ts`).
- Added explicit non-functional authz boundary suite for audio DM-only control surfaces (`backend/tests/api/audio-authz-boundaries.test.ts`).
- Added workspace QA artifact for per-package coverage and threshold deltas (`scripts/qa/coverage-report.cjs`) and root scripts `qa:coverage-report` / `qa:coverage-report:json`.
- Raised backend coverage thresholds to match current baseline signal and enforce gate floor in CI/local runs.

### Latest Delivered (W6)

- Added versioned API mounts for auth/session/presence/rooms/audio/livekit/integrations under `/api/*` while retaining compatibility mounts for legacy paths.
- Added normalized member-style aliases for session and room operations, plus normalized aliases for audio operations.
- Split guest auth flow into role-oriented backend services (`guest-auth.extension`, `guest-auth.player`, `guest-auth.spectator`, `guest-auth.account-upgrade`) behind the `guest-auth.service.ts` facade.
- Migrated frontend LiveKit token requests to `/api/livekit/token`.
- Migrated admin integrations operations to `/admin/api/integrations/*` and added backend admin alias support.
- Added centralized API-index mount contract tests to validate canonical route consistency in one suite.

## 4) Detailed Backlog

### W0: Frontend Surface Completion

1. Finish right-panel screens and layouts that are currently non-functional or not production-ready.
2. Roll out topbar Settings and Information panel entry model, including canonical Information tab order and Journal feature-flag behavior.
3. Rework global user settings so the same settings surface works both in-session and out-of-session.
4. Add campaign settings access controls (DM edit, non-DM read-only default, DM hide option) and include user profile flow ownership.
5. Add session settings cog popover with DM edit permissions, non-DM read-only visibility, and timer-override warning behavior.
6. Consolidate websocket/audio connection indicators into a coherent status model with one primary status icon. - Done
7. Implement the connection-state color matrix exactly as defined in Section 0 (Connection Status Icon Rules), including subtle LiveKit/audio signal treatment. - Done

#### W0 Next Concrete Breakdown: Notes and Journal (2026-05-14)

Implementation reference:

- [docs/changes/NOTES-JOURNAL-IMPLEMENTATION-CHECKLIST.md](docs/changes/NOTES-JOURNAL-IMPLEMENTATION-CHECKLIST.md)

Execution tasks (W0-now):

1. Shared contract alignment:

- Introduce dedicated notes event contract module and add `NOTES:HANDOUT_SURFACED`.
- Normalize event naming across shared/backend/frontend/tests (`NOTES:CREATED|UPDATED|DELETED|SHARED`).

2. Backend notes + journal contract pass:

- Extend notes payload contract to required fields (`Name`, markdown `Content`, `Hashtags`, `Attachments`).
- Implement session-journal one-entry-per-session behavior and DM-authoritative edit rules.
- Add explicit share/surface endpoints and recipients-only fanout semantics.

3. Frontend authoring UX pass:

- Add rich markdown editor with helper toolbar and raw-markdown toggle.
- Implement hashtag autocomplete and basic search (`Name + Content + Hashtags`).
- Support attachment rendering (images inline, PDFs as inline card/embed where supported).

4. Chat surfacing pass:

- Render one-time recipients-only handout card on DM share.
- Auto-generate handout card excerpt by default; allow optional DM override before send.
- Prevent duplicate card surfacing during reconnect/hydration.

5. W0 acceptance tests:

- Add/extend notes/journal state and component tests for required fields, visibility scopes, editor behavior, and handout surfacing.

Definition of done:

- High-use right-panel screens are functionally complete and interaction-tested.
- Global user settings + profile flows are usable both inside and outside session context.
- Topbar Settings/Information panel behavior is complete and persona-permission tested.
- Session settings popover behavior is complete and persona-permission tested.
- Main status icon behavior matches the defined outside-campaign and inside-campaign matrix.
- Audio/LiveKit indicator remains subtle while still escalating the main status icon on true audio-connection failure.

### W11: Runtime State and Audit Contract (High Priority)

1. Adopt [docs/architecture/RUNTIME-STATE-AND-AUDIT-CONTRACT.md](docs/architecture/RUNTIME-STATE-AND-AUDIT-CONTRACT.md) as the implementation checklist baseline. - Done
2. Classify websocket-visible backend route families and event families into Class A/B/C and mark delivery status in the matrix. - In Progress
3. Enforce Redis-first mutation order for domain actions: validate -> Redis update -> audit append -> websocket publish -> required Postgres durability. - In Progress
4. Define per-family Redis key contracts (key naming, TTL policy, invalidation, cleanup ownership). - Done
5. Define per-family durability mode (`inline` vs `bounded flush`) and retry/idempotency semantics. - In Progress
6. Define and enforce a session-audit action taxonomy for room, presence, audio, chat, notes/journal/history, and session lifecycle actions. - In Progress
7. Add integration tests for all in-scope families asserting Redis state, websocket fanout, durable persistence (where required), and audit append behavior. - In Progress
8. Validate reconnect behavior against backend-authoritative recovery (Redis runtime + durable fallback) and eliminate client-local drift assumptions. - Done
9. State-machine residual (priority P0): implement backend server-side mute enforcement in webhook/audio pipeline and reject or ignore muted audio packets. - Done (2026-05-14: LiveKit token issuance now enforces `canPublish=false` when `userMuted || dmMuted`)
10. State-machine residual (priority P0): on ENDED transition, dispatch recording shutdown plus summary/close-out work asynchronously before returning control-path response. - In Progress
11. State-machine residual (priority P1): verify and enforce environment sync contract on room change (join response and SessionInit projection behavior) to avoid stale ambience/effect projections. - In Progress

Definition of done:

- Route/event family matrix is complete with no unknown storage class assignments for websocket-visible domain flows.
- Redis-first mutation flow is implemented and tested for all high-traffic runtime families.
- Session audit coverage includes all meaningful control-plane actions (join/leave, move, mute/unmute, lifecycle boundaries, message and note mutations).
- Privacy constraints remain enforced (off-the-record content is not leaked into durable transcript/history while control-plane audit remains available).
- Operability checks exist for flush failures, dead-letter/retry paths, and restart recovery.

### W1: Hardening and Reliability

1. Add multi-client reconnect soak scenario for rooms/presence topology recovery. - Done
2. Add audio-state persistence and recovery soak assertions around `GET /api/audio/state/:sessionId`. - Done
3. Verify reconnect fanout behavior under concurrent transitions. - Done
4. Capture pass/fail thresholds and flaky-test handling policy. - Done
5. Expand broader multi-client e2e/load matrix for reconnect/recovery and transition fanout behavior (network loss, restart, burst reconnect, and cross-session isolation). - In Progress
6. Introduce schema-based backend environment validation with Zod for startup-time fail-fast config checks. - Planned
7. Migrate backend runtime logging to Pino for structured JSON logs and consistent level/transport control. - Planned

Current implementation snapshot (2026-05-08):

- Environment validation: Partial. Backend currently uses manual env parsing and required-variable checks in [backend/src/infra/config/env.ts](backend/src/infra/config/env.ts).
- Backend logging engine: Partial. Backend currently uses a custom in-memory/logger utility in [backend/src/utils/logger.ts](backend/src/utils/logger.ts); Pino is not yet adopted.

Definition of done:

- Soak suites are stable and repeatable.
- No critical reconnect or state-loss defects in repeated runs.
- Backend env validation uses a schema-first contract and fails fast on invalid/missing config in target environments.
- Backend structured logs are Pino-based and compatible with existing operational/admin telemetry consumption patterns.

### W2: Testing Program and Gates

1. Add a workspace test report artifact with per-package test and coverage deltas. - Done
2. Define release-gate thresholds for backend/frontend/admin test pass and critical-path suites. - Done
3. Add explicit non-functional checks for authz boundaries and high-risk error paths. - Done
4. Track and burn down flaky tests to agreed threshold. - In Progress
5. Expand frontend/backend automated coverage for refactor-sensitive paths (store selectors, integration hooks, API naming migration behavior). - In Progress
6. State-machine residual (priority P1): add cleanup-job integration coverage for ENDED -> CLEANUP detection and greenroom purge on schedule.
7. State-machine residual (priority P1): add spectator cooldown end-to-end coverage (ENDED window behavior, expiry/early-end, disconnect + cleanup transition).
8. State-machine residual (priority P1): add off-the-record regression coverage for paused and whisper runtime content hydration behavior.
9. State-machine residual (priority P2): add boundary marker persistence sequence coverage across start/pause/resume/end and refresh hydration.
10. State-machine residual (priority P2): add frontend state/rendering coverage for boundary marker timeline rendering, reconnect snapshot replacement semantics, and DM voice mode control interactions.

#### W2 Next Concrete Breakdown: Notes and Journal Gates (2026-05-14)

Gate reference:

- [docs/changes/NOTES-JOURNAL-IMPLEMENTATION-CHECKLIST.md](docs/changes/NOTES-JOURNAL-IMPLEMENTATION-CHECKLIST.md)

Must-pass suites and checks:

1. Backend route + WS integration:

- Extend [backend/tests/integration/notes-routes-ws.integration.test.ts](backend/tests/integration/notes-routes-ws.integration.test.ts) for recipients-only handout surfacing and new share scopes.
- Add journal route contract suite for one-per-session and DM-only edit authz.

2. Frontend state and UI contract:

- Update [frontend/tests/state/notesSlice.test.ts](frontend/tests/state/notesSlice.test.ts) to canonical notes event names.
- Add editor tests (toolbar actions, code-toggle, external-link blocking).
- Add chat integration test for one-time handout card visibility and dedupe.
- Add excerpt tests for auto-generation default and manual override.

3. WS/event contract drift checks:

- Add test assertions that disallow legacy `NOTES:NOTE_CREATED`-style event names.
- Verify shared/backend/frontend event catalogs match exactly.

4. Release gate execution:

- `npm --prefix backend run test`
- `npm --prefix frontend run test`
- `npm run qa:coverage-report`

5. Exit gate criteria:

- No notes/journal contract drift across docs, routes, shared events, and frontend handlers.
- No recipients-leak regressions for handout surfacing cards.
- Excerpt generation is deterministic and safe (no external-link leakage in surfaced excerpt text).
- Stable pass rate across reruns for new notes/journal suites.

Definition of done:

- Merge/release gates are documented, automated, and consistently enforced.

### W3: Operatisation and Runbooks

1. Add restart-survival validation for telemetry and diagnostic sinks.
2. Finalize operator runbooks for backup/restore, telemetry verification, and incident triage.
3. Add CI/release check for Prisma schema and migration parity (`prisma migrate status`).
4. Validate environment/config checklists for deployment and recovery drills.
5. Publish telemetry component matrix that defines what is tracked, why each signal is collected, and how the signal is consumed in dashboards/alerts/runbooks.

Definition of done:

- Operations checks are scripted or procedural with reproducible outcomes.
- Runbooks are current and validated against runtime behavior.
- Telemetry matrix is current and maps each signal to an operational decision or quality gate.

### W4: UI Modernization Completion

1. Close remaining UI regression gaps on migrated surfaces.
2. Run accessibility and responsive smoke passes on high-use flows.
3. Ensure token/theming consistency remains stable during hardening changes.
4. Keep framework boundaries enforced (frontend core UI vs admin MUI).
5. Refactor audio panel, campaign settings panel, and right-side panel UX so interactions are coherent and reliably functional.
6. Resolve Create Group popover CSS reliability (selector scope, stacking-context behavior, and shared panel token parity with Audio Settings style contract).
7. State-machine residual (priority P2): finalize spectator wait/cooldown UX parity (countdown + campaign setting affordances + DM-only control clarity) and close remaining polish gaps.

Definition of done:

- No unresolved high-severity UI regressions in core flows.
- Accessibility and responsive baseline checks are documented and repeatable.

### W5: User Documentation (New Stage Scope)

1. Create end-user guides:
   - DM quickstart and session controls
   - Player quickstart and participation flow
   - Spectator join/watch guide
2. Create extension-facing user docs:
   - Install and first-run flow
   - Invite/code flow and account upgrade flow
3. Create troubleshooting docs:
   - Audio/connectivity issues
   - Reconnect/recovery expectations
   - Common auth and invite issues
4. Add documentation QA checklist for every release candidate.

Definition of done:

- User docs are complete, navigable, and validated against shipped runtime behavior.
- Release checklist includes user-doc accuracy verification.

### W6: Refactor and Simplification

Status: Completed baseline. Remaining items are tracked in active workstreams so this stage can stay closed.

Delivered baseline:

1. Standardized frontend shared runtime state on canonical Zustand store/selectors for session, presence, group (runtime room), audio, and UI concerns.
2. Refactored oversized frontend audio surfaces into focused component/module boundaries.
3. Aligned frontend and backend naming with canonical non-versioned API paths while retaining intentional compatibility aliases.
4. Added migration-safe compatibility tests and route-mount contract coverage for active route families.

Follow-up tracking (moved from this stage):

1. W1: continue reconnect/recovery soak expansion for multi-client stress and cross-session isolation.
2. W2: continue refactor-sensitive coverage expansion (selectors, integration hooks, migration behavior).
3. W3: finalize legacy-path deprecation policy and sunset execution via runbook + telemetry gate.
4. Consolidate reusable constants and shared common logic into `shared/` where cross-frontend/backend reuse is intended, with migration checklist coverage to preserve behavioral parity.
5. Break oversized session/voice components into task-focused sub-components with explicit ownership boundaries (for example, group selector flow (`RoomSelector` legacy component) split into list rendering, group actions, delete/close flow controller, and move/reconcile controller).
6. Introduce a small orchestration layer for close/delete/move async flows so UI components do not own transport timing/retry logic directly.
7. Add component-map complexity caps (max file length/concern count) and enforce with refactor checklists in PR reviews.

Definition of done:

- Cross-component runtime state uses canonical store selectors for shared concerns.
- Targeted frontend/backend modules are renamed and reorganized without behavior regressions.
- Refactor-related tests pass and coverage trend improves on changed modules.
- API route inventory is documented, canonical path mapping is complete, and legacy compatibility paths are explicitly tracked with deprecation notes/tests pending planned sunset in W3.
- Reusable cross-app constants/common logic are centralized in `shared/` and consumed consistently by frontend and backend where applicable.

### W7: Admin Operations UX Review

1. Review admin console information hierarchy for operator-critical tasks (triage, user action, incident response, and settings safety).
2. Review task completion flows for high-impact operations (suspend/restore, force logout, archive/restore, backup/export, and integration authorization).
3. Review alerting and status clarity to ensure incidents are visible, prioritized, and actionable.
4. Review auditability visibility so operators can trace action -> effect -> evidence without ambiguity.
5. Review failure-state UX (timeouts, partial success, retries, and rollback guidance) for operator confidence under stress.
6. Review accessibility and keyboard-first workflows for operational efficiency.
7. Consolidate reusable admin constants into an admin-specific central constants module, using `shared/` only for truly cross-app contracts and utilities.

Definition of done:

- Admin operations UX findings are documented with severity, rationale, and recommended remediation.
- Critical/high findings are scheduled or resolved with verification notes.
- Updated operator flow guidance is reflected in docs and test checklists.
- Admin constants usage is consistent through the admin-specific constants module, with explicit boundaries documented for admin-only vs `shared/` reuse.

### W8: Localization Foundation

1. Define localization architecture and boundaries (shared message catalog strategy, frontend consumption pattern, fallback policy).
2. Introduce translation key conventions and lint/check rules to prevent hard-coded user-facing strings in new UI changes.
3. Add language switch scaffolding and persistence behavior (user preference and safe default/fallback locale).
4. Build extraction and validation tooling for translation catalogs (missing key detection and stale key cleanup workflow).
5. Localize high-traffic UI surfaces first (auth, campaign list, session shell, voice group panel, admin critical workflows).
6. Add pseudo-localization test mode for layout stress checks (overflow, truncation, RTL readiness indicators where applicable).
7. Add localization QA gates to W2 test program (snapshot/contract checks for key rendering and fallback behavior).

Definition of done:

- i18n foundation is in place with documented conventions and contributor workflow.
- New UI strings in target surfaces are key-driven rather than hard-coded.
- At least one additional locale is wired end-to-end for smoke validation.
- Localization checks are integrated into roadmap test/release gates.
- Operator/user docs include localization workflow and troubleshooting basics.

### W12: Temporal API Migration (Date → Temporal)

Migrate backend timestamp generation and arithmetic from the legacy `Date` API to the `Temporal` API, which is now globally available in Node.js 26 without a flag or polyfill.

**Why this matters:**

- `Temporal` is immutable, unambiguous about timezone intent, and eliminates whole classes of bugs around `Date` mutation and DST edge cases.
- `Date.now()` provides milliseconds but no timezone metadata; `Temporal.Now.instant()` is explicit and composable.
- Node.js 26 ships `Temporal` globally — no import, no polyfill, no dependency required on the backend.

**Scope assessment:** This is a **medium-large** migration. The codebase has approximately 100+ `Date`-related call sites across backend and frontend. They fall into three categories with very different migration costs:

| Category                                                                                                | Example                                       | Count (approx.)           | Migration cost                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pure timestamp generation** — `Date.now()` for ephemeral numeric timestamps                           | `const setAt = Date.now()`                    | ~35 backend, ~25 frontend | Low — mechanical swap to `Temporal.Now.instant().epochMilliseconds`                                                                                                                                                                                                                          |
| **ISO string generation** — `new Date().toISOString()` for logging and export metadata                  | `timestamp: new Date().toISOString()`         | ~10 backend               | Low — mechanical swap to `Temporal.Now.instant().toString()`                                                                                                                                                                                                                                 |
| **Prisma `Date` object interop** — `.toISOString()` / `.getTime()` called on objects returned by Prisma | `campaign.createdAt.toISOString()`            | ~25+ backend              | **Blocking** — Prisma v5 returns JS `Date` objects for `DateTime` fields; these calls are correct and cannot be changed without either (a) a Prisma Temporal adapter, (b) a `Date ↔ Temporal.Instant` converter utility at every Prisma boundary, or (c) waiting for official Prisma support |
| **Timestamp round-trips** — `new Date(value)` used to construct `Date` for Prisma input                 | `new Date(message.createdAt)`                 | ~10 backend               | Medium — requires `Temporal.Instant.from(isoString).toJSDate()` adapter at Prisma write boundary                                                                                                                                                                                             |
| **Frontend locale display** — `new Date(ts).toLocaleString()` for UI rendering                          | `new Date(note.publishedAt).toLocaleString()` | ~10 frontend              | Low-to-medium — `Temporal` has locale formatting but with a different API surface; Intl interop is non-trivial                                                                                                                                                                               |
| **Browser compatibility**                                                                               | Frontend Temporal usage                       | all frontend              | Verify: Temporal landed in Chrome 127+, Firefox 130+, Safari 18. Should be safe for modern targets but requires explicit baseline documentation                                                                                                                                              |

**The Prisma problem is the primary blocker.** Until Prisma officially supports `Temporal` types (or a community adapter is stable), the `Date` objects returned at Prisma boundaries are a hard dependency. The migration cannot go all the way without addressing this layer.

**Recommended phasing:**

1. **Phase 1 (Low risk, do now or during W1):** Replace all `Date.now()` pure timestamp generation in backend non-Prisma paths with `Temporal.Now.instant().epochMilliseconds`. Replace `new Date().toISOString()` in logging and export metadata with `Temporal.Now.instant().toString()`. No Prisma touch required.
2. **Phase 2 (Medium, after Prisma adapter decision):** Introduce a `temporalToJSDate(instant: Temporal.Instant): Date` adapter utility at Prisma write boundaries. Replace `new Date(value)` Prisma inputs with adapter calls.
3. **Phase 3 (Evaluate browser baseline first):** Migrate frontend `Date.now()` calls to `Temporal.Now.instant().epochMilliseconds`. Document supported browser baseline. Skip locale-formatting migration until Temporal locale API is more ergonomic.
4. **Phase 4 (Long-term, Prisma-dependent):** Remove all remaining `Date` usage from Prisma read paths once Prisma ships native `Temporal` support or a stable adapter is available.

**Do NOT migrate:**

- Prisma read-side `.toISOString()` / `.getTime()` on returned `Date` objects (blocking on Prisma support).
- `shared/utils/format.ts` `new Date(timestamp).toLocaleString()` until Temporal locale API stabilizes.
- Test fixtures using `Date.now()` as mock timestamps (low value, high noise).

**Node typing compatibility note (Node 26 runtime):**

- Use latest published `@types/node` until 26 typings are available.
- Do not pin `@types/node` to `^26` until DefinitelyTyped publishes that major.

**Definition of done (Phase 1 only gate for now):**

- All non-Prisma backend `Date.now()` calls are replaced with `Temporal.Now.instant().epochMilliseconds`.
- All non-Prisma `new Date().toISOString()` calls for generated timestamps are replaced with `Temporal.Now.instant().toString()`.
- No new bare `Date.now()` / `new Date()` calls are introduced in non-Prisma backend paths (lint rule or PR convention).
- Prisma interop paths are explicitly commented as `// Prisma Date interop — Temporal migration blocked on Prisma support`.

### W9: DEV Mock Players

Provide always-present seeded mock player accounts in the DEV environment so a single developer can test DM superpowers — conditions, drag-to-group, environments, whisper, broadcast — without needing real players to be online.

Current status (2026-05-09): Core implementation delivered (DEV-only auto-seed + DM-join auto-enrollment + randomized D&D profiles + reset reroll endpoint).

**Behaviour contract**:

- 3–5 mock player accounts are automatically selected and joined per DEV session.
- Mocks are always present in the group panel: visible, named, and draggable.
- Mocks do not have real audio; their presence is simulated (online, speaking indicator suppressed).
- When testing you are always the DM in the default browser session. Mock players supplement your session.
- If you accept a campaign invite in a **private browser session** (incognito), that session runs as a real player and is added alongside the mocks — the mocks do not disappear.
- Mock accounts are never seeded in production or staging environments. They are gated behind `NODE_ENV=development` (or an explicit `DEV_MOCK_PLAYERS=true` env flag).
- Mock player identities are generated from a D&D profile catalogue (at least 20 variations) with randomized names/race/class/subclass and level metadata.
- Randomized levels are constrained to a tight party band (within 2 levels) so encounter testing feels coherent.
- Mock roster is campaign-stable across session stop/start cycles and rerolled on browser refresh (or explicit reset endpoint).
- Mock players use a dedicated DEV avatar marker so they are immediately distinguishable from real players.
- Player-group safety contract: no user may end up homeless. Missing/closed/invalid group targets (runtime room targets) must fail back to `MAIN`.

**Implementation checklist**:

1. ✅ Add a DEV mock player service that creates mock user accounts and campaign memberships when the DEV flag is active.
2. ✅ Auto-join mocks when DM joins session in DEV, via the normal session/presence paths (draggable, mutable, condition-capable like real players).
3. ✅ Add randomized D&D profile generation (3–5 players selected from >=20 archetype variations, level spread within 2).
4. ✅ Expose a DEV-only `POST /api/dev/mock-players/reset` endpoint to re-roll and re-seed current session roster without restart.
5. Ensure mocks are excluded from recording/history pipelines where persistence policy requires runtime-only behavior. - In Progress
6. ✅ Document the mock setup in `DEVELOPING.md` so contributors know mocks are available in DEV.

Definition of done:

- Running the dev stack produces 3–5 visible mock players in any campaign without manual setup.
- DM can drag, condition, silence, and whisper the mocks exactly as they would a real player.
- A real player joining via invite in a private session coexists with the mocks seamlessly.
- Zero mock data leaks into production/staging builds or API responses.

---

## 5) Milestone Plan

### M1: Stabilize Core Hardening

- Target: close W1 critical items and baseline W2 gate reporting

### M2: Operational Confidence

- Target: complete W3 runbook + telemetry durability validation + telemetry matrix (what/why/how)

### M3: UX and Documentation Readiness

- Target: complete W0 frontend surface completion, W4 regression closure, W5 user-doc publishing, W6 panel/refactor consistency follow-up, W7 admin operations UX review, and W8 localization foundation kickoff

### M4: Release Readiness Review

- Target: run full checklist and sign off testing + operatisation gate

---

## 6) Exit Criteria

Ready for production-readiness sign-off when all are true:

- Hardening suites pass consistently with no critical regressions
- Testing gates are enforced and stable across backend/frontend/admin
- Operatisation checks and runbooks are validated and current
- UI modernization follow-through items are closed or explicitly waived
- User documentation is published and verified against runtime behavior

---

## 7) Future Enhancements

These enhancements are intentionally scoped as future-facing architecture and should be delivered incrementally behind operational gates.

### FE1: Durable Queue Manager and Worker Runtime

- Introduce a durable backend queue manager for scheduled and asynchronous jobs.
- Replace in-process best-effort long-running execution with restart-safe worker processing.
- Add retry, dead-letter, checkpoint, and operator observability paths.

Primary reference:

- [docs/architecture/QUEUE-JOB-MANAGER.md](docs/architecture/QUEUE-JOB-MANAGER.md)

### FE2: Recording, Transcription, and Summary Pipeline

- Implement queue-managed post-session processing stages for recording finalize, transcription, and summarization.
- Enforce off-the-record and privacy policies throughout the pipeline.
- Support resume-after-restart for multi-hour processing jobs.

Primary references:

- [docs/architecture/TRANSCRIPTION-RECORDING-SYSTEM.md](docs/architecture/TRANSCRIPTION-RECORDING-SYSTEM.md)
- [docs/architecture/QUEUE-JOB-MANAGER.md](docs/architecture/QUEUE-JOB-MANAGER.md)
- [docs/architecture/STATE-RECOVERY.md](docs/architecture/STATE-RECOVERY.md)

# Testing and Operatisation Roadmap

This roadmap tracks test-readiness, operatisation, hardening, and release-gate work for the current platform baseline.

Last updated: 2026-05-04

Related roadmap:

- Development roadmap (feature-stage history and delivery log): [docs/DEVELOPMENT-ROADMAP.md](docs/DEVELOPMENT-ROADMAP.md)

---

## 0) Campaign/User Flow Implementation Track (Current Build Focus)

This is a lightweight implementation tracker for the next product-flow stage.
It is intentionally simple (single-developer friendly) and not a formal backlog process.

### Goal

Deliver the pre-launch campaign flow so users move cleanly from login/register to home/dashboard and into launch/watch entry points with correct DM/player/spectator permissions and behavior.

Current boundary for this stage:

- In scope: login/register, invite/code handling, home/dashboard visibility, launch/watch CTA behavior, and pre-launch campaign settings/invite UX.
- Out of scope (deferred): runtime behavior inside campaigns after launch (greenroom/session chat, room movement, pause/stop runtime gates, in-session notes/audio behavior).

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
- On Start, only currently connected players are force-moved to Main room.
- Late-join policy for missed session start: `Open|Screened|Blocked`, with configurable grace period (default 30 minutes).
- Screened mode includes private DM chat gate; Blocked mode still respects grace period.
- Players only see campaign-linked note copies; templates/unlinked notes are DM-side only.
- Outside campaign membership context, authenticated identity is simply `User`; DM/Player/Spectator are campaign-scoped roles.
- Campaign owner DM handoff (resign and assign another player as DM) is planned.

### Build Tracking (Now)

Status legend: `Planned`, `In Progress`, `Done`

1. Home/Campaign list and derived-state model - Done
2. Privacy-rounded home dashboard metrics - Done
3. Invite/code entry flow alignment (player extension POST invite, spectator watch link guest/full paths) - Done
4. Login/register entry UX completion (including invite context handoff) - Done
5. Home/campaign panel UX pass (compact bounded shell + panel flow cleanup) - In Progress
6. Launch/Watch CTA gating on campaign cards (DM/player/spectator permissions + policy states) - In Progress
7. Dedicated campaign settings route/page + DM metadata editing + invite reissue UX - In Progress
8. Campaign-scoped role model cleanup (user-level identity outside campaigns) - In Progress
9. DM/Player guest campaign-scoping + upgrade UX copy/affordances - Planned
10. Spectator guest temporary-session UX + wait/paused/ended pre-launch messaging - Planned
11. Campaign DM handoff flow (resign and assign player as new DM) - Planned

Latest delivered in this slice:

- Invite and watch routes now use a unified notice/copy system for policy, success, waitlist, and fallback error states.
- Player invite success paths now hand off back into the app lobby with the joined campaign preselected.
- Campaign launch now loads sessions for the clicked campaign before entering, avoiding stale-session selection when launching from a different card.
- Create Campaign now explains the DM launch path, uses labeled name/description fields, and blocks guest users with explicit upgrade messaging.

### F2 Implementation Checklist (Mapped)

Use this checklist to implement and verify login -> home -> launch/watch flow only.

| F2 Item                                                                           | Frontend routes/components (current)                                                                                                                                                                                                                                                             | Backend endpoints (current)                                                                                                                                                                                                                                                                                    | Implementation acceptance check                                                                                                                                                                                          |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3. Invite/code entry flow alignment                                               | `frontend/src/App.tsx` route resolution for `/join/:code` and `/watch/:code`; `frontend/src/components/routes/JoinRouteView.tsx`; `frontend/src/components/auth/InviteJoinPage.tsx`; `frontend/src/components/routes/WatchRouteView.tsx`; `frontend/src/components/auth/SpectatorInvitePage.tsx` | `GET /api/campaigns/invite/:code/validate`; `POST /api/auth/extension/preflight`; `POST /api/auth/extension/guest-login`; `GET /api/campaigns/watch/:code/validate`; `POST /api/auth/spectator/guest-join`; `GET /api/campaigns/:campaignId/spectator/waitlist-status`; `POST /api/campaigns/:campaignId/join` | Player invite route supports extension preflight and extension guest-login path; spectator watch route supports guest spectator join plus waitlist polling; invalid/expired code states are handled in UI.               |
| 4. Login/register entry UX completion (invite context handoff)                    | `frontend/src/components/routes/AppMainRouteView.tsx`; `frontend/src/components/auth/LoginForm.tsx`; `frontend/src/hooks/useAuthSession.ts` (session bootstrap, handoff exchange, auth profile)                                                                                                  | `POST /api/auth/login`; `GET /api/auth/me`; `POST /api/auth/handoff/exchange`                                                                                                                                                                                                                                  | Unauthenticated users can sign in and return to intended flow; session restores correctly; invite routes can complete auth and transition to home/pre-launch surfaces.                                                   |
| 5. Home/campaign panel UX pass                                                    | `frontend/src/components/session/SessionInit.tsx` (campaign listing, join modal, create modal, create-to-launch handoff, enter campaign handling); `frontend/src/components/routes/BrowseRouteView.tsx`; `frontend/src/components/auth/BrowseCampaignsPage.tsx`                                  | `GET /api/campaigns`; `POST /api/campaigns`; `GET /api/campaigns/browse`; `GET /api/campaigns/:campaignId/sessions`                                                                                                                                                                                            | Home and browse surfaces clearly distinguish DM/player/spectator access, Create Campaign explains the DM launch path, and pre-launch launch/watch affordances are visible without requiring in-campaign state rendering. |
| 6. Launch/Watch CTA gating on campaign cards                                      | `frontend/src/components/session/SessionInit.tsx` (enter campaign, launch handoff, and chapter-start gating); `frontend/src/components/auth/BrowseCampaignsPage.tsx` join/watch state                                                                                                            | `GET /api/campaigns`; `GET /api/campaigns/browse`; `POST /api/campaigns/:campaignId/sessions/start`; `GET /api/campaigns/:campaignId/sessions`; `GET /api/campaigns/watch/:code/validate`                                                                                                                      | CTA labels/states map to role and policy: DM/player launch only when allowed, spectator watch only when allowed, disabled states explain why, and launch uses the targeted campaign session list.                        |
| 7. Campaign settings page + invite reissue UX                                     | `frontend/src/components/routes/CampaignSettingsRouteView.tsx`; `frontend/src/components/session/CampaignSettingsPage.tsx`; route entry from `SessionInit`                                                                                                                                       | `GET /api/campaigns/:campaignId/settings`; `PATCH /api/campaigns/:campaignId/settings`; `POST /api/campaigns/:campaignId/invites/reissue`                                                                                                                                                                      | DM can edit campaign metadata and rotate player/spectator invite codes; success/error feedback and refreshed codes are shown immediately.                                                                                |
| 8. Campaign-scoped role model cleanup                                             | `frontend/src/components/auth/LoginForm.tsx` (user-first auth wording); `frontend/src/hooks/useAuthSession.ts` (authType handling); `frontend/src/components/session/SessionInit.tsx` (campaign membership driven entry)                                                                         | `POST /api/auth/login`; `GET /api/campaigns`; `POST /api/campaigns/:campaignId/join`; `POST /api/auth/extension/guest-login`; `POST /api/auth/spectator/guest-join`                                                                                                                                            | UI copy and behavior consistently treat DM/Player/Spectator as campaign roles, not login roles; entry decisions derive from membership/invite outcomes.                                                                  |
| 9. DM/Player guest campaign-scoping + upgrade UX                                  | `frontend/src/components/auth/InviteJoinPage.tsx`; `frontend/src/hooks/useAuthSession.ts`; `frontend/src/components/auth/GuestUpgradePrompt.tsx`; `frontend/src/App.tsx` upgrade prompt wiring                                                                                                   | `POST /api/auth/extension/guest-login`; `GET /api/auth/me`; `POST /api/auth/upgrade`                                                                                                                                                                                                                           | DM/Player guest auth is only reachable from extension invite flow; guest account sees upgrade affordance; upgrade preserves campaign linkage and removes guest-only restrictions.                                        |
| 10. Spectator guest temporary-session UX + wait/paused/ended pre-launch messaging | `frontend/src/components/auth/SpectatorInvitePage.tsx` (guest spectator join and waitlist); route `/watch/:code` in `frontend/src/App.tsx`                                                                                                                                                       | `GET /api/campaigns/watch/:code/validate`; `POST /api/auth/spectator/guest-join`; `GET /api/campaigns/:campaignId/spectator/waitlist-status`                                                                                                                                                                   | Guest spectator path is available from direct watch links; waitlist status auto-refreshes; temporary spectator-session messaging is clear before campaign entry.                                                         |

Implementation policy notes for F2:

- DM/Player guest access must be reachable only through extension invite POST flow (`POST /api/auth/extension/guest-login`) and remains campaign-scoped.
- Direct watch links can create temporary guest spectators through `POST /api/auth/spectator/guest-join`.
- Any in-campaign runtime transitions or room-level behavior remain deferred to F3.

Deferred to post-launch stage (inside-campaign runtime focus):

- Greenroom default-ephemeral chat with campaign override.
- Session lifecycle enforcement (Start/Pause/Resume/Stop) runtime behavior.
- Spectator runtime gating during active/paused/ended sessions.
- Connected-only force move + late-join runtime enforcement.
- Session chapter auto-naming + post-session rename.
- In-campaign history and notes visibility runtime behavior.

### Milestone Sequence (Simple)

- F1: Home flow foundation
  - 1, 2, 3
- F2: Login -> Home -> Launch/Watch completion
  - 3, 4, 5, 6, 7, 8, 9, 10
- F3: In-campaign lifecycle behavior (deferred)
  - Deferred runtime items listed above

### Done Criteria for This Track

- Users can enter campaigns from home with correct role-based behavior.
- Login/register -> home -> launch/watch UI/UX path is complete for DM/player/spectator entry cases.
- DM/Player extension guest launch path is campaign-scoped, clearly communicated, and upgrade-capable.
- Spectator watch path supports temporary guest spectator onboarding and full-account entry.
- Visibility/privacy constraints are enforced for dashboard and pre-launch campaign access surfaces.

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
- Backend tests: 47 files / 308 tests passing
- Frontend tests: 31 files / 254 tests passing
- Admin tests: 17 files / 139 tests passing
- Backend coverage snapshot: statements 60.99, branches 51.69, functions 60.17, lines 61.35
- Admin coverage snapshot: statements 86.72, branches 71.85, functions 83.49, lines 88.2

Known readiness gap classes:

- Multi-client reconnect and soak hardening (presence/rooms/audio)
- Telemetry durability and restart-survival operational checks
- Docs parity and operator-facing playbook consistency

---

## 3) Workstreams

| ID  | Workstream                  | Status      | Scope                                                                            |
| --- | --------------------------- | ----------- | -------------------------------------------------------------------------------- |
| W1  | Hardening and Reliability   | In Progress | Multi-client reconnect, recovery soak, audio-state durability validation         |
| W2  | Testing Program and Gates   | In Progress | Cross-package test gates, regression matrix, perf/security checks                |
| W3  | Operatisation and Runbooks  | Planned     | Telemetry durability checks, backup/restore drills, migration parity checks      |
| W4  | UI Modernization Completion | In Progress | Regression hardening, accessibility and visual consistency follow-through        |
| W5  | User Documentation          | Planned     | DM/player/spectator guides, onboarding, troubleshooting, operational quickstarts |

---

## 4) Detailed Backlog

### W1: Hardening and Reliability

1. Add multi-client reconnect soak scenario for rooms/presence topology recovery.
2. Add audio-state persistence and recovery soak assertions around `GET /api/audio/state/:sessionId`.
3. Verify reconnect fanout behavior under concurrent transitions.
4. Capture pass/fail thresholds and flaky-test handling policy.

Definition of done:

- Soak suites are stable and repeatable.
- No critical reconnect or state-loss defects in repeated runs.

### W2: Testing Program and Gates

1. Add a workspace test report artifact with per-package test and coverage deltas.
2. Define release-gate thresholds for backend/frontend/admin test pass and critical-path suites.
3. Add explicit non-functional checks for authz boundaries and high-risk error paths.
4. Track and burn down flaky tests to agreed threshold.

Definition of done:

- Merge/release gates are documented, automated, and consistently enforced.

### W3: Operatisation and Runbooks

1. Add restart-survival validation for telemetry and diagnostic sinks.
2. Finalize operator runbooks for backup/restore, telemetry verification, and incident triage.
3. Add CI/release check for Prisma schema and migration parity (`prisma migrate status`).
4. Validate environment/config checklists for deployment and recovery drills.

Definition of done:

- Operations checks are scripted or procedural with reproducible outcomes.
- Runbooks are current and validated against runtime behavior.

### W4: UI Modernization Completion

1. Close remaining UI regression gaps on migrated surfaces.
2. Run accessibility and responsive smoke passes on high-use flows.
3. Ensure token/theming consistency remains stable during hardening changes.
4. Keep framework boundaries enforced (frontend core UI vs admin MUI).

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

---

## 5) Milestone Plan

### M1: Stabilize Core Hardening

- Target: close W1 critical items and baseline W2 gate reporting

### M2: Operational Confidence

- Target: complete W3 runbook + telemetry durability validation

### M3: UX and Documentation Readiness

- Target: complete W4 regression closure and W5 user-doc publishing

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

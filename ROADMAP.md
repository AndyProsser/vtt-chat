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

Deliver the end-to-end campaign flow so users move cleanly from home screen to greenroom/session lifecycle with correct DM/player/spectator permissions and behavior.

### Confirmed Product Rules

- Campaign canonical state is `ACTIVE|INACTIVE`; `GREENROOM|PAUSED` are derived from session/runtime state.
- Session Start always auto-creates a new session chapter with clean session chat.
- Session chapter names are auto-generated (e.g. Session N + date) and DM can rename later (including after end).
- Greenroom chat defaults to ephemeral and is configurable per campaign.
- DM presence on campaign cards is `Online|Offline`.
- Home dashboard metrics are privacy-limited/rounded (signal of activity, not exact counts).
- Players can join any campaign they are a member of; membership is permanent until DM/Admin removal.
- Player join via code/invite link grants immediate campaign membership.
- Spectator invites can be created by DM and Admin.
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
3. Player/spectator invite + code/link entry flow alignment - Done
4. Greenroom default-ephemeral chat with campaign override - In Progress
5. Session lifecycle enforcement (Start/Pause/Resume/Stop) - In Progress
6. Spectator runtime gating (active/waiting/paused/ended) - In Progress
7. Connected-only force move + late-join policy (`Open|Screened|Blocked` + grace period) - Planned
8. Session chapter auto-naming + post-session rename - Planned
9. History and notes visibility enforcement (DM full, player scoped) - In Progress
10. Home/campaign panel UX pass (compact bounded shell + panel flow cleanup) - In Progress
11. Dedicated campaign settings route/page + DM metadata editing + invite reissue UX - In Progress
12. Campaign-scoped role model cleanup (user-level identity outside campaigns) - Planned
13. Campaign DM handoff flow (resign and assign player as new DM) - In Progress

### Milestone Sequence (Simple)

- F1: Home flow foundation
  - 1, 2, 3
- F2: In-campaign lifecycle behavior
  - 4, 5, 6, 7, 8
- F3: Visibility and UX follow-through
  - 9, 10

### Done Criteria for This Track

- Users can enter campaigns from home with correct role-based behavior.
- DM can run full session lifecycle with spectators and players handled per rules.
- Chat/session chapter behavior matches expected tabletop chapter model.
- Visibility/privacy constraints are enforced for dashboard, spectators, history, and notes.

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

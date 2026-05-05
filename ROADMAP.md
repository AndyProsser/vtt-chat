# Testing and Operatisation Roadmap

This roadmap tracks test-readiness, operatisation, hardening, and release-gate work for the current platform baseline.

Last updated: 2026-05-05

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
- Telemetry signal definition clarity (what is tracked, why it matters, and how it is consumed)
- Admin console operations UX review against best-practice operator workflows
- Docs parity and operator-facing playbook consistency

---

## 3) Workstreams

| ID  | Workstream                  | Status      | Scope                                                                            |
| --- | --------------------------- | ----------- | -------------------------------------------------------------------------------- |
| W1  | Hardening and Reliability   | In Progress | Multi-client reconnect, recovery soak, fanout/load validation, audio durability  |
| W2  | Testing Program and Gates   | In Progress | Cross-package test gates, regression matrix, perf/security checks                |
| W3  | Operatisation and Runbooks  | Planned     | Telemetry durability checks, backup/restore drills, migration parity checks      |
| W4  | UI Modernization Completion | In Progress | Regression hardening, accessibility and visual consistency follow-through        |
| W5  | User Documentation          | Planned     | DM/player/spectator guides, onboarding, troubleshooting, operational quickstarts |
| W6  | Refactor and Simplification | In Progress | Zustand consistency, component/file simplification, naming cleanup, API cleanup  |
| W7  | Admin Operations UX Review  | Planned     | Best-practice operations review for admin information architecture and workflows |

---

### Latest Delivered (W1/W2)

- Added backend multi-client reconnect soak suite for concurrent reconnect fanout, session isolation, and FIFO recovery behavior (`backend/tests/integration/multi-client-reconnect.integration.test.ts`).
- Added backend audio-state persistence/recovery soak suite for environment + DM override + broadcast lifecycle recovery (`backend/tests/integration/audio-state-recovery.integration.test.ts`).
- Added expanded API coverage for presence and rooms route auth/validation/edge paths (`backend/tests/api/presence-routes.test.ts`, `backend/tests/api/rooms-routes.test.ts`).
- Added explicit non-functional authz boundary suite for audio DM-only control surfaces (`backend/tests/api/audio-authz-boundaries.test.ts`).
- Added workspace QA artifact for per-package coverage and threshold deltas (`scripts/qa/coverage-report.cjs`) and root scripts `qa:coverage-report` / `qa:coverage-report:json`.
- Raised backend coverage thresholds to match current baseline signal and enforce gate floor in CI/local runs.

### Latest Delivered (W6)

- Added versioned API mounts for auth/session/presence/rooms/audio/livekit/integrations under `/api/v1/*` while retaining compatibility mounts for legacy paths.
- Added normalized member-style aliases for session and room operations, plus normalized aliases for audio operations.
- Split guest auth flow into role-oriented backend services (`guest-auth.extension`, `guest-auth.player`, `guest-auth.spectator`, `guest-auth.account-upgrade`) behind the `guest-auth.service.ts` facade.
- Migrated frontend LiveKit token requests to `/api/v1/livekit/token`.
- Migrated admin integrations operations to `/admin/api/v1/integrations/*` and added backend admin alias support.
- Added centralized API-index v1 mount contract tests to validate mount consistency in one suite.

## 4) Detailed Backlog

### W1: Hardening and Reliability

1. Add multi-client reconnect soak scenario for rooms/presence topology recovery. - Done
2. Add audio-state persistence and recovery soak assertions around `GET /api/audio/state/:sessionId`. - Done
3. Verify reconnect fanout behavior under concurrent transitions. - Done
4. Capture pass/fail thresholds and flaky-test handling policy. - Done
5. Expand broader multi-client e2e/load matrix for reconnect/recovery and transition fanout behavior (network loss, restart, burst reconnect, and cross-session isolation). - In Progress

Definition of done:

- Soak suites are stable and repeatable.
- No critical reconnect or state-loss defects in repeated runs.

### W2: Testing Program and Gates

1. Add a workspace test report artifact with per-package test and coverage deltas. - Done
2. Define release-gate thresholds for backend/frontend/admin test pass and critical-path suites. - Done
3. Add explicit non-functional checks for authz boundaries and high-risk error paths. - Done
4. Track and burn down flaky tests to agreed threshold. - In Progress
5. Expand frontend/backend automated coverage for refactor-sensitive paths (store selectors, integration hooks, API naming migration behavior). - In Progress

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

1. Standardize frontend shared runtime state on Zustand slices and selectors to eliminate duplicated local state patterns.
2. Refactor oversized frontend components where sensible to reduce file size and complexity.
3. Align frontend file names and folder structure with actual component/domain responsibilities.
4. Refactor backend API route and service function naming for consistency and maintainability.
5. Add migration-safe compatibility checks and test coverage for naming and structural refactors.
6. Complete backend API route review and normalization:
   - inventory all remaining legacy route mounts/aliases
   - define canonical v1 route map and deprecation policy for compatibility paths
   - retire or explicitly timebox legacy routes with contract tests guarding expected behavior

Short API normalization checklist (actionable now):

1. Snapshot current mounts from [backend/src/api/index.ts](backend/src/api/index.ts) and classify as canonical (`/v1/*`) vs compatibility (legacy).
2. For each compatibility mount (`/auth`, `/platform`, `/chat`, `/admin`, `/notes`, `/campaigns`, `/users`, `/telemetry`, `/metadata`), decide: keep temporarily (with sunset date) or migrate immediately.
3. Verify canonical coverage is complete for active families currently mounted at `/v1/auth`, `/v1/session`, `/v1/presence`, `/v1/rooms`, `/v1/audio`, `/v1/livekit`, and `/v1/integrations`.
4. Add/maintain route-contract tests that assert canonical paths are available and deprecated legacy paths behave as intentionally defined (supported or 404).
5. Publish a migration map and changelog notes for frontend/admin/shared clients before removing any compatibility path.
6. Component/service normalization is part of this backend legacy refactor: each route family maps to its canonical backend service/module boundary for ongoing maintenance.

API normalization tracking table (update during each PR):

Route Family is the service-owner key for this table.

| Route Family | Current Path(s)     | Canonical Path     | Sunset Date |
| ------------ | ------------------- | ------------------ | ----------- |
| Auth         | `/auth`, `/v1/auth` | `/v1/auth`         | TBD         |
| Session      | `/v1/session`       | `/v1/session`      | n/a         |
| Presence     | `/v1/presence`      | `/v1/presence`     | n/a         |
| Rooms        | `/v1/rooms`         | `/v1/rooms`        | n/a         |
| Audio        | `/v1/audio`         | `/v1/audio`        | n/a         |
| LiveKit      | `/v1/livekit`       | `/v1/livekit`      | n/a         |
| Integrations | `/v1/integrations`  | `/v1/integrations` | n/a         |
| Platform     | `/platform`         | TBD                | TBD         |
| Chat         | `/chat`             | TBD                | TBD         |
| Admin        | `/admin`            | TBD                | TBD         |
| Notes        | `/notes`            | TBD                | TBD         |
| Campaigns    | `/campaigns`        | TBD                | TBD         |
| Users        | `/users`            | TBD                | TBD         |
| Telemetry    | `/telemetry`        | TBD                | TBD         |
| Metadata     | `/metadata`         | TBD                | TBD         |

Definition of done:

- Cross-component runtime state uses canonical store selectors for shared concerns.
- Targeted frontend/backend modules are renamed and reorganized without behavior regressions.
- Refactor-related tests pass and coverage trend improves on changed modules.
- API route inventory is documented, canonical v1 mapping is complete, and legacy compatibility paths are either retired or explicitly tracked with deprecation notes and tests.

### W7: Admin Operations UX Review

1. Review admin console information hierarchy for operator-critical tasks (triage, user action, incident response, and settings safety).
2. Review task completion flows for high-impact operations (suspend/restore, force logout, archive/restore, backup/export, and integration authorization).
3. Review alerting and status clarity to ensure incidents are visible, prioritized, and actionable.
4. Review auditability visibility so operators can trace action -> effect -> evidence without ambiguity.
5. Review failure-state UX (timeouts, partial success, retries, and rollback guidance) for operator confidence under stress.
6. Review accessibility and keyboard-first workflows for operational efficiency.

Definition of done:

- Admin operations UX findings are documented with severity, rationale, and recommended remediation.
- Critical/high findings are scheduled or resolved with verification notes.
- Updated operator flow guidance is reflected in docs and test checklists.

---

## 5) Milestone Plan

### M1: Stabilize Core Hardening

- Target: close W1 critical items and baseline W2 gate reporting

### M2: Operational Confidence

- Target: complete W3 runbook + telemetry durability validation + telemetry matrix (what/why/how)

### M3: UX and Documentation Readiness

- Target: complete W4 regression closure, W5 user-doc publishing, W6 panel/refactor baseline, and W7 admin operations UX review

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

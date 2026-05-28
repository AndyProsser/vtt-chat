# Release Plan and Commit Conventions

This document defines the semantic-release commit strategy for VTT-Chat so automated release notes stay aligned with roadmap stage buckets.

## 1. Version Buckets

Use these buckets when preparing release PRs. Each bucket should include exactly one release-trigger commit (`feat` or `fix`) that drives the intended bump.

| Version | Bucket                           | Primary trigger commit                                                                                 | Notes                 |
| ------- | -------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------- |
| 0.2.0   | Stage 4 chat vertical slice      | `feat(chat): complete stage 4 chat vertical slice with whisper filtering and system boundary messages` | Minor bump            |
| 0.3.0   | Stage 5 notes vertical slice     | `feat(notes): complete stage 5 persisted notes with visibility model and publish flow`                 | Minor bump            |
| 0.4.0   | Stage 6 presence and rooms       | `feat(presence-rooms): complete stage 6 redis-first presence and room transition orchestration`        | Minor bump            |
| 0.5.0   | Stage 7 audio + LiveKit baseline | `feat(audio-livekit): deliver stage 7 token flow, audio control routes, and ws dispatch integration`   | Minor bump            |
| 0.5.1   | Stage 8 partial admin + tests    | `feat(admin-telemetry): add dashboard, status, and logs endpoints with filtering and pagination`       | Patchline progression |
| 0.5.2   | Stage 13 planning/docs + README  | `fix(docs): align stage 13 guest-auth architecture docs and root readme project introduction`          | Patch bump            |

## 2. Allowed Commit Types and Scopes

Recommended types:

- `feat`
- `fix`
- `perf`
- `refactor`
- `docs`
- `test`
- `chore`

Recommended scopes:

- `chat`
- `notes`
- `presence-rooms`
- `audio-livekit`
- `admin-telemetry`
- `backend`
- `infra`
- `api`
- `architecture`
- `extension`
- `permissions`
- `roadmap`
- `readme`
- `release`

## 3. semantic-release Rules (Current)

Configured in [release.config.mjs](../../release.config.mjs):

- `feat` -> minor
- `fix` -> patch
- `perf` -> patch
- `docs` with scope in (`roadmap`, `architecture`, `extension`, `api`, `permissions`, `readme`, `release`) -> patch
- `refactor` with scope in (`backend`, `infra`) -> patch
- `test` and `chore` -> no release by themselves

Release-note sections are grouped as:

- Features
- Fixes
- Performance
- Refactors
- Documentation
- Tests
- Chores

## 4. Commit Message Templates

Use these templates for consistency:

```text
feat(<scope>): <short imperative summary>
fix(<scope>): <short imperative summary>
docs(<scope>): <short imperative summary>
refactor(<scope>): <short imperative summary>
```

Examples:

```text
feat(audio-livekit): mount livekit token flow and audio control routes
fix(api): enforce session-member authz for room transitions
docs(architecture): align guest auth endpoint contracts with roadmap stage 13
refactor(infra): extract session log service and remove circular dependencies
```

## 5. Release PR Checklist

Before merging a release-focused PR:

1. Confirm commit types/scopes follow this plan.
2. Confirm exactly one release-trigger commit sets the intended bump.
3. Confirm [CHANGELOG.md](../../CHANGELOG.md) release notes map to the expected stage bucket.
4. Confirm versions remain aligned across:
   - [package.json](../../package.json)
   - [backend/package.json](../../backend/package.json)
   - [frontend/package.json](../../frontend/package.json)
   - [admin/package.json](../../admin/package.json)
   - [shared/package.json](../../shared/package.json)
5. Confirm the version line in [README.md](../../README.md) matches the latest release.

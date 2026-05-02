# Stage 14 Backend Debt Matrix

Last updated: 2026-05-02

This document is the execution matrix for Stage 14.1.
It classifies all backend stub/placeholder files found in backend src and assigns an action:

- implement: keep file and replace stub content with runtime implementation
- remove: delete file and remove references (or prevent future references)
- defer: intentionally keep for later stage, with explicit owner and reason

## Scope Summary

- Total files identified: 50
- Planned implement: 8
- Planned remove: 42
- Planned defer: 0

## Execution Status (Stage 14.2 through 14.8)

- Stage 14.2 completed in two remove-only passes:
  - Pass 1: 29 high-confidence unused stubs removed.
  - Pass 2: 13 remaining remove-target core duplicate stubs removed.
- Stage 14.3 completed:
  - Replaced metadata `501` placeholder mount with implemented metadata route family.
  - Implemented metadata service/templates/types and mounted `/api/metadata` runtime endpoints for templates, session snapshot, and timeline.
  - Added API regression coverage in `backend/tests/api/metadata-routes.test.ts`.
- Stage 14.4 completed:
  - Implemented durable audio-state persistence and recovery (`AudioRoomState`, `AudioDMOverride`) and wired `/api/audio/state/:sessionId` to authoritative persisted data.
- Stage 14.5 completed:
  - Hardened active websocket handlers with domain-integrated behavior for chat/notes/audio/room paths and aligned dispatcher coverage.
- Stage 14.6 completed:
  - Consolidated backend type contracts under `backend/src/types/**` and removed drift from placeholder type surfaces.
- Stage 14.7 completed:
  - Retired placeholder contract TODO surfaces in favor of executable API/service/ws coverage.
- Stage 14.8 completed:
  - Reconciled roadmap/docs references to current runtime module structure and verification evidence.
- Final verification after Stage 14 closure:
  - Workspace build: passing (`npm run build`).
  - Workspace tests: passing (backend `40` files / `209` tests; frontend `20` files / `130` tests; admin `8` files / `47` tests).
  - Workspace lint: `npm run lint` -> passing.
- Remaining stub/placeholder files in `backend/src`: 0 tracked Stage 14 targets.
- Remaining Stage 14 tracked scope:
  - Implement targets remaining: 0.
  - Remove targets remaining: 0.

## Stage 14 Close-out Sign-off

Stage 14 is now **closed**.

- [x] 14.2 Placeholder/dead-path retirement complete
- [x] 14.3 Metadata runtime closure complete
- [x] 14.4 Audio/voice durability complete
- [x] 14.5 WebSocket handler hardening complete
- [x] 14.6 Type layer consolidation complete
- [x] 14.7 Contract/test debt closure complete
- [x] 14.8 Roadmap/docs reconciliation complete
- [x] Full verification snapshot recorded (tests + lint passing)

Close-out note:

- Any remaining `NOT_IMPLEMENTED` branches outside this matrix are treated as intentional runtime guardrails (for unsupported WS event types), not Stage 14 placeholder debt.

> Note: The decision table below is preserved as the historical 14.1 planning artifact and therefore references pre-refactor paths (including legacy `backend/src/core/**` planning entries).

## Decision Matrix

| File                                            | Category                 | Action    | Stage 14 substage | Owner            | Effort | Notes                                                                      |
| ----------------------------------------------- | ------------------------ | --------- | ----------------- | ---------------- | ------ | -------------------------------------------------------------------------- |
| backend/src/api/metadata.routes.ts              | API runtime gap          | implement | 14.3              | Backend API      | M      | Replace stage stub; wire metadata endpoints or feature-flag implementation |
| backend/src/core/metadata/metadata.service.ts   | Metadata domain          | implement | 14.3              | Backend Platform | M      | Backing service for metadata API                                           |
| backend/src/core/metadata/metadata.templates.ts | Metadata domain          | implement | 14.3              | Backend Platform | S      | Template handling and defaults                                             |
| backend/src/core/metadata/metadata.types.ts     | Metadata domain          | implement | 14.6              | Backend Platform | S      | Replace stage stub with concrete metadata contracts                        |
| backend/src/core/audio/audio-state.ts           | Audio durability         | implement | 14.4              | Realtime/Audio   | M      | Durable state model for room environment + overrides                       |
| backend/src/core/audio/conditions.ts            | Audio durability         | implement | 14.4              | Realtime/Audio   | S      | Condition state contract used by persisted audio state                     |
| backend/src/core/audio/dm-voice.ts              | Audio durability         | implement | 14.4              | Realtime/Audio   | M      | DM override state model and reconciliation helpers                         |
| backend/src/core/audio/environments.ts          | Audio durability         | implement | 14.4              | Realtime/Audio   | S      | Room environment state model and validation                                |
| backend/src/api/export.routes.ts                | Legacy stub API          | remove    | 14.2              | Backend API      | S      | Unused route module; export flows implemented elsewhere                    |
| backend/src/api/health.routes.ts                | Legacy stub API          | remove    | 14.2              | Backend API      | S      | Unused route module; health route already in api index/bootstrap           |
| backend/src/core/admin/admin.service.ts         | Legacy core duplicate    | remove    | 14.2              | Backend Platform | S      | Active admin logic lives under services/api paths                          |
| backend/src/core/admin/audit-log.ts             | Legacy core duplicate    | remove    | 14.2              | Backend Platform | S      | Audit behavior implemented in active admin route/service paths             |
| backend/src/core/auth/auth.service.ts           | Legacy core duplicate    | remove    | 14.2              | Auth             | S      | Active auth is in backend/src/services/auth.service.ts                     |
| backend/src/core/export/export.service.ts       | Legacy core duplicate    | remove    | 14.2              | Backend Platform | S      | Export runtime implemented under admin portability flows                   |
| backend/src/core/export/export.formatters.ts    | Legacy core duplicate    | remove    | 14.2              | Backend Platform | S      | Not wired in active runtime                                                |
| backend/src/core/notes/notes.types.ts           | Legacy core duplicate    | remove    | 14.6              | Backend Platform | S      | Notes runtime uses shared + repository contracts                           |
| backend/src/core/rooms/rooms.service.ts         | Legacy core duplicate    | remove    | 14.2              | Realtime         | S      | Active room runtime is backend/src/core/rooms/room.service.ts              |
| backend/src/core/rooms/room.types.ts            | Legacy core duplicate    | remove    | 14.6              | Realtime         | S      | Replace with concrete contracts in active room service/repo types          |
| backend/src/core/rooms/room.visibility.ts       | Legacy core duplicate    | remove    | 14.2              | Realtime         | S      | Not used by current routing/runtime                                        |
| backend/src/core/session/session.service.ts     | Legacy core duplicate    | remove    | 14.2              | Backend Platform | S      | Active session runtime is backend/src/services/session.service.ts          |
| backend/src/core/users/dm-settings.ts           | Legacy core duplicate    | remove    | 14.2              | Backend Platform | S      | Not wired                                                                  |
| backend/src/core/users/player-settings.ts       | Legacy core duplicate    | remove    | 14.2              | Backend Platform | S      | Not wired                                                                  |
| backend/src/core/users/user.service.ts          | Legacy core duplicate    | remove    | 14.2              | Backend Platform | S      | Active user flow is api/repository-driven                                  |
| backend/src/infra/http/router.ts                | Legacy infra placeholder | remove    | 14.2              | Infra            | S      | Active routing is backend/src/api/index.ts                                 |
| backend/src/infra/http/server.ts                | Legacy infra placeholder | remove    | 14.2              | Infra            | S      | Active bootstrap server is backend/src/bootstrap.ts                        |
| backend/src/infra/livekit/livekit.types.ts      | Unused placeholder       | remove    | 14.2              | Realtime/Audio   | S      | LiveKit runtime uses token.service contracts                               |
| backend/src/infra/redis/presence.store.ts       | Legacy infra placeholder | remove    | 14.2              | Realtime         | S      | Presence runtime uses room.service + redis index                           |
| backend/src/infra/redis/rate-limit.store.ts     | Legacy infra placeholder | remove    | 14.2              | Infra            | S      | Current rate limiting is middleware-based                                  |
| backend/src/infra/security/auth.middleware.ts   | Legacy infra placeholder | remove    | 14.2              | Auth             | S      | Active middleware is backend/src/infra/http/middleware.ts                  |
| backend/src/infra/security/jwt.ts               | Legacy infra placeholder | remove    | 14.2              | Auth             | S      | Active JWT logic is in utils/auth + services/auth.service                  |
| backend/src/infra/security/sanitize.ts          | Legacy infra placeholder | remove    | 14.2              | Auth             | S      | Active sanitize helpers exist in concrete modules                          |
| backend/src/types/audio.types.ts                | Placeholder type file    | remove    | 14.6              | Backend Platform | S      | Consolidate into canonical typed contracts                                 |
| backend/src/types/export.types.ts               | Placeholder type file    | remove    | 14.6              | Backend Platform | S      | Consolidate into canonical typed contracts                                 |
| backend/src/types/metadata.types.ts             | Placeholder type file    | remove    | 14.6              | Backend Platform | S      | Replace with real metadata contracts in active domain files                |
| backend/src/types/notes.types.ts                | Placeholder type file    | remove    | 14.6              | Backend Platform | S      | Consolidate into canonical typed contracts                                 |
| backend/src/types/room.types.ts                 | Placeholder type file    | remove    | 14.6              | Backend Platform | S      | Consolidate into canonical typed contracts                                 |
| backend/src/types/session.types.ts              | Placeholder type file    | remove    | 14.6              | Backend Platform | S      | Consolidate into canonical typed contracts                                 |
| backend/src/types/system-message.types.ts       | Placeholder type file    | remove    | 14.6              | Backend Platform | S      | Consolidate into canonical typed contracts                                 |
| backend/src/types/user.types.ts                 | Placeholder type file    | remove    | 14.6              | Backend Platform | S      | Consolidate into canonical typed contracts                                 |
| backend/src/ws/events/client-events.ts          | Legacy ws stub           | remove    | 14.2              | Realtime         | S      | Current event contracts come from shared + ws/handlers.ts                  |
| backend/src/ws/events/server-events.ts          | Legacy ws stub           | remove    | 14.2              | Realtime         | S      | Current event contracts come from shared + ws/handlers.ts                  |
| backend/src/ws/handlers/chat.handler.ts         | Legacy ws stub           | remove    | 14.2              | Realtime         | S      | Active handler registry uses backend/src/ws/handlers.ts                    |
| backend/src/ws/handlers/conditions.handler.ts   | Legacy ws stub           | remove    | 14.2              | Realtime         | S      | Active handler registry uses backend/src/ws/handlers.ts                    |
| backend/src/ws/handlers/environment.handler.ts  | Legacy ws stub           | remove    | 14.2              | Realtime         | S      | Active handler registry uses backend/src/ws/handlers.ts                    |
| backend/src/ws/handlers/metadata.handler.ts     | Legacy ws stub           | remove    | 14.2              | Realtime         | S      | Active handler registry uses backend/src/ws/handlers.ts                    |
| backend/src/ws/handlers/notes.handler.ts        | Legacy ws stub           | remove    | 14.2              | Realtime         | S      | Active handler registry uses backend/src/ws/handlers.ts                    |
| backend/src/ws/handlers/presence.handler.ts     | Legacy ws stub           | remove    | 14.2              | Realtime         | S      | Active handler registry uses backend/src/ws/handlers.ts                    |
| backend/src/ws/handlers/room.handler.ts         | Legacy ws stub           | remove    | 14.2              | Realtime         | S      | Active handler registry uses backend/src/ws/handlers.ts                    |
| backend/src/ws/handlers/session.handler.ts      | Legacy ws stub           | remove    | 14.2              | Realtime         | S      | Active handler registry uses backend/src/ws/handlers.ts                    |
| backend/src/ws/ws.types.ts                      | Legacy ws stub           | remove    | 14.2              | Realtime         | S      | Consolidate on shared event contracts                                      |

## Sequencing Plan

1. 14.2 remove-only pass for clearly unused legacy placeholders and stubs.
2. 14.3 metadata runtime implementation and route activation.
3. 14.4 audio durability implementation for persisted state and hydration.
4. 14.5 ws handler hardening in active handler module.
5. 14.6 type consolidation and cleanup.
6. 14.7 contract/test debt closure.
7. 14.8 roadmap/docs reconciliation with final evidence links.

## Acceptance Evidence For 14.1

- Stub/placeholder inventory completed for backend src.
- Every file has an explicit action and owner.
- Stage 14 sequence is dependency ordered and executable.

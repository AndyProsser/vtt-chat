# Backend Structure Consistency Plan

Last updated: 2026-05-15

## Goals

- Keep API route files thin and HTTP-focused.
- Move domain and policy logic into core/services modules.
- Keep persistence in repositories or explicit infra adapters.
- Centralize and organize backend types by domain instead of a single mixed file.
- Enforce repeatable structure across api/core/services/infra/repositories/types.

## Target Layering

- api: route registration, request validation, status/code mapping only.
- core: domain rules and domain models (chat, notes, rooms, metadata, audio, etc.).
- services: orchestrators/use-cases that coordinate core + repositories + infra.
- repositories: database query/write operations and persistence mapping.
- infra: implementation details for db/http/redis/livekit/logging/security.
- types: shared backend-only type contracts, split by domain concern.

## Route Refactor Status

Legend:

- [x] Completed
- [~] Partially completed / in progress
- [ ] Not completed

Checklist:

- [x] Campaign external links moved from route into service.
  - backend/src/services/campaign-external-links.service.ts
  - backend/src/api/campaign.routes.ts
- [x] Integration sync moved from route into service.
  - backend/src/services/integration-sync.service.ts
  - backend/src/api/integrations.routes.ts
- [~] Metadata runtime closure extracted from route, but not into backend/src/core/metadata/\* as originally planned.
  - Implemented at:
    - backend/src/api/metadata.routes.ts
    - backend/src/services/metadata.service.ts
  - Planned path not present:
    - backend/src/core/metadata/\*
- [x] Auth/user auth-context lookups moved from routes into service layer.
  - backend/src/services/auth/user-context.service.ts
  - backend/src/api/auth.routes.ts
  - backend/src/api/users.routes.ts
- [x] Shared auth-state validation moved into service and reused by infra middleware.
  - backend/src/services/auth/user-context.service.ts
  - backend/src/infra/http/middleware.ts
- [x] Session read-access logic extracted for users/logs endpoints.
  - backend/src/services/session/access.service.ts
  - backend/src/api/session.routes.ts

Completed service modularization waves:

- [x] Admin users slice split into DTOs, constants, repository, and subfolder services.
  - backend/src/constants/admin-users.constants.ts
  - backend/src/types/admin-users.types.ts
  - backend/src/repositories/admin-users.repository.ts
  - backend/src/services/admin-users/
  - backend/src/services/admin-users.service.ts (compat re-export)
- [x] Admin campaigns list slice split into DTOs, constants, repository, and service.
  - backend/src/constants/admin-campaigns.constants.ts
  - backend/src/types/admin-campaigns.types.ts
  - backend/src/repositories/admin-campaigns.repository.ts
  - backend/src/services/admin-campaigns.service.ts
- [x] Admin portability split into feature modules with compatibility exports.
  - backend/src/constants/admin-portability.constants.ts
  - backend/src/services/admin-portability/
  - backend/src/services/admin-portability.service.ts (compat re-export)
- [x] Room service split into membership, lifecycle, and whisper modules with compatibility exports.
  - backend/src/services/room/
  - backend/src/services/room.service.ts (compat re-export)
- [x] Notes route helper/DTO slice split into constants, route DTOs, and helper service.
  - backend/src/constants/notes.constants.ts
  - backend/src/types/notes-route.types.ts
  - backend/src/services/notes/route-helpers.service.ts
- [x] Notes service split into feature modules with compatibility exports.
  - backend/src/services/notes/
  - backend/src/services/notes.service.ts (compat re-export)

High-priority route hotspots checklist:

- [~] backend/src/api/admin.routes.ts
  - Progress in this batch:
    - Telemetry status payload construction extracted to service:
      - backend/src/services/admin-telemetry.service.ts
      - backend/src/api/admin.routes.ts (`/telemetry/status` delegates to service)
    - Telemetry dashboard payload construction extracted to service:
      - backend/src/services/admin-telemetry.service.ts
      - backend/src/api/admin.routes.ts (`/telemetry/dashboard` delegates to service)
    - Telemetry logs list/drill-down payload construction extracted to service:
      - backend/src/services/admin-telemetry.service.ts
      - backend/src/api/admin.routes.ts (`/telemetry/logs` and `/telemetry/logs/:logId` delegate to service)
    - Settings state/update/merge logic extracted to service:
      - backend/src/services/admin-settings.service.ts
      - backend/src/api/admin.routes.ts (`/settings` and `/settings` PUT delegate to service helpers)
    - Settings backup/export orchestration extracted to service:
      - backend/src/services/admin-settings-backup.service.ts
      - backend/src/api/admin.routes.ts (`/settings/backup` and `/settings/backup/export` delegate to service helpers)
    - Integrations systems list/mutation orchestration extracted to service:
      - backend/src/services/admin-integrations.service.ts
      - backend/src/api/admin.routes.ts (`/integrations/systems`, `/integrations/systems/:system/authorize`, `/integrations/systems/:system/block`, `/integrations/systems/:system` delegate to service helpers)
    - Campaign operations Prisma cluster extracted to service:
      - backend/src/services/admin-campaign-operations.service.ts
      - backend/src/api/admin.routes.ts (`/campaigns/:campaignId/rooms`, `/campaigns/:campaignId/sessions/:sessionId/end`, `/campaigns/:campaignId/archive`, `/campaigns/:campaignId/restore` delegate to service helpers)
    - Campaign export/read recording/create recording Prisma clusters extracted to service:
      - backend/src/services/admin-campaign-operations.service.ts
      - backend/src/api/admin.routes.ts (`/campaigns/:campaignId/export`, `/campaigns/:campaignId/recordings` GET/POST delegate to service helpers)
    - Room move-player Prisma validation/persistence cluster extracted to service:
      - backend/src/services/admin-campaign-operations.service.ts
      - backend/src/api/admin.routes.ts (`/campaigns/:campaignId/sessions/:sessionId/rooms/:roomId/move-player` delegates DB orchestration to service; route retains WS event emission + HTTP mapping)
  - Remaining:
    - Other admin endpoints still contain direct Prisma usage and route-level orchestration.
- [~] backend/src/api/notes.routes.ts
  - Progress in this batch:
    - Route-local request/visibility helpers moved into service/types/constants:
      - backend/src/services/notes/route-helpers.service.ts
      - backend/src/types/notes-route.types.ts
      - backend/src/constants/notes.constants.ts
  - Remaining:
    - Route still coordinates note CRUD and WS broadcast plumbing.
- [~] backend/src/api/rooms.routes.ts
  - Uses services, but still contains room reconciliation and event orchestration in route layer.
- [~] backend/src/api/audio.routes.ts
  - Uses services, but still contains authz/control/event assembly logic in route layer.
- [~] backend/src/api/session.routes.ts
  - Contains extracted access service usage, but remains a large orchestrator route file.

## Types Normalization Status

Checklist:

- [x] Split backend/src/types/index.ts into focused modules.
  - Baseline modules from plan are present:
    - backend/src/types/ws.types.ts
    - backend/src/types/api.types.ts
    - backend/src/types/auth.types.ts
    - backend/src/types/service.types.ts
    - backend/src/types/errors.types.ts
    - backend/src/types/pagination.types.ts
  - Additional domain modules also exist (metadata, notes, room, session, audio, integrations, etc.).
- [x] Preserved backward compatibility via barrel exports in backend/src/types/index.ts.
- [x] Move route-local DTOs into domain type modules where reused.
  - backend/src/types/admin-users.types.ts
  - backend/src/types/admin-campaigns.types.ts
- [~] Remove stale legacy type contracts that no longer match runtime events.

## Refactor Rules (Apply to Every Route)

For each endpoint:

1. Route only validates HTTP input and calls a single service function.
2. Service returns domain results (ok/code/message/payload), not HTTP responses.
3. Route maps domain results to status codes and response body shape.
4. Database calls are prohibited directly in route files.
5. Console logging is prohibited in routes; use logger in service/core/infra.
6. Add service-focused tests and keep route contract tests green.

## Verification Gate

After each extraction batch:

1. npm run lint
2. npm --prefix backend run test
3. If route contracts changed, run impacted API tests directly first, then full suite.

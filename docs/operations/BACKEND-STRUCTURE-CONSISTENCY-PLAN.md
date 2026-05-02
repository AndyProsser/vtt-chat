# Backend Structure Consistency Plan

Last updated: 2026-05-02

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

Completed extraction waves:

- campaign external links moved from route into service:
  - backend/src/services/campaign-external-links.service.ts
  - backend/src/api/campaign.routes.ts
- integration sync moved from route into service:
  - backend/src/services/integration-sync.service.ts
  - backend/src/api/integrations.routes.ts
- metadata runtime closure implemented with route + core split:
  - backend/src/api/metadata.routes.ts
  - backend/src/core/metadata/\*
- auth/user auth-context lookups moved from routes into service:
  - backend/src/services/auth-user-context.service.ts
  - backend/src/api/auth.routes.ts
  - backend/src/api/users.routes.ts
- shared auth-state validation moved into service and reused by infra middleware:
  - backend/src/services/auth-user-context.service.ts
  - backend/src/infra/http/middleware.ts
- session read-access logic extracted for users/logs endpoints:
  - backend/src/services/session-access.service.ts
  - backend/src/api/session.routes.ts

Remaining high-priority route hotspots:

1. backend/src/api/admin.routes.ts
2. backend/src/api/notes.routes.ts
3. backend/src/api/rooms.routes.ts
4. backend/src/api/audio.routes.ts
5. backend/src/api/session.routes.ts

## Types Normalization Status

Completed:

- Split backend/src/types/index.ts into focused modules:
  - backend/src/types/ws.types.ts
  - backend/src/types/api.types.ts
  - backend/src/types/auth.types.ts
  - backend/src/types/service.types.ts
  - backend/src/types/errors.types.ts
  - backend/src/types/pagination.types.ts
- Preserved backward compatibility via barrel exports in backend/src/types/index.ts.

Next steps:

- Move route-local DTOs into domain type modules where reused.
- Remove stale legacy type contracts that no longer match runtime events.

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

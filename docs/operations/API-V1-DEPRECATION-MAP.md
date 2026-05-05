# API v1 Deprecation Map

Last updated: 2026-05-05

This map tracks legacy endpoint usage and the v1 replacements. Legacy paths remain active for compatibility during pre-release refactoring.

## Legacy Path Cutoff Control

- Feature flag: `ENABLE_LEGACY_LIVEKIT_INTEGRATIONS_PATHS`
- Default: enabled (`1`/unset)
- Disable legacy-only livekit/integrations surfaces by setting: `ENABLE_LEGACY_LIVEKIT_INTEGRATIONS_PATHS=0`
- Affected legacy families when disabled:
  - `/api/livekit/*`
  - `/api/integrations/*`
  - `/admin/api/integrations/*`
- v1 paths remain active regardless of flag state.

## Backend Mounts

- v1 mounts active:
  - `/api/v1/auth`
  - `/api/v1/session`
  - `/api/v1/presence`
  - `/api/v1/rooms`
  - `/api/v1/audio`
  - `/api/v1/livekit`
  - `/api/v1/integrations`

## Legacy to v1 Route Mapping

### Auth

- `POST /api/auth/player/guest-join` -> `POST /api/v1/auth/join/guest/player`
- `POST /api/auth/spectator/guest-join` -> `POST /api/v1/auth/join/guest/spectator`
- `POST /api/auth/player/full-join` -> `POST /api/v1/auth/join/full/player`
- `POST /api/auth/player/precheck` -> `POST /api/v1/auth/validate/player`
- `POST /api/auth/extension/guest-login` -> `POST /api/v1/auth/join/guest/player` (bridge target)

### Session

- `GET /api/session/:id/users` -> `GET /api/v1/session/:id/members`
- `POST /api/session/:id/join` -> `POST /api/v1/session/:id/members/join`
- `POST /api/session/:id/leave` -> `POST /api/v1/session/:id/members/leave`

### Presence

- `GET /api/presence/:sessionId` -> `GET /api/v1/presence/:sessionId`
- `PUT /api/presence/:sessionId/state` -> `PUT /api/v1/presence/:sessionId/state`
- `POST /api/presence/:sessionId/recover` -> `POST /api/v1/presence/:sessionId/recover`

### Rooms

- `GET /api/rooms/:sessionId` -> `GET /api/v1/rooms/session/:sessionId`
- `POST /api/rooms` -> `POST /api/v1/rooms/session/:sessionId` (sessionId in path)
- `POST /api/rooms/:roomId/join` -> `POST /api/v1/rooms/:roomId/members/join`
- `POST /api/rooms/:roomId/leave` -> `POST /api/v1/rooms/:roomId/members/leave`
- `POST /api/rooms/:roomId/move-user` -> `POST /api/v1/rooms/:roomId/members/move`

### Audio

- `GET /api/audio/presets` -> `GET /api/v1/audio/catalog/presets`
- `POST /api/audio/environment` -> `POST /api/v1/audio/environments/apply`
- `POST /api/audio/dm-override/apply` -> `POST /api/v1/audio/overrides/dm/apply`
- `POST /api/audio/dm-override/remove` -> `POST /api/v1/audio/overrides/dm/remove`
- `GET /api/audio/state/:sessionId` -> `GET /api/v1/audio/sessions/:sessionId/state`

### LiveKit

- `POST /api/livekit/token` -> `POST /api/v1/livekit/token`
- `GET /api/livekit/health` -> `GET /api/v1/livekit/health`

### Integrations

- `POST /api/integrations/external/sync` -> `POST /api/v1/integrations/external/sync`

### Admin Integrations

- `GET /admin/api/integrations/systems` -> `GET /admin/api/v1/integrations/systems`
- `POST /admin/api/integrations/systems/:system/authorize` -> `POST /admin/api/v1/integrations/systems/:system/authorize`
- `POST /admin/api/integrations/systems/:system/block` -> `POST /admin/api/v1/integrations/systems/:system/block`
- `PATCH /admin/api/integrations/systems/:system` -> `PATCH /admin/api/v1/integrations/systems/:system`

## Client Migration Status

- Frontend:
  - LiveKit token endpoint now uses `/api/v1/livekit/token`.
- Admin:
  - Integrations page now uses `/admin/api/v1/integrations/...` paths through `requestJson`.

## Removal Criteria

Legacy paths can be removed after all of the following are true:

- Frontend uses only v1 paths for user-facing APIs.
- Admin UI uses only v1 paths for integration operations.
- Extension bridge migration for auth join flow is complete.
- A full release cycle passes with no legacy path traffic in telemetry.

## Cutoff Checklist (Single Gate)

1. Set `ENABLE_LEGACY_LIVEKIT_INTEGRATIONS_PATHS=0` in dev and staging.
2. Run backend API contract tests and admin/frontend route consumer tests.
3. Verify telemetry dashboards show no 4xx spikes for livekit/integrations/admin-integrations after cutoff.
4. Confirm extension and QA scripts use v1 routes (`/api/v1/livekit/token`, `/api/v1/integrations/external/sync`).
5. Keep legacy disabled for one full release cycle.
6. Remove legacy livekit/integrations path aliases and this flag.

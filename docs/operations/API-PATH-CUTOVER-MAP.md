# API Path Cutover Map

Last updated: 2026-05-13

This document records the API path normalization cutover to canonical non-versioned route families.

## Canonical Route Families

All runtime and admin API consumers should target these mounted families:

- `/api/auth`
- `/api/session`
- `/api/presence`
- `/api/rooms`
- `/api/audio`
- `/api/livekit`
- `/api/integrations`
- `/api/admin`

## Removed Versioned Families

Version-prefixed API families are not mounted in the current backend and should return `404`.

## Path Translation Reference

- `/<api-root>/<version-prefix>/*` -> `/<api-root>/*`
- `/api/admin/<version-prefix>/*` -> `/api/admin/*`
- `/admin/api/<version-prefix>/*` -> `/admin/api/*`

## Verification Checklist

1. Backend route index mounts only non-versioned route families.
2. Frontend/admin client calls target non-versioned API paths.
3. Tests assert canonical routes and versioned-route `404` behavior.
4. Documentation examples use canonical route families.

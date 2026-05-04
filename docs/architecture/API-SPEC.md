# VTT‑Chat API Specification

_A modular, versioned REST API for real‑time virtual tabletop communication._

Status:

- This document includes both shipped runtime endpoints and broader planned API surface.
- Through Stage 7, the shared runtime contract and mounted backend routes are the source of truth for what is actually implemented.
- Endpoints described here that are not mounted in the current backend should be treated as planned architecture, not shipped behavior.

---

## Overview

This document defines the **public API surface** for the VTT‑Chat backend.
It covers:

- Authentication
- Campaigns & sessions
- Rooms & presence
- Chat & notes
- Audio presets & DM controls
- Recordings & journals
- Search
- Import/export
- Admin & telemetry

All endpoints are **JSON‑based**, **stateless**, and **authenticated** via JWT or API keys.

Current shipped runtime baseline through Stage 12 includes these mounted route families:

- `/api/auth`
- `/api/session`
- `/api/chat`
- `/api/notes`
- `/api/campaigns`
- `/api/users`
- `/api/rooms`
- `/api/presence`
- `/api/livekit`
- `/api/audio`
- `/api/admin`

The metadata route family remains planned follow-up work.

When this document describes broader campaign-scoped or planned endpoints that are not mounted in the current backend, those sections should be read as planned architecture.

---

### Runtime Baseline vs Planned Surface

Shipped baseline through Stage 7:

- Auth, campaign, user, session, chat, notes, rooms, presence, LiveKit token issuance, and baseline audio control routes.
- Route-level authorization for session membership and DM-only controls where implemented.
- Stable audio control API surface with durable persisted recovery for room environment and DM overrides via `GET /api/audio/state/:sessionId`.

Still planned or partially implemented beyond Stage 12:

- Full refresh-token lifecycle reflected in docs.
- Complete campaign-scoped REST normalization for every conceptual endpoint in this file.
- Search, richer journal/history domains, metadata timeline domains, and extension bridge domains.
- Richer audio control workflows (preset/distance/PTT/clear-all campaign-scoped endpoints) and richer admin/ops workflows.

---

## Authentication

### /api/auth/login`

Authenticate a user.

**Body**

```json
{
  "email": "user@example.com",
  "password": "secret"
}
```

**Response**

```json
{
  "token": "jwt-token",
  "user": { ... }
}
```

---

### /api/auth/refresh`

Planned; not part of the verified Stage 0-7 shipped baseline.

---

### /api/auth/logout`

Baseline logout behavior is intentionally minimal; refresh-token invalidation remains planned.

---

### Cross-App Auth Handoff (Shipped)

These endpoints define linked authentication between the user frontend and admin console so users do not need to log in twice when they already have a valid session.

#### /api/auth/handoff/admin`

Requires authenticated user token.

Purpose: exchange a frontend-authenticated user session for a one-time token that boots admin authentication.

Rules:

- Caller must be a **full account**.
- Caller must have effective admin access (`adminRole` or equivalent DM admin eligibility).
- Guest accounts return `403 GUEST_UPGRADE_REQUIRED`.

**Response**

```json
{
  "handoffToken": "one-time-token",
  "expiresInSec": 60,
  "redirectUrl": "/admin/launch?handoff=one-time-token"
}
```

#### /api/admin/auth/handoff/exchange`

Purpose: admin app exchanges one-time handoff token for admin JWT.

**Body**

```json
{
  "handoffToken": "one-time-token"
}
```

**Response**

```json
{
  "token": "admin-jwt",
  "admin": {
    "id": "uuid",
    "username": "andy",
    "adminRole": "CAMPAIGN_DM"
  }
}
```

#### /api/admin/handoff/app`

Requires authenticated admin token.

Purpose: exchange an admin-authenticated session for a one-time token that boots frontend user authentication.

**Response**

```json
{
  "handoffToken": "one-time-token",
  "expiresInSec": 60,
  "redirectUrl": "/app/launch?handoff=one-time-token"
}
```

#### /api/auth/handoff/exchange`

Purpose: frontend app exchanges one-time handoff token for user JWT.

**Body**

```json
{
  "handoffToken": "one-time-token"
}
```

**Response**

```json
{
  "token": "user-jwt",
  "user": {
    "id": "uuid",
    "username": "andy",
    "authType": "FULL"
  }
}
```

Handoff security requirements:

- One-time use only; immediate invalidation after exchange.
- Very short TTL (recommended 30-60 seconds).
- Bound to user identity + target application (`admin` or `app`).
- Logged for audit (issuer, consumer app, timestamp, success/failure).

---

### /api/platform/status`

Public endpoint. Returns platform health and activity snapshot for the extension pre-flight check.

No authentication required.

**Response**

```json
{
  "online": true,
  "version": "1.4.0",
  "activeUsers": 24,
  "activeCampaigns": 5,
  "activeSessions": 2,
  "maintenanceMode": false
}
```

---

### /api/campaigns/invite/:code/validate`

Public endpoint. Validates an invite code and returns basic campaign info.

No authentication required.

**Response (valid)**

```json
{
  "valid": true,
  "campaign": {
    "name": "The Lost Mines",
    "dmDisplayName": "Gandalf"
  },
  "platformStatus": {
    "online": true,
    "activeUsers": 12
  }
}
```

**Response (invalid)**

```json
{
  "valid": false,
  "reason": "INVITE_EXPIRED"
}
```

---

### /api/auth/extension/preflight`

Public endpoint. Checks whether an email address has an existing vtt-chat account without issuing a token.

Used by the extension pre-flight to determine which auth branch to present the user.

**Body**

```json
{
  "email": "player@example.com",
  "externalSystem": "dndbeyond",
  "externalUserId": "ddb-user-12345",
  "inviteCode": "abc123..."
}
```

**Response**

```json
{
  "accountStatus": "none" | "guest" | "full",
  "suggestedFlow": "guest" | "auto-login" | "authenticate" | "already-authenticated"
}
```

---

### /api/auth/extension/guest-login`

Canonical extension endpoint for guest DM/Player launch via invite POST. Used by **both players and DMs**; no separate DM endpoint exists. The server determines the caller's table role (DM or Player) by comparing `externalUserId` against `campaignPacket.dmExternalUserId`.

Policy lock note (2026-05-04): DM/Player guest access is granted only through extension invite POST flow (`POST /api/auth/extension/guest-login`), and resulting guest access is campaign-scoped. Guest users can later upgrade to full accounts. Outside extension launch, DM/Player guest access is not granted.

No authentication required. Validates invite code and authorized external system before creating any records.

**Body**

```json
{
  "inviteCode": "abc123...",
  "externalSystem": "dndbeyond",
  "externalUserId": "ddb-user-12345",
  "email": "player@example.com",
  "displayName": "Aragorn's Player",
  "avatarUrl": "https://ddb.ac/avatars/player.png",
  "character": {
    "name": "Aragorn",
    "race": "Human",
    "class": "Ranger",
    "subclass": "Hunter",
    "level": 5,
    "externalCharacterId": "ddb-char-67890",
    "characterUrl": "https://www.dndbeyond.com/characters/67890",
    "avatarUrl": "https://ddb.ac/avatars/char.png"
  },
  "campaignPacket": {
    "externalCampaignId": "ddb-campaign-11111",
    "campaignName": "The Lost Mines of Phandelver",
    "dmExternalUserId": "ddb-user-99999",
    "members": [
      {
        "externalUserId": "ddb-user-12345",
        "displayName": "Aragorn's Player",
        "avatarUrl": "https://ddb.ac/avatars/player.png",
        "character": {
          "externalCharacterId": "ddb-char-67890",
          "name": "Aragorn",
          "class": "Ranger",
          "level": 5,
          "avatarUrl": "https://ddb.ac/avatars/char.png"
        }
      },
      {
        "externalUserId": "ddb-user-22222",
        "displayName": "Legolas's Player",
        "avatarUrl": "https://ddb.ac/avatars/player2.png",
        "character": {
          "externalCharacterId": "ddb-char-33333",
          "name": "Legolas",
          "class": "Fighter",
          "level": 5,
          "avatarUrl": "https://ddb.ac/avatars/char2.png"
        }
      }
    ]
  }
}
```

`campaignPacket` is **required** on the first connection for a campaign (when no `CampaignExternalLink` yet exists for this invite code). On subsequent connections it is optional; if supplied, it is used to update member stubs per `extensionSyncPolicy`.

**Response**

```json
{
  "token": "jwt-guest-token",
  "user": {
    "id": "uuid",
    "displayName": "Aragorn's Player",
    "avatarUrl": "https://ddb.ac/avatars/player.png",
    "authType": "GUEST",
    "campaignId": "uuid",
    "role": "Player"
  },
  "character": {
    "id": "uuid",
    "name": "Aragorn",
    "avatarUrl": "https://ddb.ac/avatars/char.png"
  },
  "campaignBootstrapped": false
}
```

`role` is `"DM"` or `"Player"` as determined server-side. `campaignBootstrapped` is `true` only when this request created the campaign data structures for the first time.

---

### /api/auth/upgrade`

Upgrades a guest account to a full account by setting a password.

Requires valid guest token.

**Body**

```json
{
  "password": "new-secure-password"
}
```

**Response**: new JWT with `authType: FULL` + updated user record.

---

### /api/integrations/external/sync`

Pushes character or campaign data updates from the extension. Applies updates based on the campaign's `extensionSyncPolicy` and the caller's role.

Requires authentication (guest or full token).

**Body**

```json
{
  "campaignId": "uuid",
  "externalSystem": "dndbeyond",
  "source": "player",
  "characterUpdate": {
    "externalCharacterId": "ddb-char-67890",
    "level": 6,
    "class": "Ranger",
    "subclass": "Gloom Stalker"
  },
  "campaignUpdate": null
}
```

---

### Admin: External System Authorization

These endpoints are restricted to admin users.

```
GET   /api/admin/integrations/systems
POST  /api/admin/integrations/systems/:system/authorize
POST  /api/admin/integrations/systems/:system/block
PATCH /api/admin/integrations/systems/:system
```

See [../extension/THIRD-PARTY-INTEGRATIONS.md § 11](../extension/THIRD-PARTY-INTEGRATIONS.md) for field descriptions and authorization state model.

---

### Spectator Access

#### /api/campaigns/watch/:code/validate`

Public endpoint. Validates a spectator invite code and returns campaign info, character roster, and slot availability. No authentication required for validation.

Join policy: this watch flow can proceed with a full account or can create a temporary guest spectator via `POST /api/auth/spectator/guest-join`, depending on policy and slot availability.

**Response (valid, session active)**

```json
{
  "valid": true,
  "type": "spectator",
  "campaign": {
    "name": "The Lost Mines",
    "dmDisplayName": "Gandalf",
    "sessionActive": true,
    "spectatorSlotsFilled": 2,
    "spectatorSlotsMax": 5,
    "spectatorWaitlistEnabled": true,
    "waitlistPosition": null
  },
  "characters": [
    {
      "name": "Aragorn",
      "class": "Ranger",
      "level": 5,
      "avatarUrl": "https://ddb.ac/avatars/char.png",
      "online": true
    },
    {
      "name": "Gandalf",
      "class": "Wizard",
      "level": 20,
      "avatarUrl": "https://ddb.ac/avatars/char2.png",
      "online": false
    }
  ]
}
```

**Response (invalid)**

```json
{ "valid": false, "reason": "INVITE_EXPIRED" }
```

---

#### /api/auth/spectator/guest-join`

Canonical spectator guest onboarding endpoint for direct watch links. Creates a temporary guest spectator session and issues a token (or waitlist position) when policy allows.

No authentication required. Validates spectator invite code, `spectatorPolicy`, and slot availability.

Guest spectator identities created here are temporary and scoped to watch-session participation.

**Body**

```json
{
  "spectatorInviteCode": "xyz789...",
  "displayName": "DragonFan42",
  "email": "fan@example.com"
}
```

**Response (slot available)**

```json
{
  "token": "jwt-spectator-token",
  "user": { "id": "uuid", "displayName": "DragonFan42", "authType": "GUEST" },
  "campaignId": "uuid",
  "status": "active"
}
```

**Response (waitlisted)**

```json
{
  "token": null,
  "campaignId": "uuid",
  "status": "waitlisted",
  "waitlistPosition": 3,
  "waitlistToken": "opaque-poll-token"
}
```

---

#### /api/campaigns/:id/spectator/waitlist-status`

Poll for waitlist promotion. Returns current position or a token if promoted.

Requires `waitlistToken` as a query parameter (no user auth required; the token itself authenticates the request).

**Response (still waiting)**

```json
{ "status": "waitlisted", "waitlistPosition": 2 }
```

**Response (promoted)**

```json
{ "status": "promoted", "token": "jwt-spectator-token" }
```

---

#### /api/campaigns/browse`

Lists campaigns visible by campaign privacy/access rules for full-account users. Guest player accounts are not permitted to access this endpoint.

Requires valid full-account JWT.

**Response**

```json
{
  "campaigns": [
    {
      "id": "uuid",
      "name": "The Lost Mines",
      "dmDisplayName": "Gandalf",
      "sessionActive": true,
      "spectatorSlotsFilled": 2,
      "spectatorSlotsMax": 5,
      "private": false
    },
    {
      "id": "uuid",
      "name": "Dragon of Icespire Peak",
      "dmDisplayName": "Merlin",
      "sessionActive": true,
      "spectatorSlotsFilled": 0,
      "spectatorSlotsMax": 0,
      "private": true
    }
  ]
}
```

Campaigns with `spectatorPolicy = NONE` or `discoverable = false` appear with `private: true` and no slot info.

Campaign visibility is campaign-scoped and is not removed by session lifecycle state. Session status is returned for launch/watch context and history routing only.

---

## Users & Characters

Policy lock note (2026-05-04): campaign participation relationship is `User -> CampaignMembership(role) -> Character` (player-only character ownership), with one active character per player per campaign. Character replacement is supported; message/history records should preserve send-time character snapshot identity.

### /api/users/me`

Return authenticated user profile.

---

### /api/users/me/characters`

List all characters owned by the user.

---

### /api/campaigns/:campaignId/characters`

Create a character in a campaign.

**Body**

```json
{
  "name": "Thorin",
  "race": "Dwarf",
  "class": "Fighter",
  "subclass": "Champion",
  "level": 5,
  "status": "ALIVE",
  "notes": "Markdown notes",
  "characterUrl": "https://ddb.ac/character/123"
}
```

---

## Campaigns

### /api/campaigns`

List campaigns the user belongs to.

---

### /api/campaigns`

Create a new campaign.

---

### /api/campaigns/:campaignId`

Get campaign details.

---

### /api/campaigns/:campaignId/join`

Join a campaign via invite code.

---

### /api/campaigns/:campaignId/dm/change`

Change the campaign DM.

**Body**

```json
{
  "newDmUserId": "u123",
  "reason": "Session handoff"
}
```

---

## Sessions

### /api/campaigns/:campaignId/sessions/start`

Start a session.

**Response**

```json
{
  "sessionId": "s123",
  "recap": { "manual": "...", "ai": "..." }
}
```

---

### /api/campaigns/:campaignId/sessions/:sessionId/end`

End a session.

---

### /api/campaigns/:campaignId/sessions`

List sessions.

---

## Rooms

### /api/campaigns/:campaignId/rooms`

List rooms (main, group, private).

---

### /api/campaigns/:campaignId/rooms`

Create a group room.

**Body**

```json
{
  "name": "Scouting Party"
}
```

---

### /api/campaigns/:campaignId/rooms/:roomId`

Delete a room.

---

## Chat

### /api/campaigns/:campaignId/chat`

Query chat messages.

**Query params**

- `sessionId`
- `roomId`
- `userId`
- `type`
- `hashtag`
- `from`
- `to`

---

### /api/campaigns/:campaignId/chat`

Send a message.

**Body**

```json
{
  "roomId": "main",
  "markdown": "Hello!",
  "type": "ROOM"
}
```

---

### /api/campaigns/:campaignId/chat/whisper`

Send a whisper.

---

## Notes

### /api/campaigns/:campaignId/notes`

List notes.

---

### /api/campaigns/:campaignId/notes`

Create a note.

**Body**

```json
{
  "markdown": "We found a secret door.",
  "type": "METAGAME",
  "tags": ["#loot"],
  "visibility": "PARTY"
}
```

---

### /api/campaigns/:campaignId/notes/:noteId/publish`

Publish note to chat.

---

### /api/campaigns/:campaignId/notes/:noteId/share`

Share note with specific users.

**Body**

```json
{
  "userIds": ["u123", "u456"]
}
```

---

## Audio Presets & DM Controls

The audio section below mixes shipped baseline routes with broader planned architecture.

Shipped runtime baseline routes:

- `GET /api/audio/presets`
- `POST /api/audio/environment`
- `POST /api/audio/dm-override/apply`
- `POST /api/audio/dm-override/remove`
- `GET /api/audio/state/:sessionId`

Current baseline notes:

- Audio control events are authoritative in realtime.
- `GET /api/audio/state/:sessionId` returns durable persisted room environment and DM override state for reconnect/recovery flows.
- Broader preset, distance, PTT, and clear-all workflows described below remain planned architecture until mounted and verified.

### /api/audio-presets`

Conceptual legacy endpoint. Current shipped baseline uses `GET /api/audio/presets`.

---

### /api/campaigns/:campaignId/audio/apply`

Planned architecture endpoint; not part of the verified shipped Stage 7 baseline.

**Body**

```json
{
  "targetUserId": "u123",
  "presetType": "CONDITION",
  "presetId": "SILENCED"
}
```

---

### /api/campaigns/:campaignId/audio/clear`

Planned architecture endpoint.

---

### /api/campaigns/:campaignId/audio/clear-all`

Planned architecture endpoint.

---

### /api/campaigns/:campaignId/audio/environment`

Planned architecture path. Current shipped baseline uses `POST /api/audio/environment`.

---

### /api/campaigns/:campaignId/audio/distance`

Planned architecture endpoint.

---

### /api/campaigns/:campaignId/audio/ptt/start`

Planned architecture endpoint.

---

### /api/campaigns/:campaignId/audio/ptt/end`

Planned architecture endpoint.

---

## Planned Later-Stage Domains

The following endpoint groups remain planned architecture and are intentionally summarized here rather than documented as if they were part of the shipped Stage 0-7 surface:

- recordings and journal endpoints
- search endpoints for messages, notes, and recordings
- external log ingestion endpoints
- broader campaign-admin action endpoints
- client telemetry ingestion and richer dependency/status endpoints

These domains should be expanded into full API documentation only when the routes are mounted and validated in the runtime.

---

## Admin Telemetry Baseline

Current partially shipped admin baseline endpoints include:

- `GET /api/admin/telemetry/dashboard`
- `GET /api/admin/telemetry/status`
- `GET /api/admin/telemetry/logs`

Current logs query parameters:

- `timeRange` (`1h` | `24h` | `7d`)
- `severity`
- `source`
- `userId`
- `roomId`
- `page`
- `pageSize`
- `sortBy` (`timestamp` | `severity` | `source` | `message`)
- `sortDir` (`asc` | `desc`)

Still planned beyond the current baseline:

- aggregate telemetry query endpoints
- performance-series metrics endpoints
- audit-log query endpoints
- authenticated operational action endpoints beyond readonly telemetry

---

## Admin Portability and Recording Metadata (Stage 12 Shipped)

The following Stage 12 endpoints are mounted and validated in runtime:

- `GET /api/admin/campaigns/:campaignId/export`
- `POST /api/admin/campaigns/import`
- `GET /api/admin/campaigns/:campaignId/recordings`
- `POST /api/admin/campaigns/:campaignId/recordings`
- `GET /api/admin/settings/backup/export`

Operational notes:

- Campaign import creates a new campaign and does not overwrite existing campaigns.
- Export/import and recording metadata writes are audit logged through admin audit entries.
- Portability payloads are persisted as artifacts for traceability/recovery workflows.

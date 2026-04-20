# **API-SPEC.md**

# VTT‑Chat API Specification

_A modular, versioned REST API for real‑time virtual tabletop communication._

Status:

- This document includes both shipped runtime endpoints and broader planned API surface.
- Through Stage 7, the shared runtime contract and mounted backend routes are the source of truth for what is actually implemented.
- Endpoints described here that are not mounted in the current backend should be treated as planned architecture, not shipped behavior.

---

## 📘 Overview

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

Current shipped runtime baseline through Stage 7 includes mounted route families for:

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

Placeholder route families such as metadata and export remain planned follow-up work.

When this document describes broader campaign-scoped or future-state endpoints that are not mounted in the current backend, those sections should be read as target architecture.

---

# Runtime Baseline vs Planned Surface

Shipped baseline through Stage 7:

- Auth, campaign, user, session, chat, notes, rooms, presence, LiveKit token issuance, and baseline audio control routes.
- Route-level authorization for session membership and DM-only controls where implemented.
- Stable baseline audio control API surface, including an audio state endpoint that is not yet backed by durable persisted recovery.

Still planned or partially implemented beyond Stage 7:

- Full refresh-token lifecycle reflected in docs.
- Complete campaign-scoped REST normalization for every conceptual endpoint in this file.
- Search, recordings, journal/history, metadata, import/export, and other later-stage domains.
- Durable audio-state recovery and richer admin/ops workflows.

---

# 🔐 Authentication

## `POST /api/auth/login`

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

## `POST /api/auth/refresh`

Planned / not part of the verified Stage 0-7 shipped baseline.

---

## `POST /api/auth/logout`

Baseline logout behavior is intentionally minimal; refresh-token invalidation remains planned.

---

## Cross-App Auth Handoff (Planned Stage 8 Follow-up)

These endpoints define linked authentication between the user frontend and admin console so users do not need to log in twice when they already have a valid session.

### `POST /api/auth/handoff/admin`

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

### `POST /api/admin/auth/handoff/exchange`

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

### `POST /api/admin/handoff/app`

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

### `POST /api/auth/handoff/exchange`

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

## `GET /api/platform/status`

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

## `GET /api/campaigns/invite/:code/validate`

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

## `POST /api/auth/extension/preflight`

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

## `POST /api/auth/extension/guest-login`

Creates or resumes a guest session based on extension-scraped identity data and a valid player invite code. Used by **both players and DMs** — no separate DM endpoint exists. The server determines the caller's table role (DM or Player) by comparing `externalUserId` against `campaignPacket.dmExternalUserId`.

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

## `POST /api/auth/upgrade`

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

## `POST /api/integrations/external/sync`

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

## Admin: External System Authorization

These endpoints are restricted to admin users.

```
GET   /api/admin/integrations/systems
POST  /api/admin/integrations/systems/:system/authorize
POST  /api/admin/integrations/systems/:system/block
PATCH /api/admin/integrations/systems/:system
```

See [../extension/THIRD-PARTY-INTEGRATIONS.md § 11](../extension/THIRD-PARTY-INTEGRATIONS.md) for field descriptions and authorization state model.

---

## Spectator Access

### `GET /api/campaigns/watch/:code/validate`

Public endpoint. Validates a spectator invite code and returns campaign info, character roster, and slot availability. No authentication required.

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

### `POST /api/auth/spectator/guest-join`

Creates a guest spectator account and issues a token (if a slot is available) or a waitlist position (if at capacity with waitlist enabled).

No authentication required. Validates spectator invite code, `spectatorPolicy`, and slot availability.

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

### `GET /api/campaigns/:id/spectator/waitlist-status`

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

### `GET /api/campaigns/browse`

Lists discoverable active campaigns with spectator slots for full-account users. Guest player accounts are not permitted to access this endpoint.

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

---

# 🧑‍🤝‍🧑 Users & Characters

## `GET /api/users/me`

Return authenticated user profile.

---

## `GET /api/users/me/characters`

List all characters owned by the user.

---

## `POST /api/campaigns/:campaignId/characters`

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

# 🏕️ Campaigns

## `GET /api/campaigns`

List campaigns the user belongs to.

---

## `POST /api/campaigns`

Create a new campaign.

---

## `GET /api/campaigns/:campaignId`

Get campaign details.

---

## `POST /api/campaigns/:campaignId/join`

Join a campaign via invite code.

---

## `POST /api/campaigns/:campaignId/dm/change`

Change the campaign DM.

**Body**

```json
{
  "newDmUserId": "u123",
  "reason": "Session handoff"
}
```

---

# 🎭 Sessions

## `POST /api/campaigns/:campaignId/sessions/start`

Start a session.

**Response**

```json
{
  "sessionId": "s123",
  "recap": { "manual": "...", "ai": "..." }
}
```

---

## `POST /api/campaigns/:campaignId/sessions/:sessionId/end`

End a session.

---

## `GET /api/campaigns/:campaignId/sessions`

List sessions.

---

# 🏠 Rooms

## `GET /api/campaigns/:campaignId/rooms`

List rooms (main, group, private).

---

## `POST /api/campaigns/:campaignId/rooms`

Create a group room.

**Body**

```json
{
  "name": "Scouting Party"
}
```

---

## `DELETE /api/campaigns/:campaignId/rooms/:roomId`

Delete a room.

---

# 💬 Chat

## `GET /api/campaigns/:campaignId/chat`

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

## `POST /api/campaigns/:campaignId/chat`

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

## `POST /api/campaigns/:campaignId/chat/whisper`

Send a whisper.

---

# 📝 Notes

## `GET /api/campaigns/:campaignId/notes`

List notes.

---

## `POST /api/campaigns/:campaignId/notes`

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

## `POST /api/campaigns/:campaignId/notes/:noteId/publish`

Publish note to chat.

---

## `POST /api/campaigns/:campaignId/notes/:noteId/share`

Share note with specific users.

**Body**

```json
{
  "userIds": ["u123", "u456"]
}
```

---

# 🎙️ Audio Presets & DM Controls

The audio section below mixes shipped baseline routes with broader target architecture.

Shipped runtime baseline routes:

- `GET /api/audio/presets`
- `POST /api/audio/environment`
- `POST /api/audio/dm-override/apply`
- `POST /api/audio/dm-override/remove`
- `GET /api/audio/state/:sessionId`

Current baseline notes:

- Audio control events are authoritative in realtime.
- `GET /api/audio/state/:sessionId` exists as a stable API surface for later expansion, but does not yet provide durable persisted room/environment/override recovery.
- Broader preset, distance, PTT, and clear-all workflows described below remain target architecture until mounted and verified.

## `GET /api/audio-presets`

Conceptual legacy endpoint. Current shipped baseline uses `GET /api/audio/presets`.

---

## `POST /api/campaigns/:campaignId/audio/apply`

Planned target-architecture endpoint; not part of the verified shipped Stage 7 baseline.

**Body**

```json
{
  "targetUserId": "u123",
  "presetType": "CONDITION",
  "presetId": "SILENCED"
}
```

---

## `POST /api/campaigns/:campaignId/audio/clear`

Planned target-architecture endpoint.

---

## `POST /api/campaigns/:campaignId/audio/clear-all`

Planned target-architecture endpoint.

---

## `POST /api/campaigns/:campaignId/audio/environment`

Target-architecture path. Current shipped baseline uses `POST /api/audio/environment`.

---

## `POST /api/campaigns/:campaignId/audio/distance`

Planned target-architecture endpoint.

---

## `POST /api/campaigns/:campaignId/audio/ptt/start`

Planned target-architecture endpoint.

---

## `POST /api/campaigns/:campaignId/audio/ptt/end`

Planned target-architecture endpoint.

---

# Planned Later-Stage Domains

The following endpoint groups remain target architecture and are intentionally summarized here rather than documented as if they were part of the shipped Stage 0-7 surface:

- recordings and journal endpoints
- search endpoints for messages, notes, and recordings
- external log ingestion endpoints
- import/export workflows
- broader campaign-admin action endpoints
- client telemetry ingestion and richer dependency/status endpoints

These domains should be expanded into full API documentation only when the routes are mounted and validated in the runtime.

---

# 🛠️ Admin Telemetry Baseline

Partially shipped admin baseline endpoints currently include:

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

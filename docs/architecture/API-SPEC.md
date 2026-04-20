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

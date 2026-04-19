# **API-SPEC.md**

# VTT‑Chat API Specification

_A modular, versioned REST API for real‑time virtual tabletop communication._

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

Refresh JWT.

---

## `POST /api/auth/logout`

Invalidate refresh token (optional).

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

## `GET /api/audio-presets`

Return preset library (voice, distance, environment, condition, IC).

---

## `POST /api/campaigns/:campaignId/audio/apply`

Apply an audio preset.

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

Clear a preset.

---

## `POST /api/campaigns/:campaignId/audio/clear-all`

DM clears all effects.

---

## `POST /api/campaigns/:campaignId/audio/environment`

Apply environment preset to a room.

---

## `POST /api/campaigns/:campaignId/audio/distance`

Set distance for a user.

---

## `POST /api/campaigns/:campaignId/audio/ptt/start`

Start PTT override.

---

## `POST /api/campaigns/:campaignId/audio/ptt/end`

End PTT override.

---

# 🔊 Recordings & Journals

## `GET /api/campaigns/:campaignId/recordings`

List recordings.

---

## `GET /api/campaigns/:campaignId/recordings/:recordingId`

Get recording metadata.

---

## `GET /api/campaigns/:campaignId/sessions/:sessionId/journal`

Get session journal.

---

# 🔍 Search

## `GET /api/search/messages`

Search messages across sessions.

---

## `GET /api/search/notes`

Search notes.

---

## `GET /api/search/recordings`

Search recordings.

---

# 🔌 External Log Ingestion

## `POST /api/integrations/logs/ingest`

Ingest logs from DDB/Roll20/FVTT.

**Body**

```json
{
  "source": "DDB",
  "campaignExternalId": "ddb-123",
  "userExternalId": "ddb-user-456",
  "rawPayload": { ... }
}
```

---

# 📦 Import / Export

## `GET /api/campaigns/:campaignId/export`

Export campaign data.

---

## `POST /api/campaigns/import`

Import campaign data.

---

# 🛠️ Admin

## `GET /api/admin/campaigns`

List all campaigns.

---

## `POST /api/admin/campaigns/:campaignId/archive`

Archive a campaign.

---

## `POST /api/admin/campaigns/:campaignId/restore`

Restore a campaign.

---

## `GET /api/admin/telemetry/dashboard`

Get dashboard telemetry summary cards.

## `GET /api/admin/telemetry/status`

Get platform status metrics and chart data.

## `GET /api/admin/telemetry/logs`

Get admin logs with filtering, sorting, and pagination.

Query params (current):

- `timeRange` (`1h` | `24h` | `7d`)
- `severity`
- `source`
- `userId`
- `roomId`
- `page`
- `pageSize`
- `sortBy` (`timestamp` | `severity` | `source` | `message`)
- `sortDir` (`asc` | `desc`)

## `GET /api/admin/telemetry`

Planned aggregate telemetry query endpoint for higher-level analytics views.

## `GET /api/admin/telemetry/performance`

Planned endpoint for performance-series metrics (latency/throughput/resource).

## `GET /api/admin/audit/logs`

Planned endpoint for audit-specific action history (moderation/security/config changes).

---

# 📡 Telemetry

## `POST /api/telemetry/client`

Client → server telemetry events.

Expected usage:

- frontend clients send batched, privacy-safe telemetry events
- backend aggregates/stores events for dashboard and operational analytics
- payloads must exclude raw chat/note/private content

---

# 🩺 Status & Health

## `GET /api/status`

Basic health check.

---

## `GET /api/status/dependencies`

Check DB, Redis, LiveKit, queue.

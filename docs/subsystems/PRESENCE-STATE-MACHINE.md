# Presence & Session State Machine

_A Redis‑first real‑time presence model with DB‑backed recovery and analytics._

Status:

- This document mixes shipped Stage 6 presence behavior with older target-architecture location-state examples.
- Lowercase websocket event names and campaign-scoped publish examples in this file should be read as conceptual legacy flow descriptions, not the shipped runtime contract.
- For current runtime contracts, see [../README.md](../README.md#runtime-source-of-truth).

---

## 📘 Overview

This document describes the **presence architecture** for the VTT‑Chat platform.
Presence is the backbone of:

- Room membership
- Green room → session transitions
- Private chat
- DM/assistant DM authority
- Audio routing
- WebSocket fan‑out
- Recovery after Redis restart
- Telemetry & analytics

Presence is **authoritative in Redis**, with **periodic snapshots** stored in Postgres for:

- Crash recovery
- Analytics
- Session history

### Dual-State Clarification

This document describes session/location presence (for example `GREEN_ROOM`, `IN_SESSION_PRIMARY`).
It is separate from the user activity presence enum used in Stage 0 contracts
(`ONLINE`, `TYPING`, `SPEAKING`, `IDLE`, `OFFLINE`).

Both dimensions may coexist:

- Location presence: where the user is in the session topology.
- Activity presence: what the user is currently doing.

---

## 🧩 Presence State Machine (Client-Level)

Each client runs a deterministic state machine that mirrors Redis.

```text
OFFLINE
  ↓ connect
CONNECTING
  ↓ presence.joinCampaign
GREEN_ROOM
  ↓ session.started
IN_SESSION_PRIMARY
  ↳ PRIVATE_ROOM_ACTIVE (secondary)
  ↳ SHOUTING (ephemeral)
  ↳ DM_OVERRIDE_ACTIVE (ephemeral)
  ↓ session.ended
GREEN_ROOM
  ↓ disconnect
DISCONNECTED_RECOVERABLE
  ↓ reconnect
(previous state)
```

### State meanings

| State                        | Meaning                  |
| ---------------------------- | ------------------------ |
| **OFFLINE**                  | No WS connection         |
| **CONNECTING**               | WS handshake in progress |
| **GREEN_ROOM**               | Pre‑session lobby        |
| **IN_SESSION_PRIMARY**       | In main/group room       |
| **IN_SESSION_PRIVATE**       | In private chat          |
| **DISCONNECTED_RECOVERABLE** | Temporary network loss   |

---

## 🧠 Redis Presence Model (Authoritative)

Redis stores **all live state** using hashes, sets, sorted sets, and TTL keys.

### 1. Campaign Presence Hash

#### `presence:campaign:{campaignId}`

**Hash**
Key = `userId`
Value = JSON blob:

```json
{
  "state": "GREEN_ROOM",
  "primaryRoomId": "main",
  "privateRoomId": null,
  "role": "PLAYER",
  "characterId": "char123",
  "lastSeenAt": 1713123123
}
```

---

### 2. Room Membership Sets

#### `room:campaign:{campaignId}:{roomId}:members`

**Set of userIds**

Used for:

- WebSocket fan‑out
- LiveKit subscription decisions
- DM monitoring
- Recording logic

---

### 3. Green Room Membership

#### `room:campaign:{campaignId}:green-room:members`

**Set**

Green room is:

- Pre‑session
- Post‑session
- Ephemeral
- Never recorded

---

### 4. Private Rooms

#### `room:campaign:{campaignId}:private:{privateRoomId}:members`

**Set**

Private rooms:

- Are created on demand
- Auto‑expire after inactivity
- Are never recorded
- Disable all audio effects

TTL: **5 minutes** after last user leaves.

---

### 5. Activity Tracking

#### `presence:campaign:{campaignId}:activity`

**Sorted set**
Score = timestamp
Member = userId

Used for:

- Idle detection
- Cleanup
- Telemetry sampling

---

### 6. DM & Assistant DM Roles

#### `campaign:{campaignId}:roles`

**Hash**

```json
{
  "u123": "DM",
  "u456": "ASSISTANT_DM",
  "u789": "PLAYER"
}
```

#### Session‑scoped assistant DM roles

#### `session:{sessionId}:assistant-dms`

**Set**
TTL = session lifetime.

---

### 7. Audio Overrides

#### `audio:campaign:{campaignId}:overrides:{userId}`

**Hash**

```json
{
  "gain": "0.5",
  "muted": "false",
  "effects": "{\"distance\":10}",
  "expiresAt": 1713129999
}
```

TTL = session lifetime.

---

### 8. Shout State

#### `shout:campaign:{campaignId}:{userId}`

**String**
TTL = 2–5 seconds.

Used to route upstream audio to primary room temporarily.

---

### 9. WebSocket Fan‑Out Channels

- `ws:campaign:{campaignId}`
- `ws:campaign:{campaignId}:room:{roomId}`
- `ws:user:{userId}`

---

## 🔄 State Transitions (Redis-Level)

### 1. Join Campaign → Green Room

```text
HSET presence:campaign:123 userId {...state:"GREEN_ROOM"...}
SADD room:campaign:123:green-room:members userId
ZADD presence:campaign:123:activity timestamp userId
PUBLISH ws:campaign:123 {event:"presence.joinCampaign"}
```

---

### 2. Start Session → Move Everyone to Main Room

```text
For each user in green room:
  HSET presence state="IN_SESSION_PRIMARY", primaryRoomId="main"
  SREM green-room:members userId
  SADD room:main:members userId
  PUBLISH ws:campaign:123:room:main {event:"presence.joinRoom"}
```

---

### 3. Switch Rooms

```text
HSET presence primaryRoomId="group-1"
SREM room:main:members userId
SADD room:group-1:members userId
PUBLISH ws:campaign:123:room:group-1 {event:"presence.joinRoom"}
```

---

### 4. Private Chat Start

```text
SADD room:private:xyz:members userId
HSET presence privateRoomId="xyz", state="IN_SESSION_PRIVATE"
EXPIRE room:private:xyz:members 300
PUBLISH ws:user:targetUser {event:"private.started"}
```

---

### 5. Private Chat End

```text
HSET presence privateRoomId=null, state="IN_SESSION_PRIMARY"
SREM room:private:xyz:members userId
PUBLISH ws:user:targetUser {event:"private.ended"}
```

---

### 6. Session End → Return to Green Room

```text
For each user in session:
  HSET presence state="GREEN_ROOM", primaryRoomId=null, privateRoomId=null
  SADD green-room:members userId
  PUBLISH ws:campaign:123 {event:"session.ended"}
```

---

## 🧱 DB Snapshots (Recovery + Analytics)

Every 30–60 seconds, a worker writes:

### `PresenceSnapshot`

| Field           | Description    |
| --------------- | -------------- |
| `campaignId`    | Campaign       |
| `userId`        | User           |
| `sessionId`     | Session        |
| `primaryRoomId` | Current room   |
| `privateRoomId` | Private room   |
| `state`         | Presence state |
| `lastSeenAt`    | Timestamp      |

Snapshots allow:

- Recovery after Redis crash
- Session playback
- Analytics (room usage, time spent, etc.)

---

## 🔁 Redis Failure Recovery

If Redis fails:

1. Load latest snapshots from Postgres
2. Rebuild:
   - `presence:campaign:*`
   - `room:*:members`
   - `roles`
3. Mark all users as `DISCONNECTED_RECOVERABLE`
4. When clients reconnect, they send:

   ```json
   {
     "campaignId": "...",
     "characterId": "...",
     "lastKnownRoom": "..."
   }
   ```

5. Server restores them to correct room and state

This provides **graceful degradation**.

---

## 📡 Telemetry & Analytics

Presence events are logged as **aggregated telemetry**, not detailed logs.

Redis list:

### `telemetry:presence:campaign:{campaignId}`

Each entry:

```json
{
  "ts": 1713123123,
  "userId": "u123",
  "event": "JOIN_ROOM",
  "roomId": "main"
}
```

A worker periodically:

- Reads the list
- Aggregates into `TelemetryEvent`
- Truncates processed entries

---

## 🧠 Design Principles

### 1. Redis is authoritative for live state

DB is for history, analytics, and recovery.

### 2. Presence transitions are atomic

Every transition updates:

- Presence hash
- Room membership sets
- Activity sorted set
- WebSocket fan‑out

### 3. Private rooms are ephemeral

TTL‑based cleanup ensures no stale rooms.

### 4. DM authority is explicit

Roles stored in Redis + DB history.

### 5. Session boundaries matter

Green room → session → green room.

### 6. Recovery is deterministic

Snapshots + reconnect protocol.

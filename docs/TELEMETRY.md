# **TELEMETRY.md**

# Telemetry & Analytics

_A privacy‑respecting, low‑overhead telemetry pipeline for client events, presence analytics, and system health._

---

## 📘 Overview

The telemetry subsystem provides **lightweight, anonymous analytics** for:

- Feature usage
- Client performance
- Presence & room activity
- Session flow
- Audio effect usage
- Extension activity
- System health

Telemetry is:

- **Anonymous**
- **Aggregated**
- **Non‑PII**
- **Low‑frequency**
- **Opt‑out capable**
- **Stored long‑term** for campaign analytics

This document defines:

- Client telemetry batching
- WebSocket telemetry events
- Redis ingestion
- Aggregation workers
- Postgres storage
- Query patterns
- Privacy guarantees

---

# 🧩 1. Telemetry Architecture Overview

```
Client (Zustand Telemetry Store)
        ↓ batched events
WebSocket: telemetry.clientEvent
        ↓
Redis (raw event lists)
        ↓ periodic worker
Aggregator
        ↓
Postgres (TelemetryEvent)
        ↓
Analytics / dashboards
```

Telemetry is **never** used for:

- Advertising
- Tracking users across campaigns
- Profiling individuals

It is strictly for **product improvement** and **system health**.

---

# 🧱 2. Client Telemetry

The client batches events in `useTelemetryStore`.

### State Shape

```ts
interface TelemetryEvent {
  event: string
  properties: Record<string, any>
  ts: number
}
```

### Batching Rules

- Events are queued locally
- Flushed every **10–20 seconds**
- Flushed on tab close
- Flushed on session end
- Max batch size: 50 events

### Example Client Events

| Event                  | Properties         |
| ---------------------- | ------------------ |
| `ROOM_SWITCH`          | `{ from, to }`     |
| `PRIVATE_CHAT_START`   | `{ targetUserId }` |
| `AUDIO_PRESET_APPLIED` | `{ presetId }`     |
| `NOTE_CREATED`         | `{ noteId }`       |
| `MESSAGE_SENT`         | `{ roomId }`       |
| `EXTENSION_CONNECTED`  | `{ source }`       |
| `LIVEKIT_RECONNECT`    | `{ reason }`       |
| `UI_TAB_SWITCH`        | `{ tab }`          |

### WebSocket Payload

```json
{
  "type": "telemetry.clientEvent",
  "payload": {
    "event": "ROOM_SWITCH",
    "properties": {
      "from": "main",
      "to": "group-1"
    }
  }
}
```

---

# 📡 3. WebSocket Telemetry Events

Telemetry events are delivered via:

```
telemetry.clientEvent
```

The server receives:

```ts
{
  event: string
  properties: Record<string, any>
  userId: string
  campaignId: string
  timestamp: number
}
```

The server **never** stores:

- IP address
- Browser fingerprint
- User agent
- Email
- Character name
- Player name

Only:

- `userId` (internal DB ID)
- `campaignId`
- Event name
- Event properties
- Timestamp

---

# 🔌 4. Redis Ingestion

Raw telemetry events are appended to:

```
telemetry:campaign:{campaignId}
```

Each entry is a JSON string:

```json
{
  "ts": 1713123123,
  "userId": "u123",
  "event": "ROOM_SWITCH",
  "properties": { "from": "main", "to": "group-1" }
}
```

### Redis List Behavior

- Max length per campaign: 10k–50k entries
- Old entries trimmed automatically
- Worker processes events in batches

---

# 🧮 5. Aggregation Worker

A background worker periodically:

1. Reads raw telemetry from Redis
2. Groups by:
   - Campaign
   - Event type
   - Time window (minute/hour/day)
3. Writes aggregated rows to Postgres
4. Deletes processed entries

### Aggregation Example

Raw events:

```
ROOM_SWITCH (main → group-1)
ROOM_SWITCH (group-1 → main)
AUDIO_PRESET_APPLIED (CAVE)
```

Aggregated row:

```json
{
  "campaignId": "c123",
  "eventName": "ROOM_SWITCH",
  "count": 2,
  "windowStart": "2026-04-15T10:00:00Z",
  "windowEnd": "2026-04-15T10:59:59Z"
}
```

---

# 🗄️ 6. Postgres Storage

### Table: `TelemetryEvent`

```ts
model TelemetryEvent {
  id          String   @id @default(cuid())
  campaignId  String
  eventName   String
  properties  Json?
  count       Int
  windowStart DateTime
  windowEnd   DateTime
  createdAt   DateTime @default(now())
}
```

### Storage Rules

- Aggregated events only
- No raw logs stored long‑term
- No PII
- No user‑level analytics

---

# 📊 7. Query Patterns

### 1. Feature Usage

```
SELECT eventName, SUM(count)
FROM TelemetryEvent
WHERE campaignId = $1
GROUP BY eventName;
```

### 2. Room Activity Over Time

```
SELECT windowStart, count
FROM TelemetryEvent
WHERE campaignId = $1
  AND eventName = 'ROOM_SWITCH'
ORDER BY windowStart;
```

### 3. Audio Preset Popularity

```
SELECT properties->>'presetId', SUM(count)
FROM TelemetryEvent
WHERE eventName = 'AUDIO_PRESET_APPLIED'
GROUP BY properties->>'presetId';
```

### 4. Extension Usage

```
SELECT properties->>'source', SUM(count)
FROM TelemetryEvent
WHERE eventName = 'EXTENSION_CONNECTED'
GROUP BY properties->>'source';
```

---

# 🔒 8. Privacy & Trust Model

Telemetry is designed to be:

### **Anonymous**

No PII is stored.

### **Aggregated**

No per‑user analytics.

### **Opt‑Out Capable**

Campaigns can disable telemetry.

### **Minimal**

Only essential events are tracked.

### **Transparent**

DMs can view telemetry dashboards.

### **Secure**

Stored in Postgres with strict access control.

---

# 🧠 9. Design Principles

### 1. Telemetry must never impact gameplay

Low‑frequency, batched, async.

### 2. Telemetry must never identify players

Anonymous and aggregated.

### 3. Telemetry must be useful

Feature usage, room activity, audio effects.

### 4. Telemetry must be optional

Campaign‑level opt‑out.

### 5. Telemetry must be safe

No PII, no tracking, no profiling.

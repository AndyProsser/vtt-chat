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
- Frontend console logging levels and controls
- WebSocket telemetry events
- Redis ingestion
- Aggregation workers
- Postgres storage
- Backend diagnostic/audit/performance log streams
- Admin-facing log and telemetry consumption model
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

### Frontend logging note

Frontend runtime logs and frontend telemetry are related but different:

- **Runtime logs**: local console output for debugging (`frontend/src/utils/logger.ts`)
- **Telemetry**: structured, privacy-safe signals sent to backend for analytics/admin dashboards

Telemetry must never depend on raw console logging being enabled.

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

### Frontend Console Logging Levels (Target Model)

The frontend logger supports `debug`, `info`, `warn`, `error` calls today, but currently gates only by development mode.
To make logging operationally controllable, standardize on explicit log levels.

#### Level semantics

| Level   | Console output behavior                                   | Typical use                               |
| ------- | --------------------------------------------------------- | ----------------------------------------- |
| `ERROR` | always emit (unless console logging is globally disabled) | user-visible failures, unhandled errors   |
| `WARN`  | emit at `WARN` and lower thresholds                       | recoverable anomalies, fallback paths     |
| `INFO`  | emit at `INFO` and `DEBUG` thresholds                     | lifecycle milestones, state transitions   |
| `DEBUG` | emit only at `DEBUG` threshold                            | verbose diagnostics and transport tracing |

#### Control sources (precedence)

1. Runtime override (for live troubleshooting): `window.__VTT_LOG_LEVEL__`
2. Persisted browser override: `localStorage['vtt.log.level']`
3. Build/runtime env default: `VITE_LOG_LEVEL`
4. Safe fallback: `INFO` in production, `DEBUG` in development

#### Required logger controls

- `setLevel(level)`
- `getLevel()`
- `enableConsole(boolean)`
- Optional sampling for noisy debug domains (WS/audio)

#### Integration requirements

- Replace direct `console.*` calls in frontend feature code with shared logger usage.
- Include `context` for every log event (`ws.client`, `audio`, `chat`, `notes`, etc).
- Avoid logging message content, note content, or sensitive payload bodies.
- Emit telemetry counters separately from console logging decisions.

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

Client telemetry payloads may include frontend diagnostics metadata (for example app version, platform class, reconnect reason), but must not include raw chat/note content.

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

# 📁 5. Backend Logging Streams (Diagnostics, Audit, Performance, Telemetry)

Backend logging is split by intent so admin workflows can filter and retain correctly.

### 5.1 Stream taxonomy

| Stream        | Purpose                                        | Admin surface                        | Retention tier |
| ------------- | ---------------------------------------------- | ------------------------------------ | -------------- |
| `diagnostic`  | application and infrastructure troubleshooting | Logs & Activity                      | short/medium   |
| `audit`       | security and moderation action traceability    | Logs & Activity + audit drill-down   | long           |
| `performance` | latency, throughput, resource metrics          | System Health + performance panels   | medium         |
| `telemetry`   | aggregated client/system behavior analytics    | Dashboard/Status/Telemetry analytics | medium/long    |

### 5.2 File and sink strategy (target)

In addition to stdout/stderr, write structured backend log streams to files for durability:

- `logs/diagnostic.log`
- `logs/audit.log`
- `logs/performance.log`
- `logs/telemetry-ingest.log`

Operational requirements:

- Structured JSON lines for file sinks
- Rotation policy (`daily` or size-based)
- Compression for rotated files
- Retention windows by stream class
- Correlation IDs (`requestId`, `sessionId`, `userId` where allowed)

### 5.3 Current implementation status

- Current backend logger keeps an in-memory rolling history and writes formatted console output.
- Admin telemetry logs endpoint currently reads from in-memory history.
- File-based durability and stream partitioning are planned and should be treated as required for production operations.

---

# 🧮 6. Aggregation Worker

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

# 🗄️ 7. Postgres Storage

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

# 📊 8. Query Patterns

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

# 🔒 9. Privacy & Trust Model

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

# 🧠 10. Design Principles

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

---

# 🧪 11. Validation Checklist (Logging + Telemetry)

Use this checklist when implementing logging upgrades:

### Frontend logging controls

- Logger respects `VITE_LOG_LEVEL` and runtime/browser overrides.
- Domain code no longer uses ad-hoc `console.*` calls.
- `ERROR`/`WARN` behavior is deterministic across environments.

### Frontend telemetry ingestion

- Client telemetry batches flush on interval, unload, and session end.
- Telemetry queue backpressure is bounded.
- No sensitive content is emitted in telemetry properties.

### Backend stream durability

- Diagnostic/audit/performance/telemetry streams can be queried independently.
- File sinks survive process restart and rotate correctly.
- Admin logs and status views remain functional after restart.

### Admin observability

- Admin can filter by stream class (`diagnostic`, `audit`, `performance`, `telemetry`).
- Moderation/security actions produce audit entries with actor + target + timestamp.
- Dashboard/status metrics reflect frontend telemetry and backend performance streams.

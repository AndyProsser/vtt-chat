# Chat System

_A real‑time, room‑aware chat architecture for tabletop sessions, whispers, green room, and system events._

Status:

- This document includes shipped Stage 4 chat behavior plus broader planned search/export/import surfaces.
- Any lowercase event names or search endpoint examples in this file should be treated as conceptual or later-stage architecture unless they match mounted runtime routes.
- For current runtime contracts, see [../README.md](../README.md#runtime-source-of-truth).

---

## 📘 Overview

The chat system provides:

- Room‑based chat (main, group, private)
- Whispers (player ↔ player, player ↔ DM)
- Green room chat (pre/post session)
- System messages (join/leave, conditions, effects)
- Notes published to chat
- External logs (DDB/Roll20/FVTT)
- Message filtering
- Search across sessions
- Export/import compatibility

Chat is **real‑time** via WebSockets and **persistent** via Postgres.

---

## 🧩 Architecture Overview

```text
WebSocket Events
      ↓
Event Reducer
      ↓
useChatStore
      ↓
UI Components
```

Persistence:

```text
REST API → Postgres
```

Real‑time:

```text
WebSocket → Zustand → UI
```

---

## 🏠 1. Chat Rooms

Chat is scoped to **rooms**, which mirror audio rooms:

| Room Type         | Description                        |
| ----------------- | ---------------------------------- |
| **Green Room**    | Pre/post session lobby             |
| **Main Room**     | Default session room               |
| **Group Rooms**   | DM‑created breakout rooms          |
| **Private Rooms** | Ephemeral 1:1 or small group rooms |

### Room → Chat Mapping

| Audio Room   | Chat Behavior                     |
| ------------ | --------------------------------- |
| Green Room   | Messages persist across sessions  |
| Main Room    | Standard chat                     |
| Group Room   | Chat scoped to group              |
| Private Room | Chat visible only to participants |

---

## 💬 2. Message Types

Every message has a `type`:

| Type         | Description                   |
| ------------ | ----------------------------- |
| `ROOM`       | Standard room chat            |
| `WHISPER`    | Private message between users |
| `SYSTEM`     | System‑generated events       |
| `METAGAME`   | Notes published to chat       |
| `EXTERNAL`   | Logs from DDB/Roll20/FVTT     |
| `ATTACHMENT` | Images or files               |
| `DM_ONLY`    | Visible only to DM (rare)     |

### Message Schema

```ts
interface ChatMessage {
  id: string
  roomId: string | null
  fromUserId: string | null
  toUserId?: string | null
  type: ChatMessageType
  markdown: string
  attachments?: Attachment[]
  timestamp: number
  externalSource?: string
  metadata?: any
}
```

---

## 🟢 3. Green Room Chat

Green room chat is **special**:

- Messages persist across sessions
- Messages are restored when session ends
- Messages are not included in session logs
- Messages are not recorded
- Messages are not searchable across sessions

### Behavior

| Event               | Action                                          |
| ------------------- | ----------------------------------------------- |
| `session.started`   | Green room chat is cleared from UI (but stored) |
| `session.ended`     | Green room chat is restored                     |
| User joins campaign | Green room chat is loaded                       |

---

## 🔐 4. Whispers

Whispers are **direct messages** between:

- Player → Player
- Player → DM
- DM → Player

### Properties

- Not tied to a room
- Not visible to others
- Stored in `whispers[userId]` in `useChatStore`
- Delivered via WebSocket event `chat.whisper`

### Example Event

```json
{
  "type": "chat.whisper",
  "payload": {
    "messageId": "m124",
    "fromUserId": "u123",
    "toUserId": "u999",
    "markdown": "psst..."
  }
}
```

---

## 🔊 5. System Messages

System messages appear in chat but are not user‑generated.

Examples:

- User joined room
- User left room
- Condition applied (silenced, underwater, etc.)
- Distance changed
- Private chat started/ended
- DM override applied
- Session started/ended

### Example

```text
**Thorin** has joined the Main Room.
```

System messages are:

- `type: SYSTEM`
- Rendered differently in UI
- Not editable
- Not deletable

---

## 📝 6. Notes Published to Chat

Notes can be published into chat:

- Visible to room
- Marked as `type: METAGAME`
- Includes note metadata

### Example Event

```json
{
  "type": "note.publishedToChat",
  "payload": {
    "noteId": "n123",
    "roomId": "main",
    "markdown": "You find 50 gold pieces."
  }
}
```

---

## 🔌 7. External Logs (DDB / Roll20 / FVTT)

External logs appear as chat messages with:

- `type: EXTERNAL`
- `externalSource`
- `metadata`

Examples:

- Attack rolls
- Saving throws
- Skill checks
- Spell casts
- Movement events (FVTT)

### Example

```json
{
  "type": "chat.externalLog",
  "payload": {
    "source": "DDB",
    "action": "ATTACK",
    "metadata": {
      "roll": "1d20+5",
      "result": 17
    }
  }
}
```

Users can toggle visibility:

```text
chat.filters.showExternalLogs = true/false
```

---

## 🧭 8. Chat Flow (Real‑Time)

### Sending a message

1. User sends REST request:

   ```text
   POST /api/campaigns/:id/chat
   ```

2. Server stores message in DB

3. Server emits WebSocket event:

   ```text
   chat.newMessage
   ```

4. Event reducer updates `useChatStore`

5. UI updates instantly

### Receiving a message

1. WebSocket event arrives
2. Event reducer routes to `chatReducer`
3. Store updates
4. UI re-renders

---

## 🧱 9. Chat Persistence

Messages are stored in Postgres:

- `campaignId`
- `sessionId`
- `roomId`
- `fromUserId`
- `markdown`
- `attachments`
- `type`
- `timestamp`

Green room messages are stored separately.

---

## 🔍 10. Chat Search

Search supports:

- Full‑text search
- Hashtags
- User filters
- Room filters
- Session filters
- Date ranges

### API

```text
GET /api/search/messages
```

---

## 🔄 11. Interaction With Other Systems

### Presence System

Room changes → chat routing changes.

### Audio Engine

Chat is unaffected by audio effects.

### Notes System

Notes can be published into chat.

### Session System

Green room chat is restored after session end.

### Extension Integration

External logs appear as chat messages.

---

## 🧠 Design Principles

### 1. Chat is room‑aware

Messages always belong to a room or whisper.

### 2. Chat is persistent

Stored in DB for long‑term campaign history.

### 3. Chat is real‑time

Delivered via WebSocket events.

### 4. Green room is special

Messages persist across sessions.

### 5. Whispers are private

Only sender and receiver can see them.

### 6. System messages are first‑class

They appear in chat but are not user‑generated.

### 7. External logs are optional

Users can toggle visibility.

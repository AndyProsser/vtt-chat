# **WEBSOCKETS.md**

# WebSocket Protocol Specification

_A versioned, event‑driven real‑time protocol for presence, chat, audio, and DM controls._

---

## 📘 Overview

This document defines the **WebSocket protocol** used by the VTT‑Chat platform.
It covers:

- Connection model
- Authentication
- Event envelope format
- Namespaces
- Event types
- Delivery rules
- Reconnect protocol
- Versioning strategy

This is the **authoritative reference** for all client and server WebSocket behavior.

---

# 🔌 Connection Model

Each client opens **one WebSocket connection per campaign**:

```
wss://server/ws/campaign/:campaignId
```

The connection is:

- Authenticated
- Versioned
- Event‑driven
- Bidirectional

---

# 🔐 Authentication

Clients authenticate by sending a **connection init message** immediately after opening the socket:

```json
{
  "type": "client.init",
  "payload": {
    "token": "jwt-token",
    "campaignId": "c123",
    "characterId": "char456",
    "clientVersion": "1.0.0"
  }
}
```

Server responds with:

```json
{
  "type": "server.ready",
  "payload": {
    "protocolVersion": 1,
    "serverTime": 1713123123
  }
}
```

If authentication fails:

```json
{
  "type": "error.authFailed",
  "payload": {
    "reason": "Invalid token"
  }
}
```

---

# 📦 Event Envelope Format

All events follow this structure:

```json
{
  "v": 1,
  "type": "namespace.eventName",
  "payload": { ... }
}
```

- `v` = protocol version
- `type` = namespaced event name
- `payload` = event data

---

# 🧩 Namespaces

Events are grouped into namespaces:

| Namespace     | Purpose                                        |
| ------------- | ---------------------------------------------- |
| `presence.*`  | Join/leave campaign, rooms, private rooms      |
| `session.*`   | Start/end session                              |
| `room.*`      | Room creation, deletion, rename                |
| `chat.*`      | Chat messages, whispers, external logs         |
| `private.*`   | Private chat lifecycle                         |
| `dm.*`        | DM/assistant DM authority                      |
| `audio.*`     | Presets, overrides, environment, distance, PTT |
| `note.*`      | Notes published to chat                        |
| `external.*`  | Logs from DDB/Roll20/FVTT                      |
| `telemetry.*` | Client → server telemetry                      |
| `error.*`     | Errors                                         |

---

# 🟢 Presence Events

## **presence.joinCampaign**

Sent when a user enters the campaign (green room).

```json
{
  "type": "presence.joinCampaign",
  "payload": {
    "userId": "u123",
    "characterId": "char456",
    "role": "PLAYER",
    "state": "GREEN_ROOM",
    "timestamp": 1713123123
  }
}
```

---

## **presence.leaveCampaign**

```json
{
  "type": "presence.leaveCampaign",
  "payload": {
    "userId": "u123",
    "timestamp": 1713123123
  }
}
```

---

## **presence.joinRoom**

```json
{
  "type": "presence.joinRoom",
  "payload": {
    "userId": "u123",
    "roomId": "main",
    "isPrimary": true,
    "livekitToken": "lk-token",
    "timestamp": 1713123123
  }
}
```

---

## **presence.leaveRoom**

```json
{
  "type": "presence.leaveRoom",
  "payload": {
    "userId": "u123",
    "roomId": "main"
  }
}
```

---

# 🎭 Session Events

## **session.started**

```json
{
  "type": "session.started",
  "payload": {
    "sessionId": "s789",
    "recap": {
      "manual": "...",
      "ai": "..."
    },
    "livekitToken": "lk-token"
  }
}
```

---

## **session.ended**

```json
{
  "type": "session.ended",
  "payload": {
    "sessionId": "s789"
  }
}
```

---

# 🏠 Room Events

## **room.created**

```json
{
  "type": "room.created",
  "payload": {
    "roomId": "group-1",
    "name": "Scouting Party"
  }
}
```

---

## **room.deleted**

```json
{
  "type": "room.deleted",
  "payload": {
    "roomId": "group-1"
  }
}
```

---

# 💬 Chat Events

## **chat.newMessage**

```json
{
  "type": "chat.newMessage",
  "payload": {
    "messageId": "m123",
    "roomId": "main",
    "fromUserId": "u123",
    "markdown": "Hello!",
    "attachments": [],
    "timestamp": 1713123123
  }
}
```

---

## **chat.whisper**

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

## **chat.externalLog**

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

---

# 🔐 Private Chat Events

## **private.started**

```json
{
  "type": "private.started",
  "payload": {
    "privateRoomId": "p123",
    "participants": ["u123", "u456"],
    "livekitToken": "lk-token"
  }
}
```

---

## **private.ended**

```json
{
  "type": "private.ended",
  "payload": {
    "privateRoomId": "p123"
  }
}
```

---

# 🧙 DM Authority Events

## **dm.promoted**

```json
{
  "type": "dm.promoted",
  "payload": {
    "userId": "u456",
    "role": "ASSISTANT_DM"
  }
}
```

---

## **dm.demoted**

```json
{
  "type": "dm.demoted",
  "payload": {
    "userId": "u456",
    "role": "PLAYER"
  }
}
```

---

# 🎙️ Audio Events

## **audio.applyPreset**

```json
{
  "type": "audio.applyPreset",
  "payload": {
    "targetUserId": "u123",
    "presetType": "CONDITION",
    "presetId": "SILENCED",
    "parameters": { "mute": true }
  }
}
```

---

## **audio.clearPreset**

```json
{
  "type": "audio.clearPreset",
  "payload": {
    "targetUserId": "u123",
    "presetType": "DISTANCE"
  }
}
```

---

## **audio.clearAll**

```json
{
  "type": "audio.clearAll",
  "payload": {}
}
```

---

## **audio.environmentChanged**

```json
{
  "type": "audio.environmentChanged",
  "payload": {
    "roomId": "main",
    "presetId": "CAVE",
    "parameters": { "reverbSend": 0.4 }
  }
}
```

---

## **audio.distanceChanged**

```json
{
  "type": "audio.distanceChanged",
  "payload": {
    "targetUserId": "u123",
    "distance": 0.7
  }
}
```

---

## **audio.icPreset**

```json
{
  "type": "audio.icPreset",
  "payload": {
    "fromUserId": "u123",
    "presetId": "WHISPER",
    "parameters": { "lowpass": 8000 }
  }
}
```

---

## **audio.privateRoomCleanMode**

```json
{
  "type": "audio.privateRoomCleanMode",
  "payload": {
    "enabled": true
  }
}
```

---

## **audio.pttStart / audio.pttEnd**

```json
{
  "type": "audio.pttStart",
  "payload": {}
}
```

```json
{
  "type": "audio.pttEnd",
  "payload": {}
}
```

---

# 📝 Notes Events

## **note.publishedToChat**

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

# 🔌 External Events

## **external.log**

```json
{
  "type": "external.log",
  "payload": {
    "source": "FVTT",
    "raw": { ... }
  }
}
```

---

# 📡 Telemetry Events

## **telemetry.clientEvent**

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

# ❗ Error Events

## **error.invalidAction**

```json
{
  "type": "error.invalidAction",
  "payload": {
    "reason": "Cannot join private room while in green room",
    "code": "INVALID_STATE"
  }
}
```

---

# 🔄 Reconnect Protocol

When reconnecting, client sends:

```json
{
  "type": "client.reconnect",
  "payload": {
    "campaignId": "c123",
    "characterId": "char456",
    "lastKnownState": "IN_SESSION_PRIMARY",
    "primaryRoomId": "main",
    "privateRoomId": null
  }
}
```

Server responds with a **state replay**:

- `presence.joinCampaign`
- `presence.joinRoom`
- `private.started` (if needed)
- `dm.promoted` (if needed)
- `audio.applyPreset` (if needed)
- `audio.environmentChanged` (if needed)

This ensures deterministic restoration.

---

# 🧠 Versioning Strategy

- Every event includes `"v": 1`
- New fields → bump minor version
- Breaking changes → bump major version
- Clients ignore unknown fields
- Server supports multiple versions during migration

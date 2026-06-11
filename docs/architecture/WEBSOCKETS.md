# WebSocket Protocol Specification

_A versioned, event‑driven real‑time protocol for presence, chat, audio, and DM controls._

Status:

- This document now distinguishes the shipped Stage 0-7 runtime protocol from broader conceptual protocol design.
- The canonical runtime contract is the shared event package under `packages/shared/events` and the current backend/frontend transport implementation.
- Any older lowercase namespace examples in this file should be treated as conceptual legacy design notes until they are fully rewritten.

---

## Overview

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

For shipped runtime behavior through Stage 7, the source of truth is:

- `packages/shared/events/*`
- `packages/shared/events/base.ts`
- `apps/backend/src/ws/index.ts`
- `apps/frontend/src/ws/client.ts`
- `apps/frontend/src/hooks/useWebSocket.ts`

This document also contains conceptual and planned material for later stages.

---

## Connection Model

Current shipped baseline:

- Each client opens one authenticated WebSocket connection to the backend transport.
- The connection is authenticated immediately after socket open via a `WS:AUTH` message carrying the bearer token.
- After authentication, the server responds with transport wrapper messages such as `WS:CONNECTED`, `WS:EVENT`, `WS:ACK`, and `WS:ERROR`.
- Domain events delivered inside `WS:EVENT` use the shared uppercase event contract such as `SESSION:*`, `CHAT:*`, `NOTES:*`, `ROOM:*`, `PRESENCE:*`, and `AUDIO:*`.

Illustrative runtime shape:

```json
{
  "type": "WS:AUTH",
  "token": "jwt-token"
}
```

```json
{
  "type": "WS:CONNECTED",
  "connectionId": "conn-123",
  "userId": "u123",
  "username": "dm-user",
  "role": "DM"
}
```

```json
{
  "type": "WS:EVENT",
  "event": {
    "id": "8d7d3a4d-0d3d-4f07-bff7-8d0d3c0a1111",
    "type": "CHAT:MESSAGE_SENT",
    "version": 1,
    "userId": "u123",
    "userRole": "DM",
    "sessionId": "s123",
    "roomId": "r123",
    "timestamp": 1713123123,
    "payload": {}
  }
}
```

Conceptual legacy connection model retained below for planned architecture discussion:

```text
wss://server/ws/campaign/:campaignId
```

The connection is:

- Authenticated
- Versioned
- Event‑driven
- Bidirectional

---

## Authentication

Current shipped baseline:

- The client sends `WS:AUTH` after `onopen`.
- The server verifies the JWT and associates the connection with the authenticated user and current session context when present.
- Query-string token auth is explicitly rejected.

Earlier `client.init` / `server.ready` examples below are conceptual legacy transport design and are not the shipped Stage 0-7 handshake.

Legacy conceptual example:

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

## Event Envelope Format

Shipped domain events follow the shared event envelope:

```json
{
  "id": "uuid",
  "type": "DOMAIN:ACTION",
  "version": 1,
  "userId": "uuid",
  "userRole": "DM",
  "sessionId": "uuid",
  "roomId": "uuid-or-null",
  "timestamp": 1713123123,
  "payload": { ... }
}
```

- `version` = event schema version
- `type` = shared uppercase event type
- `payload` = subsystem-specific event data

Transport wrappers around domain events are separate from the domain envelope and currently include:

- `WS:CONNECTED`
- `WS:EVENT`
- `WS:ACK`
- `WS:ERROR`

---

## Namespaces

Current shipped runtime event families are grouped by uppercase domains:

| Domain       | Purpose                                   |
| ------------ | ----------------------------------------- |
| `SESSION:*`  | Session lifecycle                         |
| `CHAT:*`     | Chat messages and typing                  |
| `NOTES:*`    | Note create/update/delete propagation     |
| `ROOM:*`     | Room lifecycle and room transition events |
| `PRESENCE:*` | Presence state changes                    |
| `AUDIO:*`    | Audio control and override events         |
| `WS:*`       | Transport wrapper and connection metadata |

Legacy lowercase namespace examples below remain conceptual and are not the shipped contract.

Conceptual namespace list:

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

## Reconnect Baseline

Current shipped Stage 6-7 reconnect behavior is intentionally narrower than a full hydrate protocol:

- The WebSocket client retries with exponential backoff.
- Queued outbound events are flushed after reconnect.
- The backend re-associates the authenticated user and restores presence snapshots when needed.
- The frontend applies targeted room and presence refresh on reconnect.
- Full cross-domain hydration for chat, notes, audio, permissions, and extension context is not yet the shipped runtime behavior.

---

## Legacy Conceptual Event Families

The following lowercase event families are retained only as compact architecture notes for later-stage protocol design. They are not the shipped Stage 0-7 contract.

Conceptual families still referenced in older docs:

- `presence.*` for campaign and room join/leave flows
- `session.*` for session lifecycle broadcasts
- `room.*` for room creation and deletion
- `chat.*` for messages, whispers, and external log ingestion
- `private.*` and `dm.*` for private-room and DM-authority flows
- `audio.*` for preset application, environment changes, distance, and PTT
- `note.*`, `external.*`, `telemetry.*`, and `error.*` for later-stage integration and observability flows

When updating runtime-facing documentation, prefer the shipped uppercase contract in `packages/shared/events/*` instead of expanding these legacy examples.

---

## Legacy Reconnect Concept

Earlier protocol sketches described reconnect as an explicit `client.reconnect` request followed by state replay. That is still useful as planned architecture, but it is not the shipped runtime behavior.

Current shipped baseline instead uses:

- websocket reconnect with `WS:AUTH`
- transport reconnection backoff and queue flushing
- backend presence restoration when realtime state is empty
- targeted frontend room/presence refresh after reconnect

---

## Versioning Strategy

- Shipped runtime domain events include `version: 1`
- New fields → bump minor version
- Breaking changes → bump major version
- Clients ignore unknown fields
- Server supports multiple versions during migration

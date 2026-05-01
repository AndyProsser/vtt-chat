# Sessions

_A structured, stateful lifecycle for tabletop play, with green room staging, recaps, private rooms, and journaling._

Status:

- This workflow document includes DM-facing lifecycle concepts that are broader than the shipped runtime naming conventions.
- Campaign-scoped endpoint examples and lowercase websocket event names in this file should be read as workflow shorthand or planned architecture, not the canonical Stage 0-7 contract.
- For current runtime contracts, see [../README.md](../README.md#runtime-source-of-truth).

---

## Overview

A **session** represents a single play period within a campaign.
Sessions provide:

- A clean boundary for chat, notes, recordings, and presence
- A green room for pre‑session gathering
- A recap shown at session start
- Private rooms and group rooms
- Session journals (manual + AI)
- Recording and transcription
- Automatic cleanup and restoration

**Note:** This document covers DM-centric session workflows.
For the architectural state machine model, see [SESSION-LIFECYCLE.md](../architecture/SESSION-LIFECYCLE.md).

This document defines:

- Session lifecycle
- Green room behavior
- Room transitions
- Recap generation
- Journaling
- Recording integration
- Presence and audio interactions

---

## 1. Session Lifecycle Overview

```text
Green Room
   ↓ DM starts session
Session Active
   ↓ DM ends session
Green Room (restored)
```

Sessions are **explicit** — they do not start automatically.

---

## 2. Green Room

The **green room** is the pre/post session lobby.

### Green Room Characteristics

| Feature       | Behavior                                |
| ------------- | --------------------------------------- |
| Chat          | Persistent across sessions              |
| Audio         | No effects, no environment, no distance |
| Rooms         | Only one room: `green-room`             |
| Presence      | All users join here first               |
| Recording     | Never recorded                          |
| Notes         | Fully accessible                        |
| Private rooms | Disabled                                |

### When users join a campaign

They always land in the green room.

---

## 3. Starting a Session

Only the **DM** can start a session.

### API

```text
POST /api/campaigns/:campaignId/sessions/start
```

### Server Actions

1. Create a new session record
2. Generate recap (manual + AI)
3. Move all users from green room → main room
4. Issue LiveKit tokens for main room
5. Emit WebSocket events:
   - `session.started`
   - `presence.joinRoom` (main)
   - `audio.environmentChanged` (if default environment)

### Client Actions

- Clear green room chat from UI
- Connect to LiveKit main room
- Show recap modal
- Reset audio effects
- Initialize session state

---

## 4. Recap System

When a session starts, players see a **recap modal**.

### Recap Sources

| Source           | Description                            |
| ---------------- | -------------------------------------- |
| **Manual**       | DM‑written summary                     |
| **AI‑generated** | Optional summary from previous session |
| **Notes**        | DM can mark notes as “recap‑worthy”    |
| **Journal**      | Previous session journal summary       |

#### Recap Delivery

Delivered via:

```text
session.started → payload.recap
```

Displayed once per user.

---

## 5. Rooms During a Session

During a session, users can be in:

- **Main Room**
- **Group Rooms** (DM‑created)
- **Private Rooms** (ephemeral)

### Room Behavior

| Room Type | Chat                         | Audio          | Recording      |
| --------- | ---------------------------- | -------------- | -------------- |
| Main      | Visible to all               | Full effects   | Optional       |
| Group     | Visible to group             | Full effects   | Optional       |
| Private   | Visible only to participants | **Clean mode** | Never recorded |

### Room Switching

Triggered by:

- DM moving players
- Players joining group rooms
- Private chat invitations

Handled via:

```text
presence.joinRoom
presence.leaveRoom
private.started
private.ended
```

---

## 6. Private Rooms

Private rooms are:

- Ephemeral
- Auto‑expire after inactivity
- Clean audio (no effects)
- Not recorded
- Not included in session logs
- Only visible to participants

### Private Room Lifecycle

```text
private.started
   ↓
private room active
   ↓
private.ended
```

### Clean Mode

When entering a private room:

- All audio effects disabled
- DM voice presets disabled
- IC presets disabled
- Distance disabled
- Environment disabled
- Conditions disabled

Restored on exit.

---

## 7. Ending a Session

Only the **DM** can end a session.

### API

```text
POST /api/campaigns/:campaignId/sessions/:sessionId/end
```

### Server Actions

1. Mark session as ended
2. Disconnect all LiveKit rooms
3. Move all users to green room
4. Restore green room chat
5. Emit WebSocket events:
   - `session.ended`
   - `presence.joinRoom` (green room)

### Client Actions

- Disconnect all LiveKit rooms
- Connect to green room
- Restore green room chat
- Reset audio effects
- Clear DM overrides
- Reset IC mode

---

## 8. Session Journaling

Each session has a **journal**:

- Manual DM notes
- AI‑generated summary
- Highlights
- Tags
- Linked notes
- Linked chat messages
- Linked recordings

### Journal Schema

```ts
interface SessionJournal {
  sessionId: string
  manual: string
  ai: string
  highlights: string[]
  linkedNotes: string[]
  linkedMessages: string[]
}
```

### Journal Generation

Occurs:

- At session end
- On demand
- Via DM UI

---

## 9. Recording & Transcription

Recordings are optional and controlled by DM.

### Recording Modes

| Mode                   | Description              |
| ---------------------- | ------------------------ |
| **Off**                | No recording             |
| **Audio Only**         | LiveKit audio tracks     |
| **Audio + Transcript** | Audio + AI transcription |
| **Transcript Only**    | No audio, text only      |

### Recording Storage

- Stored in external storage (S3, etc.)
- Metadata stored in DB
- Linked to session

### Transcription

- Stored as text
- Linked to timestamps
- Searchable

---

## 10. Interaction With Presence

Session transitions update presence:

| Event             | Presence State |
| ----------------- | -------------- |
| `session.started` | `IN_SESSION`   |
| `session.ended`   | `GREEN_ROOM`   |
| `private.started` | `IN_PRIVATE`   |
| `private.ended`   | `IN_SESSION`   |

Presence drives:

- LiveKit connections
- Audio clean mode
- UI state

---

## 11. Interaction With Audio Engine

Session start:

- Reset all effects
- Apply default environment
- DM voice presets enabled
- IC mode enabled

Session end:

- Clear all effects
- Disable IC mode
- Disable DM presets
- Return to green room clean audio

Private rooms:

- Clean mode enabled
- Restored on exit

---

## 12. Interaction With Chat

Session start:

- Green room chat cleared from UI
- Session chat begins fresh

Session end:

- Green room chat restored
- Session chat archived

Private rooms:

- Chat scoped to participants
- Not included in session logs

---

## 13. Interaction With Notes

During session:

- Notes can be created
- Notes can be shared
- Notes can be published to chat
- Notes can be linked to journal

After session:

- Notes become part of session history

---

## 14. Interaction With Extension

The browser extension can:

- Auto‑generate notes
- Auto‑apply audio effects
- Auto‑tag events
- Auto‑log combat rounds
- Auto‑log movement (FVTT)
- Auto‑log whispers

Session boundaries help:

- Group logs
- Generate summaries
- Reset extension state

---

## Design Principles

### 1. Sessions are explicit

DM controls start and end.

### 2. Green room is sacred

Clean audio, persistent chat, no effects.

### 3. Private rooms are clean

No effects, no recording, no leakage.

### 4. Journals are first‑class

Every session has a structured summary.

### 5. Audio resets at boundaries

No cross‑session leakage.

### 6. Chat resets at boundaries

Session chat is isolated.

### 7. Extension integrates seamlessly

External logs map into session context.

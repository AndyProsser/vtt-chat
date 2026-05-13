# Notes System

_A lightweight, persistent, DM‑controlled knowledge system for handouts, maps, summaries, and metagame notes._

Status:

- This document includes shipped Stage 5 notes behavior plus planned search and import/export surfaces.
- Endpoint examples for cross-session search or broader import/export should be treated as planned architecture unless they match mounted runtime routes.
- For current runtime contracts, see [../README.md](../README.md#runtime-source-of-truth).

---

## Overview

The Notes System provides a structured way to store:

- Handouts
- Maps
- Session summaries
- DM prep notes
- Player‑shared notes
- Metagame notes
- Attachments (base64 images)

Notes are:

- **Persistent** across sessions
- **Markdown‑based**
- **Visibility‑controlled**
- **Searchable**
- **Exportable/importable**
- **Publishable to chat**
- **DM‑curated** but optionally player‑contributed

This document defines:

- Note model
- Visibility rules
- Sharing model
- Flags (read, hidden, starred)
- Publishing to chat
- Import/export
- Interaction with sessions, chat, and audio

---

## 1. Note Model

### Schema

```ts
interface Note {
  id: string
  campaignId: string
  authorUserId: string
  markdown: string
  type: 'NORMAL' | 'METAGAME'
  tags: string[]
  visibility: 'DM_ONLY' | 'PARTY' | 'INDIVIDUALS' | 'GLOBAL'
  sharedWith?: string[] // userIds
  attachments?: Attachment[]
  createdAt: number
  updatedAt: number
  publishedAt?: number
}
```

### Key Concepts

| Field         | Meaning                          |
| ------------- | -------------------------------- |
| `markdown`    | Full note content (markdown)     |
| `type`        | Normal or metagame               |
| `visibility`  | Who can see the note             |
| `sharedWith`  | Explicit per‑user visibility     |
| `attachments` | Base64 images (maps, handouts)   |
| `publishedAt` | Timestamp when published to chat |

---

## 2. Visibility Rules

Visibility is determined by `visibility` + `sharedWith`.

### Visibility Modes

| Mode            | Description                     |
| --------------- | ------------------------------- |
| **DM_ONLY**     | Only DM sees the note           |
| **PARTY**       | All players + DM                |
| **INDIVIDUALS** | Only specific players + DM      |
| **GLOBAL**      | Visible to all campaign members |

### DM Always Sees Everything

DM has full visibility regardless of mode.

### Players Cannot Unshare Notes

Players may share their own notes with others, but:

- They cannot unshare once shared
- They cannot change visibility of DM notes
- They cannot delete DM notes

---

## 3. Sharing Model

Notes can be shared in two ways:

### 1. **Visibility = PARTY**

Everyone sees it.

### 2. **Visibility = INDIVIDUALS**

Only users in `sharedWith[]` see it.

### Player‑Shared Notes

Players can:

- Create notes
- Share with party
- Share with individuals
- Publish to chat
- Attach images

Players **cannot**:

- Make DM‑only notes
- Unshare notes once shared
- Change visibility of DM notes

---

## 4. Note Flags (Per‑User State)

Each user has independent flags for each note:

```ts
interface NoteFlag {
  noteId: string
  userId: string
  isRead: boolean
  isHidden: boolean
  isStarred: boolean
}
```

### Behavior

| Flag          | Meaning                         |
| ------------- | ------------------------------- |
| **isRead**    | User has opened the note        |
| **isHidden**  | User hides note from their list |
| **isStarred** | User pins note to top           |

Flags do **not** affect other users.

---

## 5. Note Types

### 1. **NORMAL**

Default note type.

### 2. **METAGAME**

Used for:

- DM prep
- Session summaries
- Out‑of‑character notes
- Rules clarifications

Metagame notes can still be shared or published.

---

## 6. Attachments

Notes support attachments for:

- Maps
- Handouts
- Screenshots
- Player sketches
- DM prep images

### Attachment Schema

```ts
interface Attachment {
  id: string
  mime: string
  data: string // encoded attachment payload
}
```

For DMDX `map` blocks in persisted notes/journal entries, `image` must reference an attachment token (`attachment://...`). Inline `data:image/*;base64,...` values are not persisted in v1.

---

## 7. Publishing Notes to Chat

Notes can be published to chat as a **one‑time event**.

### Behavior

- Chat receives a `note.publishedToChat` event
- A snippet of the note is shown
- A link to open the full note is included
- Publishing does not change visibility
- Publishing does not reveal hidden content (DM‑only notes cannot be published to players)

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

## 8. Searching Notes

Search supports:

- Full‑text search
- Tags
- Visibility filters
- Author filters
- Date ranges

### API

```text
GET /api/search/notes
```

---

## 9. Interaction With Sessions

### Before Session

DM can pre‑seed notes:

- Maps
- Handouts
- Session prep
- NPC notes

### During Session

DM can:

- Reveal notes
- Share with individuals
- Publish to chat
- Update notes live

Players can:

- Create notes
- Share with party
- Share with individuals
- Publish to chat

### After Session

Notes become part of the **session journal**.

---

## 10. Interaction With Chat

Notes can be:

- Published to chat
- Linked from chat
- Referenced by chat messages
- Tagged with hashtags used in chat

Chat messages can also be converted into notes:

- DM can convert any chat message into a note
- Useful for preserving important moments

---

## 11. Interaction With Extension

The browser extension can:

- Create notes from external logs
- Attach screenshots
- Auto‑tag notes
- Auto‑share notes based on DDB/FVTT metadata

Examples:

- FVTT movement → auto‑note “Player moved 40ft north”
- DDB spell cast → auto‑note spell description
- Roll20 whisper → auto‑note for DM

---

## 12. Import / Export

Notes are included in:

- Campaign export
- Session export
- Journal export

### Export Format

```json
{
  "notes": [
    {
      "id": "n123",
      "markdown": "...",
      "visibility": "PARTY",
      "tags": ["#loot"],
      "attachments": [ ... ]
    }
  ]
}
```

---

## Design Principles

### 1. Notes are lightweight

Markdown + optional images.

### 2. Notes are persistent

Stored in Postgres for long‑term campaign history.

### 3. Visibility is explicit

DM always sees everything.

### 4. Sharing is irreversible

Players cannot unshare notes.

### 5. Publishing is non‑destructive

Publishing does not change visibility.

### 6. Notes integrate with chat

Publishing creates a chat event.

### 7. Notes integrate with sessions

Notes become part of the session journal.

### 8. Notes integrate with extension

External logs can generate notes.

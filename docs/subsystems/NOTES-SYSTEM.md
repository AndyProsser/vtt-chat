# Notes and Journal System

_A lightweight, persistent, markdown-based authoring system for campaign notes and per-session journals._

Status:

- This document includes shipped Stage 5 notes behavior plus planned search and import/export surfaces.
- Endpoint examples for cross-session search or broader import/export should be treated as planned architecture unless they match mounted runtime routes.
- For current runtime contracts, see [../README.md](../README.md#runtime-source-of-truth).

---

## Overview

The Notes and Journal system provides a structured way to store:

- Handouts
- Maps
- Session journals (one journal per session chapter)
- DM prep notes
- Player‑shared notes
- Metagame notes
- Attachments (images and PDFs)

Authoring artifacts are:

- **Persistent** across sessions
- **Markdown‑based**
- **Visibility‑controlled**
- **Searchable**
- **Exportable/importable**
- **Publishable to chat**
- **DM-driven** for handouts and session journals

This document defines:

- Notes model
- Journal model
- Visibility rules
- Sharing model
- Required fields and editor behavior
- Publishing to chat
- Search behavior
- Interaction with sessions and chat

---

## 1. Notes Model

### Schema

```ts
interface Note {
  id: string
  campaignId: string
  authorUserId: string
  name: string
  markdown: string
  hashtags: string[]
  tags?: string[] // legacy compatibility alias for hashtags
  visibility: 'PRIVATE' | 'PARTY' | 'SELECTED' | 'SPECTATORS'
  sharedWith?: string[] // userIds
  attachments?: Attachment[]
  createdAt: number
  updatedAt: number
  surfacedToChatAt?: number
}
```

### Key Concepts

| Field              | Meaning                                  |
| ------------------ | ---------------------------------------- |
| `name`             | Human-readable note title                |
| `markdown`         | Full note content (markdown)             |
| `hashtags`         | Space-separated tags (stored normalized) |
| `visibility`       | Who can see the note                     |
| `sharedWith`       | Explicit per-user visibility             |
| `attachments`      | Linked image/PDF assets                  |
| `surfacedToChatAt` | Timestamp for one-time handout surfacing |

---

## 2. Journal Model

Journal is similar to Notes, with one critical rule: exactly one journal item exists per session chapter.

```ts
interface SessionJournal {
  id: string
  campaignId: string
  sessionId: string
  authorUserId: string // canonical author/editor is DM
  name: string // bound to session chapter name
  markdown: string
  hashtags: string[]
  attachments?: Attachment[]
  createdAt: number
  updatedAt: number
}
```

Journal contract:

- Exactly one journal per session chapter.
- `name` is linked to session name and follows session renames.
- DM is the canonical editor/owner.
- Journal visibility defaults to DM, players, and spectators.

---

## 3. Required Fields and Editor Contract

Each Notes or Journal item must include:

- `Name`
- `Content` (markdown)
- `Hashtags` (space-separated)
- `Attachments` (images and PDFs)

Editor behavior contract:

- Default mode is rich markdown editing (formatted surface).
- Users can toggle to raw markdown code view.
- A simple helper toolbar supports basic formatting and list actions.
- Editor primitives should prefer Radix-based prebuilt components where practical.
- Toolbar and renderer both block external links.
- Internal note links and attachment image links are allowed.

Link policy:

- Allowed: links to other notes, attachment image links, attachment document links.
- Disallowed: external URLs in both editor affordances and rendered output.

---

## 4. Visibility Rules

Visibility is determined by `visibility` + `sharedWith`.

### Visibility Modes

| Mode           | Description                                |
| -------------- | ------------------------------------------ |
| **PRIVATE**    | Only creator and DM                        |
| **PARTY**      | DM + all players                           |
| **SELECTED**   | DM + selected users in `sharedWith[]`      |
| **SPECTATORS** | DM + connected spectators (runtime scoped) |

### DM Always Sees Everything

DM has full visibility regardless of mode.

### DM Handout Authority

DM is the primary handout authority and can share notes at any time.

---

## 5. Sharing Model

Notes can be shared using visibility targets and optional selected recipients.

Handout share contract:

- Share targets: `PRIVATE | PARTY | SELECTED | SPECTATORS`.
- Sharing a note does not mutate note content.
- Sharing a note does not grant broader visibility than the selected target.
- Offline selected recipients remain valid targets and see shared notes when they reconnect.

---

## 6. Attachments

Notes and Journal support campaign-persistent attachments:

- Images
- PDFs

Attachment behavior:

- Attachments are reusable across notes and journal entries.
- Markdown content can reference attachments with attachment tokens.
- Images can render inline in content.
- PDFs can render as inline cards/embeds where supported.

### Attachment Schema

```ts
interface Attachment {
  id: string
  campaignId: string
  mime: string
  name: string
  uri: string // storage-backed reference
  createdAt: number
}
```

---

## 7. Note Flags (Per-User State)

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

## 8. Surfacing Notes to Chat

DM handouts are surfaced to chat as a **one-time event**.

### Behavior

- Chat receives a `NOTES:HANDOUT_SURFACED` event.
- Recipients-only policy: only targeted recipients get the card in chat.
- The card includes note name, short excerpt, and action to open the note.
- Surfacing does not change stored note visibility.
- Surfacing is non-repeat by default (one-time timeline surfacing per share action).
- Hidden content is never leaked to non-recipients.

### Example Event

```json
{
  "type": "NOTES:HANDOUT_SURFACED",
  "payload": {
    "noteId": "n123",
    "recipientScope": "SELECTED",
    "excerpt": "You find a map of the lower dungeon.",
    "surfaceId": "surface_01"
  }
}
```

---

## 9. Search

Search supports:

- Basic text match on `name`
- Basic text match on markdown content
- Basic text match on hashtags

Advanced filters are deferred to a later stage.

### API

```text
GET /api/search/notes?q=<text>
GET /api/search/journal?q=<text>
```

---

## 10. Interaction With Sessions

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
- Surface handout cards to chat
- Update notes live

Players can:

- Create and maintain personal notes
- Read notes shared to them

### After Session

Session journal remains one entry for that session and can be refined by DM.

---

## 11. Interaction With Chat

Notes can be:

- Surfaced to chat as recipients-only handout cards
- Linked from chat
- Referenced by chat messages
- Tagged with hashtags used in chat

Chat messages can also be converted into notes:

- DM can convert any chat message into a note
- Useful for preserving important moments

---

## 12. Interaction With Extension

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

## 13. Import / Export

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
      "hashtags": ["#loot"],
      "attachments": [ ... ]
    }
  ]
}
```

---

## Design Principles

### 1. Authoring is lightweight

Markdown + helper toolbar + optional attachments.

### 2. Notes and Journal are persistent

Stored in durable campaign/session storage for long-term continuity.

### 3. Visibility is explicit

DM always sees everything.

### 4. Share visibility is explicit

Sharing always has an explicit recipient scope.

### 5. Chat surfacing is non-destructive

Surfacing does not change visibility.

### 6. Notes integrate with chat

Handout surfacing creates a recipients-scoped chat event.

### 7. Journal is session-bound

Exactly one journal entry exists per session chapter.

### 8. Notes integrate with extension

External logs can generate notes.

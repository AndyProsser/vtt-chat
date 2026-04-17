# **DATA-MODEL.md**

# VTT‑Chat Data Model

_A relational schema for campaigns, sessions, presence, chat, notes, audio, and long‑term history._

---

## 📘 Overview

This document describes the **Postgres + Prisma** data model used by the VTT‑Chat platform.
It covers:

- Core entities (users, characters, campaigns)
- Session lifecycle
- Rooms & presence
- Chat & notes
- Audio presets & DM overrides
- Recordings & journals
- Import/export & telemetry
- Admin & audit logs

The schema is designed for:

- **High‑volume real‑time usage**
- **Long‑term campaign history**
- **DM authority & assistant DM roles**
- **Private chat & green room semantics**
- **Audio effects & environment state**
- **Recovery after Redis restart**
- **Searchability & analytics**

---

# 🧩 Core Entities

## **User**

Represents a real person.

Key points:

- Users may DM multiple campaigns
- Users may have multiple characters in the same campaign
- Users may have global and per‑campaign settings

**Fields include:**

- `id`, `email`, `displayName`, `avatarUrl`
- `authType`, `passwordHash`
- `createdAt`, `updatedAt`

---

## **Character**

Represents a player character in a specific campaign.

Key points:

- A user may have **multiple characters in the same campaign**
- Characters store rich metadata for long‑term campaign history
- Characters may be imported from DDB/Roll20/FVTT

**Fields include:**

- `name`, `race`, `class`, `subclass`, `level`
- `status` (alive, dead, left, unknown)
- `notes` (markdown)
- `characterUrl`
- `source` + `externalId`

---

## **Campaign**

Top‑level container for:

- Characters
- Sessions
- Rooms
- Notes
- Chat
- Recordings
- Journals

Key points:

- DM can change over time
- Assistant DM roles are session‑scoped
- Campaigns have an invite code
- Campaigns have a recording mode

**Fields include:**

- `currentDmId`
- `dmHistory[]`
- `recordingMode`
- `createdAt`, `updatedAt`

---

# 🎭 Sessions

A session represents a single play session.

Key points:

- Sessions begin in the **green room**
- DM starts the session → recap shown
- Session ends → return to green room
- Journals store manual + AI summaries
- Recordings attach to sessions

**Fields include:**

- `startedAt`, `endedAt`
- `recapShown`
- `journal` (1:1)

---

# 🏠 Rooms

Rooms represent audio/chat spaces:

- `GREEN_ROOM`
- `MAIN`
- `GROUP`
- `PRIVATE`

Key points:

- Private rooms are ephemeral
- Group rooms are DM‑created
- Rooms store recordings
- Room membership lives in Redis, but DB stores metadata

**Fields include:**

- `name`, `type`, `isActive`
- `createdAt`, `updatedAt`

---

# 🟢 Presence

Presence is **Redis‑first**, but Postgres stores snapshots for:

- Recovery after Redis failure
- Telemetry
- Analytics
- Session history

**PresenceSnapshot fields:**

- `campaignId`, `userId`, `sessionId`
- `primaryRoomId`, `privateRoomId`
- `state`
- `lastSeenAt`

---

# 💬 Chat System

Chat messages support:

- Room chat
- Whispers
- System messages
- External logs (DDB/Roll20/FVTT)
- Metagame messages
- Attachments (base64 images)

**Fields include:**

- `type` (ROOM, WHISPER, SYSTEM, METAGAME, EXTERNAL)
- `markdown`
- `attachments`
- `externalSource`
- `isGreenRoom`
- `isSystem`

Messages are immutable except for deletion flags.

---

# 📝 Notes System

Notes support:

- DM‑only
- Party‑wide
- Individual sharing
- Tags
- Attachments
- Publishing to chat
- Per‑user flags (read, hidden, starred)

### **Note**

- `markdown`
- `type` (NORMAL, METAGAME)
- `visibility` (DM_ONLY, PARTY, INDIVIDUALS, GLOBAL)
- `tags[]`
- `publishedAt`
- `publishedToChat`

### **NoteFlag**

Per‑user state:

- `isRead`
- `isHidden`
- `isStarred`

### **NoteShare**

Explicit mapping for individual visibility.

---

# 🎙️ Audio Presets & DM Controls

Audio effects are stored as:

- Preset definitions (JSON)
- DM overrides (per user)
- Environment presets (per room)
- Condition presets (per user)
- Distance presets (per user)

### **Preset Library**

Stored as JSON:

- Voice presets
- Distance presets
- Environment presets
- Condition presets
- IC presets

### **DM Overrides**

Stored transiently in Redis, but DB logs:

- Who applied override
- When
- What parameters

---

# 🎧 Recordings & Transcripts

Recordings are stored externally (S3, etc.) but metadata is stored in DB.

### **Recording**

- `campaignId`, `sessionId`, `roomId`
- `type` (AUDIO, VIDEO, TEXT)
- `url`
- `metadata`

### **Transcript**

- `recordingId`
- `text`
- `startTime`, `endTime`

---

# 📓 Journals

Each session has one journal:

- Manual DM notes
- AI summary
- Metadata (tags, highlights)

---

# 🔌 External Integrations

External logs (DDB/Roll20/FVTT) are normalized into:

### **ChatMessage** with `type=EXTERNAL`

Fields include:

- `source`
- `metadata`
- `rawPayload` (optional)

---

# 📦 Import / Export

Campaign import/export stores:

- Characters
- Notes
- Chat
- Journals
- Sessions
- Recordings metadata
- Settings

### **ImportExport**

- `type`
- `payload` (JSON)
- `createdById`
- `campaignId` (optional)
- `userId` (optional)

---

# 🛠️ Admin & Audit Logs

### **AuditLog**

Tracks:

- DM changes
- Assistant DM promotions
- Room creation/deletion
- Audio overrides
- Session start/end
- Player movement
- Private chat lifecycle

Fields:

- `action`
- `details`
- `userId`
- `campaignId`
- `sessionId`
- `createdAt`

---

# 📡 Telemetry

Telemetry events are:

- Client → server
- Aggregated
- Stored long‑term

### **TelemetryEvent**

- `eventName`
- `properties`
- `userId`
- `campaignId`
- `createdAt`

---

# 🧠 Design Principles

### 1. **Redis is the source of truth for live state**

Postgres stores snapshots for recovery + analytics.

### 2. **Postgres is the source of truth for history**

Everything that matters long‑term is stored here.

### 3. **DM authority is explicit and logged**

DM changes, assistant DM roles, and overrides are all auditable.

### 4. **Notes and chat are first‑class citizens**

Searchable, timestamped, and exportable.

### 5. **Audio effects are declarative**

Presets are JSON, not code.

### 6. **Sessions are boundaries**

Everything is scoped to a session unless explicitly global.

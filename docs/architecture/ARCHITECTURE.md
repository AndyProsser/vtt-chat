# **ARCHITECTURE.md**

# VTT‑Chat Platform Architecture

_A scalable, real‑time virtual tabletop communication system_

---

## 📘 Overview

This document provides a high‑level architectural overview of the VTT‑Chat platform.
It describes the major subsystems, their responsibilities, and how they interact:

- Backend (Node.js, Postgres, Redis, Prisma)
- Real‑time layer (WebSockets + LiveKit)
- Presence & session state machine
- Audio engine (WebAudio + presets + DM controls)
- Frontend architecture (Zustand stores + event reducer)
- Browser extension integration
- Long‑term storage, journaling, and search
- Admin, accounting, and telemetry subsystems

This file serves as the **entry point** for developers.
Each subsystem has its own dedicated document linked below.

---

## 🏗️ Core System Components

### **1. Backend API (Node.js + Fastify/Express)**

The backend exposes a modular API surface:

- **Auth & Identity**
- **Campaigns & Sessions**
- **Rooms & Presence**
- **Chat & Notes**
- **Recordings & Journals**
- **Audio Presets & DM Controls**
- **Admin & Accounting**
- **Telemetry & Status**

All APIs are stateless and authenticated via JWT or API keys.

**See:** `API-SPEC.md`

---

### **2. Database Layer (Postgres + Prisma)**

The relational schema supports:

- Users, characters, campaigns
- Sessions, rooms, presence snapshots
- Chat messages, notes, flags, shares
- Recordings, transcripts, journals
- Audio presets, DM overrides
- Admin logs, accounting usage
- Import/export & archival

**See:** `DATA-MODEL.md`

---

### **3. Redis Presence Layer**

Redis is the **source of truth for live state**, including:

- User presence
- Room membership
- Private rooms
- DM/assistant DM roles
- Audio override state
- Shout flags
- Activity timestamps
- WebSocket fan‑out channels

A background job periodically snapshots Redis → Postgres for recovery and analytics.

**See:** `PRESENCE-STATE-MACHINE.md`

---

### **4. Real‑Time Transport (WebSockets)**

All clients maintain a WebSocket connection per campaign:

```
wss://server/ws/campaign/:campaignId
```

Events include:

- Presence
- Session lifecycle
- Room changes
- Chat & whispers
- Notes published to chat
- Audio presets & DM overrides
- Private chat lifecycle
- External logs (DDB/Roll20/FVTT)
- Telemetry events

A central **event reducer** routes events into Zustand stores.

**See:** `WEBSOCKETS.md`
**See:** `EVENT-REDUCER.md`

---

### **5. LiveKit Integration**

LiveKit handles:

- Audio publishing
- Room subscriptions
- Track events
- Private chat routing
- Shout routing
- DM broadcast
- Room‑level audio separation

A custom integration layer manages:

- RoomManager
- TrackRouter
- Publisher
- AudioGraph (WebAudio)

**See:** `LIVEKIT-INTEGRATION.md`

---

### **6. Audio Engine (WebAudio)**

The audio engine provides:

- Per‑participant gain, mute, filters
- Distance simulation
- Environment acoustics (reverb IRs)
- Condition effects (silenced, underwater, drunk, etc.)
- DM voice presets (demon, narrator, whisper, etc.)
- Player IC presets (DM‑only monitor)
- Private room clean mode
- DM push‑to‑talk override
- Clear‑all effects

All presets are defined in a shared JSON library.

**See:** `AUDIO-ENGINE.md`
**See:** `PRESET-LIBRARY.md`

---

### **7. Frontend Architecture (React + Zustand)**

The client uses a modular state architecture:

- `usePresenceStore`
- `useRoomStore`
- `useAudioStore`
- `useChatStore`
- `useRoleStore`
- `useNoteStore`
- `useTelemetryStore`

The WebSocket event reducer updates these stores deterministically.

**See:** `STATE-STORES.md`

---

### **8. Chat & Notes System**

Features include:

- Room chat
- Whispers
- Green room ephemeral chat
- Hashtags
- Metagame notes
- Notes with visibility rules
- Per‑user flags (read, hidden, starred)
- Notes published to chat
- Search across sessions

**See:** `CHAT-SYSTEM.md`
**See:** `NOTES-SYSTEM.md`

---

### **9. Sessions & Green Room**

Session lifecycle:

- Players gather in green room
- DM starts session → recap shown
- Private rooms, group rooms, whispers
- Session ends → return to green room
- Green room messages restored
- Cleanup when last user leaves

**See:** `SESSIONS.md`

---

### **10. Browser Extension Integration**

The extension supports:

- Quick connect
- Character metadata injection
- External logs (DDB/Roll20/FVTT)
- Auto‑effects (conditions, spells, distance)
- Map‑based distance → audio effects
- Whisper/shout detection

**See:** `EXTENSION-INTEGRATION.md`

---

### **11. Admin & Accounting**

Admin console supports:

- User management
- Campaign management
- Logs & telemetry
- Backup, archive, restore
- Usage tracking
- Locking users/campaigns

**See:** `BACKUP-RESTORE.md`
**See:** `TELEMETRY.md`

---

### **12. Deployment & Scaling**

The platform is containerized:

- API
- Postgres
- Redis
- LiveKit
- Worker queue
- Admin console
- SPA frontend

Horizontal scaling is supported via:

- Stateless API
- Redis presence
- LiveKit SFU
- Worker queues

**See:** `DEPLOYMENT.md`

---

## 🧭 Document Index

| Document                      | Description                           |
| ----------------------------- | ------------------------------------- |
| **ARCHITECTURE.md**           | High‑level overview (this file)       |
| **API-SPEC.md**               | REST API endpoints                    |
| **DATA-MODEL.md**             | Prisma schema + relationships         |
| **PRESENCE-STATE-MACHINE.md** | Redis presence model                  |
| **WEBSOCKETS.md**             | WebSocket event contract              |
| **EVENT-REDUCER.md**          | Client event reducer                  |
| **STATE-STORES.md**           | Zustand store architecture            |
| **LIVEKIT-INTEGRATION.md**    | Room manager, track router, publisher |
| **AUDIO-ENGINE.md**           | WebAudio graph + effects              |
| **PRESET-LIBRARY.md**         | JSON preset definitions               |
| **CHAT-SYSTEM.md**            | Chat, whispers, green room            |
| **NOTES-SYSTEM.md**           | Notes, flags, visibility              |
| **SESSIONS.md**               | Session lifecycle                     |
| **EXTENSION-INTEGRATION.md**  | DDB/Roll20/FVTT hooks                 |
| **DM-TOOLS.md**               | DM controls & UI                      |
| **TELEMETRY.md**              | Analytics & logging                   |
| **BACKUP-RESTORE.md**         | Admin workflows                       |
| **DEPLOYMENT.md**             | Docker & scaling                      |

# **AI‑CONTEXT-TEMPLATE.md**

_A complete onboarding context for any AI assisting with the VTT‑Chat platform._

---

“Use the following context to understand the VTT‑Chat platform.
You are assisting with architecture, design, and implementation.
Follow all rules and constraints described.”

---

# 🧭 **1. Project Identity**

**Project Name:** VTT‑Chat
**Purpose:** A real‑time, audio‑centric virtual tabletop communication platform with deep DM tooling, browser extension integration, and long‑term campaign persistence.
**Core Philosophy:**

- DM‑first design
- Deterministic real‑time behavior
- Clean separation of concerns
- Audio as a storytelling tool
- Private rooms are sacred
- Green room is a safe lobby
- Extension augments, never replaces

---

# 🧱 **2. High‑Level Architecture**

```
Frontend (React + Zustand)
        ↓
WebSocket Event Stream
        ↓
Event Reducer
        ↓
Zustand Stores
        ↓
LiveKit Integration Layer
        ↓
Audio Engine (WebAudio DSP)
        ↓
UI Rendering
```

Backend stack:

```
Node.js API
Postgres (authoritative data)
Redis (presence + ephemeral state)
LiveKit (audio transport)
Object Storage (recordings + attachments)
Browser Extension (DDB/Roll20/FVTT)
```

---

# 🧩 **3. Core Subsystems**

### **3.1 Presence System**

- Redis‑backed state machine
- Tracks: user state, room membership, private rooms, session state
- Drives LiveKit room connections
- Drives audio clean mode

### **3.2 WebSocket Event System**

- Namespaced events (`chat.*`, `audio.*`, `presence.*`, etc.)
- Reducer routes events → store actions
- Deterministic, side‑effect‑free

### **3.3 Zustand Stores**

- `presence` — session/room state
- `rooms` — LiveKit tokens + connections
- `audio` — presets, overrides, clean mode, PTT
- `chat` — room messages, whispers, green room
- `notes` — notes, flags, visibility
- `roles` — DM/assistant DM/player
- `session` — recap, journal, metadata
- `telemetry` — batched analytics

### **3.4 LiveKit Integration**

- RoomManager
- TrackRouter
- Publisher
- Private rooms
- Shout routing
- Recording + transcription

### **3.5 Audio Engine**

- WebAudio DSP graph
- Per‑participant chains
- RoomBus + MasterBus
- Distance, environment, conditions
- DM voice presets
- IC mode
- PTT override
- Clean mode for private rooms

### **3.6 Browser Extension**

- DDB/Roll20/FVTT integration
- Metadata extraction
- External logs → chat
- Auto‑effects → audio
- Launch button injection
- Character/campaign detection

### **3.7 Notes System**

- Markdown notes
- Visibility rules
- Attachments
- Publishing to chat
- Linking to journal

### **3.8 Sessions**

- Green room → session → green room
- Recap (manual + AI)
- Journaling
- Recording
- Private rooms
- Group rooms

---

# 🎧 **4. Audio Effect Priority Stack**

Highest wins:

```
PTT override
↓
Private room clean mode
↓
DM override
↓
Condition preset
↓
Distance preset
↓
Environment preset
↓
Voice preset (DM only)
↓
IC preset (DM monitor only)
↓
Base audio
```

This ordering is **critical** for correct behavior.

---

# 🗂️ **5. Document Map (Full Repo)**

| Document                  | Purpose                      |
| ------------------------- | ---------------------------- |
| ARCHITECTURE.md           | High‑level system overview   |
| API-SPEC.md               | REST API contract            |
| DATA-MODEL.md             | Prisma schema                |
| PRESENCE-STATE-MACHINE.md | Redis presence model         |
| WEBSOCKETS.md             | Event contract               |
| EVENT-REDUCER.md          | Client reducer               |
| STATE-STORES.md           | Zustand stores               |
| LIVEKIT-INTEGRATION.md    | Room manager + track router  |
| AUDIO-ENGINE.md           | WebAudio DSP graph           |
| PRESET-LIBRARY.md         | JSON preset definitions      |
| CHAT-SYSTEM.md            | Chat + whispers + green room |
| NOTES-SYSTEM.md           | Notes + visibility           |
| SESSIONS.md               | Session lifecycle            |
| EXTENSION-INTEGRATION.md  | DDB/Roll20/FVTT hooks        |
| DM-TOOLS.md               | DM control surface           |
| TELEMETRY.md              | Analytics pipeline           |
| BACKUP-RESTORE.md         | Disaster recovery            |
| DEPLOYMENT.md             | Docker + Caddy + LiveKit     |

---

# 🧭 **6. Key Rules an AI Must Respect**

### **6.1 Deterministic Behavior**

- Reducers must be pure
- Stores must not perform side effects
- Audio effects must follow priority stack
- Presence transitions must follow state machine

### **6.2 Clean Separation**

- Backend never touches WebAudio
- Frontend never touches Redis
- Extension never touches DB
- Reducer never touches LiveKit directly

### **6.3 Private Room Guarantees**

- Clean audio
- No recording
- No environment
- No distance
- No conditions
- No IC
- No DM voice presets

### **6.4 Green Room Guarantees**

- Persistent chat
- No audio effects
- No recording
- No private rooms

### **6.5 DM Authority**

- DM can override anything
- Assistant DM has limited powers
- Players cannot unshare notes

---

# 🧠 **7. What the AI Should Do When Helping**

### **7.1 When designing features**

- Respect subsystem boundaries
- Use existing event namespaces
- Use existing store patterns
- Maintain deterministic flows

### **7.2 When writing code**

- Follow modular architecture
- Avoid side effects in reducers
- Use store actions for state changes
- Use integration layers for LiveKit/WebAudio

### **7.3 When reasoning about UX**

- DM‑first
- Player‑friendly
- Private rooms are sacred
- Green room is safe
- Audio is a storytelling tool

### **7.4 When generating backend logic**

- Use Postgres for authoritative data
- Use Redis for ephemeral state
- Use WebSocket for real‑time events
- Use LiveKit for audio transport

---

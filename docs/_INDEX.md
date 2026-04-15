# VTT‑Chat

## 🧭 Document Index

| Document                                                   | Description                           |
| ---------------------------------------------------------- | ------------------------------------- |
| [**ARCHITECTURE.md**](ARCHITECTURE.md)                     | High‑level overview (this file)       |
| [**API-SPEC.md**](API-SPEC.md)                             | REST API endpoints                    |
| [**DATA-MODEL.md**](DATA-MODEL.md)                         | Prisma schema + relationships         |
| [**PRESENCE-STATE-MACHINE.md**](PRESENCE-STATE-MACHINE.md) | Redis presence model                  |
| [**WEBSOCKETS.md**](WEBSOCKETS.md)                         | WebSocket event contract              |
| [**EVENT-REDUCER.md**](EVENT-REDUCER.md)                   | Client event reducer                  |
| [**STATE-STORES.md**](STATE-STORES.md)                     | Zustand store architecture            |
| [**LIVEKIT-INTEGRATION.md**](LIVEKIT-INTEGRATION.md)       | Room manager, track router, publisher |
| [**AUDIO-ENGINE.md**](AUDIO-ENGINE.md)                     | WebAudio graph + effects              |
| [**PRESET-LIBRARY.md**](PRESET-LIBRARY.md)                 | JSON preset definitions               |
| [**CHAT-SYSTEM.md**](CHAT-SYSTEM.md)                       | Chat, whispers, green room            |
| [**NOTES-SYSTEM.md**](NOTES-SYSTEM.md)                     | Notes, flags, visibility              |
| [**SESSIONS.md**](SESSIONS.md)                             | Session lifecycle                     |
| [**EXTENSION-INTEGRATION.md**](EXTENSION-INTEGRATION.md)   | DDB/Roll20/FVTT hooks                 |
| [**DM-TOOLS.md**](DM-TOOLS.md)                             | DM controls & UI                      |
| [**TELEMETRY.md**](TELEMETRY.md)                           | Analytics & logging                   |
| [**BACKUP-RESTORE.md**](BACKUP-RESTORE.md)                 | Admin workflows                       |
| [**DEPLOYMENT.md**](DEPLOYMENT.md)                         | Docker & scaling                      |

Absolutely, Andy — here is a **clean, authoritative overview document** that ties your entire documentation suite together.
It’s written to serve as the _front door_ to the repo: high‑level, navigable, and structured so contributors (and future you) can immediately understand the system.

You can drop this directly into **README.md** or **OVERVIEW.md**, or keep it as a standalone index.

---

# **VTT‑Chat Documentation Overview**

A complete, modular documentation suite for the VTT‑Chat platform — covering backend architecture, real‑time systems, audio engine, browser extension, DM tools, deployment, and long‑term campaign data management.

This overview provides:

- A **table of contents** linking every document
- A **map of the system** and how the docs relate
- A **recommended reading order** for new contributors
- A **high‑level architecture summary**

---

# 🧭 Document Index

| Document                                                   | Description                           |
| ---------------------------------------------------------- | ------------------------------------- |
| [**ARCHITECTURE.md**](ARCHITECTURE.md)                     | High‑level overview                   |
| [**API-SPEC.md**](API-SPEC.md)                             | REST API endpoints                    |
| [**DATA-MODEL.md**](DATA-MODEL.md)                         | Prisma schema + relationships         |
| [**PRESENCE-STATE-MACHINE.md**](PRESENCE-STATE-MACHINE.md) | Redis presence model                  |
| [**WEBSOCKETS.md**](WEBSOCKETS.md)                         | WebSocket event contract              |
| [**EVENT-REDUCER.md**](EVENT-REDUCER.md)                   | Client event reducer                  |
| [**STATE-STORES.md**](STATE-STORES.md)                     | Zustand store architecture            |
| [**LIVEKIT-INTEGRATION.md**](LIVEKIT-INTEGRATION.md)       | Room manager, track router, publisher |
| [**AUDIO-ENGINE.md**](AUDIO-ENGINE.md)                     | WebAudio graph + effects              |
| [**PRESET-LIBRARY.md**](PRESET-LIBRARY.md)                 | JSON preset definitions               |
| [**CHAT-SYSTEM.md**](CHAT-SYSTEM.md)                       | Chat, whispers, green room            |
| [**NOTES-SYSTEM.md**](NOTES-SYSTEM.md)                     | Notes, flags, visibility              |
| [**SESSIONS.md**](SESSIONS.md)                             | Session lifecycle                     |
| [**EXTENSION-INTEGRATION.md**](EXTENSION-INTEGRATION.md)   | DDB/Roll20/FVTT hooks                 |
| [**DM-TOOLS.md**](DM-TOOLS.md)                             | DM controls & UI                      |
| [**TELEMETRY.md**](TELEMETRY.md)                           | Analytics & logging                   |
| [**BACKUP-RESTORE.md**](BACKUP-RESTORE.md)                 | Admin workflows                       |
| [**DEPLOYMENT.md**](DEPLOYMENT.md)                         | Docker & scaling                      |

---

# 🧱 System Map

This section shows how the documents relate to each other and to the architecture.

```
                ┌──────────────────────────┐
                │      ARCHITECTURE.md     │
                └──────────────┬───────────┘
                               │
        ┌──────────────────────┼──────────────────────────┐
        │                      │                          │
        ▼                      ▼                          ▼
┌──────────────┐     ┌────────────────┐        ┌────────────────────┐
│ DATA-MODEL.md │     │ API-SPEC.md   │        │ WEBSOCKETS.md       │
└───────┬──────┘     └──────┬────────┘        └──────────┬─────────┘
        │                    │                             │
        ▼                    ▼                             ▼
┌──────────────┐     ┌────────────────┐        ┌────────────────────┐
│ PRESENCE-     │     │ EVENT-REDUCER │        │ STATE-STORES.md     │
│ STATE-MACHINE │     └──────┬────────┘        └──────────┬─────────┘
└───────┬──────┘            │                             │
        │                    │                             │
        ▼                    ▼                             ▼
┌──────────────┐     ┌────────────────┐        ┌────────────────────┐
│ LIVEKIT-      │     │ AUDIO-ENGINE  │        │ PRESET-LIBRARY.md   │
│ INTEGRATION   │     └────────────────┘        └────────────────────┘
└──────────────┘
```

Additional subsystems:

```
CHAT-SYSTEM.md
NOTES-SYSTEM.md
SESSIONS.md
DM-TOOLS.md
EXTENSION-INTEGRATION.md
TELEMETRY.md
BACKUP-RESTORE.md
DEPLOYMENT.md
```

---

# 📚 Recommended Reading Order (For New Contributors)

### **1. Core Architecture**

1. ARCHITECTURE.md
2. DATA-MODEL.md
3. API-SPEC.md

### **2. Real‑Time Engine**

4. PRESENCE-STATE-MACHINE.md
5. WEBSOCKETS.md
6. EVENT-REDUCER.md
7. STATE-STORES.md

### **3. Audio & LiveKit**

8. LIVEKIT-INTEGRATION.md
9. AUDIO-ENGINE.md
10. PRESET-LIBRARY.md

### **4. Feature Systems**

11. CHAT-SYSTEM.md
12. NOTES-SYSTEM.md
13. SESSIONS.md
14. DM-TOOLS.md

### **5. External Integration**

15. EXTENSION-INTEGRATION.md

### **6. Ops & Reliability**

16. TELEMETRY.md
17. BACKUP-RESTORE.md
18. DEPLOYMENT.md

---

# 🧠 High‑Level Summary

The VTT‑Chat platform is built around **five core pillars**:

### **1. Real‑Time Presence & Rooms**

- Redis presence state machine
- WebSocket event contract
- LiveKit room connections
- Private rooms with clean audio

### **2. Audio Engine**

- WebAudio DSP graph
- Distance, conditions, environment
- DM voice presets
- IC mode
- PTT override
- Deterministic effect priority

### **3. Chat & Notes**

- Room‑aware chat
- Whispers
- Green room persistence
- Notes with visibility rules
- Publishing notes to chat

### **4. Browser Extension**

- DDB/Roll20/FVTT integration
- Metadata extraction
- Auto‑effects
- External logs

### **5. Ops & Deployment**

- Docker Compose stack
- Caddy reverse proxy
- LiveKit server
- TURN support
- Backups & restore
- Telemetry pipeline

---

# 🧩 How Everything Fits Together

```
Browser Extension → Backend → WebSocket → Event Reducer → Zustand Stores
                                              ↓
                                          LiveKit
                                              ↓
                                         Audio Engine
                                              ↓
                                             UI
```

- **Backend** orchestrates presence, sessions, notes, chat, and LiveKit tokens
- **WebSocket** streams real‑time events
- **Reducer** updates stores
- **Stores** drive UI + LiveKit + AudioGraph
- **AudioGraph** processes all audio
- **Extension** enriches the experience with external logs and auto‑effects

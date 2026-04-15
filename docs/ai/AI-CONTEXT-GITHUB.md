# **AI_CONTEXT_COPILOT.md**

_A compact, high‑signal context file for GitHub Copilot._

---

# 🧭 Project Summary

**VTT‑Chat** is a real‑time, audio‑centric virtual tabletop communication platform.
It integrates:

- A React SPA with Zustand state stores
- A Node.js backend with Postgres + Redis
- LiveKit for audio transport
- A WebAudio DSP engine for effects
- A browser extension for DDB/Roll20/FVTT integration
- DM‑first UX with private rooms, group rooms, and session flow

Copilot should treat this as a **modular, event‑driven system** with strict boundaries.

---

# 🧱 Core Architectural Rules (Copilot MUST follow)

### **1. Reducers must be pure**

- No side effects
- No async
- No LiveKit/WebAudio calls
- Only update Zustand stores

### **2. Stores must not perform side effects**

- Stores expose actions
- Integration layers perform effects

### **3. Audio effects follow strict priority**

Highest wins:

```
PTT override
Private room clean mode
DM override
Condition preset
Distance preset
Environment preset
Voice preset (DM only)
IC preset (DM monitor only)
Base audio
```

### **4. Private rooms are sacred**

Copilot must enforce:

- No effects
- No recording
- No environment
- No distance
- No conditions
- No IC
- No DM voice presets

### **5. Green room is a safe lobby**

- Persistent chat
- No audio effects
- No private rooms
- No recording

### **6. DM authority is absolute**

- DM can override anything
- Assistant DM has limited powers
- Players cannot unshare notes

---

# 🧩 Subsystem Overview (Copilot should understand these modules)

### **Presence System**

- Redis state machine
- Drives LiveKit room connections
- Drives audio clean mode
- Events: `presence.*`, `private.*`, `session.*`

### **WebSocket Event System**

- Namespaced events
- Reducer routes → store actions
- Deterministic, no side effects

### **Zustand Stores**

- `presence` — session/room state
- `rooms` — LiveKit tokens + connections
- `audio` — presets, overrides, clean mode, PTT
- `chat` — room messages, whispers, green room
- `notes` — notes + visibility
- `roles` — DM/assistant DM/player
- `session` — recap + journal
- `telemetry` — batched analytics

### **LiveKit Integration**

- RoomManager
- TrackRouter
- Publisher
- Private rooms
- Recording

### **Audio Engine**

- WebAudio DSP graph
- Per‑participant chains
- RoomBus + MasterBus
- Distance, environment, conditions
- DM voice presets
- IC mode
- PTT override

### **Browser Extension**

- DDB/Roll20/FVTT integration
- Metadata extraction
- External logs → chat
- Auto‑effects → audio
- Launch button injection

### **Notes System**

- Markdown notes
- Visibility rules
- Attachments
- Publishing to chat

### **Sessions**

- Green room → session → green room
- Recap
- Journaling
- Recording
- Private rooms

---

# 🧠 Copilot Behavioral Expectations

### **When generating code**

- Use existing patterns
- Respect subsystem boundaries
- Use store actions, not direct mutations
- Use reducer namespaces correctly
- Use integration layers for LiveKit/WebAudio
- Never bypass the audio priority stack

### **When generating backend logic**

- Postgres = authoritative
- Redis = ephemeral
- WebSocket = real‑time
- LiveKit = audio transport

### **When generating frontend logic**

- Reducer → store → integration layer → UI
- Never call LiveKit or WebAudio from reducers
- Never mutate store state directly

### **When generating extension logic**

- Only content/background scripts
- No direct DB access
- All data flows through backend APIs

---

# 🧭 File Map (Copilot should use these as anchors)

```
ARCHITECTURE.md
API-SPEC.md
DATA-MODEL.md
PRESENCE-STATE-MACHINE.md
WEBSOCKETS.md
EVENT-REDUCER.md
STATE-STORES.md
LIVEKIT-INTEGRATION.md
AUDIO-ENGINE.md
PRESET-LIBRARY.md
CHAT-SYSTEM.md
NOTES-SYSTEM.md
SESSIONS.md
EXTENSION-INTEGRATION.md
DM-TOOLS.md
TELEMETRY.md
BACKUP-RESTORE.md
DEPLOYMENT.md
```

Copilot should reference these documents when generating or modifying code.

---

# 🧩 Example Instructions to Copilot (You can paste these into prompts)

### **“When modifying reducers…”**

> Ensure reducers remain pure, synchronous, and side‑effect‑free.
> All effects must be handled by integration layers.

### **“When modifying audio logic…”**

> Respect the audio priority stack.
> Private room clean mode overrides everything except PTT.

### **“When modifying presence logic…”**

> Follow the Redis presence state machine.
> Never invent new states or transitions.

### **“When modifying extension logic…”**

> Only use DOM scraping, MutationObserver, and backend APIs.
> Never access DB or internal services directly.

---

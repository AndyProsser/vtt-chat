# **COPILOT_CHAT_CONTEXT.md**

_A compact, strict system prompt for GitHub Copilot Chat inside VS Code._

---

## 🧭 **Project Summary**

You are assisting with **VTT‑Chat**, a real‑time, audio‑centric virtual tabletop communication platform.
It includes:

- React SPA with Zustand stores
- Node.js backend with Postgres + Redis
- LiveKit for audio transport
- WebAudio DSP engine for effects
- Browser extension for DDB/Roll20/FVTT
- DM‑first UX with private rooms, group rooms, and session flow

Your job is to generate code, architecture, and reasoning that fits this system exactly.

---

## 🧱 **Core Architectural Rules (You MUST follow these)**

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

You must enforce:

- No effects
- No recording
- No environment
- No distance
- No conditions
- No IC
- No DM voice presets

### **5. Green room rules**

- Persistent chat
- No audio effects
- No private rooms
- No recording

### **6. DM authority**

- DM can override anything
- Assistant DM has limited powers
- Players cannot unshare notes

---

## 🧩 **Subsystem Awareness (You MUST understand these modules)**

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

- `presence`, `rooms`, `audio`, `chat`, `notes`, `roles`, `session`, `telemetry`

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

## 🧠 **How You Should Behave When Helping**

### **When generating code**

- Use existing patterns
- Respect subsystem boundaries
- Use store actions, not direct mutations
- Use reducer namespaces correctly
- Use integration layers for LiveKit/WebAudio
- Never bypass the audio priority stack
- Create or update tests for each changed key system (API, service/repository, WS dispatcher/handlers/recovery, reducer/store/hook integration, permission/privacy paths)
- Include at least happy path + permission/privacy boundary + one error/recovery case per changed key system

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

- Only DOM scraping, MutationObserver, backend APIs
- No direct DB access

### **When changes affect release/status docs**

- Keep `ROADMAP.md` and `CHANGELOG.md` synchronized.
- Keep versions aligned across root and all package manifests.
- Keep the version line in `README.md` current.
- After any change set, run a quick doc-impact check and update `ROADMAP.md`, `CHANGELOG.md`, and `README.md` when required.
- Do not finalize release-significant edits with mismatched roadmap/changelog/version content.

---

## 🧭 **Document Map (Use these as anchors)**

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

You should reference these documents implicitly when generating or modifying code.

---

## 🧩 **Example Instructions You Should Follow**

### **“When modifying reducers…”**

Keep them pure. No side effects. No LiveKit/WebAudio. Only store actions.

### **“When modifying audio logic…”**

Respect the audio priority stack.
Private room clean mode overrides everything except PTT.

### **“When modifying presence logic…”**

Follow the Redis presence state machine.
Do not invent new states or transitions.

### **“When modifying extension logic…”**

Use DOM scraping + backend APIs only.
Never access DB or internal services directly.

---

## ✔️ \*\*This is your operating context.

All code and reasoning must align with it.\*\*

---

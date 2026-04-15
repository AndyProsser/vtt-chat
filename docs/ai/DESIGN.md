# 🧠 **VTT‑Chat — Deep Architecture & Design AI Onboarding Template**

Copy/paste everything below into a new chat.

---

## **PROJECT IDENTITY**
VTT‑Chat is a **DM‑grade, session‑aware, privacy‑respecting tabletop voice & chat platform** designed for real‑time TTRPG play.
It is *not* a VTT map tool — it is the **communication layer**: audio, chat, metadata, DM controls, and session management.

The platform must feel:

- Lightweight
- Fast
- Invisible when not needed
- DM‑empowering
- Player‑respecting
- Session‑bounded
- Exportable
- Clean

---

## **CORE PILLARS**
### **1. DM‑Grade Control**
The DM is a privileged actor with:

- Full visibility into all rooms, notes, logs, metadata
- Ability to override visibility rules
- Ability to pre‑set environments, conditions, overlays
- Ability to export/import session logs
- Ability to see join/leave events across all rooms

Players never see:

- DM notes
- Private metadata
- Other players’ private messages
- System clutter

### **2. Privacy & Session Boundaries**
Privacy is a *first‑class architectural constraint*:

- No cross‑session leakage
- No global logs
- No global presence
- No global chat
- All events are scoped to a **session** and **room**
- DM can see everything; players see only what they should
- Export/import is DM‑only

### **3. Minimal System Message Clutter**
Only three system messages are allowed:

- **Join**
- **Leave**
- **Session End**

Everything else (conditions, effects, environment changes, group transitions, private chat transitions) **must not** generate system messages.

### **4. Clean, Predictable Architecture**
- Shared TypeScript types across backend & frontend
- Modular backend services
- Predictable WebSocket event schemas
- Stateless frontend with Zustand stores
- Backend handles all authoritative state
- Redis handles presence, ephemeral state, rate limiting
- Postgres handles persistent state

---

## **ARCHITECTURE OVERVIEW**
### **Frontend**
- React + Vite
- Zustand for state
- LiveKit Components for audio
- SPA with DM/player modes
- Caddy reverse proxy
- Hot‑reload dev stack via docker-compose.dev.yml
- Strict separation of:
  - UI state
  - Session state
  - Audio state
  - Metadata overlays
  - DM tools

### **Backend**
- Node + Express 5
- WebSocket server
- Prisma + Postgres
- Redis for presence/session state
- LiveKit token service
- Modular service architecture:
  - Auth
  - Session
  - Room
  - Chat
  - Audio
  - Metadata
  - Export/Import

### **Infrastructure**
- Docker Compose (prod + dev)
- Caddy (HTTPS + routing + local dev mode)
- LiveKit server (dev mode locally)
- Postgres + Redis
- GitHub Actions CI/CD
- semantic‑release for automated versioning
- VS Code workspace with debugging & tasks

---

## **DATA MODELING PRINCIPLES**
- Everything is scoped to a **session**
- Rooms belong to sessions
- Users belong to rooms
- Metadata is room‑scoped
- Notes are DM‑only
- Logs are session‑scoped
- Audio tokens are ephemeral
- WebSocket events are typed and versioned

---

## **EVENT SCHEMA PRINCIPLES**
Every WebSocket event must include:

- `type`
- `sessionId`
- `roomId`
- `timestamp`
- `payload`

Events must be:

- Predictable
- Versioned
- Minimal
- Room‑scoped
- DM‑aware

---

## **UX PRINCIPLES**
### **DM Experience**
- DM sees everything
- DM can override visibility
- DM can annotate, tag, export, import
- DM can switch rooms instantly
- DM can apply overlays (conditions, effects, environments)
- DM can see join/leave logs across all rooms

### **Player Experience**
- Clean, minimal UI
- Only sees what they should
- No system spam
- No DM‑only metadata
- No cross‑room leakage

### **Chat UX**
- Fast, responsive
- Room‑scoped
- Supports metadata cards
- Supports DM‑only messages
- Supports private notes
- Supports export

### **Audio UX**
- LiveKit‑powered
- Room‑scoped
- DM can mute individuals
- DM can force‑mute room
- Audio state visible via overlays

---

## **SESSION MANAGEMENT RULES**
- Sessions have strict boundaries
- History is lazy‑loaded
- Export/import is DM‑only
- Session end generates a system message
- Session end locks the session
- Session end freezes logs

---

## **METADATA SYSTEM**
Metadata cards are:

- Structured
- Timestamped
- Searchable
- Exportable
- Room‑scoped
- DM‑controlled

Types include:

- Rewards
- Rest
- Level‑up
- Key events
- Key encounters
- Combat start/end
- Recap
- DM notes

---

## **COLLABORATION STYLE (HOW I WANT THE AI TO WORK)**
You should:

- Provide **architectural reasoning**, not just code
- Challenge assumptions respectfully
- Offer alternatives when relevant
- Keep answers **direct, technical, and actionable**
- Avoid fluff
- Use diagrams, tables, and structured reasoning
- Treat me as a technical peer
- Avoid over‑explaining basics
- Prioritize:
  - Backend architecture
  - Privacy
  - Session logic
  - DM/player role separation
  - UX patterns
  - Event schema design
  - Audio/chat pipeline design

---

## **CURRENT PROJECT STATUS**
- Repo initialized
- Frontend + backend skeletons created
- Docker Compose (prod + dev) ready
- Caddyfile (prod + dev mode) ready
- VS Code workspace configured
- semantic‑release + CI/CD ready
- Starting real implementation work
- Ready for deep architectural design

---

## **WHAT I WANT FROM YOU**
- Architecture guidance
- Data modeling
- Event schema design
- UX patterns
- DM/player role separation strategies
- Audio/chat pipeline design
- Privacy/session logic
- High‑level reasoning
- System design
- Conceptual exploration
- Non‑code considerations

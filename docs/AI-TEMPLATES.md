# 🎭 **VTT‑Chat — Role‑Specific AI Onboarding Template**

Copy/paste the sections you want into a new chat.

---

# 🎛️ **1. DM UX DESIGN MODE**
*(Use this when you want to explore DM workflows, UI patterns, visibility rules, metadata systems, and session UX.)*

## **DM UX Philosophy**
VTT‑Chat is a **DM‑first** communication platform.
The DM is a privileged actor with:

- Full visibility into all rooms, logs, metadata, and notes
- Ability to override visibility rules
- Ability to pre‑set environments, conditions, overlays
- Ability to export/import session logs
- Ability to see join/leave events across all rooms

Players never see:

- DM notes
- Private metadata
- Other players’ private messages
- System clutter

## **DM UX Principles**
- DM sees everything; players see only what they should
- No system message spam (only join, leave, session end)
- Metadata overlays are visual, not chat messages
- Session history is lazy‑loaded
- DM can switch rooms instantly
- DM can annotate, tag, export, import
- DM controls audio (mute, force‑mute, room mute)
- DM can apply overlays (conditions, effects, environments)

## **DM Tools**
- Room switcher
- Metadata card composer
- Session log viewer
- Player list with controls
- Audio control panel
- Environment/condition overlays
- Private notes panel
- Export/import panel

## **What I Want From You (AI)**
- UX flows
- Interaction patterns
- Wireframe‑level reasoning
- Visibility rules
- Metadata system design
- Session lifecycle UX
- DM/player separation strategies
- Cognitive load reduction
- UI hierarchy and layout patterns

---

# 🏗️ **2. BACKEND ARCHITECTURE MODE**
*(Use this when you want to design data models, event schemas, backend services, session logic, or infrastructure.)*

## **Backend Philosophy**
The backend is the **authoritative source of truth** for:

- Sessions
- Rooms
- Presence
- Metadata
- Logs
- Audio tokens
- Permissions
- Visibility rules

Frontend is stateless; backend enforces everything.

## **Backend Stack**
- Node + Express 5
- WebSocket server
- Prisma + Postgres
- Redis for presence/session state
- LiveKit token service
- Modular service architecture
- Caddy reverse proxy
- Docker Compose (prod + dev)

## **Backend Modules**
- Auth
- Session
- Room
- Chat
- Metadata
- Audio
- Export/Import
- Presence
- Permissions
- Logging

## **Event Schema Rules**
Every WebSocket event includes:

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

## **Data Modeling Principles**
- Everything is session‑scoped
- Rooms belong to sessions
- Users belong to rooms
- Metadata is room‑scoped
- Notes are DM‑only
- Logs are session‑scoped
- Audio tokens are ephemeral

## **What I Want From You (AI)**
- Data modeling
- Event schema design
- Service boundaries
- WebSocket architecture
- Redis presence patterns
- Session lifecycle logic
- Export/import design
- Permission model
- Scalability considerations
- Failure modes & recovery

---

# 🎨 **3. FRONTEND UX & STATE ARCHITECTURE MODE**
*(Use this when you want to design UI structure, state stores, LiveKit integration, or React architecture.)*

## **Frontend Philosophy**
The frontend is:

- A thin client
- Stateless where possible
- Driven by backend events
- Powered by Zustand stores
- Structured around DM/player modes
- Built for speed and clarity

## **Frontend Stack**
- React + Vite
- Zustand
- LiveKit Components
- TypeScript
- Caddy reverse proxy
- SPA with DM/player modes

## **State Architecture**
Zustand stores are split by domain:

- `sessionStore`
- `roomStore`
- `chatStore`
- `audioStore`
- `metadataStore`
- `dmStore`
- `uiStore`

Stores must be:

- Minimal
- Event‑driven
- Derived from backend state
- Reset on session boundaries

## **UI Architecture**
- DM and player modes share components but differ in capabilities
- Metadata overlays are visual, not chat messages
- Audio UI is LiveKit‑driven
- Chat UI is WebSocket‑driven
- Session history is lazy‑loaded
- DM tools are collapsible panels

## **What I Want From You (AI)**
- Component architecture
- Zustand store design
- LiveKit integration patterns
- UI flows
- Interaction patterns
- State normalization
- Event‑driven UI updates
- DM/player mode separation
- Performance considerations

---

# ✔️ That’s the full role‑specific onboarding template.

Use it like this:

- Paste **DM UX Mode** when you want to design DM workflows
- Paste **Backend Architecture Mode** when you want deep system design
- Paste **Frontend UX Mode** when you want UI/state architecture

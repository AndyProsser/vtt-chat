# VTT‑Chat — Knowledge Pack  
*A complete architectural and behavioral reference for the project*

---

## 1. Project Overview

**Repository:** https://github.com/AndyProsser/vtt-chat  
**Goal:** Build a DM‑grade, privacy‑respecting, session‑aware tabletop **voice + chat** platform with advanced audio effects, metadata cards, notes, and LiveKit‑powered voice — deployable on a **home server** with minimal effort.

**Core idea:**  
A **voice‑first** tabletop communication system with optional messaging and powerful DM tools.  
Players get simplicity.  
DM gets control.

---

## 2. Roles & UX Philosophy

### Roles
- **DM**
  - Full control over audio effects, conditions, environments
  - Can manage sessions, metadata, notes, exports
  - Sees all messages and system events
- **Player**
  - Simple audio controls (gain/gate/mute/devices)
  - Can see conditions/environment applied to them
  - Cannot change conditions/environment

### UX Principles
- All DM actions should be **1–2 clicks**
- DM controls must never overwhelm the UI
- Private chat is **clean** (no logs, no effects)
- Players retain control over:
  - Mic device
  - Speaker device
  - Self‑mute
- DM overrides are **session‑scoped**
- Player preferences are **persistent**

---

## 3. Core Concepts & Behavior

### 3.1 Sessions & Session Boundaries

A **session** is a logical play segment (e.g., a game night).  
DM can explicitly **end a session**.

When a session ends:

- Insert a **session boundary marker** into main chat
- Reset:
  - DM voice preset → Normal
  - Room environments → None
  - Player conditions → cleared
  - DM gain/gate overrides → cleared
  - DM‑muted states → cleared
  - Temporary audio effects → cleared
  - Private/group rooms → closed
  - Everyone returned to main room
- Persist:
  - Player audio preferences
  - DM settings toggles
  - Chat logs
  - Notes
  - Metadata cards
  - Tags

### Lazy‑Loading Chat History

- When scrolling up and hitting a session boundary:
  - User must explicitly request older messages
- Messages load as a continuous log

---

## 3.2 Rooms & Visibility

Room types:

- **Main** — default room for everyone
- **Group** — subset of players; DM sees all groups
- **Private Chat** — intentionally silent

### Visibility Rules

| Room | What Players See | What DM Sees |
|------|------------------|--------------|
| Main | Main chat + system messages | Everything |
| Group | Group chat + group metadata | Everything |
| Private | No system messages, no effects logs | Everything |

---

## 3.3 System Messages (Strictly Limited)

Only **three** system message types exist:

1. **Join session**
2. **Leave session**
3. **Session ended by DM**

All system messages appear in **main chat only**.

### DM Included in Join/Leave

- “🟦 The DM (Andy) joined the session.”
- “⬜ The DM (Andy) left the session.”
- “🟥 Session ended by the DM.”

### No system messages for:

- Group joins/leaves  
- Private chat transitions  
- Conditions  
- Environments  
- Audio effects  

---

## 4. Audio Model

### 4.1 High-Level

- LiveKit handles voice transport
- Web Audio handles:
  - DM voice presets
  - Player conditions
  - Room environments
  - Gain/gate overrides

---

### 4.2 DM Audio Controls

DM Audio Panel includes:

- **DM Voice**  
  Single button → hover to choose preset  
- **Room Environment**  
  Hover → click to apply  
- **Clear Conditions**  
  Clears all player conditions  
- **Effects Panel** (optional)  
  Popup grid of one‑click sound effects  
- **Audio State Slide‑Out**  
  Per‑user gain/gate/mute/condition view

DM Settings Panel controls visibility of:

- DM Voice
- Room Environment
- Player Conditions
- Effects Panel
- Audio State Panel
- Whisper/Private Chat options

---

### 4.3 Player Conditions

- Applied **per player**
- Only one active condition at a time
- Applied via **right‑click → Conditions**
- Tapping again clears it
- Persist across reconnects and room changes
- Disabled in private chat
- Cleared at session end

Conditions appear as:

- Avatar overlays
- Player audio panel (read‑only)
- DM audio state slide‑out

---

### 4.4 Room Environments

- Applied **per room**
- Visible only to room members
- DM can pre‑set environments before moving players
- Cleared at session end

---

### 4.5 Gain/Gate & Mute Rules

**Players:**

- Can set:
  - Gain
  - Gate
  - Mic device
  - Speaker device
  - Self‑mute
- These persist across sessions

**DM:**

- Can override gain/gate (session‑only)
- Can mute/unmute only if **DM muted them**
- Cannot unmute a player who self‑muted
- Cannot change player mic/speaker devices

---

### 4.6 Ping Behavior

- Players can ping DM
- DM hears soft chime
- Ping cooldown per player (e.g., 10s)
- Prevents spam

---

## 5. Chat, Metadata, Notes, and Tags

### 5.1 Chat Messages

- Standard text messages
- Stored with:
  - Author
  - Room
  - Timestamp
  - Visibility
  - Session ID

---

### 5.2 Metadata Cards (DM Templates)

DM‑authored structured cards:

- Rewards
- Rest
- XP / Level‑Up
- Key Encounter
- Key Event
- Combat Start
- Combat End
- **Recap** (session summary)

Metadata cards:

- Are not system messages
- Are timestamped
- Are room‑scoped (main or group)
- Can be tagged
- Are searchable
- Appear in timeline view

---

### 5.3 Tags & Search

Tags:

- `#combat`, `#loot`, `#npc`, `#quest`, `#event`, `#xp`, `#recap`, etc.
- Clickable
- Filterable
- DM can add/remove via right‑click

Search can filter by:

- Text
- Tags
- Author
- Date range
- Session
- Metadata subtype

---

### 5.4 Timeline View

A metadata‑only chronological view grouped by session.

- Shows XP, Rest, Encounters, Events, Combat, Recaps
- DM‑focused
- Clicking a card jumps to original message

---

### 5.5 Notes

- DM can convert any message into a note
- Notes have:
  - Title
  - Content
  - Visibility rules
- No “one‑time reveal” messages
- Notes can be exported/imported

---

## 6. Persistence Rules

### Persist Across Sessions

- Player gain/gate/mute/devices
- Player theme/panel preferences
- DM settings toggles
- Player conditions
- Room environments
- Chat logs
- Metadata cards
- Notes
- Tags

### Reset at Session End

- DM voice preset
- Room environments
- Player conditions
- DM gain/gate overrides
- DM‑muted states
- Temporary effects
- Private/group rooms

---

## 7. Homelab Deployment Model

Target environment:

- **Ubuntu Server**
- **Docker** (Engine + Compose or Swarm)
- **Caddy** reverse proxy
- Non‑standard HTTPS ports (80/443 may be blocked)
- Self‑signed certificates for local IPs
- Optional ACME DNS‑01 for domains

### Deployment Goals

- A technical home user can deploy in a few hours
- Single install script:
  - Installs Docker
  - Installs Caddy
  - Generates self‑signed certs
  - Configures non‑standard HTTPS ports
  - Brings up:
    - Backend
    - SPA
    - Postgres
    - Redis
    - LiveKit
  - Writes `.env` files

### Assumptions

- No public domain required
- Local network access (e.g., `https://192.168.1.50:8443`)
- DDB VTT‑Chat Launcher Extension will open the SPA

---

## 8. Tech Stack Expectations

### Backend

- TypeScript
- WebSocket for realtime
- REST for config/export
- Postgres
- Redis
- LiveKit token generation

### Frontend

- React SPA
- TypeScript
- WebSocket client
- LiveKit client SDK
- Web Audio pipeline

### Reverse Proxy

- Caddy
- TLS termination
- Self‑signed or ACME DNS‑01
- Non‑standard HTTPS ports

---

## 9. Admin App (Optional Future)

- Campaign management
- Archive/export/delete
- User management
- System performance dashboards
- Historical logs
- Stats from backend, SPA, LiveKit
- Secure access
- Audit logs

---

## 10. Coding & Design Intent for AI

When generating code, prefer:

- Strong TypeScript typing
- Clear separation of concerns:
  - `core/`
  - `api/`
  - `infra/`
  - `ui/`
- Explicit handling of:
  - Privacy rules
  - Session boundaries
  - Lazy‑load chat history
  - DM vs player capabilities
- Structured logging
- Input validation & sanitization
- Rate limiting (especially ping)
- No assumptions about public domains
- Deployment must work on a **home server** with **non‑standard ports**

---

# **AI-CONTEXT.md**

### _A complete onboarding context for any AI assisting with the VTT‑Chat platform_

# AI Context & Onboarding Guide

_A complete onboarding context for any AI assisting with the VTT‑Chat platform._

This document provides everything an AI assistant needs to understand the VTT‑Chat platform, its architecture, philosophy, constraints, and documentation structure.
It ensures all AI‑generated output is:

- Consistent
- Deterministic
- Role‑aware
- Privacy‑respecting
- Architecturally aligned
- Safe and predictable

This is the **single source of truth** for AI behaviour within the VTT‑Chat ecosystem.

---

# 1. Project Identity

VTT‑Chat is a **role‑aware, privacy‑first communication layer** for virtual tabletops (VTTs).
It provides:

- Chat (IC/OOC/whispers/system)
- Notes (private/shared/DM)
- Audio effects & presets
- Presence indicators
- Session lifecycle management
- A browser extension overlay for third‑party VTTs

Everything is built on a **unidirectional event architecture** with deterministic reducers and strict permission boundaries.

---

# 2. Documentation Map (Full Repo Index)

AI assistants must reference and align with the documentation stored in the repo:

```
docs/
├── README.md
│
├── philosophy/
│   ├── SYSTEM-PHILOSOPHY.md
│   ├── UX-PRINCIPLES.md
│   ├── PRIVACY-MODEL.md
│   └── ROLE-SYSTEM.md
│
├── architecture/
│   ├── ARCHITECTURE-DIAGRAM.md
│   ├── EVENT-BUS.md
│   ├── STATE-RECOVERY.md
│   ├── SESSION-LIFECYCLE.md
│   ├── ERROR-MODEL.md
│   └── PERMISSIONS-MATRIX.md
│
├── subsystems/
│   ├── CHAT-SYSTEM.md
│   ├── NOTES-SYSTEM.md
│   ├── AUDIO-ENGINE.md
│   ├── PRESENCE-STATE-MACHINE.md
│   └── (future subsystem docs)
│
├── ui/
│   ├── COMPONENT-INTERFACES.md
│   ├── ANIMATION-AND-MOTION-SPEC.md
│   └── (future UI docs)
│
├── extension/
│   ├── EXTENSION-UX.md
│   └── THIRD-PARTY-INTEGRATIONS.md
│
├── dm-tools/
│   ├── DM-TOOLS.md
│   ├── SESSIONS.md
│   └── (future DM tooling docs)
│
├── operations/
│   ├── DEPLOYMENT.md
│   ├── TELEMETRY.md
│   ├── BACKUP-RESTORE.md
│   └── (future ops docs)
│
├── meta/
│   ├── ONBOARDING.md
│   ├── CONTRIBUTING.md
│   └── GLOSSARY.md
│
└── ai/
    ├── AI-CONTEXT.md   ← (this file)
    └── PROMPTING-RULES.md
```

AI assistants must use these documents as authoritative references.

---

# 3. Core Principles (From Philosophy Docs)

AI behaviour must align with:

### **SYSTEM-PHILOSOPHY.md**

- The table comes first
- Predictability builds trust
- Privacy is sacred
- DM is table authority
- Players deserve agency
- Spectators are passive
- System must never get in the way

### **UX-PRINCIPLES.md**

- Clarity over cleverness
- Motion reinforces meaning
- Role‑aware UI
- Non‑blocking design
- Minimal cognitive load

### **PRIVACY-MODEL.md**

- Private notes are truly private
- Whispers visible only to sender/recipient/DM
- No implicit visibility
- Extension cannot violate privacy

### **ROLE-SYSTEM.md**

- DM: full authority, full visibility
- Player: agency + private space
- Spectator: read‑only
- System: neutral arbiter

AI must never violate these boundaries.

---

# 4. Architecture Rules (From Architecture Docs)

### **ARCHITECTURE-DIAGRAM.md**

The system is composed of:

- UI Layer
- Event Bus
- Reducers
- Stores (Zustand)
- Subsystems
- Transport (WebSocket / Extension Bridge)
- Server services

### **EVENT-BUS.md**

AI must respect:

- Namespaced events
- Immutable payloads
- Validation rules
- Permission checks
- Privacy checks

### **STATE-RECOVERY.md**

AI must understand:

- Hydration events
- Snapshot replacement
- Deterministic rehydration
- Reconnect behaviour

### **SESSION-LIFECYCLE.md**

AI must respect:

- idle → active → paused → ended
- DM‑controlled transitions

### **ERROR-MODEL.md**

AI must produce:

- Non‑blocking errors
- Role‑appropriate messages
- Recoverable states

### **PERMISSIONS-MATRIX.md**

AI must enforce:

- DM‑only actions
- Player‑only actions
- Spectator restrictions
- Visibility rules

---

# 5. Subsystem Behaviour (From Subsystem Docs)

AI must understand the behaviour of:

### **CHAT-SYSTEM.md**

- IC/OOC
- Whispers
- System messages
- Role‑based visibility

### **NOTES-SYSTEM.md**

- Private notes
- Shared notes
- DM notes
- Real‑time sync

### **AUDIO-ENGINE.md**

- Effects
- Presets
- Local vs global audio
- DM overrides

### **PRESENCE-STATE-MACHINE.md**

- Typing
- Speaking
- Online state
- Heartbeats

### **dm-tools/SESSIONS.md**

- Session state
- Pause reasons
- Locking

AI must generate output consistent with subsystem rules.

---

# 6. UI & Extension Behaviour (From UI + Extension Docs)

### **UI Layer**

- Role‑aware
- Non‑blocking
- Motion‑informed
- Modular panels
- Dockable overlay

### **EXTENSION-UX.md**

- Overlay‑first
- Non‑destructive
- VTT‑agnostic
- Context‑aware
- Cannot access private data

### **THIRD-PARTY-INTEGRATIONS.md**

- DOM‑safe
- Event‑driven
- No direct mutation of VTT state

AI must never propose behaviours that violate these constraints.

---

# 7. DM Tools (From DM-TOOLS.md)

AI must understand:

- Session controls
- Presence overrides
- Audio overrides
- Moderation tools
- Safety features

DM tools are **DM‑only**.

---

# 8. Operations (From Operations Docs)

AI may reference:

- Deployment
- Telemetry
- Backups
- Monitoring

But must not invent operational behaviour outside documented rules.

---

# 9. Meta Rules (From Meta Docs)

### **ONBOARDING.md**

AI must help contributors:

- Understand architecture
- Follow coding standards
- Respect privacy/roles
- Update documentation

### **CONTRIBUTING.md**

AI must:

- Follow branch naming
- Follow event/reducer/store patterns
- Produce deterministic output
- Document all changes

### **GLOSSARY.md**

AI must use consistent terminology.

---

# 10. AI Behaviour Rules (From PROMPTING-RULES.md)

AI must:

- Be deterministic
- Avoid hallucination
- Reference existing docs
- Never contradict architecture
- Never violate privacy
- Never invent new roles
- Never bypass the event system
- Never propose reducers with side effects
- Never propose UI that violates UX principles
- Never propose extension behaviour that touches private data

AI should:

- Provide structured, maintainable output
- Use the same naming conventions as the repo
- Generate events, reducers, selectors, and UI consistent with subsystem patterns
- Ask clarifying questions when needed

---

# 11. Output Format Expectations

AI output must:

- Use GitHub‑flavored Markdown
- Use headings, lists, tables where appropriate
- Be concise but complete
- Avoid repetition
- Follow the repo’s tone and structure
- Reference relevant docs when giving guidance

---

# 12. Summary

This file defines:

- The identity of the VTT‑Chat platform
- The full documentation map
- The philosophical and architectural foundations
- The subsystem behaviours
- The UI and extension rules
- The DM‑tooling constraints
- The operational context
- The AI behavioural rules

Any AI assisting with VTT‑Chat must operate **strictly within these boundaries** and treat this file as the authoritative onboarding context.

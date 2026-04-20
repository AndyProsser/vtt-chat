# **README.md — Documentation Suite Overview**

# VTT‑Chat Documentation Suite

This repository contains the complete documentation for the VTT‑Chat platform — a role‑aware, privacy‑first communication layer for virtual tabletops.
The documentation is intentionally modular, deterministic, and deeply aligned with the system’s architecture and philosophy.

This README serves as the **entry point** for the entire documentation suite.

## Runtime Source of Truth

When roadmap, architecture, and implementation docs diverge, treat the shipped runtime contract as authoritative.

Use these sources first when updating docs or stage status:

- `shared/events/*` and `shared/events/base.ts` for websocket/domain event contracts
- `backend/src/api/index.ts` for mounted REST route families
- `backend/src/ws/index.ts` and `frontend/src/ws/client.ts` for current websocket transport behavior
- `ROADMAP.md` for stage labels and shipped-baseline wording

Architecture and API docs may include target-architecture material for later stages. If they conflict with mounted runtime behavior, update the docs or mark the content as planned rather than changing roadmap stage status to match conceptual material.

## 📚 Documentation Index

### **Philosophy**

- [SYSTEM-PHILOSOPHY.md](philosophy/SYSTEM-PHILOSOPHY.md)
- [UX-PRINCIPLES.md](philosophy/UX-PRINCIPLES.md)
- [PRIVACY-MODEL.md](philosophy/PRIVACY-MODEL.md)
- [ROLE-SYSTEM.md](philosophy/ROLE-SYSTEM.md)

### **Architecture**

- [ARCHITECTURE-DIAGRAM.md](architecture/ARCHITECTURE-DIAGRAM.md)
- [EVENT-BUS.md](architecture/EVENT-BUS.md)
- [STATE-RECOVERY.md](architecture/STATE-RECOVERY.md)
- [SESSION-LIFECYCLE.md](architecture/SESSION-LIFECYCLE.md)
- [ERROR-MODEL.md](architecture/ERROR-MODEL.md)
- [PERMISSIONS-MATRIX.md](architecture/PERMISSIONS-MATRIX.md)

### **Subsystems**

- [CHAT-SYSTEM.md](subsystems/CHAT-SYSTEM.md)
- [NOTES-SYSTEM.md](subsystems/NOTES-SYSTEM.md)
- [AUDIO-ENGINE.md](subsystems/AUDIO-ENGINE.md)
- [PRESENCE-STATE-MACHINE.md](subsystems/PRESENCE-STATE-MACHINE.md)
- [SESSIONS.md](dm-tools/SESSIONS.md)
- [EVENT-REDUCER.md](subsystems/EVENT-REDUCER.md)
- [LIVEKIT-INTEGRATION.md](subsystems/LIVEKIT-INTEGRATION.md)
- [PRESET-LIBRARY.md](subsystems/PRESET-LIBRARY.md)
- [STATE-STORES.md](subsystems/STATE-STORES.md)
- [ZUSTAND-STORE-ARCHITECTURE.md](subsystems/ZUSTAND-STORE-ARCHITECTURE.md)

### **UI**

- [UI-COMPONENTS.md](ui/UI-COMPONENTS.md)
- [UI-COMPONENT-INTERFACES.md](ui/UI-COMPONENT-INTERFACES.md)
- [UI-COMPONENT-PROPS.md](ui/UI-COMPONENT-PROPS.md)
- [REACT-COMPONENT-TREES.md](ui/REACT-COMPONENT-TREES.md)
- [UI-LAYOUT.md](ui/UI-LAYOUT.md)
- [UI-WIREFRAMES.md](ui/UI-WIREFRAMES.md)
- [UI-FLOWS.md](ui/UI-FLOWS.md)
- [UI-EVENTS.md](ui/UI-EVENTS.md)
- [UI-STATE-MAP.md](ui/UI-STATE-MAP.md)
- [UI-STATE-RECOVERY.md](ui/UI-STATE-RECOVERY.md)
- [UI-LOADING-STATES.md](ui/UI-LOADING-STATES.md)
- [UI-ERROR-HANDLING.md](ui/UI-ERROR-HANDLING.md)
- [UI-PERSONAS.md](ui/UI-PERSONAS.md)
- [COMBINED PERSONA COMPARISON SHEET](ui/personas/COMPARISION-SHEET.md)
- [UI PERSONA DM WIREFRAME](ui/personas/UI-PERSONA-DM.md)
- [FIGMA MOCKUP DM](ui/personas/FIGMA-MOCKUP-DM.md)
- [FIGMA MOCKUP PLAYER](ui/personas/FIGMA-MOCKUP-PLAYER.md)
- [FIGMA MOCKUP SPECTATOR](ui/personas/FIGMA-MOCKUP-SPECTATOR.md)
- [ANIMATION-AND-MOTION-SPEC.md](ui/ANIMATION-AND-MOTION-SPEC.md)
- [UI-MOTION.md](ui/UI-MOTION.md)
- [UI-THEMING.md](ui/UI-THEMING.md)
- [UI-THEMING-GUIDELINES.md](ui/UI-THEMING-GUIDELINES.md)
- [UI-THEMING-LIGHT-MODE.md](ui/UI-THEMING-LIGHT-MODE.md)
- [UI-THEMING-DARK-MODE.md](ui/UI-THEMING-DARK-MODE.md)
- [UI-THEMING-COMPONENT-TOKENS.md](ui/UI-THEMING-COMPONENT-TOKENS.md)
- [ADMIN-UI-DESIGN.md](ui/ADMIN-UI-DESIGN.md)

### **Extension**

- [EXTENSION-INTEGRATION.md](extension/EXTENSION-INTEGRATION.md) — architecture, pre-flight, communication
- [GUEST-AUTH.md](extension/GUEST-AUTH.md) — guest/invite-link auth, external identity, sync policy, account upgrade
- [EXTENSION-UX.md](extension/EXTENSION-UX.md) — overlay UX and role-aware UI
- [THIRD-PARTY-INTEGRATIONS.md](extension/THIRD-PARTY-INTEGRATIONS.md) — system separation and admin authorization

### **DM Tools**

- [DM-TOOLS.md](dm-tools/DM-TOOLS.md)

### **Operations**

- [DEPLOYMENT.md](operations/DEPLOYMENT.md)
- [TELEMETRY.md](operations/TELEMETRY.md)
- [BACKUP-RESTORE.md](operations/BACKUP-RESTORE.md)

### **Meta**

- [ONBOARDING.md](meta/ONBOARDING.md)
- [CONTRIBUTING.md](meta/CONTRIBUTING.md)
- [GLOSSARY.md](meta/GLOSSARY.md)

### **AI**

- [AI-CONTEXT.md](ai/AI-CONTEXT.md) — Main onboarding context
- [PROMPTING-RULES.md](ai/PROMPTING-RULES.md) — Behavioral rules
- [AI-CONTEXT-GITHUB.md](ai/AI-CONTEXT-GITHUB.md) — GitHub Copilot variant
- [AI-CONTEXT-VSCODE.md](ai/AI-CONTEXT-VSCODE.md) — VS Code Copilot variant
- [DESIGN.md](ai/DESIGN.md) — Deep architecture template

---

# 1. What This System Is

VTT‑Chat provides a unified communication and presence layer for any virtual tabletop (VTT).
It includes:

- Chat (IC/OOC/whispers/system)
- Notes (private/shared/DM)
- Audio effects & presets
- Presence indicators
- Session lifecycle management
- A browser extension overlay for third‑party VTTs

Everything is built on a **unidirectional event architecture**, with deterministic reducers, strict privacy boundaries, and a transport‑agnostic design.

---

# 2. Documentation Structure

The documentation is organized into clear domains:

```
docs/
  philosophy/      → Why the system behaves the way it does
  architecture/    → How the system is structured internally
  subsystems/      → Behaviour of each feature domain
  ui/              → UI patterns, motion, component rules
  extension/       → Browser extension & VTT integration
  dm-tools/        → DM‑specific workflows and controls
  operations/      → Deployment, telemetry, backups
  meta/            → Contributor guides, onboarding, glossary
  ai/              → AI context and behaviour (optional)
```

Each folder contains focused, self‑contained documents.

---

# 3. Start Here — Essential Reading

These documents give you the **core mental model** of the platform.

### 📘 Philosophy (The “Why”)

- [SYSTEM-PHILOSOPHY.md](philosophy/SYSTEM-PHILOSOPHY.md)
- [UX-PRINCIPLES.md](philosophy/UX-PRINCIPLES.md)
- [PRIVACY-MODEL.md](philosophy/PRIVACY-MODEL.md)
- [ROLE-SYSTEM.md](philosophy/ROLE-SYSTEM.md)

### 🏛 Architecture (The “How”)

- [ARCHITECTURE-DIAGRAM.md](architecture/ARCHITECTURE-DIAGRAM.md)
- [EVENT-BUS.md](architecture/EVENT-BUS.md)
- [STATE-RECOVERY.md](architecture/STATE-RECOVERY.md)
- [SESSION-LIFECYCLE.md](architecture/SESSION-LIFECYCLE.md)
- [ERROR-MODEL.md](architecture/ERROR-MODEL.md)
- [PERMISSIONS-MATRIX.md](architecture/PERMISSIONS-MATRIX.md)

### 🧭 Meta (The “How to Work Here”)

- [ONBOARDING.md](meta/ONBOARDING.md)
- [CONTRIBUTING.md](meta/CONTRIBUTING.md)
- [GLOSSARY.md](meta/GLOSSARY.md)

---

# 4. Subsystem Documentation

Each subsystem has its own dedicated document under `docs/subsystems/`.

Subsystem docs explain:

- Behaviour
- Events
- Reducers
- Selectors
- UI interactions
- Permissions
- Privacy rules

Examples include:

- Chat
- Notes
- Audio
- Presence
- Session Manager

(Your repo will contain one document per subsystem.)

---

# 5. Extension Documentation

The browser extension integrates VTT‑Chat with third‑party VTTs.

Key documents:

- [EXTENSION-UX.md](extension/EXTENSION-UX.md)
- [THIRD-PARTY-INTEGRATIONS.md](extension/THIRD-PARTY-INTEGRATIONS.md)

These cover:

- Overlay behaviour
- DOM‑safe integration rules
- VTT‑agnostic design
- Role‑aware extension behaviour

---

# 6. UI Documentation

UI documentation lives under `docs/ui/` and covers:

- Component responsibilities, interfaces, and props
- Component trees
- Layout rules and wireframes
- UX flows and event mappings
- State maps, recovery, loading, and error handling
- Interaction patterns
- Persona capability matrices and Figma-ready persona mockups
- Motion & animation rules
- Theming and token guidance
- Admin SPA layout and operations-focused UX design
- Role‑aware visibility
- Non‑blocking overlay behaviour

This ensures a consistent, predictable UX across the platform.

---

# 7. DM Tools Documentation

DM‑specific workflows live under `docs/dm-tools/`.

These documents describe:

- Session control
- Presence overrides
- Audio presets
- Moderation tools
- Safety features

---

# 8. Operations Documentation

Operational documents live under `docs/operations/` and cover:

- Deployment
- Telemetry
- Backups
- Monitoring
- Health checks

---

# 9. AI Documentation (Optional)

If your project uses AI assistants, the `docs/ai/` folder contains:

- AI context
- Behaviour guidelines
- Prompting rules
- Safety constraints

This ensures consistent AI‑generated output across the project.

---

# 10. Recommended Reading Order for New Developers

1. SYSTEM-PHILOSOPHY.md
2. ARCHITECTURE-DIAGRAM.md
3. EVENT-BUS.md
4. STATE-RECOVERY.md
5. PRIVACY-MODEL.md
6. ROLE-SYSTEM.md
7. UX-PRINCIPLES.md
8. CONTRIBUTING.md
9. Subsystem docs (as needed)
10. Extension docs (if working on the overlay)

This order builds understanding from conceptual → architectural → practical.

---

# 11. Contributing

To contribute:

- Read the onboarding guide
- Follow the coding and UX standards
- Respect the privacy and role models
- Document everything you add
- Submit clear, well‑structured PRs

See:

- [CONTRIBUTING.md](meta/CONTRIBUTING.md)
- [ONBOARDING.md](meta/ONBOARDING.md)

---

# 12. Summary

This documentation suite provides a complete, modular, deterministic foundation for VTT‑Chat.
It explains:

- What the system is
- Why it works the way it does
- How each subsystem fits together
- How to extend it safely
- How to maintain consistency across the project

Use this README as your map — and dive into the folders for the details.

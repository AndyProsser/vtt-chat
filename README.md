# VTT‑Chat Documentation Suite

Welcome to the VTT‑Chat documentation hub.
This repository contains the complete architectural, philosophical, and UX foundation for the platform — designed to be modular, deterministic, and deeply respectful of player privacy and DM authority.

This README provides a **structured map** of the documentation, helping developers understand:

- What the system is
- How it works
- Why it works that way
- Where to find the details

It is the recommended starting point for all new contributors.

---

# 1. Overview

VTT‑Chat is a **role‑aware, privacy‑first communication layer** for virtual tabletops.
It provides:

- Chat (IC/OOC/whispers/system)
- Notes (private/shared/DM)
- Audio effects & presets
- Presence indicators
- Session lifecycle management
- A browser extension overlay for third‑party VTTs

Everything is built on a **unidirectional event architecture** with deterministic reducers, strict permission boundaries, and a transport‑agnostic design.

---

# 2. Documentation Structure

The documentation is organized into logical domains.
Each folder contains focused, self‑contained documents.

```
docs/
  philosophy/      → Why the system behaves the way it does
  architecture/    → How the system is structured internally
  extension/       → Browser extension & VTT integration
  ui/              → UI/UX patterns and component rules
  subsystems/      → Feature‑level behaviour (chat, notes, audio, etc.)
  dm-tools/        → DM‑specific workflows and controls
  operations/      → Deployment, telemetry, backups
  meta/            → Contributor guides, glossary, onboarding
  ai/              → AI context and behaviour (optional)
```

---

# 3. Start Here: Essential Reading

These documents form the **core mental model** of the platform.

### **Philosophy**

- [SYSTEM-PHILOSOPHY.md](docs/philosophy/SYSTEM-PHILOSOPHY.md)
- [UX-PRINCIPLES.md](docs/philosophy/UX-PRINCIPLES.md)
- [PRIVACY-MODEL.md](docs/philosophy/PRIVACY-MODEL.md)
- [ROLE-SYSTEM.md](docs/philosophy/ROLE-SYSTEM.md)

### **Architecture**

- [ARCHITECTURE-DIAGRAM.md](docs/architecture/ARCHITECTURE-DIAGRAM.md)
- [EVENT-BUS.md](docs/architecture/EVENT-BUS.md)
- [STATE-RECOVERY.md](docs/architecture/STATE-RECOVERY.md)
- [SESSION-LIFECYCLE.md](docs/architecture/SESSION-LIFECYCLE.md)
- [ERROR-MODEL.md](docs/architecture/ERROR-MODEL.md)
- [PERMISSIONS-MATRIX.md](docs/architecture/PERMISSIONS-MATRIX.md)

### **Meta**

- [ONBOARDING.md](meta/ONBOARDING.md)
- [CONTRIBUTING.md](meta/CONTRIBUTING.md)
- [GLOSSARY.md](meta/GLOSSARY.md)

These documents give you the “big picture” — the system’s purpose, constraints, and design philosophy.

---

# 4. Subsystem Documentation

Each subsystem has its own dedicated documentation.
These documents explain behaviour, events, reducers, and UI interactions.

Examples include:

- Chat system
- Notes system
- Audio engine
- Presence system
- Session manager

(Your repo will contain one document per subsystem under `docs/subsystems/`.)

---

# 5. Extension Documentation

The browser extension integrates VTT‑Chat with third‑party VTTs.

Key documents:

- [EXTENSION-UX.md](docs/extension/EXTENSION-UX.md)
- [THIRD-PARTY-INTEGRATIONS.md](docs/extension/THIRD-PARTY-INTEGRATIONS.md)

These describe:

- Overlay behaviour
- VTT‑agnostic integration model
- DOM‑safe interaction rules
- Role‑aware extension behaviour

---

# 6. UI & Component Documentation

UI documentation covers:

- Component trees
- Interaction patterns
- Motion & animation rules
- Role‑aware visibility
- Non‑blocking overlay behaviour

These documents live under `docs/ui/`.

---

# 7. DM Tools Documentation

DM‑specific workflows and controls live under `docs/dm-tools/`.

These documents describe:

- Session control
- Presence overrides
- Audio presets
- Moderation tools
- Safety features

---

# 8. Operations Documentation

Operational documents cover:

- Deployment
- Telemetry
- Backups
- Monitoring
- Health checks

These live under `docs/operations/`.

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

1. **SYSTEM-PHILOSOPHY.md**
2. **ARCHITECTURE-DIAGRAM.md**
3. **EVENT-BUS.md**
4. **STATE-RECOVERY.md**
5. **PRIVACY-MODEL.md**
6. **ROLE-SYSTEM.md**
7. **UX-PRINCIPLES.md**
8. **CONTRIBUTING.md**
9. Subsystem docs (as needed)
10. Extension docs (if working on the overlay)

This order builds understanding from conceptual → architectural → practical.

---

# 11. Contributing

If you want to contribute:

- Read the onboarding guide
- Follow the coding and UX standards
- Respect the privacy and role models
- Document everything you add
- Submit clear, well‑structured PRs

See:
**[CONTRIBUTING.md](docs/meta/CONTRIBUTING.md)**
**[ONBOARDING.md](docs/meta/ONBOARDING.md)**

---

# 12. Summary

This documentation suite provides a complete, modular, and deterministic foundation for VTT‑Chat.
It explains:

- What the system is
- Why it works the way it does
- How each subsystem fits together
- How to extend it safely
- How to maintain consistency across the project

Use this README as your map — and dive into the folders for the details.

Welcome to the project.

# **ONBOARDING.md**

# Onboarding Guide

Welcome to VTT‑Chat!
This guide introduces new contributors to the project’s architecture, philosophy, workflows, and expectations.
It is designed to get you productive quickly, with a clear understanding of how the system works and how to contribute effectively.

---

# 1. What VTT‑Chat Is

VTT‑Chat is a **role‑aware, privacy‑first communication layer** for virtual tabletops.
It provides:

- Chat (IC/OOC/whispers/system)
- Notes (private/shared/DM)
- Audio triggers and presets
- Presence indicators
- Session lifecycle management
- A browser extension overlay for third‑party VTTs

Everything is built on a **unidirectional event architecture** with deterministic reducers and strict privacy/permission boundaries.

---

# 2. Core Concepts You Must Understand

Before contributing, you should be familiar with these foundational documents:

### **Philosophy**

- `SYSTEM-PHILOSOPHY.md`
- `UX-PRINCIPLES.md`
- `PRIVACY-MODEL.md`
- `ROLE-SYSTEM.md`

### **Architecture**

- `EVENT-BUS.md`
- `STATE-RECOVERY.md`
- `SESSION-LIFECYCLE.md`
- `ERROR-MODEL.md`
- `PERMISSIONS-MATRIX.md`
- `ARCHITECTURE-DIAGRAM.md`

### **Extension**

- `EXTENSION-UX.md`
- `THIRD-PARTY-INTEGRATIONS.md`

### **Meta**

- `GLOSSARY.md`
- `CONTRIBUTING.md`

These documents define the **rules of the system**.
All contributions must align with them.

---

# 3. How the System Works (High‑Level)

### **3.1 Unidirectional Data Flow**

All state changes originate from events.

```

UI → Event → Reducer → Store → UI

```

### **3.2 Deterministic Reducers**

Reducers are pure functions that compute the next state.

### **3.3 Role‑Aware Permissions**

Every action is validated against the Permissions Matrix.

### **3.4 Privacy‑First Visibility**

Users only see what their role allows.

### **3.5 Extension Overlay**

The browser extension injects a safe, non‑intrusive overlay into third‑party VTTs.

### **3.6 State Recovery**

Clients can reconnect at any time and rebuild state from the server.

---

# 4. Development Workflow

### **4.1 Fork the Repository**

Create your own working copy.

### **4.2 Create a Feature Branch**

Use descriptive names:

```

feature/chat-whisper-improvements
fix/audio-preset-crash
docs/update-privacy-model

```

### **4.3 Implement Your Change**

Follow:

- Event Bus rules
- Reducer purity
- Store structure
- UX principles
- Privacy model
- Role system

### **4.4 Update Documentation**

Every change must include documentation updates.

### **4.5 Submit a Pull Request**

Include:

- Description
- Screenshots (if UI)
- New events/reducers/selectors
- Privacy/permission considerations

---

# 5. Project Structure

```

docs/
philosophy/
architecture/
extension/
subsystems/
ui/
dm-tools/
operations/
meta/
ai/

src/
core/
subsystems/
reducers/
stores/
ui/
extension/

```

### **5.1 docs/**

Contains all conceptual and architectural documentation.

### **5.2 src/**

Contains the actual implementation.

---

# 6. Coding Standards

### **6.1 Events**

- Namespaced
- Declarative
- Immutable

### **6.2 Reducers**

- Pure
- Deterministic
- No side effects

### **6.3 Stores**

- Zustand
- Selector‑driven
- No derived state

### **6.4 Components**

- Functional
- Hook‑based
- Role‑aware
- Selector‑based

---

# 7. UX Standards

### **7.1 Predictable**

No surprising behaviour.

### **7.2 Role‑Aware**

DM, Player, Spectator each see different UI.

### **7.3 Privacy‑Respecting**

No accidental leaks.

### **7.4 Non‑Blocking**

Never interfere with VTT interaction.

### **7.5 Motion‑Informed**

Animations reinforce meaning.

---

# 8. Extension Standards

### **8.1 Overlay‑First**

Never modify the VTT directly.

### **8.2 Non‑Destructive**

Never break the host VTT.

### **8.3 VTT‑Agnostic**

Avoid relying on fragile DOM structures.

### **8.4 Permission‑Aware**

DM actions only for DMs.

---

# 9. Getting Set Up (Local Development)

### **9.1 Install Dependencies**

Standard Node/Yarn setup.

### **9.2 Run the Dev Server**

Hot‑reload environment.

### **9.3 Run the Extension**

Load the extension in your browser’s developer mode.

### **9.4 Connect to a VTT**

Open Foundry, Roll20, or any supported VTT.

### **9.5 Start Testing**

Interact with:

- Chat
- Notes
- Audio
- Presence
- Session controls
- Overlay

---

# 10. Common Pitfalls

### **10.1 Mutating State**

Reducers must be pure.

### **10.2 Violating Privacy**

Never expose private notes or whispers.

### **10.3 Ignoring Role Boundaries**

DM tools must not appear for players.

### **10.4 Breaking the Overlay**

Never block VTT interaction.

### **10.5 Missing Documentation**

Every change must be documented.

---

# 11. Where to Ask Questions

- Pull request comments
- Issue threads
- Architecture discussions
- Documentation updates

The project values clarity and collaboration.

---

# 12. Summary

This onboarding guide gives you everything you need to start contributing:

- Understand the philosophy
- Learn the architecture
- Follow the UX principles
- Respect privacy and roles
- Use the event‑driven model
- Keep documentation up to date

Welcome to the project — we’re excited to have you here!

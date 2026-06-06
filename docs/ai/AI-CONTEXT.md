# **AI-CONTEXT.md**

> _A complete onboarding context for any AI assisting with the VTT‑Chat platform_

## AI Context & Onboarding Guide

_A complete onboarding context for any AI assisting with the VTT‑Chat platform._

This document provides everything an AI assistant needs to understand the VTT‑Chat platform, its architecture, philosophy, constraints, and documentation structure.
It ensures all AI‑generated output is:

- Consistent
- Deterministic
- Role‑aware
- Privacy‑respecting
- Architecturally aligned
- Safe and predictable

> **AI context hierarchy for this project:**
>
> - **Claude Code** → primary context is `CLAUDE.md` (repo root). Read that first; it is kept current with the codebase.
> - **GitHub Copilot / other tools** → use `.github/copilot-instructions.md` for the full product spec.
> - **This file** (`docs/ai/AI-CONTEXT.md`) → general-purpose onboarding context; may lag behind `CLAUDE.md` on architectural specifics.
>
> When `CLAUDE.md` and this file conflict, trust `CLAUDE.md`.

---

## 1. Project Identity

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

## 2. Documentation Map (Full Repo Index)

AI assistants must reference and align with the documentation stored in the repo:

```text
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
│   ├── EVENT-REDUCER.md
│   ├── LIVEKIT-INTEGRATION.md
│   ├── PRESET-LIBRARY.md
│   ├── STATE-STORES.md
│   └── ZUSTAND-STORE-ARCHITECTURE.md
│
├── ui/
│   ├── UI-COMPONENTS.md
│   ├── UI-COMPONENT-INTERFACES.md
│   ├── UI-COMPONENT-PROPS.md
│   ├── UI-COMPONENT-CHANNELS.md
│   ├── UI-LAYOUT.md
│   ├── UI-WIREFRAMES.md
│   ├── UI-FLOWS.md
│   ├── UI-EVENTS.md
│   ├── UI-STATE-MAP.md
│   ├── UI-STATE-RECOVERY.md
│   ├── UI-LOADING-STATES.md
│   ├── UI-ERROR-HANDLING.md
│   ├── UI-MOTION.md
│   ├── UI-PERSONAS.md
│   ├── ADMIN-UI-DESIGN.md
│   ├── ANIMATION-AND-MOTION-SPEC.md
│   ├── REACT-COMPONENT-TREES.md
│   ├── VOICE-CHANNEL-QUICK-REFERENCE.md
│   ├── VOICE-CHANNEL-REVIEW-SUMMARY.md
│   ├── W0-VOICE-CHANNEL-DOCUMENTATION-INDEX.md
│   ├── W0-VOICE-CHANNEL-IMPLEMENTATION-CHECKLIST.md
│   ├── UI-VOICE-CHAT-FIRST-PASS.md
│   ├── DM-CAMPAIGN-SETTINGS.md
│   ├── UI-THEMING.md
│   ├── UI-THEMING-GUIDELINES.md
│   ├── UI-THEMING-LIGHT-MODE.md
│   ├── UI-THEMING-DARK-MODE.md
│   ├── UI-THEMING-COMPONENT-TOKENS.md
│   └── personas/
│       ├── COMPARISON-SHEET.md
│       ├── UI-PERSONA-DM.md
│       ├── FIGMA-MOCKUP-DM.md
│       ├── FIGMA-MOCKUP-PLAYER.md
│       └── FIGMA-MOCKUP-SPECTATOR.md
│
├── extension/
│   ├── EXTENSION-INTEGRATION.md
│   ├── EXTENSION-ROADMAP.md
│   ├── EXTENSION-UX.md
│   ├── GUEST-AUTH.md
│   └── THIRD-PARTY-INTEGRATIONS.md
│
├── dm-tools/
│   ├── DM-TOOLS.md
│   └── SESSIONS.md
│
├── operations/
│   ├── DEPLOYMENT.md
│   ├── DEVELOPER-DEPLOYMENT.md
│   ├── TELEMETRY.md
│   ├── BACKUP-RESTORE.md
│   ├── API-PATH-CUTOVER-MAP.md
│   ├── BACKEND-DEBT-MATRIX.md
│   ├── BACKEND-STRUCTURE-CONSISTENCY-PLAN.md
│   ├── INSTALL-SCRIPT-GUIDE.md
│   ├── FLAKY-TEST-POLICY.md
│   └── TESTING-READINESS.md
│
├── meta/
│   ├── ONBOARDING.md
│   ├── CONTRIBUTING.md
│   └── GLOSSARY.md
│
└── ai/
    ├── AI-CONTEXT.md   ← (this file)
    ├── AI-GUIDELINES.md
    ├── AI-CONTEXT-GITHUB.md
    ├── AI-CONTEXT-VSCODE.md
    └── DESIGN.md
```

AI assistants must use these documents as authoritative references.

---

## 3. Core Principles (From Philosophy Docs)

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

## 4. Architecture Rules (From Architecture Docs)

### **ARCHITECTURE-DIAGRAM.md**

The system is composed of:

- UI Layer
- Event Bus
- Reducers
- Stores (Zustand)
- Subsystems
- Transport (WebSocket / Extension Bridge)
- Server services

Canonical frontend state rules:

- Zustand is the canonical source for cross-component and cross-route runtime state.
- Shared transport state (WebSocket and LiveKit connection lifecycle) must be normalized into store snapshots.
- Components rendering the same status must consume shared selectors from the same store source.
- Keep local component state limited to transient UI-only concerns.
- Operational runtime state required for app behavior (connection refs, published track refs, permission/status snapshots, shared audio/session runtime values) MUST be stored in core Zustand slices, not in hook-local component state.
- Hook/component local state is allowed only for view-local UX concerns (panel open/close, hover/focus, temporary input drafts) or short-lived derived values that can be recomputed from store state.

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

## 5. Subsystem Behaviour (From Subsystem Docs)

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

## 6. UI & Extension Behaviour (From UI + Extension Docs)

### **UI Layer**

- Role‑aware
- Non‑blocking
- Motion‑informed
- Modular panels
- Dockable overlay

Frontend implementation guidance:

- Prefer project core-ui wrappers and Radix primitives for composable, accessible interaction patterns.
- Use Material Symbols Outlined consistently for chat, room, and system status icon semantics.
- Keep status states explicit (connected, connecting, disconnected) and visually consistent across left rail, center pane, and right rail.
- Keep copy contextual and room/session-aware instead of generic labels.
- Preserve responsive layout integrity for left rail, center pane, and right rail at tablet and mobile breakpoints.

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

## 7. DM Tools (From DM-TOOLS.md)

AI must understand:

- Session controls
- Presence overrides
- Audio overrides
- Moderation tools
- Safety features

DM tools are **DM‑only**.

---

## 8. Operations (From Operations Docs)

AI may reference:

- Deployment
- Telemetry
- Backups
- Monitoring

But must not invent operational behaviour outside documented rules.

---

## 9. Meta Rules (From Meta Docs)

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

## 10. AI Behaviour Rules (From AI-GUIDELINES.md)

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
- Create or update tests whenever a key system is created or modified
- Ask clarifying questions when needed

Key systems requiring tests include API routes, core services/repositories, WebSocket dispatcher/handlers/recovery, reducer/store/integration-hook flows, and permission/privacy enforcement paths.

For each changed key system, tests should cover happy path, permission/privacy boundaries, and at least one error or recovery path.

---

## 11. Output Format Expectations

AI output must:

- Use GitHub‑flavored Markdown
- Use headings, lists, tables where appropriate
- Be concise but complete
- Avoid repetition
- Follow the repo’s tone and structure
- Reference relevant docs when giving guidance

---

## 12. Summary

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

---

## 13. Release Consistency Rules

In addition to architecture and privacy compliance, AI assistants must preserve release-document consistency.

When making release-significant changes, always keep these files aligned:

- `ROADMAP.md`
- `CHANGELOG.md`
- `package.json`
- `backend/package.json`
- `frontend/package.json`
- `admin/package.json`
- `shared/package.json`
- `README.md` (version line)

Required behavior:

- If roadmap scope/status changes, update roadmap and changelog together.
- If versions are incremented, align all package versions and README version text.
- If changelog buckets are revised, ensure roadmap terminology and README status summary remain compatible.
- After any change set, run a quick doc-impact check and update ROADMAP.md, CHANGELOG.md, and README.md when required by the change.

AI should treat this as a mandatory closing checklist before finalizing release-facing edits.

# **AI-GUIDELINES.md**

### _Operational prompting guidelines for any AI assisting with the VTT‑Chat platform_

# AI GUIDELINES

_A strict behavioural contract for any AI assisting with the VTT‑Chat platform._

This document defines **how** an AI must behave when generating output for the VTT‑Chat project.
It complements `AI-CONTEXT.md`, which defines **what** the AI must understand.

This document contains AI safety and compliance rules for a tabletop gaming project.
It does not contain harmful or unsafe content.

---

# 1. Core Behaviour Requirements

### **1.1 Deterministic Output**

AI responses must be:

- Predictable
- Repeatable
- Free of randomness
- Free of stylistic drift

### **1.2 No Hallucination**

AI must not:

- Invent APIs
- Invent events
- Invent reducers
- Invent UI components
- Invent roles
- Invent subsystems
- Invent behaviours not documented in `/docs`

If unsure, the AI must ask clarifying questions.

### **1.3 Documentation‑Aligned**

All output must align with:

- `docs/philosophy/*`
- `docs/architecture/*`
- `docs/subsystems/*`
- `docs/ui/*`
- `docs/extension/*`
- `docs/dm-tools/*`
- `docs/operations/*`
- `docs/meta/*`

AI must reference these documents when relevant.

---

# 2. Privacy & Role Enforcement

### **2.1 Privacy Is Sacred**

AI must never propose behaviour that violates:

- Private notes
- Whisper visibility
- DM‑private data
- System‑private data

### **2.2 Role Boundaries Are Absolute**

AI must enforce:

- DM: full authority
- Player: agency + private space
- Spectator: read‑only
- System: neutral arbiter

AI must never:

- Give players DM‑only capabilities
- Give spectators interactive capabilities
- Reveal private data across roles

---

# 3. Architecture Compliance

### **3.1 Event‑Driven Only**

All state changes must follow:

```
UI → Event → Reducer → Store → UI
```

AI must never propose:

- Direct store mutation
- Direct reducer calls
- UI‑driven state mutation
- Side effects inside reducers

### **3.2 Reducer Rules**

Reducers must be:

- Pure
- Deterministic
- Side‑effect free
- Transport‑agnostic
- DOM‑agnostic

### **3.3 Store Rules**

Stores must:

- Use Zustand
- Use selectors
- Contain no derived state
- Contain no UI‑only state

### **3.4 Transport Rules**

AI must treat:

- WebSocket
- Extension Bridge

as equivalent transport layers.

### **3.5 Testing Is Required For Key Systems**

AI must create or update tests whenever it changes a key system.

Key systems include:

- API routes and request validation
- Core services and repositories
- WebSocket dispatcher/handlers/state recovery
- Reducer/store/integration-hook flows
- Role, permission, and privacy enforcement paths

Required minimum coverage for each changed key system:

- Happy path behavior
- Permission/privacy boundary behavior
- Error or recovery behavior

If an implementation does not exist yet, AI may use `it.todo(...)` placeholders only with explicit module path and expected behavior.

---

# 4. UI & UX Compliance

### **4.1 Role‑Aware UI**

AI must ensure UI proposals follow:

- DM UI
- Player UI
- Spectator UI

as defined in `UX-PRINCIPLES.md`.

### **4.2 Non‑Blocking UI**

AI must never propose UI that:

- Blocks VTT interaction
- Interferes with token movement
- Obscures core VTT controls

### **4.3 Motion Rules**

Animations must:

- Reinforce meaning
- Be subtle
- Be fast
- Never distract

---

# 5. Extension Compliance

AI must follow:

- `EXTENSION-UX.md`
- `THIRD-PARTY-INTEGRATIONS.md`

### **5.1 Overlay‑First**

AI must never propose modifying the VTT DOM directly.

### **5.2 Non‑Destructive**

AI must avoid:

- Breaking VTT controls
- Blocking map interaction
- Overriding native UI

### **5.3 Privacy‑Respecting**

The extension cannot access:

- Private notes
- DM‑private data
- System‑private data

---

# 6. Session & State Rules

### **6.1 Session Lifecycle**

AI must respect:

```
idle → active → paused → ended
```

Only the DM may change session state.

### **6.2 State Recovery**

AI must follow:

- Hydration replaces local state
- Hydration is atomic
- Hydration is deterministic

---

# 7. Output Formatting Rules

### **7.1 Markdown Required**

AI must use GitHub‑flavored Markdown.

### **7.2 Structure**

Responses must use:

- Headings
- Lists
- Tables (when appropriate)
- Code blocks for code

### **7.3 No Redundancy**

AI must avoid:

- Repeating the question
- Repeating previous answers
- Over‑explaining

### **7.4 No Fictional Content**

AI must not generate:

- Fictional logs
- Fictional errors
- Fictional system messages
- Fictional user data

Unless explicitly requested for mock/demo purposes.

---

# 8. When AI Must Ask Clarifying Questions

AI must request clarification when:

- Requirements are ambiguous
- Role boundaries are unclear
- Privacy implications are uncertain
- Architecture constraints may be violated
- The user asks for behaviour not documented in `/docs`

---

# 9. When AI Must Refuse

AI must refuse when asked to:

- Violate privacy
- Break role boundaries
- Mutate state outside reducers
- Modify VTT DOM directly
- Add undocumented features
- Invent new architecture
- Generate unsafe extension behaviour

Refusals must be:

- Brief
- Polite
- Constructive
- Offer alternatives

---

# 10. Example Allowed Behaviours

AI may:

- Generate events, reducers, selectors
- Propose UI components
- Suggest documentation updates
- Explain architecture
- Provide subsystem‑aligned logic
- Help design DM tools
- Help design extension overlay behaviour
- Provide code consistent with the repo

---

# 11. Example Forbidden Behaviours

AI must not:

- Invent new event types
- Invent new reducer patterns
- Invent new roles
- Invent new privacy rules
- Propose direct DOM manipulation in the extension
- Propose direct store mutation
- Propose side effects in reducers
- Propose bypassing the Event Bus
- Propose VTT‑breaking overlay behaviour

---

# 12. Summary

These prompting rules ensure that any AI assisting with VTT‑Chat:

- Respects architecture
- Respects privacy
- Respects roles
- Produces deterministic output
- Aligns with all documentation
- Avoids hallucination
- Asks when unsure
- Never violates system constraints

This file, together with `AI-CONTEXT.md`, forms the **complete AI onboarding and behaviour contract** for the VTT‑Chat platform.

---

# 13. Release Documentation Hygiene (Required)

When AI work changes delivery status, release scope, or user-facing behavior, AI must keep release-facing docs synchronized in the same change set.

Minimum sync requirements:

- Update `ROADMAP.md` when stage status, milestone scope, dependencies, or progress notes change.
- Update `CHANGELOG.md` when shipped behavior, staged scope, or release buckets are introduced or revised.
- Keep version fields aligned across `package.json`, `backend/package.json`, `frontend/package.json`, `admin/package.json`, and `shared/package.json` when versions are bumped.
- Ensure the version line in `README.md` matches the current release version.
- After any change set, run a quick doc-impact check and update `ROADMAP.md`, `CHANGELOG.md`, and `README.md` when required.

Before finalizing output, AI should perform a release-hygiene check:

1. Are roadmap stage labels/statuses still accurate?
2. Does changelog content reflect the same scope and terminology?
3. Are all package versions aligned?
4. Does README show the same version?

AI must not leave these artifacts inconsistent after making release-significant changes.

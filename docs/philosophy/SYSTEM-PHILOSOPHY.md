# **SYSTEM-PHILOSOPHY.md**

# System Philosophy

The System Philosophy defines the foundational beliefs that guide every design, architectural, and UX decision in VTT‑Chat.
It is the “why” behind the platform — the principles that shape how the system behaves, how users interact with it, and how developers extend it.

This philosophy ensures that VTT‑Chat remains:

- Predictable
- Trustworthy
- Modular
- Extensible
- Respectful of player intent
- DM‑aware
- Privacy‑first

Every subsystem, reducer, UI component, and extension feature must align with these principles.

---

# 1. Core Beliefs

### **1.1 The Table Comes First**

The platform exists to support the social experience of tabletop roleplaying.
Technology should enhance the table, not dominate it.

### **1.2 Predictability Builds Trust**

Players and DMs must always understand:

- What will happen
- Why it will happen
- Who can do what
- What others can see

No surprises. No hidden behaviours.

### **1.3 Privacy is Sacred**

Players must feel safe expressing:

- Thoughts
- Plans
- Notes
- Character intentions

The system must never violate this trust.

### **1.4 The DM is the Table Authority**

The DM has:

- The most responsibility
- The most context
- The most need for control

The system reflects this reality.

### **1.5 Players Deserve Agency**

Players should feel empowered, not restricted.

The system gives players:

- Clear tools
- Predictable interactions
- Respect for their private space

### **1.6 Spectators Are Passive**

Spectators observe.
They do not influence the table.

### **1.7 The System Should Never Get in the Way**

The UI, extension, and subsystems must be:

- Lightweight
- Fast
- Non‑intrusive
- Easy to understand

The system should disappear when not needed.

---

# 2. Architectural Principles

### **2.1 Unidirectional Data Flow**

All state changes originate from events.
Reducers compute state.
Stores hold state.
UI renders state.

This ensures:

- Determinism
- Debuggability
- Replayability
- Predictability

### **2.2 Subsystems Are Modular**

Each subsystem:

- Has a single responsibility
- Is isolated
- Has its own events
- Has its own reducers
- Has its own documentation

Subsystems never reach into each other’s internals.

### **2.3 Transport‑Agnostic Design**

The system must work over:

- WebSockets
- Extension bridges
- Local dispatch

No subsystem should depend on transport details.

### **2.4 Declarative State**

State describes _what is_, not _how to compute it_.

Derived state belongs in selectors, not stores.

### **2.5 Pure Reducers**

Reducers must be:

- Pure
- Deterministic
- Side‑effect free

This guarantees stability and predictability.

---

# 3. UX Principles

### **3.1 Clarity Over Cleverness**

The UI should be obvious, not surprising.

### **3.2 Motion Reinforces Meaning**

Animations must:

- Support state changes
- Be subtle
- Never distract

### **3.3 Role‑Aware UI**

The UI adapts to:

- DM
- Player
- Spectator

Each role sees only what they should.

### **3.4 Non‑Blocking Design**

The UI must never block:

- VTT interaction
- Token movement
- Map navigation

### **3.5 Minimal Cognitive Load**

The UI should reduce mental overhead, not increase it.

---

# 4. Privacy Principles

### **4.1 Private Means Private**

Private notes are truly private.
Not even the DM can see them.

### **4.2 Whispers Are Safe**

Whispers are visible only to:

- Sender
- Recipient
- DM (for safety)

### **4.3 No Implicit Visibility**

Every visibility rule is explicit.

### **4.4 Extension Cannot Violate Privacy**

The extension must never:

- Access private notes
- Access DM‑only data
- Access system‑private data

---

# 5. Role Philosophy

### **5.1 DM as Facilitator**

The DM is not a dictator; they are a facilitator.
The system gives them tools, not power trips.

### **5.2 Players as Co‑Creators**

Players shape the story.
The system supports their creativity.

### **5.3 Spectators as Observers**

Spectators watch without influencing the table.

### **5.4 System as Neutral Arbiter**

The system:

- Enforces rules
- Validates events
- Maintains consistency

It never takes sides.

---

# 6. Extension Philosophy

### **6.1 Overlay‑First**

The extension interacts with the VTT through a safe, isolated overlay.

### **6.2 Non‑Destructive**

The extension must never break the host VTT.

### **6.3 VTT‑Agnostic**

Integrations must work across multiple platforms.

### **6.4 Role‑Aware**

The extension respects:

- DM authority
- Player privacy
- Spectator restrictions

---

# 7. Developer Philosophy

### **7.1 Documentation Is Part of the Codebase**

Every feature must be documented.

### **7.2 Consistency Over Novelty**

Follow established patterns.

### **7.3 Deterministic Behaviour**

No hidden state.
No magic.
No side effects.

### **7.4 Extensibility Without Complexity**

New subsystems should be easy to add.

### **7.5 AI as a Collaborative Tool**

AI assists with:

- Documentation
- Architecture
- Code generation
- UX patterns

But humans make final decisions.

---

# 8. Summary

The System Philosophy ensures that VTT‑Chat remains:

- Trustworthy
- Predictable
- Modular
- Extensible
- Privacy‑first
- DM‑aware
- Player‑respecting
- VTT‑agnostic

It is the foundation upon which the entire platform is built.

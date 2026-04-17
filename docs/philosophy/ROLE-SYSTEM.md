# **ROLE-SYSTEM.md**

# Role System

The Role System defines the fundamental identities within VTT‑Chat and determines how authority, visibility, and capabilities are distributed across the platform.
It is one of the core pillars of the system’s philosophy, shaping:

- Permissions
- Privacy
- UI visibility
- Event validation
- Extension behaviour
- DM tools
- Session control
- Subsystem interactions

This document describes the conceptual model behind roles, not the technical implementation.

---

# 1. Core Principles

### **1.1 Roles define authority**

Every action in the system is governed by role‑based capabilities.

### **1.2 Roles define visibility**

What a user can see is determined by their role.

### **1.3 Roles define responsibility**

Different roles have different expectations and responsibilities at the table.

### **1.4 Roles are stable**

A user’s role does not change during a session unless explicitly changed by the DM.

### **1.5 Roles are universal**

All subsystems — chat, notes, audio, presence, extension — respect the same role boundaries.

---

# 2. The Three Human Roles

VTT‑Chat defines three human roles:

- **DM**
- **Player**
- **Spectator**

Each role has a distinct purpose and set of capabilities.

---

# 3. DM (Dungeon Master)

The DM is the **table authority**.
They have the highest level of control and visibility.

### **3.1 Responsibilities**

- Manage the session lifecycle
- Moderate chat
- Control audio
- Override presence
- Manage notes
- Trigger VTT actions (if supported)
- Maintain table safety

### **3.2 Capabilities**

DMs can:

- Start, pause, resume, and end sessions
- View all shared notes
- View whispers (for safety)
- Apply audio presets
- Mute players
- Kick or ban users
- Trigger system messages
- Use DM‑only tools
- Access DM‑private notes

### **3.3 Visibility**

DMs can see:

- All chat (including whispers)
- All shared notes
- All presence states
- Session metadata
- DM‑only UI

DMs cannot see:

- Player private notes

This is a deliberate privacy boundary.

---

# 4. Player

Players are active participants with character‑level interactions.

### **4.1 Responsibilities**

- Participate in chat
- Maintain their own notes
- Interact with audio (within limits)
- Engage with the session

### **4.2 Capabilities**

Players can:

- Send IC/OOC messages
- Whisper to other players or the DM
- Create private notes
- Create and edit shared notes
- Trigger audio effects
- Update their presence
- Interact with the overlay

Players cannot:

- View other players’ private notes
- Use DM tools
- Change session state
- Override presence
- Trigger DM‑only audio actions

### **4.3 Visibility**

Players can see:

- Public chat
- Their own private notes
- Shared notes
- Presence
- Session state

Players cannot see:

- DM notes
- DM override reasons
- Other players’ private notes

---

# 5. Spectator

Spectators are passive observers.

### **5.1 Responsibilities**

- Watch the session
- Avoid interfering with gameplay

### **5.2 Capabilities**

Spectators can:

- View public chat
- View presence
- Listen to audio

Spectators cannot:

- Send messages
- Create notes
- Trigger audio
- Interact with the VTT
- Use DM tools
- Affect session state

### **5.3 Visibility**

Spectators can see:

- Public chat
- Presence
- Session state

Spectators cannot see:

- Notes
- Whispers
- DM tools
- Player tools

---

# 6. System Role

The **System** is a non‑human actor used for:

- Automated events
- Presence pings
- System messages
- Internal state transitions
- Server‑side enforcement

The System role:

- Has no UI
- Has no identity
- Cannot be impersonated
- Cannot be overridden

It exists purely for internal consistency.

---

# 7. Role Boundaries

Role boundaries are enforced at multiple layers:

- UI visibility
- Event validation
- Permissions matrix
- Privacy model
- Extension bridge
- Reducer logic

No single layer can violate role boundaries.

---

# 8. Role Transitions

Role transitions are rare and controlled.

### **8.1 Allowed Transitions**

- DM → Player (manual reassignment)
- Player → Spectator (manual reassignment)
- Spectator → Player (manual reassignment)

### **8.2 Forbidden Transitions**

- Player → DM
- Spectator → DM

DM authority cannot be granted automatically.

---

# 9. Role in the Event System

Every event includes an `actor` field that identifies the role of the sender.

The validator checks:

- Does this role have permission to send this event?
- Does this role have permission to modify this state?
- Does this role have visibility into this payload?

If not, the event is rejected.

---

# 10. Role in the UI

The UI adapts based on role:

### **DM UI**

- Full toolset
- Session controls
- Audio presets
- Presence overrides

### **Player UI**

- Chat
- Notes
- Audio triggers
- Presence

### **Spectator UI**

- Read‑only chat
- Presence

---

# 11. Role in the Extension

The extension enforces role boundaries:

- DMs can trigger VTT actions
- Players can interact with allowed features
- Spectators are read‑only
- Private data never leaves the core app

---

# 12. Summary

The Role System ensures:

- Clear authority
- Predictable behaviour
- Strong privacy
- Consistent UX
- Safe table dynamics
- Reliable event validation

It is one of the foundational pillars of VTT‑Chat’s design philosophy.

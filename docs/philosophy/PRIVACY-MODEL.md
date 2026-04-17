# **PRIVACY-MODEL.md**

### _The privacy and visibility model of the VTT‑Chat platform_

# Privacy Model

_A first‑class architectural constraint of the VTT‑Chat platform._

VTT‑Chat treats privacy as a **non‑negotiable system guarantee**, not a UX feature or optional setting.
Every subsystem, reducer, event, and UI component must respect the privacy boundaries defined in this document.

This model ensures that:

- Players retain agency and private space
- DMs maintain table authority without overreach
- Spectators remain passive and non‑intrusive
- No accidental or implicit data leakage occurs
- The extension cannot access or infer private information
- All visibility is deterministic and role‑aware

This document defines the **complete privacy and visibility rules** for the platform.

---

# 1. Core Principles

### **1.1 Privacy Is Sacred**

Private data must remain private across:

- UI
- Reducers
- Stores
- Transport
- Server
- Extension

There are no exceptions.

### **1.2 Visibility Must Be Deterministic**

If a user can see something, it must be because:

- Their role explicitly grants visibility
- The event/reducer pipeline explicitly allows it
- The permissions matrix authorizes it

There is **no implicit visibility**.

### **1.3 Role Determines Visibility**

The role system defines the boundaries:

- **DM**: full visibility
- **Player**: limited visibility + private space
- **Spectator**: read‑only, minimal visibility

### **1.4 No Cross‑Session Leakage**

All data is scoped to:

```
session → room → user
```

Nothing leaks across sessions.

### **1.5 Extension Cannot Access Private Data**

The browser extension:

- Cannot read private notes
- Cannot read whispers
- Cannot read DM‑only data
- Cannot infer private state from events

It only receives **role‑appropriate, filtered state**.

---

# 2. Visibility Domains

VTT‑Chat defines five visibility domains.
Every piece of data belongs to exactly one.

## **2.1 Public**

Visible to all connected users.

Examples:

- Public chat messages
- System announcements
- Session state (active/paused/ended)

## **2.2 Role‑Restricted**

Visible only to users with specific roles.

Examples:

- DM tools
- Session controls
- Audio routing controls

## **2.3 Player‑Private**

Visible only to the player who created it.

Examples:

- Private notes
- Draft messages
- Local audio settings

## **2.4 DM‑Private**

Visible only to the DM.

Examples:

- DM notes
- DM‑only audio presets
- Moderation tools
- Presence overrides

## **2.5 System‑Private**

Visible only to the system.

Examples:

- Internal presence heartbeats
- Transport metadata
- Reconnection tokens
- Server‑side audit logs (non‑content)

---

# 3. Privacy Rules by Subsystem

## **3.1 Chat System**

Defined in: `docs/subsystems/CHAT-SYSTEM.md`

- Public messages → visible to all
- OOC messages → visible to all
- IC messages → visible to all
- Whispers → visible only to:
  - Sender
  - Recipient
  - DM (safety requirement)

Whispers must **never** appear in:

- Spectator view
- Extension logs
- System logs (content)

## **3.2 Notes System**

Defined in: `docs/subsystems/NOTES-SYSTEM.md`

- Private notes → creator only
- Shared notes → specific recipients
- DM notes → DM only

Notes must never be:

- Indexed globally
- Searchable across users
- Exposed to the extension

## **3.3 Audio Engine**

Defined in: `docs/subsystems/AUDIO-ENGINE.md`

- Local audio settings → user only
- Global audio triggers → all users
- DM audio overrides → DM only

Audio events must not leak:

- User device info
- Local volume settings

## **3.4 Presence System**

Defined in: `docs/subsystems/PRESENCE-SYSTEM.md`

Presence signals include:

- Online/offline
- Typing
- Speaking
- Idle

Presence is **role‑filtered**:

- Players cannot see DM‑private presence
- Spectators see minimal presence
- DM sees all presence

## **3.5 Session Manager**

Defined in: `docs/subsystems/SESSIONS.md`

Session state is public, but:

- Pause reasons → DM only
- Internal flags → system‑private

---

# 4. Privacy Enforcement Layers

Privacy is enforced at **five layers**, each independently responsible for preventing leaks.

## **4.1 Event Validators**

Defined in: `docs/architecture/EVENT-BUS.md`

Validators ensure:

- Role is allowed to perform action
- Payload does not contain restricted fields
- Event does not cross visibility boundaries

## **4.2 Reducers**

Reducers must:

- Filter state based on role
- Never include private data in public state
- Never merge private and public domains

## **4.3 Store Selectors**

Selectors enforce:

- Role‑appropriate slices
- No accidental exposure of private fields

## **4.4 Transport Layer**

Transport must:

- Strip private fields
- Send only role‑filtered state
- Never broadcast private data

## **4.5 Extension Bridge**

The extension receives:

- Only public + role‑restricted data
- Never private or DM‑private data

---

# 5. Hydration & Reconnection Privacy

Defined in: `docs/architecture/STATE-RECOVERY.md`

Hydration must:

- Filter state based on role
- Never include private notes of other users
- Never include whispers not addressed to the user
- Never include DM‑private data for players
- Never include player‑private data for other players

Hydration is **role‑scoped**, not global.

---

# 6. Privacy Scenarios

## **6.1 Player A whispers Player B**

- A sees the message
- B sees the message
- DM sees the message
- No one else sees it
- Extension receives nothing

## **6.2 Player creates a private note**

- Only that player sees it
- DM does not see it
- Other players do not see it
- Extension does not see it

## **6.3 DM pauses the session**

- All users see “Session Paused”
- Only DM sees the pause reason

## **6.4 Player disconnects**

- Presence updates are public
- No private state is leaked

---

# 7. Future Privacy Extensions

The privacy model is designed to support:

- End‑to‑end encrypted private notes
- Encrypted whispers
- Zero‑knowledge DM tools
- Per‑room visibility rules
- Optional ephemeral chat modes

These must remain consistent with the core principles.

---

# 8. Summary

The VTT‑Chat privacy model ensures:

- Deterministic visibility
- Strict role boundaries
- Zero accidental leakage
- Extension safety
- Predictable behaviour
- Player agency
- DM authority

Privacy is not a feature — it is the **foundation** of the platform.

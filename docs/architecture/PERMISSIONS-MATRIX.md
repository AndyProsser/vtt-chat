# **PERMISSIONS-MATRIX.md**

# Permissions Matrix

The Permissions Matrix defines **who can do what** within the VTT‑Chat platform.
It is the authoritative reference for all capability checks across the system, including:

- UI visibility
- Event dispatch permissions
- State mutation rights
- Extension‑level overrides
- DM‑only controls
- Player‑only interactions
- Spectator‑only restrictions

This matrix is intentionally **role‑centric**, not feature‑centric.
Roles define capabilities; capabilities unlock features.

---

# 1. Roles Overview

| Role          | Description                                                   |
| ------------- | ------------------------------------------------------------- |
| **DM**        | Full control of the table, players, audio, and session state. |
| **Player**    | Active participant with character‑level interactions.         |
| **Spectator** | Read‑only observer with no ability to affect state.           |
| **System**    | Internal actor used for automated events and system messages. |

---

# 2. Capability Categories

Capabilities are grouped into functional domains:

- **Chat** — sending messages, whispers, system prompts
- **Notes** — creating, editing, sharing notes
- **Audio** — controlling effects, presets, routing
- **Presence** — updating status, avatar, readiness
- **Session** — starting, ending, pausing sessions
- **Moderation** — muting, kicking, overriding states
- **Extension** — interacting with the VTT overlay
- **Admin** — developer‑level or system‑level actions

---

# 3. Permissions Matrix

## 3.1 Chat Capabilities

| Capability              | DM  | Player | Spectator | System |
| ----------------------- | --- | ------ | --------- | ------ |
| Send IC message         | ✔   | ✔      | ✖         | ✔      |
| Send OOC message        | ✔   | ✔      | ✖         | ✔      |
| Whisper to player       | ✔   | ✔      | ✖         | ✔      |
| Whisper to DM           | ✔   | ✔      | ✖         | ✔      |
| Send system message     | ✔   | ✖      | ✖         | ✔      |
| Delete own message      | ✔   | ✔      | ✖         | ✖      |
| Delete others' messages | ✔   | ✖      | ✖         | ✖      |

---

## 3.2 Notes Capabilities

| Capability          | DM  | Player | Spectator | System |
| ------------------- | --- | ------ | --------- | ------ |
| Create private note | ✔   | ✔      | ✖         | ✖      |
| Create shared note  | ✔   | ✔      | ✖         | ✖      |
| Edit shared note    | ✔   | ✔      | ✖         | ✖      |
| Delete shared note  | ✔   | ✖      | ✖         | ✖      |
| View all notes      | ✔   | ✖      | ✖         | ✖      |

---

## 3.3 Audio Capabilities

| Capability           | DM  | Player | Spectator | System |
| -------------------- | --- | ------ | --------- | ------ |
| Trigger sound effect | ✔   | ✔      | ✖         | ✔      |
| Apply preset         | ✔   | ✖      | ✖         | ✔      |
| Modify audio graph   | ✔   | ✖      | ✖         | ✖      |
| Mute player          | ✔   | ✖      | ✖         | ✖      |
| Mute all             | ✔   | ✖      | ✖         | ✖      |

---

## 3.4 Presence Capabilities

| Capability               | DM  | Player | Spectator | System |
| ------------------------ | --- | ------ | --------- | ------ |
| Update presence          | ✔   | ✔      | ✖         | ✔      |
| Change avatar            | ✔   | ✔      | ✖         | ✖      |
| Override player presence | ✔   | ✖      | ✖         | ✖      |
| Force disconnect         | ✔   | ✖      | ✖         | ✖      |

---

## 3.5 Session Capabilities

| Capability     | DM  | Player | Spectator | System |
| -------------- | --- | ------ | --------- | ------ |
| Start session  | ✔   | ✖      | ✖         | ✖      |
| End session    | ✔   | ✖      | ✖         | ✖      |
| Pause session  | ✔   | ✖      | ✖         | ✖      |
| Resume session | ✔   | ✖      | ✖         | ✖      |
| Lock table     | ✔   | ✖      | ✖         | ✖      |

---

## 3.6 Moderation Capabilities

| Capability     | DM  | Player | Spectator | System |
| -------------- | --- | ------ | --------- | ------ |
| Kick player    | ✔   | ✖      | ✖         | ✖      |
| Ban player     | ✔   | ✖      | ✖         | ✖      |
| Clear chat     | ✔   | ✖      | ✖         | ✖      |
| Override state | ✔   | ✖      | ✖         | ✖      |

---

## 3.7 Extension Capabilities

| Capability          | DM  | Player | Spectator | System |
| ------------------- | --- | ------ | --------- | ------ |
| Inject overlay      | ✔   | ✔      | ✖         | ✖      |
| Read VTT state      | ✔   | ✔      | ✖         | ✖      |
| Write VTT state     | ✔   | ✖      | ✖         | ✖      |
| Trigger VTT actions | ✔   | ✖      | ✖         | ✖      |

---

# 4. System Role

The **System** role is not a user.
It is used for:

- Automated events
- Presence pings
- System messages
- Internal state transitions
- Server‑side enforcement

System actions **never bypass** the permissions model unless explicitly defined.

---

# 5. Extensibility

The Permissions Matrix is designed to be:

- **Declarative** — stored as JSON
- **Composable** — capabilities can be grouped
- **Override‑friendly** — DMs can grant temporary capabilities
- **Future‑proof** — new subsystems can add new capability groups

---

# 6. Source of Truth

The matrix is enforced in:

- The reducer layer
- The server event validator
- The extension bridge
- The UI (visibility + disabled states)

All four layers must agree for a capability to be allowed.

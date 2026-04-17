# **UI-PERSONAS.md**

_A complete UX blueprint for DM, Player, and Spectator personas._

---

# 🧭 Overview

The VTT‑Chat SPA supports **three personas**, each with a different level of control, visibility, and UI complexity:

| Persona       | Purpose                 | UI Complexity | Permissions     |
| ------------- | ----------------------- | ------------- | --------------- |
| **DM**        | Runs the session        | High          | Full control    |
| **Player**    | Participates in session | Medium        | Limited control |
| **Spectator** | Observes session        | Low           | Read‑only       |

The SPA dynamically adapts based on:

- Role from backend (`DM`, `ASSISTANT_DM`, `PLAYER`, `SPECTATOR`)
- Room state (green room, main room, group room, private room)
- Session state (pre‑session, in‑session, post‑session)

Detailed persona companion docs:

- [Combined Persona Comparison Sheet](personas/COMPARISION-SHEET.md)
- [DM Persona High-Fidelity Wireframe](personas/UI-PERSONA-DM.md)
- [Figma Mockup DM](personas/FIGMA-MOCKUP-DM.md)
- [Figma Mockup Player](personas/FIGMA-MOCKUP-PLAYER.md)
- [Figma Mockup Spectator](personas/FIGMA-MOCKUP-SPECTATOR.md)

---

# 🎭 Persona 1: **DM UI**

## 🎛️ DM UX Principles

- **Everything visible**: all rooms, all players, all audio states
- **Everything controllable**: movement, audio, notes, metadata
- **Fast actions**: one‑click tools, drag‑and‑drop
- **Zero clutter**: collapsible panels, context‑aware controls
- **Session‑aware**: recap, journal, recording, private rooms

## 🧱 DM Layout Structure

```
┌──────────────────────────────────────────────┐
│ Top Bar: Session Controls + Room Selector     │
├──────────────────────────────────────────────┤
│ Left Panel: Player List + Room Manager        │
├──────────────────────────────────────────────┤
│ Center: Chat + Metadata Cards + Notes         │
├──────────────────────────────────────────────┤
│ Right Panel: Audio Control Panel              │
└──────────────────────────────────────────────┘
```

## 🧩 DM UI Components

### **1. Top Bar**

- Start/end session
- Recap modal
- Recording toggle
- Room selector (DM can join/monitor any room)
- DM status indicator

### **2. Player List Panel**

- Avatar, name, character
- Speaking indicator
- Conditions
- Distance
- Room membership
- Right‑click actions:
  - Move to room
  - Start private chat
  - Apply condition
  - Apply distance
  - Mute/unmute
  - Open notes shared with player
  - Open metadata card

### **3. Room Manager**

- Create/delete group rooms
- Drag players between rooms
- Force private chat
- Monitor room (listen‑only)

### **4. Chat Panel**

- Room chat
- Whispers
- System messages
- External logs
- Publish notes
- Publish metadata cards

### **5. Notes Panel**

- Create/edit/delete notes
- Visibility controls
- Attach images
- Publish to chat
- Mark as recap‑worthy

### **6. Metadata Card Composer**

- NPCs, items, locations, clues
- Publish to chat
- Link to notes

### **7. Audio Control Panel**

- DM voice presets
- Environment presets
- Conditions
- Distance
- IC mode
- DM override
- PTT override
- Clear all effects

---

# 🎭 Persona 2: **Player UI**

## 🎮 Player UX Principles

- **Minimal cognitive load**
- **Fast access to chat + audio controls**
- **No DM tools**
- **No room management**
- **No global audio overrides**
- **No visibility into other rooms**

Players should feel:

- Immersed
- Uncluttered
- Empowered to roleplay
- Not overwhelmed by DM‑level controls

## 🧱 Player Layout Structure

```
┌──────────────────────────────────────────────┐
│ Top Bar: Room Name + Theme Toggle + Mute     │
├──────────────────────────────────────────────┤
│ Center: Chat (room‑scoped)                   │
├──────────────────────────────────────────────┤
│ Bottom: Message Composer + IC Toggle         │
└──────────────────────────────────────────────┘
```

## 🧩 Player UI Components

### **1. Top Bar**

- Room name
- Theme toggle
- Self mute/unmute
- Connection indicator

### **2. Chat Panel**

- Room chat
- Whispers
- Inline images
- System messages (limited)
- External logs (optional toggle)

### **3. Message Composer**

- Markdown formatting
- Inline images
- Whisper target dropdown (if enabled)
- IC toggle (affects DM monitor only)

### **4. Notes Panel (Player Version)**

- Player’s own notes
- Notes shared with party
- Notes shared individually
- Cannot:
  - See DM‑only notes
  - Unshare notes
  - Delete DM notes

### **5. Audio Controls (Player Version)**

- IC toggle
- Self mute
- No access to:
  - Distance
  - Conditions
  - Environment
  - DM overrides

---

# 🎭 Persona 3: **Spectator UI**

## 👁️ Spectator UX Principles

- **Read‑only**
- **Zero clutter**
- **No audio controls**
- **No chat composer**
- **No notes editing**
- **No room switching**

Spectators are observers — not participants.

## 🧱 Spectator Layout Structure

```
┌──────────────────────────────────────────────┐
│ Top Bar: Spectator Mode Indicator            │
├──────────────────────────────────────────────┤
│ Center: Chat (read‑only)                     │
├──────────────────────────────────────────────┤
│ Right: Player List (read‑only)               │
└──────────────────────────────────────────────┘
```

## 🧩 Spectator UI Components

### **1. Top Bar**

- “Spectator Mode” label
- Theme toggle
- Connection indicator

### **2. Chat Panel**

- Read‑only
- No composer
- No whispers
- No external logs (optional)

### **3. Player List**

- Avatar + name
- Speaking indicator
- Room membership
- No actions

### **4. Notes Panel**

- Only notes marked **GLOBAL**
- Read‑only

### **5. Audio**

- Spectators hear everything
- No controls

---

# 🧠 Cross‑Persona Behavior Rules

### **Room Visibility**

| Persona      | Can See Other Rooms? |
| ------------ | -------------------- |
| DM           | Yes                  |
| Assistant DM | Yes                  |
| Player       | No                   |
| Spectator    | No                   |

### **Private Rooms**

| Persona      | Behavior            |
| ------------ | ------------------- |
| DM           | Full control        |
| Assistant DM | Can join if invited |
| Player       | Only if invited     |
| Spectator    | Cannot join         |

### **Audio Effects**

| Persona      | Controls       |
| ------------ | -------------- |
| DM           | Full           |
| Assistant DM | Partial        |
| Player       | IC + self mute |
| Spectator    | None           |

### **Notes**

| Persona      | Permissions           |
| ------------ | --------------------- |
| DM           | Full                  |
| Assistant DM | Full (except DM‑only) |
| Player       | Own + shared          |
| Spectator    | Global only           |

---

# 🚀 Next Step Options

If you want, I can now generate:

### **A. Wireframes for all three personas**

ASCII or structured layout.

### **B. Component architecture**

React component tree for each persona.

### **C. Zustand store → UI mapping**

Which store drives which UI element.

### **D. Interaction flows**

E.g., “DM starts private chat”, “Player toggles IC”.

### **E. CSS/Theme system**

Light/dark mode, role‑based color accents.

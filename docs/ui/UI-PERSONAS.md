# **UI-PERSONAS.md**

_A complete UX blueprint for DM, Player, and Spectator personas._

---

## Overview

The VTT‑Chat SPA supports **three personas**, each with a different level of control, visibility, and UI complexity:

| Persona       | Purpose                 | UI Complexity | Permissions     |
| ------------- | ----------------------- | ------------- | --------------- |
| **DM**        | Runs the session        | High          | Full control    |
| **Player**    | Participates in session | Medium        | Limited control |
| **Spectator** | Observes session        | Low           | Read‑only       |

The SPA dynamically adapts based on:

- Role from backend (`DM`, `ASSISTANT_DM`, `PLAYER`, `SPECTATOR`)
- Group state (greenroom, Main group, split group, private group)
- Session state (pre‑session, in‑session, post‑session)

Responsive viewport modes:

- Minimalist Mobile (`<=767px`)
- Balanced Player (`768px-1279px`, target `~900px`)
- DM Desktop Command (`>=1280px`)

Mode activation policy:

- DM Desktop Command auto-enables for DM on eligible widths.
- Non-DM personas may opt in on eligible widths.

Topbar popout panel model:

- Settings and Information are opened from topbar icons.
- Session settings open from a small cog in the campaign/session header.
- Information tab order is `Campaign | Search | Notes | Journal | History`.
- Journal is a FUTURE feature and is feature-flagged off by default.

Settings access policy:

- System settings apply to defaults for newly created campaigns only.
- Campaign settings are DM-editable.
- Player and Spectator can view campaign settings read-only by default.
- DM can hide campaign settings from non-DM personas.

Detailed persona companion docs:

- [Combined Persona Comparison Sheet](personas/COMPARISON-SHEET.md)
- [DM Persona High-Fidelity Wireframe](personas/UI-PERSONA-DM.md)
- [Figma Mockup DM](personas/FIGMA-MOCKUP-DM.md)
- [Figma Mockup Player](personas/FIGMA-MOCKUP-PLAYER.md)
- [Figma Mockup Spectator](personas/FIGMA-MOCKUP-SPECTATOR.md)

---

## Persona 1: **DM UI**

### DM UX Principles

- **Everything visible**: all groups, all players, all audio states
- **Everything controllable**: movement, audio, notes, metadata
- **Fast actions**: one‑click tools, drag‑and‑drop
- **Zero clutter**: collapsible panels, context‑aware controls
- **Session‑aware**: recap, journal, recording, private groups
- **Desktop command mode**: keep one right tool panel open on wide screens

### DM Layout Structure

```text
┌──────────────────────────────────────────────┐
│ Top Bar: Session Controls + Group Selector   │
├──────────────────────────────────────────────┤
│ Left Panel: Player List + Group Manager      │
├──────────────────────────────────────────────┤
│ Center: Chat + Metadata Cards + Notes        │
├──────────────────────────────────────────────┤
│ Right Panel: Audio Control Panel             │
└──────────────────────────────────────────────┘
```

### DM UI Components

#### **1. Top Bar**

- Start/end session
- Recap modal
- Recording toggle
- Group selector (DM can join/monitor any group)
- DM status indicator

#### **2. Player List Panel**

- Avatar, name, character
- Speaking indicator
- Conditions
- Distance
- Group membership
- Right‑click actions:
  - Move to group
  - Start private chat
  - Apply condition
  - Apply distance
  - Mute/unmute
  - Open notes shared with player
  - Open metadata card

#### **3. Group Manager**

- Create/delete groups
- Drag players between groups
- Force private chat
- Monitor group (listen‑only)

#### **4. Chat Panel**

- Group chat
- Whispers
- System messages
- External logs
- Publish notes
- Publish metadata cards

#### **5. Notes Panel**

- Create/edit/delete notes
- Visibility controls
- Attach images
- Publish to chat
- Mark as recap‑worthy

#### **6. Metadata Card Composer**

- NPCs, items, locations, clues
- Publish to chat
- Link to notes

#### **7. Audio Control Panel**

- DM voice presets
- Environment presets
- Conditions
- Distance
- IC mode
- DM override
- PTT override
- Clear all effects

---

## Persona 2: **Player UI**

### Player UX Principles

- **Minimal cognitive load**
- **Fast access to chat + audio controls**
- **No DM tools**
- **No group management**
- **No global audio overrides**
- **No visibility into other groups**
- **Balanced-first responsive behavior** with optional desktop command opt-in

Players should feel:

- Immersed
- Uncluttered
- Empowered to roleplay
- Not overwhelmed by DM‑level controls

### Player Layout Structure

```text
┌──────────────────────────────────────────────┐
│ Top Bar: Group Name + Theme Toggle + Mute    │
├──────────────────────────────────────────────┤
│ Center: Chat (group‑scoped)                  │
├──────────────────────────────────────────────┤
│ Bottom: Message Composer + IC Toggle         │
└──────────────────────────────────────────────┘
```

### Player UI Components

#### **1. Top Bar**

- Group name
- Theme toggle
- Self mute/unmute
- Connection indicator

#### **2. Chat Panel**

- Group chat
- Whispers
- Inline images
- System messages (limited)
- External logs (optional toggle)

#### **3. Message Composer**

- Markdown formatting
- Inline images
- Whisper target dropdown (if enabled)
- IC toggle (affects DM monitor only)

#### **4. Notes Panel (Player Version)**

- Player’s own notes
- Notes shared with party
- Notes shared individually
- Cannot:
  - See DM‑only notes
  - Unshare notes
  - Delete DM notes

#### **5. Audio Controls (Player Version)**

- IC toggle
- Self mute
- No access to:
  - Distance
  - Conditions
  - Environment
  - DM overrides

---

## Persona 3: **Spectator UI**

### Spectator UX Principles

- **Read‑only**
- **Zero clutter**
- **No audio controls**
- **No chat composer**
- **No notes editing**
- **No group switching**

Spectators are observers — not participants.

Minimalist Mobile reminder:

- Spectator layout follows mobile shell behavior (bottom-docked tools, compact left column).

### Spectator Layout Structure

```text
┌──────────────────────────────────────────────┐
│ Top Bar: Spectator Mode Indicator            │
├──────────────────────────────────────────────┤
│ Center: Chat (read‑only)                     │
├──────────────────────────────────────────────┤
│ Right: Player List (read‑only)               │
└──────────────────────────────────────────────┘
```

### Spectator UI Components

#### **1. Top Bar**

- “Spectator Mode” label
- Theme toggle
- Connection indicator

#### **2. Chat Panel**

- Read‑only
- No composer
- No whispers
- No external logs (optional)

#### **3. Player List**

- Avatar + name
- Speaking indicator
- Group membership
- No actions

#### **4. Notes Panel**

- Only notes marked **GLOBAL**
- Read‑only

#### **5. Audio**

- Spectators hear everything
- No controls

---

## Cross‑Persona Behavior Rules

### **Viewport Mode Behavior**

| Mode               | Primary behavior                                                                  |
| ------------------ | --------------------------------------------------------------------------------- |
| Minimalist Mobile  | Chat-first, compact left column, bottom-docked right-panel icons + popover panels |
| Balanced Player    | Existing popout right panel behavior and balanced tri-pane shell                  |
| DM Desktop Command | One pinned right panel always open; right-edge icons switch pinned content        |

### **Group Visibility**

| Persona      | Can See Other Groups? |
| ------------ | --------------------- |
| DM           | Yes                   |
| Assistant DM | Yes                   |
| Player       | No                    |
| Spectator    | No                    |

### **Private Groups**

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

| Persona      | Permissions                   |
| ------------ | ----------------------------- |
| DM           | Full (create/edit/share/post) |
| Assistant DM | Full (except DM‑only)         |
| Player       | Read shared notes             |
| Spectator    | Read shared notes             |

### **Settings and Rightbar Access**

| Panel / Action                              | DM   | Player         | Spectator   |
| ------------------------------------------- | ---- | -------------- | ----------- |
| Open topbar Settings                        | Yes  | Yes            | Yes         |
| Open rightbar INFO                          | Yes  | Yes            | Yes         |
| Open rightbar PARTY                         | Yes  | Yes            | Yes         |
| Open rightbar ROOMS                         | Yes  | No (hidden)    | No (hidden) |
| Open rightbar NOTES                         | Yes  | Yes            | Yes         |
| Open rightbar JOURNAL                       | Yes  | Yes            | Yes         |
| Open rightbar HISTORY                       | Yes  | Yes            | Yes         |
| Open rightbar SETTINGS                      | Yes  | Yes            | No (hidden) |
| Edit INFO campaign metadata                 | Yes  | No             | No          |
| Edit NOTES/JOURNAL                          | Yes  | No             | No          |
| Edit SETTINGS campaign/session              | Yes  | No             | No          |
| Edit SETTINGS character (own character)     | No   | Yes            | No          |
| PARTY > Edit routes to SETTINGS > Character | n/a  | Yes (own only) | No          |
| PARTY row stats/conditions visibility       | Full | Full           | Full        |

DM note handout scopes remain: `PRIVATE | PARTY | SELECTED`.

---

## Next Step Options

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

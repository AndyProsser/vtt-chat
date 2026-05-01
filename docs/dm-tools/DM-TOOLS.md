# Dungeon Master Tools

_A unified control surface for audio, rooms, notes, metadata, private chats, and session flow._

Status:

- This document describes intended DM workflows and capability surfaces, not just the currently mounted runtime APIs/events.
- Legacy lowercase event names in tables and examples should be read as conceptual workflow labels unless they match the shared runtime contract.
- For current runtime contracts, see [../README.md](../README.md#runtime-source-of-truth).

---

## Overview

The DM Tools subsystem provides the **full control surface** for running a session:

- Room management
- Player movement
- Private chats
- Audio effects & overrides
- Environment control
- Conditions & distance
- Notes & handouts
- Metadata cards
- Session start/end
- Recap & journaling
- Recording control
- DM/Assistant DM roles

This document defines:

- DM UI layout
- DM capabilities
- Assistant DM capabilities
- Interaction with presence, audio, chat, and notes
- Backend permissions
- Event flows

---

## 1. DM UI Overview

The DM UI is composed of **six primary panels**:

1. **Room Manager**
2. **Player List & Movement Panel**
3. **Audio Control Panel**
4. **Notes & Handouts Panel**
5. **Metadata Card Composer**
6. **Session Control Panel**

Assistant DMs see the same UI **except**:

- Cannot start/end sessions
- Cannot change DM
- Cannot apply global audio overrides
- Cannot delete rooms
- Cannot publish DM‑only notes

---

## 2. Room Manager

The DM can:

- Create group rooms
- Delete group rooms
- Move players between rooms
- Move entire groups
- Join any room (monitor mode)
- Force players into private rooms
- End private rooms
- Rename rooms

### Room Types

| Type             | DM Controls               |
| ---------------- | ------------------------- |
| **Main Room**    | Cannot delete             |
| **Group Room**   | Create / rename / delete  |
| **Private Room** | Create / end / force join |

### Room Actions

| Action             | Description                                  |
| ------------------ | -------------------------------------------- |
| Move Player        | DM drags player into room                    |
| Move Group         | DM drags room onto another room              |
| Join Room          | DM enters room without leaving main          |
| Monitor Room       | DM listens without speaking                  |
| Force Private Chat | DM selects 2+ players → “Start Private Chat” |

---

## 3. Player List & Movement Panel

The DM sees:

- All players
- Their current room
- Their audio status (muted, speaking, effects)
- Their conditions
- Their distance
- Their IC mode
- Their connection quality

### DM Actions Per Player

- Move to room
- Apply condition
- Apply distance
- Apply voice preset (rare)
- Mute/unmute
- Force private chat
- Open metadata card
- Open notes shared with player

---

## 4. Audio Control Panel

The DM audio panel is the **most powerful tool** in the system.

### Sections

1. **DM Voice Presets**
2. **Environment Presets**
3. **Conditions**
4. **Distance**
5. **IC Mode**
6. **DM Overrides**
7. **Private Room Clean Mode**
8. **PTT Override**
9. **Clear All Effects**

---

### 4.1 DM Voice Presets

Applies only to DM’s microphone.

Examples:

- Narrator
- Demon
- Whisper
- Angel
- Robot

#### UI

- Single‑click toggle
- Only one active at a time
- PTT override temporarily disables

---

### 4.2 Environment Presets (Room-Level)

Applies to **RoomBus**:

- Cave
- Tavern
- Cathedral
- Forest
- Dungeon

#### UI

- Hover → preview
- Click → apply
- DM can override per room

---

### 4.3 Conditions (Per Player)

Examples:

- Silenced
- Underwater
- Drunk
- Confused
- Invisible
- Exhausted

#### UI

- Right‑click player → “Apply Condition”
- Multiple conditions can stack
- DM override always wins

---

### 4.4 Distance (Per Player)

Simulates spatial separation.

#### UI

- Slider (0.0 → 1.0)
- Presets: Close / Near / Far / Distant
- Auto‑distance from extension (FVTT)

---

### 4.5 IC Mode (Player → DM Only)

Players can toggle IC mode:

- Whisper
- Goblin
- Dramatic echo
- Raspy

DM hears IC effects; players do not.

DM can:

- Force IC mode
- Disable IC mode

---

### 4.6 DM Overrides

DM can override:

- Gain
- Mute
- Effects

Overrides apply **after** all presets.

---

### 4.7 Private Room Clean Mode

Automatically enabled when entering private rooms:

- All effects disabled
- DM voice presets disabled
- IC disabled
- Distance disabled
- Environment disabled
- Conditions disabled

DM can manually toggle clean mode.

---

### 4.8 PTT Override

DM holds a key (e.g., Space) to temporarily disable all effects.

---

### 4.9 Clear All Effects

Resets:

- Distance
- Conditions
- Environment
- IC
- DM voice presets
- DM overrides

---

## 5. Notes & Handouts Panel

DM can:

- Create notes
- Edit notes
- Delete notes
- Share notes
- Publish notes to chat
- Attach images
- Convert chat messages into notes
- Mark notes as recap‑worthy
- Pin notes

### Player Notes

Players can:

- Create notes
- Share notes
- Publish notes
- Attach images

Players **cannot**:

- Create DM‑only notes
- Unshare notes
- Delete DM notes

---

## 6. Metadata Card Composer

DM can create **metadata cards**:

- NPCs
- Items
- Locations
- Events
- Clues
- Handouts

### Metadata Card Fields

- Title
- Type
- Description
- Tags
- Image
- Visibility
- Linked notes
- Linked chat messages

### Publishing

DM can publish metadata cards to:

- Chat
- Notes panel
- Player popups

---

## 7. Session Control Panel

DM controls:

- Start session
- End session
- Show recap
- Generate recap (AI/manual)
- Start/stop recording
- View journal
- Export session log
- Promote/demote assistant DM

---

## 8. Assistant DM Capabilities

Assistant DMs can:

- Move players
- Create group rooms
- Start private chats
- Apply conditions
- Apply distance
- Apply IC presets
- Publish notes
- Create metadata cards
- Use DM voice presets (optional toggle)

Assistant DMs **cannot**:

- Start/end sessions
- Change DM
- Apply global audio overrides
- Delete rooms
- Clear all effects
- Access DM‑only notes

---

## 9. Interaction With Presence

DM actions trigger presence events:

| DM Action          | Presence Event      |
| ------------------ | ------------------- |
| Move player        | `presence.joinRoom` |
| Start private chat | `private.started`   |
| End private chat   | `private.ended`     |
| Start session      | `session.started`   |
| End session        | `session.ended`     |

---

## 10. Interaction With Audio Engine

DM actions trigger audio events:

| DM Action         | Audio Event                       |
| ----------------- | --------------------------------- |
| Apply preset      | `audio.applyPreset`               |
| Clear preset      | `audio.clearPreset`               |
| Clear all         | `audio.clearAll`                  |
| Apply environment | `audio.environmentChanged`        |
| Set distance      | `audio.distanceChanged`           |
| Apply IC          | `audio.icPreset`                  |
| Toggle clean mode | `audio.privateRoomCleanMode`      |
| PTT               | `audio.pttStart` / `audio.pttEnd` |

---

## 11. Interaction With Chat

DM can:

- Publish notes
- Publish metadata cards
- Send whispers
- Convert chat → note
- Send system messages (join/leave)

---

## 12. Interaction With Sessions

DM controls:

- Recap
- Journal
- Recording
- Session boundaries

DM tools reset at session boundaries.

---

## Design Principles

### 1. DM has full visibility

DM sees all rooms, all notes, all logs.

### 2. DM has full control

Audio, rooms, notes, metadata, session flow.

### 3. Assistant DM is powerful but limited

Cannot override DM authority.

### 4. Private rooms are sacred

Clean audio, no recording, no leakage.

### 5. Tools are fast

One‑click actions for common tasks.

### 6. Tools are reversible

Every action can be undone.

# Audio Preset Library

_A versioned, declarative preset system for voice, distance, environment, condition, and IC effects._

---

## 📘 Overview

This document defines the **Audio Preset Library**, a shared JSON‑based system used by:

- The **client** (WebAudio engine)
- The **server** (WebSocket events, DM controls)
- The **browser extension** (auto‑effects from DDB/Roll20/FVTT)

Presets are:

- **Declarative** (pure data, no code)
- **Composable**
- **Versioned**
- **Cross‑platform**
- **DM‑controlled**
- **Reversible**
- **Safe to merge**

This library is loaded at:

- Client login
- Campaign join
- Version updates

---

## 🧩 Preset Schema

All presets follow the same structure:

```ts
interface AudioPreset {
  id: string
  type: 'VOICE' | 'DISTANCE' | 'ENVIRONMENT' | 'CONDITION' | 'IC'
  name: string
  description?: string
  parameters: AudioParameters
}
```

### `AudioParameters`

```ts
interface AudioParameters {
  gain?: number
  distance?: number
  lowpass?: number
  highpass?: number
  reverbSend?: number
  reverbIR?: string
  pitchShift?: number
  formantShift?: number
  distortion?: number
  tremolo?: number
  flanger?: number
  chorus?: number
  mute?: boolean
}
```

All fields are optional.
Missing fields are ignored.

---

## 🗂️ Library Structure

The preset library is stored as a **versioned JSON file**:

```json
{
  "version": 1,
  "voice": [ ... ],
  "distance": [ ... ],
  "environment": [ ... ],
  "condition": [ ... ],
  "ic": [ ... ]
}
```

Each category is documented below.

---

## 🎙️ 1. Voice Presets (DM Voice Changer)

Voice presets apply **only to the DM’s microphone**.

Used for:

- NPC voices
- Narration
- Dramatic effects

### Example Presets

```json
{
  "id": "DEMON",
  "type": "VOICE",
  "name": "Demon",
  "parameters": {
    "pitchShift": -6,
    "formantShift": -4,
    "distortion": 0.3,
    "lowpass": 4000
  }
}
```

```json
{
  "id": "NARRATOR",
  "type": "VOICE",
  "name": "Narrator",
  "parameters": {
    "highpass": 120,
    "lowpass": 12000,
    "reverbSend": 0.1
  }
}
```

```json
{
  "id": "WHISPER",
  "type": "VOICE",
  "name": "Whisper",
  "parameters": {
    "lowpass": 8000,
    "reverbSend": 0.2
  }
}
```

---

## 📏 2. Distance Presets (Spatial Simulation)

Distance presets apply **per participant**.

Used for:

- Simulating physical distance
- Shouting across a room
- Characters splitting up

### Example Presets

```json
{
  "id": "CLOSE",
  "type": "DISTANCE",
  "name": "Close",
  "parameters": {
    "distance": 0.0,
    "reverbSend": 0.0
  }
}
```

```json
{
  "id": "FAR",
  "type": "DISTANCE",
  "name": "Far",
  "parameters": {
    "distance": 0.6,
    "reverbSend": 0.1
  }
}
```

```json
{
  "id": "DISTANT",
  "type": "DISTANCE",
  "name": "Distant",
  "parameters": {
    "distance": 0.9,
    "reverbSend": 0.2,
    "gain": 0.3
  }
}
```

---

## 🏛️ 3. Environment Presets (Room Acoustics)

Environment presets apply to **RoomBus** (room‑level).

Used for:

- Tavern ambience
- Cave echo
- Cathedral reverb
- Dungeon acoustics
- Outdoor scenes

### Example Presets

```json
{
  "id": "CAVE",
  "type": "ENVIRONMENT",
  "name": "Cave",
  "parameters": {
    "reverbIR": "/ir/cave.wav",
    "reverbSend": 0.4
  }
}
```

```json
{
  "id": "TAVERN",
  "type": "ENVIRONMENT",
  "name": "Tavern",
  "parameters": {
    "reverbIR": "/ir/small-hall.wav",
    "reverbSend": 0.15
  }
}
```

```json
{
  "id": "CATHEDRAL",
  "type": "ENVIRONMENT",
  "name": "Cathedral",
  "parameters": {
    "reverbIR": "/ir/cathedral.wav",
    "reverbSend": 0.6
  }
}
```

---

## 🧪 4. Condition Presets (Character Status Effects)

Condition presets apply **per participant** and override distance.

Used for:

- Silenced
- Underwater
- Drunk
- Confused
- Invisible
- Exhausted
- Blessed
- Cursed

### Example Presets

```json
{
  "id": "SILENCED",
  "type": "CONDITION",
  "name": "Silenced",
  "parameters": {
    "mute": true
  }
}
```

```json
{
  "id": "UNDERWATER",
  "type": "CONDITION",
  "name": "Underwater",
  "parameters": {
    "lowpass": 800,
    "reverbSend": 0.3
  }
}
```

```json
{
  "id": "DRUNK",
  "type": "CONDITION",
  "name": "Drunk",
  "parameters": {
    "pitchShift": -1,
    "tremolo": 0.2,
    "distortion": 0.05
  }
}
```

---

## 🎭 5. IC Presets (Player → DM Only)

IC presets apply **only to the DM’s monitor chain**.

Used for:

- Whispering
- Goblin voice
- Dramatic echo
- Raspy voice

### Example Presets

```json
{
  "id": "IC_WHISPER",
  "type": "IC",
  "name": "Whisper (IC)",
  "parameters": {
    "lowpass": 8000,
    "reverbSend": 0.2
  }
}
```

```json
{
  "id": "IC_GOBLIN",
  "type": "IC",
  "name": "Goblin",
  "parameters": {
    "pitchShift": +3,
    "formantShift": +2
  }
}
```

---

## 🔄 Preset Merging Rules

Presets are merged into the participant’s audio chain using:

```text
finalValue = presetValue OR previousValue
```

### Merge Order (lowest → highest)

```text
Environment
↓
Distance
↓
Condition
↓
Voice (DM only)
↓
IC (DM monitor only)
↓
DM Override (gain/mute/effects)
↓
Private Room Clean Mode
↓
PTT Override (highest)
```

### Notes

- Missing fields do not overwrite existing values
- DM overrides always win
- Private room clean mode bypasses all effects
- PTT override temporarily disables all effects

---

## 🧱 Versioning Strategy

The preset library includes a version number:

```json
{
  "version": 1,
  ...
}
```

Rules:

- Adding presets → bump minor version
- Changing parameters → bump minor version
- Removing presets → bump major version
- Breaking schema changes → bump major version

Clients cache presets by version.

---

## 🔌 Extension Mapping

The browser extension maps external events to presets:

| External Event         | Preset       |
| ---------------------- | ------------ |
| DDB: Silenced          | `SILENCED`   |
| DDB: Drunk             | `DRUNK`      |
| FVTT: Fog Cloud        | `FOG_MUFFLE` |
| FVTT: Distance > 30 ft | `FAR`        |
| Roll20: /whisper       | `IC_WHISPER` |

**See:** `EXTENSION-INTEGRATION.md`

---

## 🧠 Design Principles

### 1. Declarative

Presets are pure data, not code.

### 2. Composable

Multiple presets can stack safely.

### 3. Reversible

Every preset can be undone cleanly.

### 4. DM‑centric

DM has full control over all effects.

### 5. Player‑friendly

Players can IC toggle without affecting others.

### 6. Private rooms are sacred

Always clean, always clear.

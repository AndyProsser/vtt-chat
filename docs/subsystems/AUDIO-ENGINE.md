# Audio Engine

_A deterministic WebAudio processing pipeline for real‑time tabletop communication._

Status:

- This document describes the target audio architecture in more detail than the shipped Stage 7 baseline.
- The shipped runtime includes LiveKit token issuance, mounted frontend hooks, realtime audio control events, and baseline override handling; some preset and control flows described here remain future-state design.
- For current runtime contracts, see [../README.md](../README.md#runtime-source-of-truth).

---

## 📘 Overview

This document describes the **client‑side audio engine** used by the VTT‑Chat platform.
It is responsible for:

- Per‑participant audio processing
- Room‑level acoustics
- DM voice presets
- Player IC (in‑character) effects
- Distance simulation
- Condition effects
- Environment effects
- DM overrides (gain/mute/effects)
- Private room clean mode
- Push‑to‑talk (PTT) override
- Shout routing
- DM broadcast
- WebAudio graph construction and teardown

The engine is built on:

- **WebAudio** for DSP
- **LiveKit** for audio transport
- **Zustand** for state
- **WebSocket events** for control

---

## 🧩 Architecture Overview

```text
LiveKit Track
   ↓
MediaStreamSource
   ↓
TrackGain (per‑participant gain/mute)
   ↓
DistanceFilter (LPF + gain shaping)
   ↓
EffectsSend (reverb send)
   ↓
RoomBus (per‑room gain)
   ↓
MasterBus (global gain + compressor)
   ↓
AudioContext.destination
```

Additional chains:

- **DM Voice Chain** (DM’s own mic → voice presets)
- **DM Monitor Chain** (player IC effects heard only by DM)
- **Private Room Clean Mode** (bypass effects)
- **PTT Override** (temporary clean voice)

---

## 🎛️ 1. AudioGraph (Core WebAudio Engine)

The AudioGraph is the central DSP engine.

### Initialization

```ts
class AudioGraph {
  ctx = new AudioContext()

  masterGain = ctx.createGain()
  masterCompressor = ctx.createDynamicsCompressor()

  roomBuses = new Map<string, RoomBus>()
  participantNodes = new Map<string, ParticipantAudioNode>()

  reverbBus = ctx.createGain()
  convolver = ctx.createConvolver()
}
```

### Master Chain

```text
[RoomBuses] → MasterGain → MasterCompressor → destination
ReverbBus → Convolver → MasterGain
```

---

## 🎚️ 2. RoomBus (Per‑Room Processing)

Each room has its own gain node:

```ts
class RoomBus {
  gainNode = ctx.createGain()
}
```

Used for:

- Environment presets
- Private room attenuation
- DM broadcast routing

---

## 🎤 3. ParticipantAudioNode (Per‑User Processing)

Each remote participant gets a full chain:

```ts
class ParticipantAudioNode {
  source: MediaStreamAudioSourceNode
  trackGain: GainNode
  distanceFilter: BiquadFilterNode
  effectsSend: GainNode
}
```

### Chain

```text
source
  → trackGain
    → distanceFilter
      → effectsSend → reverbBus
      → roomBus.gainNode
```

### Controls

| Control           | Description                       |
| ----------------- | --------------------------------- |
| `setGain()`       | DM override or condition          |
| `setDistance()`   | LPF + gain shaping                |
| `setReverbSend()` | Environment + distance            |
| `setMute()`       | DM override or silenced condition |
| `disconnect()`    | Cleanup                           |

---

## 🎙️ 4. DM Voice Chain (DM Voice Presets)

DM’s microphone is processed through a **separate chain** before publishing:

```text
MicInput
  → VoicePresetChain
    → LiveKitPublisher
```

Voice presets include:

- Pitch shift
- Formant shift
- Distortion
- Whisper mode
- Robotize
- Lowpass/highpass
- Reverb send

DM can **toggle presets instantly**.

---

## 🎧 5. DM Monitor Chain (Player IC Effects)

Players can toggle “in‑character mode” (IC):

- Only the **DM hears** the IC effect
- Other players hear the normal voice

Chain:

```text
ParticipantAudioNode
  → DMMonitorGain
    → DMMonitorEffects
      → DMMonitorBus (headphones only)
```

Used for:

- Whisper
- Goblin voice
- Shout
- Dramatic effects

---

## 🔇 6. Private Room Clean Mode

When a user enters a private room:

- **All effects are disabled**
- DM voice presets disabled
- Player IC presets disabled
- Distance effects disabled
- Environment disabled
- Conditions disabled
- DM overrides (mute/gain) remain

### Implementation

```ts
audioStore.pushEffectState()
audioStore.disableAllEffects()
```

On exit:

```ts
audioStore.popEffectState()
```

---

## 🎤 7. Push‑To‑Talk (PTT) Override

DM can hold a key (e.g., Space or V) to temporarily disable all effects:

- Voice presets disabled
- Environment disabled
- Distance disabled
- Conditions disabled
- IC disabled
- Clean voice only

### Implementation

```ts
audioStore.startPTT()
audioStore.endPTT()
```

PTT always overrides everything except device mute.

---

## 📢 8. Shout Routing

Shout temporarily publishes DM or player audio to the **primary room**:

```text
LiveKitPublisher.publishToRoom(primaryRoom)
wait(duration)
LiveKitPublisher.unpublishFromRoom(primaryRoom)
```

TTL = 2–5 seconds.

---

## 🧙 9. DM Overrides

DM can apply:

- Gain override
- Mute override
- Effects override

Overrides apply **after** presets.

### Example

```json
{
  "gain": 0.5,
  "muted": false,
  "effects": { "lowpass": 2000 }
}
```

---

## 🌌 10. Environment Presets (Room‑Level)

Environment presets apply to **RoomBus**:

- Reverb IR
- Reverb send
- Optional EQ shaping

Examples:

- Tavern
- Cave
- Cathedral
- Forest
- Dungeon
- Underwater

---

## 📏 11. Distance Presets (Per‑Participant)

Distance presets simulate spatial separation:

- LPF frequency
- Gain reduction
- Reverb send

Examples:

- Close
- Near
- Far
- Distant
- Out of earshot

---

## 🧪 12. Condition Presets (Per‑Participant)

Conditions override distance:

- Silenced
- Underwater
- Drunk
- Confused
- Invisible
- Exhausted
- Blessed
- Cursed

---

## 🎭 13. Voice Presets (DM Only)

DM voice presets override environment:

- Narrator
- Demon
- Angel
- Whisper
- Robot
- God Voice

---

## 🎭 14. IC Presets (Player → DM Only)

Players can toggle IC mode:

- Whisper
- Goblin
- Dramatic echo
- Raspy
- Deep voice

Only the DM hears these.

---

## 🧠 15. Effect Priority Rules

Final priority stack:

```text
PTT override (highest)
↓
Private room clean mode
↓
DM override (gain/mute/effects)
↓
Condition preset
↓
Distance preset
↓
Environment preset
↓
Voice preset (DM only)
↓
IC preset (DM monitor only)
↓
Base audio (lowest)
```

This ensures:

- PTT always wins
- Private rooms are always clean
- DM overrides always apply
- Conditions override distance
- Distance overrides environment
- Voice presets override environment
- IC never affects other players

---

## 🔄 16. Interaction With WebSocket Events

| Event                        | Effect                      |
| ---------------------------- | --------------------------- |
| `audio.applyPreset`          | Apply preset to participant |
| `audio.clearPreset`          | Remove preset               |
| `audio.clearAll`             | Reset all effects           |
| `audio.environmentChanged`   | Update room environment     |
| `audio.distanceChanged`      | Update distance             |
| `audio.icPreset`             | Apply IC effect (DM only)   |
| `audio.privateRoomCleanMode` | Enable/disable clean mode   |
| `audio.pttStart`             | Start PTT                   |
| `audio.pttEnd`               | End PTT                     |

---

## 🧱 17. Interaction With Zustand Stores

### `useAudioStore`

Controls:

- Gain
- Mute
- Distance
- Conditions
- Environment
- Voice presets
- IC presets
- PTT
- Clean mode

### `useRoomStore`

Provides:

- Room membership
- LiveKit tokens

### `usePresenceStore`

Triggers:

- Private room transitions
- Room switching

---

## 🧠 Design Principles

### 1. Deterministic

All effects are applied in a predictable order.

### 2. Modular

Each effect is isolated and composable.

### 3. Reversible

Every effect can be undone cleanly.

### 4. DM‑centric

DM has full control over the soundscape.

### 5. Player‑friendly

Players can IC toggle without affecting others.

### 6. Private rooms are sacred

Always clean, always clear.

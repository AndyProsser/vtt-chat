# **LIVEKIT-INTEGRATION.md**

# LiveKit Integration

_A modular, deterministic audio transport layer for real‑time tabletop communication._

Status:

- This subsystem document includes target-architecture examples that go beyond the shipped Stage 7 baseline.
- Lowercase event references in this file should be read as conceptual design shorthand rather than the shipped websocket contract.
- For current runtime contracts, see [../README.md](../README.md#runtime-source-of-truth).

---

## 📘 Overview

This document describes how the VTT‑Chat client integrates with **LiveKit** to provide:

- Multi‑room audio
- Private chat audio
- Shout routing
- DM broadcast
- Per‑participant audio chains
- Room‑level environment effects
- DM overrides
- Distance & condition effects
- PTT override
- Private room clean mode

The integration is built around **three cooperating modules**:

1. **LiveKitRoomManager** — connects to rooms, manages subscriptions
2. **LiveKitTrackRouter** — routes audio tracks into the WebAudio graph
3. **LiveKitPublisher** — publishes microphone audio to the correct room(s)

These modules interact with the Zustand stores and WebSocket event reducer.

---

# 🧩 Architecture Overview

```
WebSocket Events
        ↓
Zustand Stores
        ↓
LiveKitRoomManager  ←→  LiveKit SFU
        ↓
LiveKitTrackRouter
        ↓
AudioGraph (WebAudio)
        ↓
Output to speakers/headphones
```

Publishing path:

```
Microphone → LiveKitPublisher → LiveKit SFU → Other clients
```

---

# 🎛️ 1. LiveKitRoomManager

The **RoomManager** is responsible for:

- Connecting to LiveKit rooms
- Disconnecting rooms
- Managing subscriptions
- Attaching event listeners
- Handling reconnection
- Providing room instances to other modules

Each room is isolated and managed independently.

### Responsibilities

| Responsibility | Description                  |
| -------------- | ---------------------------- |
| Connect        | `connect(roomId, token)`     |
| Disconnect     | `disconnect(roomId)`         |
| Switch rooms   | Disconnect old → connect new |
| Private rooms  | Connect ephemeral rooms      |
| Track events   | Forward to TrackRouter       |
| Reconnect      | Reconnect after WS recovery  |

### Implementation

```ts
export class LiveKitRoomManager {
  rooms = new Map<string, Room>()

  async connect(roomId: string, token: string) {
    if (this.rooms.has(roomId)) return this.rooms.get(roomId)

    const room = await connect(token, {
      autoSubscribe: false,
      adaptiveStream: true,
      dynacast: true,
    })

    this.rooms.set(roomId, room)
    this.attachListeners(roomId, room)
    return room
  }

  disconnect(roomId: string) {
    const room = this.rooms.get(roomId)
    if (!room) return
    room.disconnect()
    this.rooms.delete(roomId)
  }

  disconnectAll() {
    for (const id of this.rooms.keys()) this.disconnect(id)
  }

  attachListeners(roomId: string, room: Room) {
    room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
      LiveKitTrackRouter.handleTrackSubscribed(roomId, track, participant)
    })

    room.on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
      LiveKitTrackRouter.handleTrackUnsubscribed(roomId, track, participant)
    })

    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      LiveKitTrackRouter.handleParticipantLeft(roomId, participant)
    })
  }
}
```

---

# 🎚️ 2. LiveKitTrackRouter

The **TrackRouter** connects LiveKit audio tracks into the **AudioGraph**.

### Responsibilities

| Responsibility     | Description                        |
| ------------------ | ---------------------------------- |
| Track subscribed   | Create WebAudio nodes              |
| Track unsubscribed | Remove nodes                       |
| Participant left   | Cleanup                            |
| Room gain          | Apply room‑level gain              |
| DM overrides       | Apply per‑participant gain/effects |
| Distance           | Apply LPF + gain                   |
| Environment        | Apply reverb send                  |

### Implementation

```ts
export const LiveKitTrackRouter = {
  handleTrackSubscribed(roomId, track, participant) {
    if (track.kind !== Track.Kind.Audio) return

    const audioTrack = track
    const stream = audioTrack.attach()

    AudioGraph.addParticipantTrack({
      roomId,
      participantId: participant.identity,
      stream,
    })
  },

  handleTrackUnsubscribed(roomId, track, participant) {
    AudioGraph.removeParticipantTrack(roomId, participant.identity)
  },

  handleParticipantLeft(roomId, participant) {
    AudioGraph.removeParticipantTrack(roomId, participant.identity)
  },
}
```

---

# 🎤 3. LiveKitPublisher

The **Publisher** controls microphone publishing:

- Primary room
- Private room
- Shout routing
- DM broadcast
- PTT override (temporary clean voice)

### Responsibilities

| Action       | Description                       |
| ------------ | --------------------------------- |
| Publish      | Publish mic to a room             |
| Unpublish    | Remove mic from a room            |
| Switch       | Move mic between rooms            |
| Shout        | Temporary publish to primary room |
| Private chat | Publish only to private room      |
| DM broadcast | Publish to multiple rooms         |

### Implementation

```ts
export class LiveKitPublisher {
  currentRoomId = null
  localTrack = null

  async ensureTrack() {
    if (!this.localTrack) {
      this.localTrack = await createLocalAudioTrack()
    }
  }

  async publishToRoom(roomId) {
    await this.ensureTrack()
    const room = LiveKitRoomManager.rooms.get(roomId)
    if (!room) return

    await room.localParticipant.publishTrack(this.localTrack)
    this.currentRoomId = roomId
  }

  async unpublishFromRoom(roomId) {
    const room = LiveKitRoomManager.rooms.get(roomId)
    if (!room || !this.localTrack) return
    room.localParticipant.unpublishTrack(this.localTrack)
  }

  async shout(primaryRoomId, durationMs = 2000) {
    await this.publishToRoom(primaryRoomId)
    setTimeout(() => this.unpublishFromRoom(primaryRoomId), durationMs)
  }
}
```

---

# 🎧 4. AudioGraph (WebAudio)

The **AudioGraph** is the heart of the audio engine.

Each participant gets:

```
MediaStreamSource
  → TrackGain
    → DistanceFilter
      → EffectsSend
        → RoomBus
          → MasterBus
            → destination
```

Room buses allow:

- Environment presets
- Room‑level gain
- Private room clean mode

DM overrides apply on top of the chain.

### Key Features

| Feature                 | Description              |
| ----------------------- | ------------------------ |
| Per‑participant gain    | DM overrides, conditions |
| Distance                | LPF + gain               |
| Environment             | Reverb IRs               |
| IC mode                 | DM‑only monitor chain    |
| Private room clean mode | Disable all effects      |
| PTT override            | Temporary clean voice    |
| Clear all               | Reset all effects        |

**See:** `AUDIO-ENGINE.md` for full details.

---

# 🔄 5. Interaction With Zustand Stores

### PresenceStore

Triggers:

- Room connect/disconnect
- Private room connect/disconnect

### RoomStore

Provides:

- LiveKit tokens
- Room switching logic

### AudioStore

Controls:

- Gain
- Distance
- Conditions
- Environment
- DM overrides
- PTT
- Clean mode

### ChatStore

No direct LiveKit interaction.

### RoleStore

DM/assistant DM capabilities.

---

# 🔁 6. Reconnect Logic

When WebSocket reconnects:

1. Client sends `client.reconnect`
2. Server restores presence from Redis
3. Server sends:
   - `presence.joinCampaign`
   - `presence.joinRoom`
   - `private.started` (if needed)
   - `audio.applyPreset` (if needed)
   - `audio.environmentChanged` (if needed)
4. RoomManager reconnects LiveKit rooms
5. TrackRouter rebuilds audio graph

This ensures deterministic recovery.

---

# 🧠 Design Principles

### 1. LiveKit is transport, not logic

All logic lives in Zustand + WebAudio.

### 2. Rooms are isolated

Each room has its own LiveKit connection.

### 3. AudioGraph is the single source of truth

All effects apply through it.

### 4. WebSocket events drive everything

LiveKit never makes decisions on its own.

### 5. Private rooms are clean

Effects disabled automatically.

### 6. DM overrides always win

Gain/mute/effects override all presets.

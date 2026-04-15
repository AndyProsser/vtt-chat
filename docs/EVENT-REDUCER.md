# **EVENT-REDUCER.md**

# WebSocket Event Reducer

_A deterministic, modular dispatcher that synchronizes client state with the real‑time backend._

---

## 📘 Overview

The **Event Reducer** is the central mechanism that processes all WebSocket events and updates the client’s Zustand stores.
It ensures:

- Deterministic state transitions
- Modular handling of event namespaces
- Clean separation of concerns
- Predictable UI updates
- Tight integration with LiveKit and the Audio Engine
- Zero race conditions
- Full recoverability after reconnect

This document defines:

- Reducer architecture
- Namespace routing
- Per‑namespace reducers
- Interaction with Zustand stores
- Interaction with LiveKit
- Interaction with the Audio Engine
- Reconnect behavior
- Error handling

---

# 🧩 Architecture Overview

```
WebSocket Event
      ↓
Event Reducer (handleWsEvent)
      ↓
Namespace Reducer
      ↓
Zustand Store Updates
      ↓
LiveKit / AudioGraph / UI
```

The reducer is **pure routing logic** — it does not store state itself.

---

# 🧱 1. Event Envelope

All events follow:

```ts
interface WsEvent {
  v: number
  type: string
  payload: any
}
```

Example:

```json
{
  "v": 1,
  "type": "chat.newMessage",
  "payload": { ... }
}
```

---

# 🧭 2. Top‑Level Reducer

The top‑level reducer routes events by namespace:

```ts
export function handleWsEvent(event: WsEvent) {
  const { type, payload } = event

  if (type.startsWith('presence.')) return presenceReducer(type, payload)
  if (type.startsWith('session.')) return sessionReducer(type, payload)
  if (type.startsWith('room.')) return roomReducer(type, payload)
  if (type.startsWith('voice.')) return voiceReducer(type, payload)
  if (type.startsWith('chat.')) return chatReducer(type, payload)
  if (type.startsWith('private.')) return privateReducer(type, payload)
  if (type.startsWith('dm.')) return dmReducer(type, payload)
  if (type.startsWith('note.')) return noteReducer(type, payload)
  if (type.startsWith('external.')) return externalReducer(type, payload)
  if (type.startsWith('audio.')) return audioReducer(type, payload)
  if (type.startsWith('error.')) return errorReducer(type, payload)

  console.warn('Unknown WS event:', event)
}
```

This keeps the system **modular** and **easy to extend**.

---

# 🟢 3. Presence Reducer

Handles:

- Joining/leaving campaign
- Joining/leaving rooms
- Switching primary rooms
- LiveKit room connections
- Green room transitions

```ts
function presenceReducer(type: string, p: any) {
  const presence = usePresenceStore.getState()
  const rooms = useRoomStore.getState()

  switch (type) {
    case 'presence.joinCampaign':
      presence.enterGreenRoom()
      break

    case 'presence.leaveCampaign':
      if (p.userId === getCurrentUserId()) presence.markDisconnected()
      break

    case 'presence.joinRoom':
      presence.switchPrimaryRoom(p.roomId)
      rooms.switchPrimaryRoom(p.roomId, p.livekitToken)
      break

    case 'presence.leaveRoom':
      rooms.disconnectRoom(p.roomId)
      break
  }
}
```

---

# 🎭 4. Session Reducer

Handles:

- Session start
- Session end
- Green room → session transitions
- LiveKit main room connection
- Chat restoration
- Audio cleanup

```ts
function sessionReducer(type: string, p: any) {
  const presence = usePresenceStore.getState()
  const chat = useChatStore.getState()
  const rooms = useRoomStore.getState()
  const audio = useAudioStore.getState()

  switch (type) {
    case 'session.started':
      presence.enterSession('main')
      rooms.connectRoom('main', p.livekitToken)
      chat.clearGreenRoomMessages()
      break

    case 'session.ended':
      presence.endSession()
      rooms.disconnectAll()
      rooms.connectRoom('green-room', p.livekitToken)
      chat.restoreGreenRoomMessages(p.greenRoomMessages)
      audio.clearDMOverride()
      break
  }
}
```

---

# 🏠 5. Room Reducer

Handles:

- Room creation
- Room deletion
- Room rename

```ts
function roomReducer(type: string, p: any) {
  const rooms = useRoomStore.getState()

  switch (type) {
    case 'room.created':
      // DM UI only
      break

    case 'room.deleted':
      rooms.disconnectRoom(p.roomId)
      break

    case 'room.renamed':
      // UI update only
      break
  }
}
```

---

# 🎚️ 6. Voice Reducer (Legacy)

Handles:

- DM override applied
- DM override cleared
- Shout events

```ts
function voiceReducer(type: string, p: any) {
  const audio = useAudioStore.getState()

  switch (type) {
    case 'voice.overrideApplied':
      audio.applyDMOverride(p)
      break

    case 'voice.overrideCleared':
      audio.clearDMOverride()
      break

    case 'voice.shout':
      audio.startShout()
      setTimeout(() => audio.endShout(), p.durationMs ?? 2000)
      break
  }
}
```

---

# 💬 7. Chat Reducer

Handles:

- Room messages
- Whispers
- External logs (if enabled)

```ts
function chatReducer(type: string, p: any) {
  const chat = useChatStore.getState()

  switch (type) {
    case 'chat.newMessage':
      chat.addMessage(p.roomId, p)
      break

    case 'chat.whisper':
      chat.addPrivateMessage(p.toUserId, p)
      break

    case 'chat.externalLog':
      if (chat.filters.showExternalLogs) chat.addMessage(p.roomId, p)
      break
  }
}
```

---

# 🔐 8. Private Chat Reducer

Handles:

- Private chat start
- Private chat end
- LiveKit private room connection
- Audio clean mode

```ts
function privateReducer(type: string, p: any) {
  const presence = usePresenceStore.getState()
  const rooms = useRoomStore.getState()
  const audio = useAudioStore.getState()

  switch (type) {
    case 'private.started':
      presence.enterPrivateRoom(p.privateRoomId)
      rooms.joinPrivateRoom(p.privateRoomId, p.livekitToken)
      audio.enterPrivateChat()
      break

    case 'private.ended':
      presence.exitPrivateRoom()
      rooms.leavePrivateRoom(p.privateRoomId)
      audio.exitPrivateChat()
      break
  }
}
```

---

# 🧙 9. DM Reducer

Handles:

- Assistant DM promotion
- Demotion

```ts
function dmReducer(type: string, p: any) {
  const role = useRoleStore.getState()

  switch (type) {
    case 'dm.promoted':
      role.promoteToAssistantDM()
      break

    case 'dm.demoted':
      role.demoteToPlayer()
      break
  }
}
```

---

# 📝 10. Notes Reducer

Handles:

- Notes published to chat

```ts
function noteReducer(type: string, p: any) {
  const chat = useChatStore.getState()

  switch (type) {
    case 'note.publishedToChat':
      chat.addMessage(p.roomId, {
        ...p,
        type: 'METAGAME',
      })
      break
  }
}
```

---

# 🔌 11. External Logs Reducer

Handles:

- DDB/Roll20/FVTT logs

```ts
function externalReducer(type: string, p: any) {
  const chat = useChatStore.getState()

  if (type === 'external.log') {
    if (chat.filters.showExternalLogs) chat.addMessage(p.roomId, p)
  }
}
```

---

# 🎙️ 12. Audio Reducer (Presets & Effects)

Handles:

- Preset application
- Preset clearing
- Environment changes
- Distance changes
- IC mode
- PTT
- Clear all
- Private room clean mode

```ts
function audioReducer(type: string, p: any) {
  const audio = useAudioStore.getState()

  switch (type) {
    case 'audio.applyPreset':
      audio.applyPreset(p.targetUserId, p.presetType, p.parameters)
      break

    case 'audio.clearPreset':
      audio.clearPreset(p.targetUserId, p.presetType)
      break

    case 'audio.clearAll':
      audio.clearAllEffects()
      break

    case 'audio.environmentChanged':
      audio.applyEnvironmentPreset(p.roomId, p.parameters)
      break

    case 'audio.distanceChanged':
      audio.setDistance(p.targetUserId, p.distance)
      break

    case 'audio.icPreset':
      audio.applyIcPreset(p.fromUserId, p.parameters)
      break

    case 'audio.privateRoomCleanMode':
      p.enabled ? audio.enterPrivateChat() : audio.exitPrivateChat()
      break

    case 'audio.pttStart':
      audio.startPTT()
      break

    case 'audio.pttEnd':
      audio.endPTT()
      break
  }
}
```

---

# ❗ 13. Error Reducer

```ts
function errorReducer(type: string, p: any) {
  console.error('WS Error:', p)
  // Optional: toast or UI alert
}
```

---

# 🔁 14. Reconnect Behavior

On reconnect:

1. Client sends `client.reconnect`
2. Server replays:
   - Presence events
   - Room join events
   - Private chat events
   - DM role events
   - Audio preset events
   - Environment events
3. Reducer rebuilds state
4. RoomManager reconnects LiveKit rooms
5. TrackRouter rebuilds audio graph

This ensures **deterministic recovery**.

---

# 🧠 Design Principles

### 1. Reducers are pure

No side effects except calling Zustand store actions.

### 2. Namespaces are isolated

Each reducer handles only its own domain.

### 3. LiveKit is controlled indirectly

Reducers update stores → stores trigger LiveKit actions.

### 4. Audio engine is declarative

Reducers never manipulate WebAudio directly.

### 5. Reconnect is deterministic

State is rebuilt from server replay.

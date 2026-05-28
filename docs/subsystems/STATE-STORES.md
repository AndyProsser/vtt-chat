# Zustand State Stores

_A modular, deterministic client‑side state architecture for presence, rooms, audio, chat, roles, notes, and sessions._

---

## Overview

This document describes the **Zustand store architecture** used by the VTT‑Chat SPA.
Each store is:

- **Isolated** (single responsibility)
- **Deterministic** (pure state transitions)
- **Event‑driven** (updated by the WebSocket event reducer)
- **Side‑effect‑free** (effects handled by integration layers)
- **Serializable** (for debugging and replay)

Stores do **not** directly manipulate:

- LiveKit
- WebAudio
- WebSocket
- UI components

Instead, they expose **actions** that integration layers call.

### Runtime Churn Diagnostics (Dev)

To debug freeze/GC churn in development, the root store supports opt-in churn snapshots.

- Env toggle: `VITE_DEBUG_CHURN_METRICS=1`
- Runtime toggle: `window.__VTT_DEBUG_CHURN__ = true`

When enabled, logger domain `store.churn` emits totals/deltas for high-churn store collections
(messages, outgoing queue, typing/speaking sets, room members, LiveKit connections).
Use this with browser profiler captures to correlate reducer churn with UI stalls.

### Leaf-Isolation Pattern (UI Subscription Discipline)

High-frequency per-user transient state — speaking, presence online/offline, ghost mode,
mic mute — must be consumed by **memoized leaf indicator components** that each subscribe
to a single primitive selector. Threading these bits through participant projections
(`GroupParticipantStatus`, `MockPartyMember`, etc.) invalidates every participant on any
flip and rebuilds every surrounding Radix Tooltip/Popover subtree, which is the verified
root cause of long-session memory growth.

Canonical leaves under `frontend/src/components/workspaces/session/rooms/`:

- `SpeakingIndicator` — speaking + combined mute
- `PresenceIndicator` — online/offline dot
- `GhostIndicator` — ghost-mode badge (drives `:has()` cascade for parent dimming)
- `MicMutedIndicator` — mic_off badge (variants `avatar` | `profile`)

Shared hook: `frontend/src/hooks/useIsUserMuted.ts` collapses own-mute + DM `MUTE`
override + (for self) device PTT/mic into a single boolean per user.

`AvatarOverlay` takes a single `presence?: {sessionId, userId, isSelf?, roomType?}` prop
and mounts the four leaves itself; callers do not pass `presenceState`, `ghost`, `isMuted`,
or `speaking`.

For list-of-cards components where extracting per-card subscriptions is invasive
(e.g. `PartyPanel`): wrap the card in `React.memo` and ensure the parent merges with a
reference-preserving helper (`mergeMembersPreservingReferences` in PartyPanel). Stable
refs + default shallow compare deliver the same isolation.

Structural exceptions (will not be leaf-isolated): state that physically relocates a
participant between rendered groups (e.g. DM voice target moving the DM avatar between
groups in `GroupsPanel.session.tsx` / `dmDetachedParticipant` in `RoomSelector.tsx`).
Recompute is bounded to the two affected groups and is acceptable.

See `.github/copilot-instructions.md` → "Leaf-Isolation Pattern for High-Frequency Per-User
UI Bits" for the full contract.

---

## Store Overview

| Store               | Responsibility                                |
| ------------------- | --------------------------------------------- |
| `usePresenceStore`  | User presence, session state, private rooms   |
| `useRoomStore`      | LiveKit room connections, tokens, switching   |
| `useAudioStore`     | All audio effects, presets, DM overrides, PTT |
| `useChatStore`      | Chat messages, whispers, green room history   |
| `useRoleStore`      | DM/assistant DM/player roles                  |
| `useNoteStore`      | Notes, flags, visibility                      |
| `useSessionStore`   | Session metadata, recap, journal              |
| `useTelemetryStore` | Client telemetry batching                     |

Each store is documented below.

---

## 1. Presence Store

**File:** `stores/presence.ts`

Tracks:

- Campaign join/leave
- Green room vs session
- Primary room
- Private room
- Reconnect state
- Character selection

### State Shape

```ts
interface PresenceState {
  connected: boolean
  state: 'OFFLINE' | 'GREEN_ROOM' | 'IN_SESSION' | 'IN_PRIVATE'
  primaryRoomId: string | null
  privateRoomId: string | null
  characterId: string | null
}
```

### Actions

```ts
enterGreenRoom()
enterSession(primaryRoomId: string)
endSession()
switchPrimaryRoom(roomId: string)
enterPrivateRoom(privateRoomId: string)
exitPrivateRoom()
markDisconnected()
setCharacter(characterId: string)
```

### Notes

- This store drives **LiveKitRoomManager**.
- Private room transitions trigger **audio clean mode**.

---

## 2. Room Store

**File:** `stores/rooms.ts`

Tracks:

- LiveKit tokens
- Active room connections
- Private room connections
- Room switching
- Disconnect logic

### State Shape

```ts
interface RoomState {
  activeRooms: Record<string, { token: string }>
}
```

### Actions

```ts
connectRoom(roomId: string, token: string)
disconnectRoom(roomId: string)
disconnectAll()
switchPrimaryRoom(roomId: string, token: string)
joinPrivateRoom(roomId: string, token: string)
leavePrivateRoom(roomId: string)
```

### Notes

- This store is the **only place** that triggers LiveKit connections.
- The event reducer calls these actions.

---

## 3. Audio Store

**File:** `stores/audio.ts`

Tracks:

- Distance presets
- Condition presets
- Environment presets
- Voice presets (DM only)
- IC presets (DM monitor only)
- DM overrides
- Private room clean mode
- PTT override
- Shout state

### State Shape

```ts
interface AudioState {
  presets: {
    distance: Record<userId, AudioParameters>
    condition: Record<userId, AudioParameters>
    ic: Record<userId, AudioParameters>
  }

  environment: Record<roomId, AudioParameters>

  dmVoicePreset: AudioParameters | null
  dmOverride: AudioParameters | null

  privateCleanMode: boolean
  pttActive: boolean

  savedEffectState: any | null
}
```

### Actions

```ts
applyPreset(userId, type, params)
clearPreset(userId, type)
clearAllEffects()

applyEnvironmentPreset(roomId, params)

applyIcPreset(userId, params)

applyDMOverride(params)
clearDMOverride()

enterPrivateChat()
exitPrivateChat()

startPTT()
endPTT()

setDistance(userId, distance)
```

### Notes

- This store drives **AudioGraph**.
- Effects are merged in priority order (see AUDIO-ENGINE.md).
- Private room clean mode overrides everything except DM mute.

---

## 4. Chat Store

**File:** `stores/chat.ts`

Tracks:

- Room messages
- Whispers
- Green room history
- Filters (external logs, system messages)

### State Shape

```ts
interface ChatState {
  messages: Record<roomId, ChatMessage[]>
  whispers: Record<userId, ChatMessage[]>
  greenRoomMessages: ChatMessage[]
  filters: {
    showExternalLogs: boolean
  }
}
```

### Actions

```ts
addMessage(roomId, message)
addPrivateMessage(userId, message)

clearGreenRoomMessages()
restoreGreenRoomMessages(messages)

toggleExternalLogs()
```

### Notes

- Messages are immutable.
- Green room messages persist across session transitions.

---

## 5. Role Store

**File:** `stores/roles.ts`

Tracks:

- DM
- Assistant DM
- Player

### State Shape

```ts
interface RoleState {
  role: 'DM' | 'ASSISTANT_DM' | 'PLAYER'
}
```

### Actions

```ts
promoteToAssistantDM()
demoteToPlayer()
setDM()
```

### Notes

- DM role affects UI and permissions.
- Assistant DM is session‑scoped.

---

## 6. Note Store

**File:** `stores/notes.ts`

Tracks:

- Notes
- Flags
- Visibility
- Publishing

### State Shape

```ts
interface NoteState {
  notes: Record<noteId, Note>
  flags: Record<noteId, NoteFlag>
}
```

### Actions

```ts
addNote(note)
updateNote(noteId, patch)
deleteNote(noteId)

setFlag(noteId, flag)
publishToChat(noteId)
```

### Notes

- Notes are synced via REST, not WebSocket.
- Publishing triggers a WebSocket event.

---

## 7. Session Store

**File:** `stores/session.ts`

Tracks:

- Current session
- Recap
- Journal
- Recording state

### State Shape

```ts
interface SessionState {
  sessionId: string | null
  recap: { manual: string; ai: string } | null
  journal: string | null
}
```

### Actions

```ts
startSession(sessionId, recap)
endSession()
setJournal(text)
```

---

## 8. Telemetry Store

**File:** `stores/telemetry.ts`

Tracks:

- Client telemetry batching
- Flush intervals
- Event queue

### State Shape

```ts
interface TelemetryState {
  queue: TelemetryEvent[]
}
```

### Actions

```ts
enqueue(event)
flush()
```

---

## Store Interaction Diagram

```text
WebSocket Events
      ↓
Event Reducer
      ↓
Zustand Stores
      ↓
LiveKitRoomManager ←→ LiveKit
      ↓
LiveKitTrackRouter
      ↓
AudioGraph (WebAudio)
      ↓
UI Components
```

---

## Design Principles

### 1. Stores are pure

No side effects inside actions.

### 2. Integration layers handle effects

LiveKit, WebAudio, and WebSocket are external.

### 3. Reducer drives stores

Stores never listen to WebSocket directly.

### 4. Stores are isolated

Each store has a single responsibility.

### 5. Reconnect is deterministic

Stores rebuild state from server replay.

### 6. Audio is declarative

Stores hold parameters, not DSP logic.

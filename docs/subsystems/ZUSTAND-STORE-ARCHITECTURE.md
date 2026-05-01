# **ZUSTAND-STORE-ARCHITECTURE.md**

_Full store definitions, actions, and responsibilities._

---

## **Philosophy**

Each store is:

- **Single‑responsibility**
- **Event‑driven** (fed by your WebSocket reducer)
- **UI‑friendly** (selectors for minimal re-renders)
- **Serializable** (no functions in state)
- **Deterministic** (no side effects inside reducers)

Stores communicate via **actions**, not direct mutation.

---

## **Store Overview**

| Store              | Purpose                                    |
| ------------------ | ------------------------------------------ |
| `useSessionStore`  | Campaign/session metadata                  |
| `usePresenceStore` | Players, rooms, speaking, mute, conditions |
| `useChatStore`     | Chat messages, history, scroll state       |
| `useNotesStore`    | Notes, visibility, sharing                 |
| `useJournalStore`  | Session journal entries                    |
| `useHistoryStore`  | System events, logs                        |
| `useAudioStore`    | Gain, mute, distance, DM voice preset      |
| `useUIStore`       | Panels, layout, persona, theme             |
| `useCommandStore`  | Autocomplete + command context             |

This is the **minimum viable set** for your architecture.

---

## **1. Session Store**

Tracks high‑level session metadata.

```ts
export const useSessionStore = create<{
  campaignName: string
  sessionStartedAt: number | null
  connectionStatus: 'connected' | 'connecting' | 'disconnected'

  setCampaignName: (name: string) => void
  setSessionStartedAt: (ts: number | null) => void
  setConnectionStatus: (status: 'connected' | 'connecting' | 'disconnected') => void
}>((set) => ({
  campaignName: '',
  sessionStartedAt: null,
  connectionStatus: 'connecting',

  setCampaignName: (campaignName) => set({ campaignName }),
  setSessionStartedAt: (sessionStartedAt) => set({ sessionStartedAt }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
}))
```

---

## **2. Presence Store**

Players, rooms, conditions, distance, speaking, mute.

```ts
export const usePresenceStore = create<{
  players: Record<string, Player>
  rooms: Record<string, Room>

  // Player updates
  updatePlayer: (playerId: string, patch: Partial<Player>) => void
  movePlayerToRoom: (playerId: string, roomId: string) => void

  // Room updates
  updateRoom: (roomId: string, patch: Partial<Room>) => void
  createRoom: (room: Room) => void
  deleteRoom: (roomId: string) => void

  // Conditions & distance
  setCondition: (playerId: string, condition: Condition | null) => void
  setDistance: (playerId: string, distance: DistanceCategory) => void

  // Speaking/mute
  setSpeaking: (playerId: string, speaking: boolean) => void
  setMuted: (playerId: string, muted: boolean) => void
}>((set) => ({
  players: {},
  rooms: {},

  updatePlayer: (playerId, patch) =>
    set((s) => ({
      players: {
        ...s.players,
        [playerId]: { ...s.players[playerId], ...patch },
      },
    })),

  movePlayerToRoom: (playerId, roomId) =>
    set((s) => {
      const player = s.players[playerId]
      if (!player) return {}
      return {
        players: {
          ...s.players,
          [playerId]: { ...player, roomId },
        },
      }
    }),

  updateRoom: (roomId, patch) =>
    set((s) => ({
      rooms: {
        ...s.rooms,
        [roomId]: { ...s.rooms[roomId], ...patch },
      },
    })),

  createRoom: (room) =>
    set((s) => ({
      rooms: { ...s.rooms, [room.id]: room },
    })),

  deleteRoom: (roomId) =>
    set((s) => {
      const rooms = { ...s.rooms }
      delete rooms[roomId]
      return { rooms }
    }),

  setCondition: (playerId, condition) =>
    set((s) => {
      const p = s.players[playerId]
      if (!p) return {}
      return {
        players: {
          ...s.players,
          [playerId]: {
            ...p,
            conditions: condition ? [...p.conditions, condition] : [],
          },
        },
      }
    }),

  setDistance: (playerId, distance) =>
    set((s) => ({
      players: {
        ...s.players,
        [playerId]: { ...s.players[playerId], distance },
      },
    })),

  setSpeaking: (playerId, speaking) =>
    set((s) => ({
      players: {
        ...s.players,
        [playerId]: { ...s.players[playerId], speaking },
      },
    })),

  setMuted: (playerId, muted) =>
    set((s) => ({
      players: {
        ...s.players,
        [playerId]: { ...s.players[playerId], muted },
      },
    })),
}))
```

---

## **3. Chat Store**

Handles chat messages, history, scroll state.

```ts
export const useChatStore = create<{
  messages: ChatMessage[]
  hasMoreHistory: boolean

  addMessage: (msg: ChatMessage) => void
  prependHistory: (msgs: ChatMessage[]) => void
  setHasMoreHistory: (v: boolean) => void
}>((set) => ({
  messages: [],
  hasMoreHistory: true,

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  prependHistory: (msgs) => set((s) => ({ messages: [...msgs, ...s.messages] })),

  setHasMoreHistory: (hasMoreHistory) => set({ hasMoreHistory }),
}))
```

---

## **4. Notes Store**

Handles note creation, sharing, visibility.

```ts
export const useNotesStore = create<{
  notes: Record<string, Note>

  createNote: (note: Note) => void
  updateNote: (id: string, patch: Partial<Note>) => void
  deleteNote: (id: string) => void
}>((set) => ({
  notes: {},

  createNote: (note) =>
    set((s) => ({
      notes: { ...s.notes, [note.id]: note },
    })),

  updateNote: (id, patch) =>
    set((s) => ({
      notes: {
        ...s.notes,
        [id]: { ...s.notes[id], ...patch },
      },
    })),

  deleteNote: (id) =>
    set((s) => {
      const notes = { ...s.notes }
      delete notes[id]
      return { notes }
    }),
}))
```

---

## **5. Journal Store**

```ts
export const useJournalStore = create<{
  entries: JournalEntry[]
  addEntry: (entry: JournalEntry) => void
}>((set) => ({
  entries: [],
  addEntry: (entry) => set((s) => ({ entries: [...s.entries, entry] })),
}))
```

---

## **6. History Store**

```ts
export const useHistoryStore = create<{
  events: HistoryEvent[]
  addEvent: (event: HistoryEvent) => void
}>((set) => ({
  events: [],
  addEvent: (event) => set((s) => ({ events: [...s.events, event] })),
}))
```

---

## **7. Audio Store**

Handles gain, mute, distance, DM voice preset.

```ts
export const useAudioStore = create<{
  gain: Record<string, number>
  dmVoicePreset: string | null

  setGain: (playerId: string, gain: number) => void
  setDMVoicePreset: (preset: string | null) => void
}>((set) => ({
  gain: {},
  dmVoicePreset: null,

  setGain: (playerId, gainValue) =>
    set((s) => ({
      gain: { ...s.gain, [playerId]: gainValue },
    })),

  setDMVoicePreset: (preset) => set({ dmVoicePreset: preset }),
}))
```

---

## **8. UI Store**

Handles panels, persona, theme, layout.

```ts
export const useUIStore = create<{
  persona: Persona
  activeRightPanel: RightPanelTab | null
  leftRailCollapsed: boolean
  theme: 'light' | 'dark' | 'auto'

  setPersona: (p: Persona) => void
  setActiveRightPanel: (tab: RightPanelTab | null) => void
  toggleLeftRail: () => void
  setTheme: (theme: 'light' | 'dark' | 'auto') => void
}>((set) => ({
  persona: 'player',
  activeRightPanel: null,
  leftRailCollapsed: false,
  theme: 'dark',

  setPersona: (persona) => set({ persona }),
  setActiveRightPanel: (activeRightPanel) => set({ activeRightPanel }),
  toggleLeftRail: () => set((s) => ({ leftRailCollapsed: !s.leftRailCollapsed })),
  setTheme: (theme) => set({ theme }),
}))
```

---

## **9. Command Store**

Autocomplete + command context.

```ts
export const useCommandStore = create<{
  options: AutocompleteOption[]
  setOptions: (opts: AutocompleteOption[]) => void
}>((set) => ({
  options: [],
  setOptions: (options) => set({ options }),
}))
```

# **COMPONENT-INTERFACES.ts**

_Full TypeScript interface layer for all personas._

---

# 🧱 1. GLOBAL DOMAIN TYPES

```ts
export type Persona = 'dm' | 'player' | 'spectator'

export interface Player {
  id: string
  name: string
  avatarUrl?: string
  race: string
  class: string
  level: number
  speaking: boolean
  muted: boolean
  conditions: Condition[]
  distance: DistanceCategory
  roomId: string
}

export interface Room {
  id: string
  name: string
  environment?: Environment
  playerIds: string[]
}

export type Condition = 'frightened' | 'poisoned' | 'blinded' | 'deafened' | 'restrained' | 'custom'

export type DistanceCategory = 'near' | 'far' | 'distant'

export type Environment = 'none' | 'cave' | 'forest' | 'cathedral' | 'storm' | 'silence'

export interface Note {
  id: string
  title: string
  content: string
  visibility: 'private' | 'party' | 'players' | 'global'
  sharedWith?: string[]
  createdBy: string
  createdAt: number
}

export interface ChatMessage {
  id: string
  senderId: string | null // null = system
  content: string
  timestamp: number
  type: 'chat' | 'system' | 'note'
}

export interface JournalEntry {
  id: string
  title: string
  summary: string
  content: string
  createdAt: number
}

export interface HistoryEvent {
  id: string
  timestamp: number
  description: string
}
```

---

# 🧱 2. LAYOUT PRIMITIVES

## **2.1 `<TopBar />`**

```ts
export interface TopBarProps {
  persona: Persona
  campaignName: string
  sessionTime: string // "02:14:33"
  connectionStatus: 'connected' | 'connecting' | 'disconnected'
  showDMControls?: boolean
}
```

## **2.2 `<MainLayout />`**

```ts
export interface MainLayoutProps {
  children: React.ReactNode
}
```

## **2.3 `<LeftRail />`**

```ts
export interface LeftRailProps {
  collapsed: boolean
  children: React.ReactNode
}
```

## **2.4 `<CenterPane />`**

```ts
export interface CenterPaneProps {
  children: React.ReactNode
}
```

## **2.5 `<RightRail />`**

```ts
export interface RightRailProps {
  children: React.ReactNode
}
```

---

# 👥 3. LEFT RAIL — PLAYER LIST

## **3.1 `<PlayerList />`**

```ts
export interface PlayerListProps {
  persona: Persona
  players: Player[]
  rooms: Room[]
  collapsed: boolean
  onPlayerDrag?: (playerId: string) => void
  onPlayerDrop?: (playerId: string, roomId: string) => void
  onPlayerRightClick?: (playerId: string, pos: { x: number; y: number }) => void
}
```

## **3.2 `<PlayerItem />`**

```ts
export interface PlayerItemProps {
  player: Player
  persona: Persona
  showOverrides?: boolean // DM only
  draggable?: boolean
  onRightClick?: (playerId: string) => void
}
```

## **3.3 `<PlayerOverrides />` (DM Only)**

```ts
export interface PlayerOverridesProps {
  player: Player
  onSetGain: (playerId: string, gain: number) => void
  onToggleMute: (playerId: string) => void
  onSetCondition: (playerId: string, condition: Condition | null) => void
  onSetDistance: (playerId: string, distance: DistanceCategory) => void
}
```

---

# 💬 4. CENTER PANE — CHAT + COMPOSER

## **4.1 `<ChatWindow />`**

```ts
export interface ChatWindowProps {
  persona: Persona
  messages: ChatMessage[]
  readOnly?: boolean
  onScrollTop?: () => void
}
```

## **4.2 `<MessageComposer />`**

```ts
export interface MessageComposerProps {
  persona: Persona
  disabled?: boolean
  onSend: (text: string) => void
  autocompleteOptions: AutocompleteOption[]
}
```

## **4.3 `<MessageBubble />`**

```ts
export interface MessageBubbleProps {
  message: ChatMessage
  isOwnMessage: boolean
  sender?: Player | null
}
```

---

# 🎙 5. DM VOICE PANEL

```ts
export interface DMVoicePanelProps {
  presets: string[]
  activePreset: string | null
  onSelectPreset: (preset: string) => void
  onClear: () => void
}
```

---

# 📚 6. RIGHT RAIL — TABS + PANELS

## **6.1 `<RightTabBar />`**

```ts
export interface RightTabBarProps {
  persona: Persona
  activeTab: RightPanelTab | null
  onTabSelect: (tab: RightPanelTab) => void
}

export type RightPanelTab =
  | 'rooms'
  | 'audio'
  | 'search'
  | 'notes'
  | 'journal'
  | 'history'
  | 'settings'
```

## **6.2 `<SlideInPanels />`**

```ts
export interface SlideInPanelsProps {
  persona: Persona
  activeTab: RightPanelTab | null
  onClose: () => void
}
```

---

# 🏠 7. PANEL INTERFACES

## **7.1 `<RoomsPanel />` (DM Only)**

```ts
export interface RoomsPanelProps {
  rooms: Room[]
  players: Player[]
  onSetEnvironment: (roomId: string, env: Environment) => void
  onMoveAll: (fromRoomId: string, toRoomId: string) => void
  onRenameRoom: (roomId: string, name: string) => void
  onDeleteRoom: (roomId: string) => void
  onCreateRoom: (name: string) => void
}
```

## **7.2 `<AudioPanel />` (DM Only)**

```ts
export interface AudioPanelProps {
  players: Player[]
  onSetGain: (playerId: string, gain: number) => void
  onToggleMute: (playerId: string) => void
  onSetCondition: (playerId: string, condition: Condition | null) => void
  onSetDistance: (playerId: string, distance: DistanceCategory) => void
  onClearAllConditions: () => void
  onResetAllDistances: () => void
  onNormalizeGain: () => void
}
```

## **7.3 `<SearchPanel />`**

```ts
export interface SearchPanelProps {
  query: string
  results: SearchResult[]
  onQueryChange: (q: string) => void
  onSelectResult: (result: SearchResult) => void
}

export type SearchResult =
  | { type: 'note'; note: Note }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'player'; player: Player }
  | { type: 'room'; room: Room }
  | { type: 'metadata'; id: string; label: string }
```

## **7.4 `<NotesPanel />`**

```ts
export interface NotesPanelProps {
  notes: Note[]
  persona: Persona
  onCreateNote?: () => void
  onSelectNote: (noteId: string) => void
}
```

## **7.5 `<JournalPanel />`**

```ts
export interface JournalPanelProps {
  entries: JournalEntry[]
  readOnly?: boolean
  onOpenEntry: (id: string) => void
}
```

## **7.6 `<HistoryPanel />`**

```ts
export interface HistoryPanelProps {
  events: HistoryEvent[]
  readOnly?: boolean
}
```

## **7.7 `<SettingsPanel />`**

```ts
export interface SettingsPanelProps {
  persona: Persona
  audioDevices: AudioDevice[]
  uiSettings: UISettings
  onUpdateAudio: (settings: Partial<AudioSettings>) => void
  onUpdateUI: (settings: Partial<UISettings>) => void
}
```

---

# ⌨️ 8. COMMAND SYSTEM

```ts
export interface CommandContext {
  players: Player[]
  rooms: Room[]
  conditions: Condition[]
  environments: Environment[]
  voicePresets: string[]
}

export interface AutocompleteOption {
  type: 'player' | 'room' | 'command' | 'condition' | 'environment' | 'voice'
  label: string
  value: string
}
```

---

# 🖱️ 9. DRAG‑DROP

```ts
export interface DragPayload {
  type: 'player'
  playerId: string
}

export interface DropTarget {
  type: 'room'
  roomId: string
}
```

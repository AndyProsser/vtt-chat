# **TYPESCRIPT INTERFACES**

_All interfaces follow your existing conventions and do not introduce new architecture._

---

## **1. `<SystemToasts />`**

A UI‑only component that renders dismissable system toasts.
No state mutation — reducers control the toast list.

```ts
export interface SystemToast {
  id: string
  message: string
  level: 'info' | 'warning' | 'error'
  createdAt: number
}

export interface SystemToastsProps {
  toasts: SystemToast[]
  onDismiss: (toastId: string) => void
}
```

### Notes

- `onDismiss` dispatches an event (UI → Event → Reducer).
- `level` controls color only — no behavioural differences.
- `createdAt` allows auto‑dismiss timers in UI layer.

---

## **2. `<NotePopout />`**

A persona‑aware wrapper around the existing `NotesPanel` content.

```ts
export interface NotePopoutProps {
  note: Note | null
  persona: Persona
  readOnly?: boolean
  onClose: () => void
}
```

### Notes

- `note = null` means hidden.
- `readOnly` is derived from persona + note visibility.
- No editing logic here — editing is handled by existing note events.

---

## **3. `<ChatNotesToggle />`**

A simple UI toggle between chat and notes view.

```ts
export interface ChatNotesToggleProps {
  activeView: 'chat' | 'notes'
  onChange: (view: 'chat' | 'notes') => void
}
```

### Notes

- No persona logic here — parent decides what is allowed.
- Pure UI component.

---

## **4. `<RoomHeader />`**

Displays the current group and whisper target (if applicable).

```ts
export interface RoomHeaderProps {
  persona: Persona
  roomName: string
  whisperTarget?: Player | null
  onWhisperTargetChange?: (playerId: string | null) => void
}
```

### Notes

- `onWhisperTargetChange` is only used by Player/DM.
- Spectator will not receive this callback.
- No group‑switching logic here — DM group switching is handled in Right Panel.

---

## **5. Optional: `<NoteCard />` (Chat message type = `METAGAME`)**

This is not a new subsystem — it is a UI wrapper for `ChatMessage.type = 'METAGAME'`.

```ts
export interface NoteCardProps {
  message: ChatMessage
  note: Note
  persona: Persona
  onOpen: (noteId: string) => void
}
```

### Notes

- Used inside `<MessageBubble />` when `message.type === 'METAGAME'`.
- `onOpen` triggers the pop‑out viewer.

---

## **6. Optional: `<SystemToastItem />`**

If you want a split between list + item:

```ts
export interface SystemToastItemProps {
  toast: SystemToast
  onDismiss: (toastId: string) => void
}
```

---

## **7. Responsive Shell Interfaces**

```ts
export type ViewportMode = 'MINIMALIST_MOBILE' | 'BALANCED_PLAYER' | 'DM_DESKTOP_COMMAND'

export interface ViewportModeControllerProps {
  width: number
  persona: Persona
  desktopCommandOptIn?: boolean
  onModeChange: (mode: ViewportMode) => void
}

export interface RightRailModeProps {
  viewportMode: ViewportMode
  activePanel: RightPanelTab
  lastDesktopPinnedPanel?: RightPanelTab
  onSelectPanel: (tab: RightPanelTab) => void
}

export interface MobileBottomTabDockProps {
  tabs: RightPanelTab[]
  activeTab: RightPanelTab | null
  onSelectTab: (tab: RightPanelTab) => void
}

export interface MobileDmWarningBannerProps {
  visible: boolean
  onDismiss: () => void
}
```

---

## **8. Settings & Information Interfaces**

```ts
export type SettingsSection = 'SYSTEM' | 'CAMPAIGN' | 'PROFILE'

export type InformationTab = 'CAMPAIGN' | 'SEARCH' | 'NOTES' | 'JOURNAL' | 'HISTORY'

export type NotesAccessLevel = 'PRIVATE' | 'PARTY' | 'SELECTED'

export interface SettingsPanelProps {
  persona: Persona
  activeSection: SettingsSection
  canViewCampaignSettings: boolean
  canEditCampaignSettings: boolean
  onSelectSection: (section: SettingsSection) => void
}

export interface CampaignFeatureToggles {
  allowDmVoices: boolean
  allowEnvironments: boolean
  allowConditions: boolean
  allowPrivateGroupRequests: boolean
  allowSpectators: boolean
  spectatorLimit: number | null
  lateJoinGraceMinutes: number | null
  defaultSessionLimitMinutes: number | null
  recordingEnabled: boolean
  transcriptionEnabled: boolean
  extensionCampaignSyncEnabled: boolean
}

export interface SessionSettingsPopoverProps {
  persona: Persona
  sessionName: string
  sessionDescriptionMarkdown: string
  campaignDefaultTimerMinutes: number | null
  sessionTimerOverrideMinutes: number | null
  canEdit: boolean
  onSave: (payload: {
    sessionName: string
    sessionDescriptionMarkdown: string
    sessionTimerOverrideMinutes: number | null
  }) => void
}

export interface InformationPanelProps {
  persona: Persona
  activeTab: InformationTab
  availableTabs: InformationTab[]
  onSelectTab: (tab: InformationTab) => void
}

export interface NotesPanelPermissionsProps {
  persona: Persona
  accessLevel: NotesAccessLevel
  selectedPlayerIds: string[]
  canEditPermissions: boolean
  onChangeAccessLevel: (level: NotesAccessLevel) => void
  onChangeSelectedPlayers: (playerIds: string[]) => void
}
```

---

## All Interfaces Are Fully Compliant

These interfaces:

- Do **not** introduce new subsystems
- Do **not** invent reducers or events
- Fit perfectly into your existing UI architecture
- Respect persona boundaries
- Follow your event‑driven model
- Are deterministic and documentation‑aligned

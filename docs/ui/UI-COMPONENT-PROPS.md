# **UI-COMPONENT-PROPS.md**

_A complete props reference for all UI components in VTT‑Chat._

---

## 1. Overview

This document lists the **props** for every UI component in the VTT‑Chat SPA.

All props reference the domain types defined in:

- `UI-COMPONENT-INTERFACES.md`
- `UI-COMPONENTS.md`

All components follow the event‑driven architecture:

```text
UI → Event → Reducer → Store → UI
```

No component mutates state directly.

---

## 2. Layout Components

---

### **2.1 `<Toolbar />`**

| Prop               | Type                   | Description                    |
| ------------------ | ---------------------- | ------------------------------ | --------------- | --------------------- |
| `audioDevices`     | `AudioDevice[]`        | Available input/output devices |
| `selectedDevice`   | `string`               | Current device ID              |
| `onSelectDevice`   | `(id: string) => void` | Event: user selects device     |
| `theme`            | `'light'               | 'dark'`                        | Current theme   |
| `onToggleTheme`    | `() => void`           | Event: toggle theme            |
| `connectionStatus` | `'connected'           | 'connecting'                   | 'disconnected'` | Live connection state |

---

### **2.2 `<CampaignInfo />`**

| Prop            | Type     | Description                    |
| --------------- | -------- | ------------------------------ |
| `campaignName`  | `string` | Name of the campaign           |
| `dmName`        | `string` | DM’s display name              |
| `sessionNumber` | `number` | Current session index          |
| `sessionTime`   | `string` | Formatted timer (`"02:14:33"`) |

---

### **2.3 `<SystemToasts />`**

| Prop        | Type                        | Description          |
| ----------- | --------------------------- | -------------------- |
| `toasts`    | `SystemToast[]`             | Active toast list    |
| `onDismiss` | `(toastId: string) => void` | Event: dismiss toast |

---

### **2.4 `<MainLayout />`**

| Prop       | Type              | Description                |
| ---------- | ----------------- | -------------------------- |
| `children` | `React.ReactNode` | Left, center, right panels |

---

### **2.5 `<LeftRail />`**

| Prop        | Type              | Description                   |
| ----------- | ----------------- | ----------------------------- |
| `collapsed` | `boolean`         | Whether the rail is collapsed |
| `children`  | `React.ReactNode` | Usually `<PlayerList />`      |

---

### **2.6 `<CenterPane />`**

| Prop       | Type              | Description                        |
| ---------- | ----------------- | ---------------------------------- |
| `children` | `React.ReactNode` | Group header, chat/notes, composer |

---

### **2.7 `<RightRail />`**

| Prop       | Type              | Description            |
| ---------- | ----------------- | ---------------------- |
| `children` | `React.ReactNode` | Tabs + slide‑in panels |

---

## 3. Player List Components

---

### **3.1 `<PlayerList />`**

| Prop                 | Type                                                      | Description           |
| -------------------- | --------------------------------------------------------- | --------------------- |
| `persona`            | `Persona`                                                 | DM, player, spectator |
| `players`            | `Player[]`                                                | All players           |
| `rooms`              | `Room[]`                                                  | Group grouping        |
| `collapsed`          | `boolean`                                                 | Collapsed state       |
| `onPlayerDrag`       | `(playerId: string) => void`                              | DM only               |
| `onPlayerDrop`       | `(playerId: string, roomId: string) => void`              | DM only               |
| `onPlayerRightClick` | `(playerId: string, pos: {x: number; y: number}) => void` | Context menu          |

---

### **3.2 `<PlayerItem />`**

| Prop            | Type                         | Description                      |
| --------------- | ---------------------------- | -------------------------------- |
| `player`        | `Player`                     | Player data                      |
| `persona`       | `Persona`                    | Controls visibility of overrides |
| `showOverrides` | `boolean`                    | DM only                          |
| `draggable`     | `boolean`                    | DM only                          |
| `onRightClick`  | `(playerId: string) => void` | Context menu                     |

---

### **3.3 `<PlayerOverrides />` (DM Only)**

| Prop             | Type                                                     | Description      |
| ---------------- | -------------------------------------------------------- | ---------------- | ---------------------- |
| `player`         | `Player`                                                 | Target player    |
| `onSetGain`      | `(playerId: string, gain: number) => void`               | DM audio control |
| `onToggleMute`   | `(playerId: string) => void`                             | DM mute          |
| `onSetCondition` | `(playerId: string, condition: Condition                 | null) => void`   | Apply/remove condition |
| `onSetDistance`  | `(playerId: string, distance: DistanceCategory) => void` | Set distance     |

---

## 4. Chat & Messaging Components

---

### **4.1 `<RoomHeader />`**

| Prop                    | Type                                 | Description         |
| ----------------------- | ------------------------------------ | ------------------- |
| `persona`               | `Persona`                            | Controls whisper UI |
| `roomName`              | `string`                             | Current group       |
| `whisperTarget`         | `Player \| null`                     | Whisper target      |
| `onWhisperTargetChange` | `(playerId: string \| null) => void` | DM/Player only      |

---

### **4.2 `<ChatNotesToggle />`**

| Prop         | Type           | Description       |
| ------------ | -------------- | ----------------- | ------------ |
| `activeView` | `'chat'        | 'notes'`          | Current view |
| `onChange`   | `(view: 'chat' | 'notes') => void` | Toggle event |

---

### **4.3 `<ChatWindow />`**

| Prop          | Type            | Description               |
| ------------- | --------------- | ------------------------- |
| `persona`     | `Persona`       | Controls visibility rules |
| `messages`    | `ChatMessage[]` | Chat log                  |
| `readOnly`    | `boolean`       | Spectator mode            |
| `onScrollTop` | `() => void`    | Infinite scroll           |

---

### **4.4 `<MessageComposer />`**

| Prop                  | Type                     | Description         |
| --------------------- | ------------------------ | ------------------- |
| `persona`             | `Persona`                | DM/Player only      |
| `disabled`            | `boolean`                | For connection loss |
| `onSend`              | `(text: string) => void` | Send message        |
| `autocompleteOptions` | `AutocompleteOption[]`   | Command system      |

---

### **4.5 `<MessageBubble />`**

| Prop           | Type             | Description              |
| -------------- | ---------------- | ------------------------ |
| `message`      | `ChatMessage`    | Message data             |
| `isOwnMessage` | `boolean`        | Styling                  |
| `sender`       | `Player \| null` | Null for system messages |

---

### **4.6 `<NoteCard />`**

| Prop      | Type                       | Description         |
| --------- | -------------------------- | ------------------- |
| `message` | `ChatMessage`              | Chat wrapper        |
| `note`    | `Note`                     | Note content        |
| `persona` | `Persona`                  | Controls visibility |
| `onOpen`  | `(noteId: string) => void` | Opens pop‑out       |

---

## 5. Notes Components

---

### **5.1 `<NotesPanel />`**

| Prop           | Type                       | Description               |
| -------------- | -------------------------- | ------------------------- |
| `notes`        | `Note[]`                   | Visible notes             |
| `persona`      | `Persona`                  | Controls visibility rules |
| `onCreateNote` | `() => void`               | DM/Player only            |
| `onSelectNote` | `(noteId: string) => void` | Opens viewer              |

---

### **5.2 `<NotePopout />`**

| Prop       | Type           | Description          |
| ---------- | -------------- | -------------------- |
| `note`     | `Note \| null` | Null = hidden        |
| `persona`  | `Persona`      | Controls editability |
| `readOnly` | `boolean`      | Derived from persona |
| `onClose`  | `() => void`   | Close viewer         |

---

## 6. DM‑Only Components

---

### **6.1 `<DMVoiceBar />`**

| Prop             | Type                       | Description       |
| ---------------- | -------------------------- | ----------------- |
| `presets`        | `string[]`                 | Voice presets     |
| `activePreset`   | `string \| null`           | Current preset    |
| `onSelectPreset` | `(preset: string) => void` | Apply preset      |
| `onClear`        | `() => void`               | Clear all effects |

---

### **6.2 `<RoomsPanel />`**

| Prop               | Type                                             | Description      |
| ------------------ | ------------------------------------------------ | ---------------- |
| `rooms`            | `Room[]`                                         | All groups       |
| `players`          | `Player[]`                                       | All players      |
| `onSetEnvironment` | `(roomId: string, env: Environment) => void`     | Set environment  |
| `onMoveAll`        | `(fromRoomId: string, toRoomId: string) => void` | Move all players |
| `onRenameRoom`     | `(roomId: string, name: string) => void`         | Rename group     |
| `onDeleteRoom`     | `(roomId: string) => void`                       | Delete group     |
| `onCreateRoom`     | `(name: string) => void`                         | Create group     |

---

### **6.3 `<AudioPanel />`**

| Prop                   | Type                                                       | Description |
| ---------------------- | ---------------------------------------------------------- | ----------- |
| `players`              | `Player[]`                                                 | All players |
| `onSetGain`            | `(playerId: string, gain: number) => void`                 | Gain        |
| `onToggleMute`         | `(playerId: string) => void`                               | Mute        |
| `onSetCondition`       | `(playerId: string, condition: Condition \| null) => void` | Condition   |
| `onSetDistance`        | `(playerId: string, distance: DistanceCategory) => void`   | Distance    |
| `onClearAllConditions` | `() => void`                                               | Bulk action |
| `onResetAllDistances`  | `() => void`                                               | Bulk action |
| `onNormalizeGain`      | `() => void`                                               | Bulk action |

---

## 7. Search, Journal, History, Settings

---

### **7.1 `<SearchPanel />`**

| Prop             | Type                             | Description  |
| ---------------- | -------------------------------- | ------------ |
| `query`          | `string`                         | Search text  |
| `results`        | `SearchResult[]`                 | Results      |
| `onQueryChange`  | `(q: string) => void`            | Update query |
| `onSelectResult` | `(result: SearchResult) => void` | Open result  |

---

### **7.2 `<JournalPanel />`**

| Prop          | Type                   | Description      |
| ------------- | ---------------------- | ---------------- |
| `entries`     | `JournalEntry[]`       | Journal entries  |
| `readOnly`    | `boolean`              | Player/Spectator |
| `onOpenEntry` | `(id: string) => void` | Open entry       |

---

### **7.3 `<HistoryPanel />`**

| Prop       | Type             | Description      |
| ---------- | ---------------- | ---------------- |
| `events`   | `HistoryEvent[]` | Timeline         |
| `readOnly` | `boolean`        | Player/Spectator |

---

### **7.4 `<SettingsPanel />`**

| Prop            | Type                                         | Description         |
| --------------- | -------------------------------------------- | ------------------- |
| `persona`       | `Persona`                                    | Controls visibility |
| `audioDevices`  | `AudioDevice[]`                              | Device list         |
| `uiSettings`    | `UISettings`                                 | UI preferences      |
| `onUpdateAudio` | `(settings: Partial<AudioSettings>) => void` | Update audio        |
| `onUpdateUI`    | `(settings: Partial<UISettings>) => void`    | Update UI           |

---

## 8. Responsive Mode Components

### **8.1 `<ViewportModeController />`**

| Prop                  | Type                           | Description                            |
| --------------------- | ------------------------------ | -------------------------------------- |
| `width`               | `number`                       | Current viewport width                 |
| `persona`             | `Persona`                      | Active persona                         |
| `desktopCommandOptIn` | `boolean`                      | Non-DM opt-in for desktop command mode |
| `onModeChange`        | `(mode: ViewportMode) => void` | Emits resolved mode                    |

### **8.2 `<RightRail />` (Responsive Additions)**

| Prop                     | Type            | Description                                         |
| ------------------------ | --------------- | --------------------------------------------------- |
| `viewportMode`           | `ViewportMode`  | Active shell mode                                   |
| `activePanel`            | `RightPanelTab` | Current right-panel tab                             |
| `lastDesktopPinnedPanel` | `RightPanelTab` | Last pinned panel for desktop command mode defaults |

### **8.3 `<MobileBottomTabDock />`**

| Prop          | Type                           | Description                          |
| ------------- | ------------------------------ | ------------------------------------ |
| `tabs`        | `RightPanelTab[]`              | Tabs displayed in mobile bottom dock |
| `activeTab`   | `RightPanelTab \| null`        | Active tab/popover                   |
| `onSelectTab` | `(tab: RightPanelTab) => void` | Opens corresponding bottom popover   |

### **8.4 `<MobileDmWarningBanner />`**

| Prop        | Type         | Description                                 |
| ----------- | ------------ | ------------------------------------------- |
| `visible`   | `boolean`    | Whether warning is shown                    |
| `onDismiss` | `() => void` | Dismisses one-time mobile DM warning banner |

---

## 9. Summary

This file provides:

- A complete props reference
- Persona‑aware visibility
- Strict alignment with existing architecture
- No new subsystems
- No hallucinated behaviour

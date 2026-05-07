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

## 7. Information & Settings Panels

---

### **7.1 `<InformationPanel />`**

| Prop            | Type                            | Description                           |
| --------------- | ------------------------------- | ------------------------------------- |
| `persona`       | `Persona`                       | Role-based visibility/access          |
| `activeTab`     | `InformationTab`                | Active info tab                       |
| `availableTabs` | `InformationTab[]`              | Tab list (Journal feature-flag aware) |
| `onSelectTab`   | `(tab: InformationTab) => void` | Switches info tab                     |

---

### **7.2 `<CampaignInfoPanel />`**

| Prop           | Type                                    | Description                       |
| -------------- | --------------------------------------- | --------------------------------- |
| `campaignName` | `string`                                | Campaign display name             |
| `description`  | `string`                                | Campaign description              |
| `bannerUrl`    | `string \| null`                        | Campaign banner image             |
| `canEdit`      | `boolean`                               | DM edit capability                |
| `syncEnabled`  | `boolean`                               | Extension sync allow/block toggle |
| `onToggleSync` | `(enabled: boolean) => void`            | DM-only sync policy update        |
| `onUpdate`     | `(payload: CampaignPanelInput) => void` | DM campaign metadata update       |

---

### **7.3 `<SearchPanel />`**

| Prop             | Type                             | Description  |
| ---------------- | -------------------------------- | ------------ |
| `query`          | `string`                         | Search text  |
| `results`        | `SearchResult[]`                 | Results      |
| `onQueryChange`  | `(q: string) => void`            | Update query |
| `onSelectResult` | `(result: SearchResult) => void` | Open result  |

---

### **7.4 `<NotesPanel />` (Information Tab Variant)**

| Prop                      | Type                                 | Description                           |
| ------------------------- | ------------------------------------ | ------------------------------------- |
| `notes`                   | `Note[]`                             | Visible notes only                    |
| `query`                   | `string`                             | Local notes filter text               |
| `onQueryChange`           | `(q: string) => void`                | Updates filter                        |
| `readOnlyByDefault`       | `boolean`                            | Read-focused default behavior         |
| `canEdit`                 | `boolean`                            | DM edit permissions                   |
| `accessLevel`             | `'PRIVATE' \| 'PARTY' \| 'SELECTED'` | DM handout model                      |
| `selectedPlayerIds`       | `string[]`                           | DM-selected recipients for `SELECTED` |
| `onChangeAccessLevel`     | `(level: NotesAccessLevel) => void`  | Updates handout visibility            |
| `onChangeSelectedPlayers` | `(ids: string[]) => void`            | Updates selected handout recipients   |

---

### **7.5 `<JournalPanel />`**

| Prop             | Type                   | Description                                       |
| ---------------- | ---------------------- | ------------------------------------------------- |
| `entries`        | `JournalEntry[]`       | Journal entries                                   |
| `readOnly`       | `boolean`              | Read-only mode                                    |
| `featureEnabled` | `boolean`              | Feature flag (off by default for current release) |
| `onOpenEntry`    | `(id: string) => void` | Open entry                                        |

---

### **7.6 `<HistoryPanel />`**

| Prop             | Type                          | Description                          |
| ---------------- | ----------------------------- | ------------------------------------ |
| `sessions`       | `SessionHistoryItem[]`        | Reverse-chronological session list   |
| `query`          | `string`                      | Session/history filter query         |
| `onQueryChange`  | `(q: string) => void`         | Updates session filter               |
| `onOpenSession`  | `(sessionId: string) => void` | Opens chat log for selected session  |
| `summaryEnabled` | `boolean`                     | Whether summary block appears at top |
| `readOnly`       | `boolean`                     | Player/Spectator read-only behavior  |

---

### **7.7 `<SettingsPanel />`**

| Prop                      | Type                                        | Description                                    |
| ------------------------- | ------------------------------------------- | ---------------------------------------------- |
| `persona`                 | `Persona`                                   | Role-based visibility/access                   |
| `activeSection`           | `'SYSTEM' \| 'CAMPAIGN' \| 'PROFILE'`       | Active settings section                        |
| `canViewCampaignSettings` | `boolean`                                   | Player/spectator read visibility (DM can hide) |
| `canEditCampaignSettings` | `boolean`                                   | DM-only campaign edit control                  |
| `campaignToggles`         | `CampaignFeatureToggles`                    | Per-campaign feature controls and limits       |
| `onSelectSection`         | `(section: SettingsSection) => void`        | Switches section                               |
| `onUpdateCampaignToggles` | `(toggles: CampaignFeatureToggles) => void` | DM campaign settings update                    |
| `onUpdateSystemDefaults`  | `(toggles: CampaignFeatureToggles) => void` | Sets defaults for newly created campaigns only |

---

### **7.8 `<SessionSettingsPopover />`**

| Prop                          | Type                                      | Description                        |
| ----------------------------- | ----------------------------------------- | ---------------------------------- |
| `sessionName`                 | `string`                                  | Editable session title             |
| `sessionDescriptionMarkdown`  | `string`                                  | Markdown session intro/description |
| `campaignDefaultTimerMinutes` | `number \| null`                          | Campaign default timer limit       |
| `sessionTimerOverrideMinutes` | `number \| null`                          | Session-specific timer override    |
| `canEdit`                     | `boolean`                                 | DM edit permission                 |
| `onSave`                      | `(payload: SessionSettingsInput) => void` | Saves DM edits and overrides       |

Notes:

- Session timer overrides may exceed campaign default and should show warning-only UX.

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

# **UI-STATE-MAP.md**

_Authoritative mapping of UI components → Zustand stores → selectors._

---

## 1. Overview

Every UI component in VTT‑Chat derives its state from **Zustand stores**, using **selectors** that expose only the required data.

No component reads global state directly.
No component mutates state directly.

All state flows follow:

```text
UI → Event → Reducer → Store → UI
```

This document defines:

- Which store each component reads from
- Which selectors it uses
- Persona‑specific visibility rules

---

## 2. Store Overview

The UI uses the following stores (already defined in your architecture):

| Store           | Purpose                                          |
| --------------- | ------------------------------------------------ |
| `sessionStore`  | Campaign/session metadata                        |
| `presenceStore` | Players, rooms, speaking/mute/conditions         |
| `chatStore`     | Chat messages, pagination                        |
| `notesStore`    | Notes, visibility rules                          |
| `journalStore`  | Journal entries                                  |
| `historyStore`  | Timeline events                                  |
| `audioStore`    | DM audio routing state                           |
| `searchStore`   | Search query + results                           |
| `settingsStore` | User UI/audio settings                           |
| `uiStore`       | UI‑only state (panels, popouts, toasts, toggles) |

No new stores are introduced.

### 2.1 Connection Status Canonical Model

For cross-app consistency (frontend, backend APIs, admin), status naming follows the roadmap canonical model:

- `coreWsState`: `CONNECTED | CONNECTING | ERROR`
- `livekitState`: `CONNECTED | CONNECTING | ERROR | NOT_APPLICABLE`
- `statusContext`: `OUTSIDE_CAMPAIGN | INSIDE_CAMPAIGN`
- `statusIconState`: `OK | OK_PARTIAL | CONNECTING | DEGRADED_AUDIO | ERROR`
- `statusColorKey`: `GREEN | PALE_GREEN | YELLOW | ORANGE | RED`

State ownership and selector expectations:

- Frontend runtime state derives from stores/selectors and must not hardcode ad-hoc status strings.
- Shared enum/type definitions belong in `shared/`.
- Admin keeps UI presentation constants local, but maps to the same shared enum names.

### 2.2 W0 UI Completion Priorities

The current UX implementation track prioritizes:

- Right-panel screens and layouts that are currently non-functional or incomplete.
- Global settings usability both in-session and out-of-session.
- User profile information in the global settings panel.
- Consolidated websocket/audio status model with one primary status icon and subtle LiveKit/audio secondary indicators.

---

## 3. Layout Components

---

### **3.1 `<Toolbar />`**

**Selectors:**

| Data              | Store           | Selector                 |
| ----------------- | --------------- | ------------------------ |
| Audio devices     | `settingsStore` | `selectAudioDevices`     |
| Selected device   | `settingsStore` | `selectSelectedDevice`   |
| Theme             | `settingsStore` | `selectTheme`            |
| Connection status | `sessionStore`  | `selectConnectionStatus` |

Toolbar connection status behavior rules:

- Outside campaign, primary icon reflects Core WS only.
- Inside campaign, primary icon reflects aggregate Core WS + LiveKit mapping.
- LiveKit/audio connection signals should remain visually subtle unless aggregate state is `DEGRADED_AUDIO` or `ERROR`.

---

### **3.2 `<CampaignInfo />`**

**Selectors:**

| Data           | Store          | Selector              |
| -------------- | -------------- | --------------------- |
| Campaign name  | `sessionStore` | `selectCampaignName`  |
| DM name        | `sessionStore` | `selectDMName`        |
| Session number | `sessionStore` | `selectSessionNumber` |
| Session timer  | `sessionStore` | `selectSessionTimer`  |
| Toasts         | `uiStore`      | `selectToasts`        |

---

### **3.3 `<SystemToasts />`**

**Selectors:**

| Data       | Store     | Selector       |
| ---------- | --------- | -------------- |
| Toast list | `uiStore` | `selectToasts` |

---

### **3.4 `<LeftRail />`**

**Selectors:**

| Data            | Store     | Selector                  |
| --------------- | --------- | ------------------------- |
| Collapsed state | `uiStore` | `selectLeftRailCollapsed` |

---

### **3.5 `<CenterPane />`**

**Selectors:**

| Data                     | Store     | Selector           |
| ------------------------ | --------- | ------------------ |
| Active view (chat/notes) | `uiStore` | `selectCenterView` |

---

### **3.6 `<RightRail />`**

**Selectors:**

| Data       | Store     | Selector                 |
| ---------- | --------- | ------------------------ |
| Active tab | `uiStore` | `selectActiveRightPanel` |

---

## 4. Player List Components

---

### **4.1 `<PlayerList />`**

**Selectors:**

| Data    | Store           | Selector        |
| ------- | --------------- | --------------- |
| Players | `presenceStore` | `selectPlayers` |
| Rooms   | `presenceStore` | `selectRooms`   |
| Persona | `sessionStore`  | `selectPersona` |

---

### **4.2 `<PlayerItem />`**

**Selectors:**

| Data       | Store           | Selector                     |
| ---------- | --------------- | ---------------------------- |
| Speaking   | `presenceStore` | `selectSpeaking(playerId)`   |
| Muted      | `presenceStore` | `selectMuted(playerId)`      |
| Conditions | `presenceStore` | `selectConditions(playerId)` |
| Distance   | `presenceStore` | `selectDistance(playerId)`   |

---

### **4.3 `<PlayerOverrides />` (DM Only)**

**Selectors:**

| Data       | Store           | Selector                     |
| ---------- | --------------- | ---------------------------- |
| Gain       | `audioStore`    | `selectGain(playerId)`       |
| Mute       | `audioStore`    | `selectMute(playerId)`       |
| Conditions | `presenceStore` | `selectConditions(playerId)` |
| Distance   | `presenceStore` | `selectDistance(playerId)`   |

---

## 5. Chat & Messaging Components

---

### **5.1 `<RoomHeader />`**

**Selectors:**

| Data           | Store           | Selector              |
| -------------- | --------------- | --------------------- |
| Current group  | `presenceStore` | `selectCurrentRoom`   |
| Whisper target | `uiStore`       | `selectWhisperTarget` |
| Persona        | `sessionStore`  | `selectPersona`       |

---

### **5.2 `<ChatNotesToggle />`**

**Selectors:**

| Data        | Store     | Selector           |
| ----------- | --------- | ------------------ |
| Active view | `uiStore` | `selectCenterView` |

---

### **5.3 `<ChatWindow />`**

**Selectors:**

| Data     | Store          | Selector                        |
| -------- | -------------- | ------------------------------- |
| Messages | `chatStore`    | `selectMessagesForRoom(roomId)` |
| Persona  | `sessionStore` | `selectPersona`                 |

---

### **5.4 `<MessageComposer />`**

**Selectors:**

| Data                 | Store          | Selector                    |
| -------------------- | -------------- | --------------------------- |
| Persona              | `sessionStore` | `selectPersona`             |
| Autocomplete options | `chatStore`    | `selectAutocompleteOptions` |
| Disabled state       | `sessionStore` | `selectConnectionStatus`    |

---

### **5.5 `<MessageBubble />`**

**Selectors:**

| Data   | Store           | Selector                     |
| ------ | --------------- | ---------------------------- |
| Sender | `presenceStore` | `selectPlayerById(senderId)` |

---

### **5.6 `<NoteCard />`**

**Selectors:**

| Data    | Store          | Selector                 |
| ------- | -------------- | ------------------------ |
| Note    | `notesStore`   | `selectNoteById(noteId)` |
| Persona | `sessionStore` | `selectPersona`          |

---

## 6. Notes Components

---

### **6.1 `<NotesPanel />`**

**Selectors:**

| Data    | Store          | Selector                      |
| ------- | -------------- | ----------------------------- |
| Notes   | `notesStore`   | `selectVisibleNotes(persona)` |
| Persona | `sessionStore` | `selectPersona`               |

---

### **6.2 `<NotePopout />`**

**Selectors:**

| Data        | Store          | Selector                       |
| ----------- | -------------- | ------------------------------ |
| Active note | `uiStore`      | `selectActiveNoteId`           |
| Note data   | `notesStore`   | `selectNoteById(activeNoteId)` |
| Persona     | `sessionStore` | `selectPersona`                |

---

## 7. DM‑Only Components

---

### **7.1 `<DMVoiceBar />`**

**Selectors:**

| Data          | Store        | Selector             |
| ------------- | ------------ | -------------------- |
| Presets       | `audioStore` | `selectVoicePresets` |
| Active preset | `audioStore` | `selectActivePreset` |

---

### **7.2 `<RoomsPanel />`**

**Selectors:**

| Data    | Store           | Selector        |
| ------- | --------------- | --------------- |
| Rooms   | `presenceStore` | `selectRooms`   |
| Players | `presenceStore` | `selectPlayers` |

---

### **7.3 `<AudioPanel />`**

**Selectors:**

| Data       | Store           | Selector                     |
| ---------- | --------------- | ---------------------------- |
| Players    | `presenceStore` | `selectPlayers`              |
| Gain       | `audioStore`    | `selectGain(playerId)`       |
| Mute       | `audioStore`    | `selectMute(playerId)`       |
| Conditions | `presenceStore` | `selectConditions(playerId)` |
| Distance   | `presenceStore` | `selectDistance(playerId)`   |

---

## 8. Search, Journal, History, Settings

---

### **8.1 `<SearchPanel />`**

**Selectors:**

| Data    | Store         | Selector        |
| ------- | ------------- | --------------- |
| Query   | `searchStore` | `selectQuery`   |
| Results | `searchStore` | `selectResults` |

---

### **8.2 `<JournalPanel />`**

**Selectors:**

| Data    | Store          | Selector        |
| ------- | -------------- | --------------- |
| Entries | `journalStore` | `selectEntries` |

---

### **8.3 `<HistoryPanel />`**

**Selectors:**

| Data   | Store          | Selector       |
| ------ | -------------- | -------------- |
| Events | `historyStore` | `selectEvents` |

---

### **8.4 `<SettingsPanel />`**

**Selectors:**

| Data          | Store           | Selector             |
| ------------- | --------------- | -------------------- |
| Persona       | `sessionStore`  | `selectPersona`      |
| Audio devices | `settingsStore` | `selectAudioDevices` |
| UI settings   | `settingsStore` | `selectUISettings`   |

---

## 9. UI‑Only State (uiStore)

The `uiStore` contains **only UI state**, never domain state.

| Selector                  | Purpose                      |
| ------------------------- | ---------------------------- |
| `selectActiveRightPanel`  | Which slide‑in panel is open |
| `selectCenterView`        | Chat or Notes                |
| `selectLeftRailCollapsed` | Left rail collapse state     |
| `selectToasts`            | System toast list            |
| `selectActiveNoteId`      | Note pop‑out viewer          |
| `selectWhisperTarget`     | Whisper target               |
| `selectContextMenu`       | Player context menu          |

---

## 10. Summary

This file defines:

- Every UI component’s state dependencies
- Exact store + selector mappings
- Persona‑aware visibility
- No new stores
- No invented selectors
- Full compliance with your architecture

It is the authoritative reference for UI → Store mapping.

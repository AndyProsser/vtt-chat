# **UI-EVENTS.md**

_Authoritative mapping of UI interactions → events → reducers in VTT‑Chat._

---

## 🧭 1. Overview

All UI interactions in VTT‑Chat follow the same pipeline:

```text
UI → Event → Reducer → Store → UI
```

Note: This document describes UI-layer interaction events (for component and reducer intent).
Canonical transport contracts live in [EVENT-BUS.md](../architecture/EVENT-BUS.md) and
[CONTRACTS.md](../CONTRACTS.md).

This document defines:

- UI‑originating events
- Their payloads
- Which reducers handle them
- Persona‑specific constraints

No component mutates state directly.

---

## 🧱 2. Event Categories

UI events fall into these categories:

1. **Chat Events**
2. **Notes Events**
3. **Player List Events**
4. **Room Events**
5. **Audio Events (DM Only)**
6. **Search Events**
7. **Journal Events**
8. **History Events**
9. **Settings Events**
10. **Toast Events**
11. **UI View Events** (toggles, panel open/close)

Each section below lists the events and reducer mappings.

---

## 💬 3. Chat Events

---

### **3.1 `chat/sendMessage`**

**Triggered by:**
`<MessageComposer />`

**Payload:**

```ts
{
  text: string
  whisperTargetId?: string | null
}
```

**Handled by Reducer:**
`chatReducer.sendMessage`

**Persona Rules:**

- DM: allowed
- Player: allowed
- Spectator: never triggers

---

### **3.2 `chat/loadOlderMessages`**

**Triggered by:**
`<ChatWindow onScrollTop />`

**Payload:**

```ts
{
  roomId: string
  beforeTimestamp: number
}
```

**Handled by Reducer:**
`chatReducer.loadOlderMessages`

---

## 📝 4. Notes Events

---

### **4.1 `notes/create`**

**Triggered by:**
`<NotesPanel onCreateNote />`

**Payload:**

```ts
{
  title: string
  content: string
  visibility: NoteVisibility
}
```

**Reducer:**
`notesReducer.create`

**Persona Rules:**

- DM: allowed
- Player: allowed
- Spectator: never

---

### **4.2 `notes/update`**

**Triggered by:**
`<NotePopout />` (DM or Player if allowed)

**Payload:**

```ts
{
  noteId: string
  content: string
  title?: string
  visibility?: NoteVisibility
}
```

**Reducer:**
`notesReducer.update`

---

### **4.3 `notes/publishToChat`**

**Triggered by:**
`<MessageComposer />` → “Publish Note”

**Payload:**

```ts
{
  noteId: string
}
```

**Reducer:**
`chatReducer.publishNote`

---

### **4.4 `notes/openPopout`**

**Triggered by:**
`<NoteCard onOpen />` or `<NotesPanel onSelectNote />`

**Payload:**

```ts
{
  noteId: string
}
```

**Reducer:**
`uiReducer.openNotePopout`

---

### **4.5 `notes/closePopout`**

**Triggered by:**
`<NotePopout onClose />`

**Reducer:**
`uiReducer.closeNotePopout`

---

## 👥 5. Player List Events

---

### **5.1 `players/rightClick`**

**Triggered by:**
`<PlayerItem onRightClick />`

**Payload:**

```ts
{
  playerId: string
  position: {
    x: number
    y: number
  }
}
```

**Reducer:**
`uiReducer.openContextMenu`

---

### **5.2 `players/dragStart`** (DM Only)

**Triggered by:**
`<PlayerList onPlayerDrag />`

**Payload:**

```ts
{
  playerId: string
}
```

**Reducer:**
`uiReducer.startDrag`

---

### **5.3 `players/dragDrop`** (DM Only)

**Triggered by:**
`<PlayerList onPlayerDrop />`

**Payload:**

```ts
{
  playerId: string
  roomId: string
}
```

**Reducer:**
`roomsReducer.movePlayer`

---

## 🏠 6. Room Events (DM Only)

---

### **6.1 `rooms/create`**

**Triggered by:**
`<RoomsPanel onCreateRoom />`

**Payload:**

```ts
{
  name: string
}
```

**Reducer:**
`roomsReducer.create`

---

### **6.2 `rooms/delete`**

**Triggered by:**
`<RoomsPanel onDeleteRoom />`

**Payload:**

```ts
{
  roomId: string
}
```

**Reducer:**
`roomsReducer.delete`

---

### **6.3 `rooms/rename`**

**Triggered by:**
`<RoomsPanel onRenameRoom />`

**Payload:**

```ts
{
  roomId: string
  name: string
}
```

**Reducer:**
`roomsReducer.rename`

---

### **6.4 `rooms/setEnvironment`**

**Triggered by:**
`<RoomsPanel onSetEnvironment />`

**Payload:**

```ts
{
  roomId: string
  environment: Environment
}
```

**Reducer:**
`roomsReducer.setEnvironment`

---

## 🎙️ 7. Audio Events (DM Only)

---

### **7.1 `audio/setGain`**

**Triggered by:**
`<PlayerOverrides />` or `<AudioPanel />`

**Payload:**

```ts
{
  playerId: string
  gain: number
}
```

**Reducer:**
`audioReducer.setGain`

---

### **7.2 `audio/toggleMute`**

**Triggered by:**
`<PlayerOverrides />` or `<AudioPanel />`

**Payload:**

```ts
{
  playerId: string
}
```

**Reducer:**
`audioReducer.toggleMute`

---

### **7.3 `audio/setCondition`**

**Payload:**

```ts
{
  playerId: string
  condition: Condition | null
}
```

**Reducer:**
`audioReducer.setCondition`

---

### **7.4 `audio/setDistance`**

**Payload:**

```ts
{
  playerId: string
  distance: DistanceCategory
}
```

**Reducer:**
`audioReducer.setDistance`

---

### **7.5 Bulk Actions**

| Event                      | Reducer                           |
| -------------------------- | --------------------------------- |
| `audio/clearAllConditions` | `audioReducer.clearAllConditions` |
| `audio/resetAllDistances`  | `audioReducer.resetAllDistances`  |
| `audio/normalizeGain`      | `audioReducer.normalizeGain`      |

---

## 🔍 8. Search Events

---

### **8.1 `search/queryChange`**

**Triggered by:**
`<SearchPanel onQueryChange />`

**Payload:**

```ts
{
  query: string
}
```

**Reducer:**
`searchReducer.setQuery`

---

### **8.2 `search/selectResult`**

**Triggered by:**
`<SearchPanel onSelectResult />`

**Payload:**

```ts
{
  result: SearchResult
}
```

**Reducer:**
`uiReducer.openSearchResult`

---

## 📚 9. Journal Events

---

### **9.1 `journal/openEntry`**

**Triggered by:**
`<JournalPanel onOpenEntry />`

**Payload:**

```ts
{
  entryId: string
}
```

**Reducer:**
`uiReducer.openJournalEntry`

---

## 🕒 10. History Events

History is read‑only for Player/Spectator.

No UI‑originating events.

---

## ⚙️ 11. Settings Events

---

### **11.1 `settings/updateAudio`**

**Triggered by:**
`<SettingsPanel onUpdateAudio />`

**Payload:**

```ts
Partial<AudioSettings>
```

**Reducer:**
`settingsReducer.updateAudio`

---

### **11.2 `settings/updateUI`**

**Triggered by:**
`<SettingsPanel onUpdateUI />`

**Payload:**

```ts
Partial<UISettings>
```

**Reducer:**
`settingsReducer.updateUI`

---

## 🔔 12. Toast Events

---

### **12.1 `toast/dismiss`**

**Triggered by:**
`<SystemToasts onDismiss />`

**Payload:**

```ts
{
  toastId: string
}
```

**Reducer:**
`uiReducer.dismissToast`

---

## 🧭 13. UI View Events

---

### **13.1 `ui/toggleChatNotes`**

**Triggered by:**
`<ChatNotesToggle onChange />`

**Payload:**

```ts
{
  view: 'chat' | 'notes'
}
```

**Reducer:**
`uiReducer.setCenterView`

---

### **13.2 `ui/openPanel`**

**Triggered by:**
`<RightTabBar onTabSelect />`

**Payload:**

```ts
{
  tab: RightPanelTab
}
```

**Reducer:**
`uiReducer.openPanel`

---

### **13.3 `ui/closePanel`**

**Triggered by:**
`<SlideInPanels onClose />`

**Reducer:**
`uiReducer.closePanel`

---

## ✔ 14. Summary

This file defines:

- Every UI‑originating event
- Payloads
- Reducer mappings
- Persona constraints
- No new behaviour
- No undocumented subsystems

It is the authoritative reference for UI → Event → Reducer flow.

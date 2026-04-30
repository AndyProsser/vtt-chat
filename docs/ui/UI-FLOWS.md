# **UI-FLOWS.md**

_Authoritative interaction flows for all personas in VTT‑Chat._

---

## 🧭 1. Overview

This document defines **moment‑to‑moment UI interaction flows** for:

- DM
- Player
- Spectator

Each flow shows:

1. **User Action (UI)**
2. **Event Emitted**
3. **Reducer Handling**
4. **Store Update**
5. **UI Reaction**

All flows follow:

```text
UI → Event → Reducer → Store → UI
```

No flow violates persona boundaries or privacy rules.

---

## 🎭 2. DM Interaction Flows

DM has the most complete set of flows.

---

### **2.1 DM Moves a Player Between Rooms**

**UI Action:**
DM drags a player from one room group to another.

**Flow:**

1. `<PlayerList onPlayerDrag>`
   → `players/dragStart`
2. `<PlayerList onPlayerDrop>`
   → `players/dragDrop`
3. Reducer: `roomsReducer.movePlayer`
4. Store updates:
   - `presenceStore.rooms`
   - `presenceStore.players[playerId].roomId`
5. UI updates:
   - Player animates into new room group
   - Chat window updates if DM is monitoring that room

---

### **2.2 DM Publishes a Note to Chat**

**UI Action:**
DM clicks “Publish Note” in `<MessageComposer />`.

**Flow:**

1. `notes/publishToChat`
2. Reducer: `chatReducer.publishNote`
3. Store updates:
   - New `ChatMessage` of type `'note'`
4. UI updates:
   - `<NoteCard />` appears in chat
   - Note card animates in (160ms accent pulse)

---

### **2.3 DM Opens a Note in Pop‑Out Viewer**

**UI Action:**
DM clicks “Open Note” on a note card.

**Flow:**

1. `notes/openPopout`
2. Reducer: `uiReducer.openNotePopout`
3. Store updates:
   - `uiStore.activeNoteId = noteId`
4. UI updates:
   - `<NotePopout />` slides in from right

---

### **2.4 DM Applies an Audio Condition**

**UI Action:**
DM selects a condition from `<PlayerOverrides />`.

**Flow:**

1. `audio/setCondition`
2. Reducer: `audioReducer.setCondition`
3. Store updates:
   - `audioStore.conditions[playerId] = condition`
4. UI updates:
   - Condition icon updates
   - Player item pulses (micro‑interaction)

---

### **2.5 DM Creates a New Room**

**UI Action:**
DM clicks “+ Create Room”.

**Flow:**

1. `rooms/create`
2. Reducer: `roomsReducer.create`
3. Store updates:
   - New room added to `presenceStore.rooms`
4. UI updates:
   - Room appears in `<RoomsPanel />`
   - Left panel updates grouping

---

### **2.6 DM Clears All Audio Effects**

**UI Action:**
DM clicks “Clear All” in `<DMVoiceBar />`.

**Flow:**

1. `audio/clearAllConditions`
2. Reducer: `audioReducer.clearAllConditions`
3. Store updates:
   - All conditions removed
4. UI updates:
   - Red flash animation
   - All condition icons disappear

---

## 🎮 3. Player Interaction Flows

Players have a focused, minimal set of flows.

---

### **3.1 Player Sends a Chat Message**

**UI Action:**
Player types and presses Enter.

**Flow:**

1. `chat/sendMessage`
2. Reducer: `chatReducer.sendMessage`
3. Store updates:
   - New chat message added
4. UI updates:
   - Message animates in
   - Composer clears

---

### **3.2 Player Switches Between Chat and Notes**

**UI Action:**
Player clicks `[Chat ▼]` or `[Notes]`.

**Flow:**

1. `ui/toggleChatNotes`
2. Reducer: `uiReducer.setCenterView`
3. Store updates:
   - `uiStore.centerView = 'chat' | 'notes'`
4. UI updates:
   - Center pane switches
   - Slide/fade animation

---

### **3.3 Player Opens a Note in Pop‑Out Viewer**

**UI Action:**
Player clicks “Open Note”.

**Flow:**

1. `notes/openPopout`
2. Reducer: `uiReducer.openNotePopout`
3. Store updates:
   - `uiStore.activeNoteId = noteId`
4. UI updates:
   - `<NotePopout />` slides in

---

### **3.4 Player Toggles IC Mode**

**UI Action:**
Player toggles IC in composer.

**Flow:**

1. `settings/updateAudio`
2. Reducer: `settingsReducer.updateAudio`
3. Store updates:
   - `settingsStore.audio.icMode = boolean`
4. UI updates:
   - IC indicator updates

---

## 👁️ 4. Spectator Interaction Flows

Spectators are read‑only.

---

### **4.1 Spectator Switches Between Chat and Notes**

**UI Action:**
Spectator clicks `[Chat ▼]` or `[Notes]`.

**Flow:**

1. `ui/toggleChatNotes`
2. Reducer: `uiReducer.setCenterView`
3. Store updates:
   - `uiStore.centerView = 'chat' | 'notes'`
4. UI updates:
   - Center pane switches

---

### **4.2 Spectator Opens a Global Note**

**UI Action:**
Spectator clicks “Open Note”.

**Flow:**

1. `notes/openPopout`
2. Reducer: `uiReducer.openNotePopout`
3. Store updates:
   - `uiStore.activeNoteId = noteId`
4. UI updates:
   - `<NotePopout readOnly />` slides in

---

## 🔔 5. System Toast Flows

---

### **5.1 Toast Auto‑Dismiss**

**Triggered by:**
Timer in UI layer.

**Flow:**

1. `toast/dismiss`
2. Reducer: `uiReducer.dismissToast`
3. Store updates:
   - Toast removed
4. UI updates:
   - Toast animates out

---

### **5.2 Toast Manual Dismiss**

**UI Action:**
User clicks ×.

**Flow:**
Same as above.

---

## 🧭 6. Right Panel Flows (Tabs + Panels)

---

### **6.1 User Opens a Right‑Panel Tab**

**UI Action:**
User clicks a tab.

**Flow:**

1. `ui/openPanel`
2. Reducer: `uiReducer.openPanel`
3. Store updates:
   - `uiStore.activeRightPanel = tab`
4. UI updates:
   - Slide‑in panel animates in
   - Chat shifts left

---

### **6.2 User Closes a Right‑Panel Panel**

**UI Action:**
User clicks close button.

**Flow:**

1. `ui/closePanel`
2. Reducer: `uiReducer.closePanel`
3. Store updates:
   - `uiStore.activeRightPanel = null`
4. UI updates:
   - Panel slides out
   - Chat shifts back

---

## 🧠 7. Whisper Flows (DM + Player)

---

### **7.1 Player Selects Whisper Target**

**UI Action:**
Player selects whisper target in composer.

**Flow:**

1. `ui/setWhisperTarget`
2. Reducer: `uiReducer.setWhisperTarget`
3. Store updates:
   - `uiStore.whisperTarget = playerId`
4. UI updates:
   - Whisper badge appears

---

### **7.2 Player Sends Whisper**

**UI Action:**
Player sends message with whisper target.

**Flow:**

1. `chat/sendMessage` (with whisperTargetId)
2. Reducer: `chatReducer.sendMessage`
3. Store updates:
   - Whisper message added
4. UI updates:
   - Whisper appears only to sender + target + DM

---

## ✔ 8. Summary

This document defines:

- All persona‑specific UI flows
- Event → Reducer → Store → UI mapping
- No new behaviour
- No invented subsystems
- Full compliance with your architecture

It is the authoritative reference for UI interaction behaviour.

# **UI-STATE-RECOVERY.md**

_Authoritative specification for UI state recovery in VTT‑Chat._

---

## 🧭 1. Overview

VTT‑Chat uses a **backend‑authoritative**, **deterministic**, **atomic** state recovery model.

The UI must:

- Recover instantly after reconnect
- Never show stale or partial state
- Never leak private or DM‑only data
- Never guess or infer missing state
- Never mutate domain state locally
- Always defer to the backend snapshot

All UI recovery flows follow:

```text
Transport reconnects →
Backend sends full snapshot →
Client applies snapshot atomically →
UI re-renders from stores →
UI restores UI-only state
```

This document defines:

- What state is recovered
- How UI-only state is restored
- Persona‑specific recovery rules
- Error handling during recovery
- Motion/UX rules during recovery

---

## 🧱 2. Recovery Model Summary

Recovery is split into two layers:

### **2.1 Domain State (Authoritative)**

Recovered from backend snapshot:

- Players
- Rooms
- Presence
- Chat history (windowed)
- Notes
- Journal
- History
- Audio routing state
- Session metadata

This is applied **atomically** via reducers.

### **2.2 UI State (Local Only)**

Recovered from `uiStore`:

- Active right‑panel tab
- Chat/Notes toggle
- Left rail collapsed state
- Whisper target
- Active note pop‑out
- Toasts
- Context menu state

UI state is **never** included in backend snapshots.

---

## 🧩 3. Recovery Triggers

Recovery is triggered by:

### **3.1 WebSocket reconnect**

Transport layer reconnects → backend sends snapshot.

### **3.2 Backend instructs client to rehydrate**

E.g., after permission change, room change, or DM override.

### **3.3 Reducer detects invalid state**

E.g., missing room, deleted note, stale player reference.

### **3.4 System error**

UI triggers full hydration.

---

## 🔄 4. Recovery Flow (Full Sequence)

This is the **canonical** recovery flow.

```text
1. Transport reconnects
2. UI shows toast: “Reconnecting…”
3. Backend sends full snapshot
4. Client validates snapshot (schema only)
5. Reducers apply snapshot atomically
6. Domain stores update
7. UI re-renders from updated stores
8. UI-only state restored from uiStore
9. UI shows toast: “Connection restored”
```

No partial rendering.
No incremental hydration.
No optimistic UI.

---

## 🧱 5. Domain State Recovery (Authoritative)

The following stores are **fully overwritten** by the snapshot:

| Store           | Recovery Rule                                      |
| --------------- | -------------------------------------------------- |
| `presenceStore` | Replace players, rooms, speaking, mute, conditions |
| `chatStore`     | Replace visible window of messages                 |
| `notesStore`    | Replace all visible notes                          |
| `journalStore`  | Replace entries                                    |
| `historyStore`  | Replace events                                     |
| `audioStore`    | Replace gain, mute, distance, conditions           |
| `sessionStore`  | Replace campaign/session metadata                  |

### **5.1 Atomic Application**

All reducers apply the snapshot in a **single atomic commit**.

### **5.2 Persona Filtering**

Backend filters snapshot before sending:

- Player never receives DM‑only data
- Spectator receives only global notes
- Assistant DM receives delegated subset

UI never filters domain state.

---

## 🧩 6. UI State Recovery (Local Only)

UI state is **not** overwritten by snapshots.

After domain hydration, the UI restores:

| UI State            | Selector                  | Notes                     |
| ------------------- | ------------------------- | ------------------------- |
| Active right panel  | `selectActiveRightPanel`  | Reopens slide‑in panel    |
| Center view         | `selectCenterView`        | Chat or Notes             |
| Left rail collapsed | `selectLeftRailCollapsed` | Preserved                 |
| Whisper target      | `selectWhisperTarget`     | Cleared if invalid        |
| Active note pop‑out | `selectActiveNoteId`      | Closed if note missing    |
| Toasts              | `selectToasts`            | Persist until dismissed   |
| Context menu        | `selectContextMenu`       | Always closed on recovery |

### **6.1 Whisper Target Validation**

If whisper target no longer exists or is in another room:

```text
uiStore.whisperTarget = null
```

### **6.2 Note Pop‑Out Validation**

If active note is no longer visible:

```text
uiStore.activeNoteId = null
```

### **6.3 Right Panel Validation**

If active panel is no longer allowed for persona:

```text
uiStore.activeRightPanel = null
```

---

## 🎭 7. Persona‑Specific Recovery Rules

---

### **7.1 DM**

- All panels may reopen
- All notes remain visible
- Whisper target preserved
- DM Voice Bar state preserved
- Context menu closed

---

### **7.2 Player**

- Whisper target preserved only if still valid
- Notes panel reopens if previously open
- Cannot reopen DM‑only panels
- Note pop‑out closes if note visibility changed

---

### **7.3 Spectator**

- Always read‑only
- Whisper target always cleared
- Only global notes restored
- Note pop‑out closes if note is not global

---

## 🧠 8. Error Handling During Recovery

Recovery errors follow `UI-ERROR-HANDLING.md`.

---

### **8.1 Snapshot Validation Error**

If snapshot is malformed:

- UI shows toast:
  **“System error — attempting recovery.”**
- Client requests a new snapshot
- UI remains interactive

---

### **8.2 Reducer Error During Hydration**

If reducer rejects snapshot data:

- UI shows toast:
  **“State out of sync — reloading.”**
- Full hydration retried

---

### **8.3 Transport Failure During Recovery**

If connection drops mid‑hydration:

- UI shows toast:
  **“Connection lost — retrying…”**
- UI stays interactive
- Recovery resumes on reconnect

---

## 🎛️ 9. Motion & UX During Recovery

### **9.1 No blocking overlays**

UI must remain usable.

### **9.2 Toasts communicate recovery state**

- “Reconnecting…”
- “Connection restored.”

### **9.3 No panel auto‑closing**

Panels remain open unless invalid.

### **9.4 No chat scroll jumps**

Chat window preserves scroll position unless message window changes.

### **9.5 No animation on snapshot application**

Hydration is instantaneous.

---

## 🔍 10. Component‑Specific Recovery Behaviour

---

### **10.1 `<ChatWindow />`**

- Re-renders with new messages
- Scroll position preserved if possible
- Whisper messages filtered by persona

---

### **10.2 `<NotesPanel />`**

- Re-renders with new note list
- If active note disappears → pop‑out closes

---

### **10.3 `<PlayerList />`**

- Re-renders with updated rooms/players
- Drag state cancelled

---

### **10.4 `<RightTabBar />`**

- Active tab preserved unless invalid

---

### **10.5 `<SlideInPanels />`**

- Panel remains open unless persona no longer has access

---

### **10.6 `<DMVoiceBar />`**

- Re-renders with updated audio state
- Open/closed state preserved

---

## ✔ 11. Summary

This document defines:

- Full UI recovery model
- Domain vs UI state boundaries
- Persona‑specific recovery rules
- Error handling during recovery
- Motion and UX constraints
- Deterministic, backend‑authoritative hydration

It is the authoritative reference for UI state recovery in VTT‑Chat.

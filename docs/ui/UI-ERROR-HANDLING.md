# **UI-ERROR-HANDLING.md**

_Authoritative specification for UI‑level error handling in VTT‑Chat._

---

## 1. Overview

VTT‑Chat uses a **deterministic, non‑blocking, persona‑aware** error‑handling model.

The UI must:

- Never block interaction
- Never obscure core VTT controls
- Never violate privacy or role boundaries
- Never invent new error types
- Never mutate state directly

All errors follow the same pipeline:

```text
UI → Event → Reducer → Store → UI
```

Errors are categorized exactly as defined in your error model:

1. **Validation Errors**
2. **Permission Errors**
3. **Reducer Errors**
4. **Transport Errors**
5. **System Errors**

The UI does not create new categories.

---

## 2. Error Display Principles

### **2.1 Errors must be visible but non‑blocking**

- No modal dialogs
- No blocking overlays
- No UI freeze states

### **2.2 Errors must appear as system toasts**

- Dismissable
- Temporary
- Stacked
- Under the toolbar
- Above all other UI

### **2.3 Errors must never reveal private or DM‑only data**

- Player cannot see DM errors
- Spectator cannot see player or DM errors
- Assistant DM sees only delegated errors

### **2.4 Errors must be deterministic**

- Same input → same output
- No random phrasing
- No stylistic drift

---

## 3. Error Presentation (Toasts)

All UI errors are displayed using `<SystemToasts />`.

### **Toast Format**

```text
[Error Title] — [Short deterministic description] [×]
```

### **Toast Motion**

```text
Duration: 140ms
Transform: translateY(-6px) → 0
Opacity: 0 → 1
Easing: primary
```

### **Toast Levels**

| Level     | Used For           |
| --------- | ------------------ |
| `info`    | benign UI notices  |
| `warning` | recoverable issues |
| `error`   | failed operations  |

---

## 4. Error Handling by Category

---

## **4.1 Validation Errors**

_The user attempted an invalid action._

Examples:

- Empty chat message
- Invalid note title
- Room name too short

### **UI Behaviour**

- Show toast:
  **“Invalid input — please check your entry.”**
- Highlight the offending field (micro‑interaction)
- No state changes
- No reducer errors

### **Persona Rules**

- Same behaviour for all personas

---

## **4.2 Permission Errors**

_The user attempted an action outside their role._

Examples:

- Player tries to move another player
- Spectator tries to send a message
- Player tries to open DM‑only note

### **UI Behaviour**

- Show toast:
  **“You don’t have permission to do that.”**
- No UI lock
- No state mutation

### **Persona Rules**

- DM never receives permission errors
- Assistant DM receives only delegated permission errors
- Player/Spectator receive permission errors for restricted actions

---

## **4.3 Reducer Errors**

_The reducer rejected the event due to invalid state._

Examples:

- Moving a player to a non‑existent room
- Updating a note that no longer exists
- Applying a condition to a disconnected player

### **UI Behaviour**

- Show toast:
  **“Action failed — state out of sync.”**
- UI triggers a **silent re‑sync** (hydration)
- No blocking UI

### **Persona Rules**

- DM sees reducer errors for DM actions
- Players see reducer errors only for their own actions
- Spectators never trigger reducer errors

---

## **4.4 Transport Errors**

_The WebSocket or extension bridge failed._

Examples:

- Message send failed
- Note update failed
- Room update failed

### **UI Behaviour**

- Show toast:
  **“Connection issue — retrying…”**
- Composer enters “retry pending” state
- UI remains interactive
- Automatic retry handled by transport layer

### **Persona Rules**

- All personas see transport errors
- DM sees additional context:
  **“Some players may be disconnected.”**

---

## **4.5 System Errors**

_Unexpected internal failure._

Examples:

- Store hydration failed
- Unexpected null state
- Unhandled reducer exception

### **UI Behaviour**

- Show toast:
  **“System error — attempting recovery.”**
- UI triggers full hydration
- UI remains interactive
- No modal, no blocking

### **Persona Rules**

- DM sees system errors
- Players see only user‑impacting system errors
- Spectators see minimal system errors

---

## 5. Component‑Specific Error Handling

---

### **5.1 `<MessageComposer />`**

Errors:

- Validation (empty message)
- Transport (send failed)

UI:

- Field shake (micro‑interaction)
- Toast
- Composer stays active

---

### **5.2 `<NotesPanel />`**

Errors:

- Permission (editing DM‑only note)
- Reducer (note deleted before update)

UI:

- Toast
- Note list refresh

---

### **5.3 `<NotePopout />`**

Errors:

- Permission (player editing restricted note)
- Reducer (note no longer exists)

UI:

- Toast
- Pop‑out closes if note is gone

---

### **5.4 `<RoomsPanel />` (DM Only)**

Errors:

- Reducer (invalid room)
- Validation (duplicate name)

UI:

- Toast
- No panel close

---

### **5.5 `<AudioPanel />` (DM Only)**

Errors:

- Reducer (player not found)

UI:

- Toast
- No UI lock

---

### **5.6 `<SearchPanel />`**

Errors:

- None (search is read‑only)

UI:

- Empty state only

---

## 6. Error Recovery Flows

---

### **6.1 Transport Recovery**

1. Transport detects failure
2. UI shows toast
3. Transport retries
4. On success:
   - Toast: **“Connection restored.”**
   - UI re‑hydrates silently

---

### **6.2 Reducer Recovery**

1. Reducer rejects event
2. UI shows toast
3. UI triggers hydration
4. UI re‑renders with corrected state

---

### **6.3 System Recovery**

1. System error detected
2. UI shows toast
3. Full hydration
4. UI returns to stable state

---

## 7. Persona‑Specific Error Visibility

| Error Type | DM  | Assistant DM  | Player   | Spectator |
| ---------- | --- | ------------- | -------- | --------- |
| Validation | ✔   | ✔             | ✔        | ✔         |
| Permission | ✖   | ✔ (delegated) | ✔        | ✔         |
| Reducer    | ✔   | ✔             | Own only | ✖         |
| Transport  | ✔   | ✔             | ✔        | ✔         |
| System     | ✔   | Partial       | Minimal  | Minimal   |

DM never receives permission errors.
Spectator never receives reducer errors.

---

## 8. Summary

This document defines:

- All UI error behaviours
- Persona‑aware visibility
- Non‑blocking toast‑based presentation
- Deterministic recovery flows
- Strict alignment with your architecture
- No new subsystems or behaviours

It is the authoritative reference for UI error handling in VTT‑Chat.

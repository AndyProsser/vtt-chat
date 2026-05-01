# **UI-LOADING-STATES.md**

_Authoritative specification for loading, empty, and transitional UI states in VTT‑Chat._

---

## 1. Overview

VTT‑Chat is designed to feel **instant**, **responsive**, and **non‑blocking**, even during:

- Initial load
- Reconnect
- Hydration
- Panel transitions
- Data fetches
- Empty states

This document defines:

- All loading states
- How each component behaves
- Persona‑specific visibility
- Motion rules
- Error fallback behaviour

Loading states must **never** block interaction unless absolutely required (e.g., no session yet).

---

## 2. Global Loading Principles

### **2.1 Loading must never block core UI**

- Chat window always visible
- Player list always visible
- Right‑panel tabs always visible

### **2.2 Loading must be subtle**

- No spinners in the center of the screen
- No modal overlays
- No skeletons that obscure layout

### **2.3 Loading must preserve layout**

- Components render placeholders in place
- No layout shift

### **2.4 Loading must be persona‑aware**

- DM sees more detail
- Player sees only what they need
- Spectator sees minimal UI

### **2.5 Loading must be deterministic**

- Same state → same UI
- No random shimmer patterns
- No unpredictable transitions

---

## 3. Global App Loading States

The app has **three** global loading phases:

---

### **3.1 Phase 1 — App Bootstrapping**

Occurs when the SPA first loads.

#### UI Behaviour

- Toolbar renders immediately
- CampaignInfo renders with placeholders
- LeftRail renders with skeleton player items
- CenterPane renders empty chat window
- RightRail tabs render but disabled

#### Motion

None — static placeholders.

#### Persona Rules

Same for all personas.

---

### **3.2 Phase 2 — Session Initialization**

Occurs after connecting but before receiving the first snapshot.

#### UI Behaviour

- Toast: **“Connecting…”**
- Chat window shows “Loading messages…” placeholder
- Notes panel shows “Loading notes…” placeholder
- Player list shows skeleton avatars

#### Motion

Fade‑in of placeholders (120ms).

---

### **3.3 Phase 3 — Snapshot Hydration**

Occurs when backend sends the authoritative snapshot.

#### UI Behaviour

- All domain stores update atomically
- UI re-renders instantly
- No animation on hydration
- UI-only state restored (see UI‑STATE‑RECOVERY.md)

#### Motion

None — hydration is instantaneous.

---

## 4. Component‑Level Loading States

Each component has a deterministic loading state.

---

## **4.1 `<PlayerList />`**

### Loading State

- Skeleton avatars (32px circles)
- Grey bars for names
- No speaking/mute indicators

### Empty State

- “No players connected” (rare; only pre‑session)

### Persona Rules

Same for all personas.

---

## **4.2 `<ChatWindow />`**

### Loading State

- Placeholder messages (3–5 grey bars)
- Scroll disabled
- Composer disabled

### Empty State

- “No messages yet”

### Persona Rules

- Spectator sees read‑only placeholders
- DM/Player see composer disabled until ready

---

## **4.3 `<MessageComposer />`**

### Loading State

- Disabled
- Placeholder input field

### Ready State

- Enabled once chatStore hydrated

---

## **4.4 `<NotesPanel />`**

### Loading State

- Skeleton note items
- Disabled “Create Note” button

### Empty State

- “No notes yet”

#### Persona Rules

- Spectator sees only global notes once loaded

---

## **4.5 `<NotePopout />`**

### Loading State

- Skeleton title bar
- Grey content blocks
- Close button disabled

### Empty State

- Never shown (pop‑out only opens with a note)

---

## **4.6 `<RoomsPanel />` (DM Only)**

### Loading State

- Skeleton room list
- Disabled controls

### Empty State

- “No rooms defined” (pre‑session only)

---

## **4.7 `<AudioPanel />` (DM Only)**

### Loading State

- Skeleton sliders
- Disabled bulk actions

---

## **4.8 `<SearchPanel />`**

### Loading State

- Disabled input
- “Waiting for data…”

### Empty State

- “No results”

---

## **4.9 `<JournalPanel />`**

### Loading State

- Skeleton entry list

#### Empty State

- “No journal entries”

---

## **4.10 `<HistoryPanel />`**

### Loading State

- Skeleton timeline items

#### Empty State

- “No history events”

---

## **4.11 `<SettingsPanel />`**

### Loading State

- Disabled controls
- Skeleton toggles

---

## 5. Right Panel Loading Behaviour

Right panel tabs are always visible, but:

- Tabs are disabled until snapshot hydration
- Slide‑in panels show skeletons
- No motion until data is ready

This prevents layout shift and maintains the command‑centre feel.

---

## 6. Loading During Reconnect

When the connection drops:

### UI Behaviour

- Toast: **“Connection lost — retrying…”**
- Composer disabled
- Right‑panel panels remain open
- Player list remains visible
- Chat window remains visible
- No skeletons shown (avoid flicker)

### On reconnect

- Toast: **“Connection restored.”**
- Full hydration
- UI-only state restored

---

## 7. Persona‑Specific Loading Rules

---

### **7.1 DM**

- Sees all skeletons
- DM Voice Bar shows disabled controls
- RoomsPanel and AudioPanel load fully

---

### **7.2 Player**

- Sees only player‑visible skeletons
- No DM‑only placeholders
- NotesPanel loads only visible notes

---

### **7.3 Spectator**

- Minimal skeletons
- No composer
- NotesPanel loads only global notes

---

## 8. Motion Rules for Loading

### **8.1 Skeleton Fade‑In**

```text
Duration: 120ms
Opacity: 0 → 1
```

### **8.2 No Slide‑In During Loading**

Panels do not animate until data is ready.

### **8.3 No Chat Shift During Loading**

Right panel does not shift chat until panel is fully ready.

### **8.4 No Player Drag Motion**

Drag‑and‑drop disabled until presenceStore hydrated.

---

## 9. Error Handling During Loading

Loading integrates with `UI-ERROR-HANDLING.md`.

### **If snapshot fails:**

- Toast: **“System error — attempting recovery.”**
- Retry hydration

### **If transport fails:**

- Toast: **“Connection lost — retrying…”**
- UI remains interactive

### **If reducer rejects snapshot:**

- Toast: **“State out of sync — reloading.”**
- Full hydration

---

## 10. Summary

This document defines:

- All loading states
- All empty states
- All transitional states
- Persona‑specific behaviour
- Motion rules
- Error fallback behaviour
- Deterministic, non‑blocking UI principles

It is the authoritative reference for loading behaviour in VTT‑Chat.

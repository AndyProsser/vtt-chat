# **UI-LAYOUT.md**

_Authoritative layout specification for all VTT‑Chat personas._

---

# 🧭 1. Overview

The VTT‑Chat UI is a **three‑panel command‑centre layout** designed for widescreen PC use.
All personas share the same structural regions:

```
Toolbar
Campaign Info + System Toasts
Left Panel (Players)
Center Panel (Chat / Notes)
Right Panel (Vertical Tabs + Slide‑In Panels)
```

Persona differences are expressed through **visibility**, **permissions**, and **panel availability**, not through structural changes.

---

# 🧱 2. Global Layout Structure

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ TOOLBAR: Audio Devices | Theme | Connection Status                           │
├──────────────────────────────────────────────────────────────────────────────┤
│ CAMPAIGN INFO: Campaign Name | DM | Session # | Time                         │
│ SYSTEM TOASTS (Dismissable, stacked, temporary)                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌───────────────┬───────────────────────────────────────────────┬──────────────┐
│ LEFT PANEL     │                 CENTER PANEL                  │ RIGHT PANEL   │
│ Player List    │  [Room Header]                                │ Vertical Tabs │
│ (Grouped)      │  [Chat ▼ | Notes]                             │ Slide‑In      │
│ Collapsible    │-----------------------------------------------│ Panels        │
│ Avatar‑First   │  Chat Window                                   │ (Settings is  │
│ DM Highlight   │  Message Composer                              │ last tab)     │
└───────────────┴───────────────────────────────────────────────┴──────────────┘
```

This layout is **fluid**, **uncluttered**, and designed to complement external VTTs such as D&D Beyond Maps.

---

# 🔔 3. System Toasts

System‑level notifications appear as **dismissable toasts** directly under the toolbar.

### Placement

- Under the toolbar
- Above all other UI
- Do not shift layout

### Behaviour

- Auto‑dismiss (4–6 seconds)
- Manual dismiss (× button)
- Max 3 stacked

### Motion

```
Duration: 140ms
Transform: translateY(-6px) → 0
Opacity: 0 → 1
Easing: primary
```

### Examples

- Connection restored
- Reconnecting…
- Room environment updated
- Note published

---

# 👥 4. Left Panel — Player List

The left panel is the **primary anchor** of the UI.

### Features

- Avatar‑first design
- Collapsible to icon‑only mode
- Grouped by room
- Speaking indicator
- Mute indicator
- Condition icons
- DM always visible

### Persona Rules

| Persona      | Behaviour                         |
| ------------ | --------------------------------- |
| DM           | Full list + overrides + drag‑drop |
| Assistant DM | Same as DM (subset of tools)      |
| Player       | Read‑only, no overrides           |
| Spectator    | Read‑only                         |

### Motion

Collapse/expand follows `Left Player Rail` rules in `ANIMATION-AND-MOTION-SPEC.md`.

---

# 💬 5. Center Panel — Chat & Notes

The center panel is the **core interaction surface**.

### Structure

```
[Room Header]
[Chat ▼ | Notes]
-----------------------------------
Chat Window OR Notes List
Message Composer (if allowed)
```

### Room Header

Shows:

- Current room name
- Whisper target (if applicable)
- Persona‑specific visibility

### Chat / Notes Toggle

- Chat is default
- Notes replaces chat when selected
- Notes are also accessible via right‑panel Notes tab

### Notes in Chat

Notes appear as **chat message cards** (`ChatMessage.type = 'METAGAME'`).

Each card includes:

- Title
- Snippet
- Visibility badge
- “Open Note” button

### Note Pop‑Out Window

Clicking “Open Note” opens a **right‑side pop‑out viewer**:

```
┌────────────────┐
│ NOTE VIEWER    │
│----------------│
│ [Note Content] │
│ Scrollable     │
│----------------│
│ [Close]        │
└────────────────┘
```

Persona rules:

- DM: full editor
- Player: editable or read‑only depending on visibility
- Spectator: read‑only, global notes only

---

# 🎛️ 6. Right Panel — Vertical Tabs + Slide‑In Panels

The right panel contains **secondary tools**.
Tabs vary by persona.

### Tab Order (DM)

1. Rooms
2. Audio
3. Search
4. Notes
5. Journal
6. History
7. **Settings (always last)**

### Tab Order (Player)

1. Notes
2. Journal (read‑only)
3. Search
4. History (read‑only)
5. **Settings**

### Tab Order (Spectator)

1. Notes (global only)
2. Journal (read‑only)
3. Search (read‑only)
4. History (read‑only)
5. **Settings**

### Slide‑In Panels

Panels follow the motion spec:

```
Duration: 180ms
Easing: primary
Transform: translateX(100%) → 0
Opacity: 0.85 → 1
```

Chat shifts left by panel width (transform only).

---

# 🎙️ 7. DM Voice Bar (DM Only)

A horizontal, collapsible bar between Campaign Info and the main layout.

### Contains

- Voice presets
- Environment
- Conditions
- Distance
- Overrides
- IC mode
- PTT
- Clear All

### Motion

```
Duration: 140ms
Transform: translateY(-8px) → 0
Opacity: 0 → 1
```

---

# 🎭 8. Persona‑Specific Layouts

## 8.1 DM Layout

```
Toolbar
Campaign Info + Toasts
DM Voice Bar
Left Panel | Center Panel | Right Panel (full tabs)
```

## 8.2 Player Layout

```
Toolbar
Campaign Info + Toasts
Left Panel | Center Panel | Right Panel (limited tabs)
```

## 8.3 Spectator Layout

```
Toolbar
Campaign Info + Toasts
Left Panel | Center Panel (read‑only) | Right Panel (read‑only tabs)
```

---

# 🧩 9. Component Mapping

### Left Panel

- `<LeftRail />`
- `<PlayerList />`
- `<PlayerItem />`
- `<PlayerOverrides />` (DM only)

### Center Panel

- `<ChatWindow />`
- `<MessageComposer />`
- `<NotesPanel />` (when toggled)
- `<MessageBubble />`
- Note pop‑out uses `<NotesPanel />` in isolated mode

### Right Panel

- `<RightTabBar />`
- `<SlideInPanels />`
- `<RoomsPanel />`
- `<AudioPanel />`
- `<SearchPanel />`
- `<NotesPanel />`
- `<JournalPanel />`
- `<HistoryPanel />`
- `<SettingsPanel />`

### Toasts

- `<SystemToast />` (new UI wrapper, no new subsystem)

---

# 🧠 10. Motion Integration

All motion follows `ANIMATION-AND-MOTION-SPEC.md`.

- Slide‑in panels: 180ms primary easing
- Left rail collapse: 160–180ms
- Chat message entry: 120ms micro easing
- Toasts: 140ms primary easing
- Note pop‑out: slide‑in from right

---

# 📐 11. Layout Principles

- **Fluid**: Panels resize with viewport
- **Uncluttered**: Only one secondary panel visible at a time
- **Command‑centre feel**: Tactical, fast, minimal chrome
- **Complementary**: Designed to sit beside a VTT, not replace it
- **Widescreen‑first**: Optimised for 1080p+ and multi‑monitor setups

---

# ✔ 12. Summary

This layout:

- Prioritises players and chat
- Keeps secondary tools hidden until needed
- Uses toast notifications for system messages
- Delivers notes as chat cards + persistent viewer
- Maintains strict persona boundaries
- Aligns with all existing documentation
- Respects all prompting rules

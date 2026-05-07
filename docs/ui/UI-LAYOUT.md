# **UI-LAYOUT.md**

_Authoritative layout specification for all VTT‑Chat personas._

---

## 1. Overview

The VTT‑Chat UI is a **three‑panel command‑centre layout** designed for widescreen PC use.
All personas share the same structural regions:

```text
Toolbar
Campaign Info + System Toasts
Left Panel (Players)
Center Panel (Chat / Notes)
Right Panel (Vertical Tabs + Slide‑In Panels)
```

Persona differences are expressed through **visibility**, **permissions**, and **panel availability**, not through structural changes.

Admin exception: the Admin SPA uses a dedicated two-column operations layout.
See [ADMIN-UI-DESIGN.md](ADMIN-UI-DESIGN.md).

Current implementation priority alignment:

- Right-panel screen completion and usability hardening are active W0 priorities.
- Global settings must be usable both in-session and out-of-session.
- User profile information belongs within the global settings surface.

### Viewport Mode Model (2026-05-07)

The shell now defines three responsive viewport modes:

1. Minimalist Mobile (`<=767px`)
2. Balanced Player (`768px-1279px`, with `~900px` as the primary target zone)
3. DM Desktop Command (`>=1280px`)

Role gating for DM Desktop Command:

- DM auto-enables this mode on eligible widths.
- Non-DM users can opt in when width permits.

Right-panel behavior by mode:

- Minimalist Mobile: right-panel icons dock to bottom and open popover panels.
- Balanced Player: right-panel icons on right edge with popout/overlay behavior.
- DM Desktop Command: exactly one right panel stays pinned open; clicking right-edge icons switches the pinned panel. Default is last used panel.

---

## 2. Global Layout Structure

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ TOOLBAR: Audio Devices | Theme | Connection Status                           │
├──────────────────────────────────────────────────────────────────────────────┤
│ CAMPAIGN INFO: Campaign Name | DM | Session ## | Time                        │
│ SYSTEM TOASTS (Dismissable, stacked, temporary)                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌───────────────┬───────────────────────────────────────────────┬───────────────┐
│ LEFT PANEL    │                 CENTER PANEL                  │ RIGHT PANEL   │
│ Player List   │  [Group Header]                               │ Vertical Tabs │
│ (Grouped)     │  [Chat ▼ | Notes]                             │ Slide‑In      │
│ Collapsible   │-----------------------------------------------│ Panels        │
│ Avatar‑First  │  Chat Window                                  │ (Settings is  │
│ DM Highlight  │  Message Composer                             │ last tab)     │
└───────────────┴───────────────────────────────────────────────┴───────────────┘
```

This layout is **fluid**, **uncluttered**, and designed to complement external VTTs such as D&D Beyond Maps.

Connection status presentation rules:

- The toolbar primary status icon is authoritative.
- Outside campaign, it maps to Core WS state only.
- Inside campaign, it maps to aggregate Core WS + LiveKit state.
- LiveKit/audio status should be visually subtle, escalating the primary icon only for degraded audio or error conditions.

---

## 3. System Toasts

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

```text
Duration: 140ms
Transform: translateY(-6px) → 0
Opacity: 0 → 1
Easing: primary
```

### Examples

- Connection restored
- Reconnecting…
- Group environment updated
- Note published

---

## 4. Left Panel — Player List

The left panel is the **primary anchor** of the UI.

### Features

- Avatar‑first design
- Collapsible to icon‑only mode
- Grouped by group
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

## 5. Center Panel — Chat & Notes

The center panel is the **core interaction surface**.

### Structure

```text
[Group Header]
[Chat ▼ | Notes]
-----------------------------------
Chat Window OR Notes List
Message Composer (if allowed)
```

### Group Header

Shows:

- Current group name
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

```text
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

## 6. Right Panel — Vertical Tabs + Slide‑In Panels

The right panel contains **secondary tools**.
Tabs vary by persona.

### Tab Order (DM)

1. Groups
2. Audio
3. Search
4. Notes
5. Journal
6. History
7. **Settings (always last)**

Settings panel expectations:

- Settings is a global surface, not session-scoped only.
- The same panel supports in-session and out-of-session access.
- User profile settings are included in this panel.

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

```text
Duration: 180ms
Easing: primary
Transform: translateX(100%) → 0
Opacity: 0.85 → 1
```

Chat shifts left by panel width (transform only).

DM Desktop Command layout rule:

- Preserve existing left rail and center-pane baseline widths.
- Allocate dedicated right-pane width for one always-open panel.
- Allow center pane to absorb remaining flexible width.

Minimalist Mobile layout rule:

- Right-tab icons move to a bottom dock.
- Opening a tab launches a bottom-anchored popover panel.

---

## 7. DM Voice Bar (DM Only)

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

```text
Duration: 140ms
Transform: translateY(-8px) → 0
Opacity: 0 → 1
```

---

## 8. Persona‑Specific Layouts

### 8.1 DM Layout

```text
Toolbar
Campaign Info + Toasts
DM Voice Bar
Left Panel | Center Panel | Right Panel (full tabs)
```

On `>=1280px`: DM Desktop Command behavior applies by default (one pinned right panel).

### 8.2 Player Layout

```text
Toolbar
Campaign Info + Toasts
Left Panel | Center Panel | Right Panel (limited tabs)
```

On `>=1280px`: players may opt into DM Desktop Command-style pinned panel behavior.

### 8.3 Spectator Layout

```text
Toolbar
Campaign Info + Toasts
Left Panel | Center Panel (read‑only) | Right Panel (read‑only tabs)
```

On `<=767px`: all personas use Minimalist Mobile layout conventions.

DM warning on Minimalist Mobile:

- Show a one-time dismissible warning banner indicating the mobile layout is not optimized for DM command workflows.

---

## 9. Component Mapping

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

## 10. Motion Integration

All motion follows `ANIMATION-AND-MOTION-SPEC.md`.

- Slide‑in panels: 180ms primary easing
- Left rail collapse: 160–180ms
- Chat message entry: 120ms micro easing
- Toasts: 140ms primary easing
- Note pop‑out: slide‑in from right

---

## 11. Layout Principles

- **Fluid**: Panels resize with viewport
- **Uncluttered**: Only one secondary panel visible at a time
- **Command‑centre feel**: Tactical, fast, minimal chrome
- **Complementary**: Designed to sit beside a VTT, not replace it
- **Widescreen‑first**: Optimised for 1080p+ and multi‑monitor setups

---

## 12. Summary

This layout:

- Prioritises players and chat
- Keeps secondary tools hidden until needed
- Uses toast notifications for system messages
- Delivers notes as chat cards + persistent viewer
- Maintains strict persona boundaries
- Aligns with all existing documentation
- Respects all prompting rules

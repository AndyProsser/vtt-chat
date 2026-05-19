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
Right Panel (Slide‑In Popout Surface)
```

Persona differences are expressed through **visibility**, **permissions**, and **panel availability**, not through structural changes.

Admin exception: the Admin SPA uses a dedicated two-column operations layout.
See [ADMIN-UI-DESIGN.md](ADMIN-UI-DESIGN.md).

Current implementation priority alignment:

- Right-panel screen completion and usability hardening are active W0 priorities.
- Global settings must be usable both in-session and out-of-session.
- User profile information belongs within the global settings surface.
- Campaign UI documentation now treats the topbar timer, topbar Settings panel, chat lifecycle bookends, chat message visibility, chat message creation, and the rightbar Notes/Journal tabs as one connected surface.

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
│ TOOLBAR: Audio Devices | Theme | Connection Status | Settings | Information  │
├──────────────────────────────────────────────────────────────────────────────┤
│ CAMPAIGN INFO: Campaign Name | DM | Session ## | Time | Session Cog          │
│ SYSTEM TOASTS (Dismissable, stacked, temporary)                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌───────────────┬───────────────────────────────────────────────┬───────────────┐
│ LEFT PANEL    │                 CENTER PANEL                  │ RIGHT PANEL   │
│ Player List   │  [Group Header]                               │ Vertical Tabs │
│ (Grouped)     │  [Chat ▼ | Notes]                             │ Slide‑In      │
│ Collapsible   │-----------------------------------------------│ Panels        │
│ Avatar‑First  │  Chat Window                                  │ (Topbar-driven│
│ DM Highlight  │  Message Composer                             │ content)      │
└───────────────┴───────────────────────────────────────────────┴───────────────┘
```

This layout is **fluid**, **uncluttered**, and designed to complement external VTTs such as D&D Beyond Maps.

Connection status presentation rules:

- The toolbar primary status icon is authoritative.
- Outside campaign, it maps to Core WS state only.
- Inside campaign, it maps to aggregate Core WS + LiveKit state.
- LiveKit/audio status should be visually subtle, escalating the primary icon only for degraded audio or error conditions.

Campaign timer presentation rules:

- `INACTIVE`: show elapsed readiness time since first DM/player joined greenroom membership for the next session; timer popper is disabled.
- `ACTIVE`: timer resets to `00:00` on session start and shows active elapsed time.
- `PAUSED`: primary timer switches to paused elapsed duration with paused color treatment; active elapsed continues in the timer popper.
- `ENDED`: timer shows cooldown countdown to zero.
- Timer values are server-anchor driven and must be consistent across clients after refresh/reconnect.

Theme adaptation contract:

- Dark and light mode must apply to all UI elements with no partial coverage.
- No user-visible element may retain fixed styling from the opposite theme after a mode switch.
- Known high-risk surfaces requiring explicit checks include chat bubbles, note cards, banner/poster backgrounds, popovers, dialogs, toasts, and icon-only controls.
- Theme styling must be token-driven; hard-coded light-only or dark-only colors are not allowed in shared UI surfaces.
- Theme switch behavior is not considered complete until all impacted surfaces are verified in both modes.

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
- Notes are also accessible from the right-toolbar `NOTES` panel
- Chat visibility follows persona and room membership rules, while the message composer remains the canonical chat creation surface when allowed.
- Session lifecycle markers (`[Session Started]`, `[Session Ended]`, `[Session Paused]`, `[Session Resumed]`) render as system-authored chat bookends in the visible chat stream.

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

The right panel contains **secondary tools** and is opened from a dedicated right-toolbar icon for each surface.

Canonical right-toolbar order:

- `INFO`
- `PARTY`
- `ROOMS`
- `NOTES`
- `JOURNAL`
- `HISTORY`
- `SETTINGS`

Panel model contract:

- Do not use a single Information panel with internal tabs for campaign surfaces.
- Each toolbar item opens its own slide-in panel surface.
- `ROOMS` is DM-only and hidden for non-DM personas.
- Search is integrated within `NOTES`, `JOURNAL`, and `HISTORY` panels.

Tabbed UI contract:

- Any panel/dialog that still uses internal sections must use Radix UI Tabs.
- This is required for settings dialogs and any future multi-section surfaces.
- Custom tab implementations are not allowed unless explicitly approved in a design exception.

Admin note:

- Admin UI uses MUI; admin tabbed screens should use MUI Tabs (or approved MUI-equivalent tab primitives).

### Settings Panel Access

1. Settings opens from topbar settings icon.
2. Campaign settings are DM-editable.
3. Players and spectators can view campaign settings read-only by default.
4. DM can hide campaign settings from non-DM users.

Boundary rule:

- Campaign metadata (name, description, banner/poster image, and read-only campaign stats) is owned by the `INFO` panel, not the rightbar campaign settings surface.

System settings expectations:

- System settings define defaults for newly created campaigns.
- System settings never mutate existing campaigns.
- User profile settings are included in this panel.

### Session Settings Popover

- Opened from campaign/session row cog icon.
- Session-scoped fields:
  - Session name
  - Session description (markdown)
  - Session timer override
- DM can edit.
- Players and spectators can view read-only.
- Timer override can exceed campaign default with warning-only UX.
- Session duration source for timer projections is `session override` when present, else campaign default.

Migration note:

- Legacy session cog popover remains transitional; canonical editing location is the rightbar campaign/session settings panel.

### Session Timer Popper

- Triggered from the campaign timer display in `ACTIVE`, `PAUSED`, and `ENDED`.
- Disabled in `INACTIVE`.
- Shows a simple live-updating list:
  - Session state
  - Start time timestamp
  - Cumulative paused time
  - Pause count
  - Expected end time (rounded to nearest 15 minutes)
  - Time left in session
  - End time timestamp (in `ENDED`)
- In `PAUSED`, topbar shows paused elapsed while popper still exposes active elapsed context.
- In `ENDED`, popper remains visible until cooldown completes/cancels, then disables after transition back to `INACTIVE`.

### Rightbar Surface Behavior

- `INFO`: campaign name, description, banner/poster image, plus read-only stats for player count, session count, completed sessions, and next-session ETA. DM can edit metadata fields (not stats).
- `PARTY`: campaign-wide roster for all players (including disconnected and not-yet-connected members) with name, class, level, race, connection state, last seen, stats, and active conditions.
- `ROOMS`: DM-only room/group management surface; hidden for non-DM personas.
- `NOTES`: searchable notes/handouts list. DM can add/edit/delete/share notes and change sharing targets at any time.
- `JOURNAL`: reverse-chronological session journals with text and hashtag search; no images; DM edits completed past sessions only.
- `HISTORY`: read-only searchable full chat history, grouped by session bookends, starts at bottom, dynamically loads older content one session at a time.
- `SETTINGS`: role-routed surface. DM opens campaign/session settings. Players open own character settings. Spectators are read-only.

Notes details:

- Notes content is markdown with a simple rich-text helper toolbar for non-markdown users.
- Notes can include attached images rendered below markdown content and scaled to fit available panel space.
- Notes list supports favorites for players and DM; favorites bubble to top.
- Notes panel can expand into a wider overlay for list + detail workflows while preserving the overall 900px target shell behavior.
- Open note view must include a clear `X` close action.

Party edit navigation rule:

- When a player clicks `Edit` from the `PARTY` panel, the UI must switch to `SETTINGS` with the Character section active.
- After switching, focus moves to the first editable character field.

Home settings access rule:

- For DM, Notes and Journal are also available in the main/home campaign settings dialog as dedicated tabs.
- Campaign-specific rightbar settings are mirrored in that same DM home settings dialog.

Component composition contract:

- Avoid monolithic UI files for tabbed screens and rightbar/info panel implementations.
- Split into focused subcomponents (for example tab shell, list pane, detail pane, editor toolbar, share controls).
- Keep transport/orchestration concerns out of presentational components.

History privacy rule:

- History must respect existing chat privacy visibility constraints for all hydrated messages.

Theme validation rule:

- Any UI change touching color, background, border, elevation, icon contrast, or semantic status colors must be validated in both dark and light mode before sign-off.

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
Left Panel | Center Panel | Right Panel (popout surface)
```

On `>=1280px`: DM Desktop Command behavior applies by default (one pinned right panel).

### 8.2 Player Layout

```text
Toolbar
Campaign Info + Toasts
Left Panel | Center Panel | Right Panel (popout surface)
```

On `>=1280px`: players may opt into DM Desktop Command-style pinned panel behavior.

### 8.3 Spectator Layout

```text
Toolbar
Campaign Info + Toasts
Left Panel | Center Panel (read‑only) | Right Panel (read‑only popouts)
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
- `<GroupsPanel />` (legacy alias: `<RoomsPanel />`)
- `<AudioPanel />`
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

# **UI-COMPONENTS.md**

_Authoritative reference for all UI components in VTT‑Chat._

---

## 1. Overview

This document defines every UI component used in the VTT‑Chat SPA.

It covers:

- Component purpose
- Persona visibility
- Props (referencing `UI-COMPONENT-INTERFACES.md`)
- Placement in the UI layout
- Notes on behaviour (UI‑only, no new logic)

All components follow the event‑driven architecture:

```
UI → Event → Reducer → Store → UI
```

No component mutates state directly.

---

## 2. Layout Components

These components define the structural regions of the SPA.

---

### **2.1 `<Toolbar />`**

**Purpose:**
Top‑level control strip for audio devices, theme, and connection status.

**Visible to:**
All personas.

**Contains:**

- Audio device selector
- Theme toggle
- Connection status indicator

**Notes:**
Settings are _not_ in the toolbar (moved to last right‑panel tab).

---

### **2.2 `<CampaignInfo />`**

**Purpose:**
Displays campaign metadata and session info.

**Visible to:**
All personas.

**Shows:**

- Campaign name
- DM name
- Session number
- Session timer

**Also hosts:**

- System toasts (stacked, dismissable)

---

### **2.3 `<SystemToasts />`**

**Purpose:**
Renders temporary, dismissable system notifications.

**Visible to:**
All personas.

**Behaviour:**

- Stacked
- Auto‑dismiss
- Manual dismiss
- Does not shift layout

---

### **2.4 `<MainLayout />`**

**Purpose:**
Three‑panel layout container.

**Contains:**

- `<LeftRail />`
- `<CenterPane />`
- `<RightRail />`

---

### **2.5 `<LeftRail />`**

**Purpose:**
Primary anchor panel showing connected players.

**Visible to:**
All personas.

**Features:**

- Collapsible
- Avatar‑first
- Grouped by group

---

### **2.6 `<CenterPane />`**

**Purpose:**
Core interaction surface (chat + notes).

**Contains:**

- `<RoomHeader />`
- `<ChatNotesToggle />`
- `<ChatWindow />` or Notes list
- `<MessageComposer />` (except spectator)

---

### **2.7 `<RightRail />`**

**Purpose:**
Secondary tools behind vertical tabs.

**Contains:**

- `<RightTabBar />`
- `<SlideInPanels />`

Mode behavior:

- `BALANCED_PLAYER`: right-edge icon rail + popout panel behavior.
- `DM_DESKTOP_COMMAND`: right-edge icon rail + one always-pinned panel.
- `MINIMALIST_MOBILE`: bottom icon dock + bottom popover panel behavior.

---

### **2.8 `<ViewportModeController />`**

**Purpose:**
Computes active shell mode from viewport width and role/opt-in settings.

**Visible to:**
All personas (infrastructure component).

**Rules:**

- `<=767px`: `MINIMALIST_MOBILE`
- `768px-1279px`: `BALANCED_PLAYER`
- `>=1280px`: `DM_DESKTOP_COMMAND` (DM auto-on, others opt-in)

---

### **2.9 `<MobileBottomTabDock />`**

**Purpose:**
Bottom-pinned tab dock for right-panel tools in Minimalist Mobile mode.

**Visible to:**
All personas in `MINIMALIST_MOBILE`.

**Notes:**

- Opens tool panels as bottom popovers.
- Keeps chat as primary visual layer.

---

### **2.10 `<MobileDmWarningBanner />`**

**Purpose:**
One-time dismissible warning when a DM enters Minimalist Mobile mode.

**Visible to:**
DM persona only, first entry to `MINIMALIST_MOBILE` until dismissed.

---

## 3. Player List Components

---

### **3.1 `<PlayerList />`**

**Purpose:**
Displays all players grouped by group.

**Persona rules:**

- DM: full list + overrides + drag‑drop
- Player: read‑only
- Spectator: read‑only

---

### **3.2 `<PlayerItem />`**

**Purpose:**
Represents a single player.

**Shows:**

- Avatar
- Name
- Class / race / level
- Speaking indicator
- Mute indicator
- Condition icons

---

### **3.3 `<PlayerOverrides />` (DM Only)**

**Purpose:**
DM‑only audio and condition controls.

**Controls:**

- Gain
- Mute
- Distance
- Conditions

---

## 4. Chat & Messaging Components

---

### **4.1 `<RoomHeader />`**

**Purpose:**
Displays current group and whisper target.

**Persona rules:**

- DM/Player: whisper target selectable
- Spectator: read‑only

---

### **4.2 `<ChatNotesToggle />`**

**Purpose:**
Switches center panel between Chat and Notes view.

**States:**

- `chat`
- `notes`

---

### **4.3 `<ChatWindow />`**

**Purpose:**
Displays chat messages.

**Persona rules:**

- DM: full visibility
- Player: group‑scoped
- Spectator: read‑only

---

### **4.4 `<MessageComposer />`**

**Purpose:**
Message input field.

**Persona rules:**

- DM: full
- Player: full
- Spectator: hidden

---

### **4.5 `<MessageBubble />`**

**Purpose:**
Renders a single chat message.

**Supports:**

- Chat messages
- System messages
- Note messages (`type = 'note'`)

---

### **4.6 `<NoteCard />`**

**Purpose:**
Chat‑embedded representation of a note.

**Contains:**

- Title
- Snippet
- Visibility badge
- “Open Note” button

---

## 5. Notes Components

---

### **5.1 `<NotesPanel />`**

**Purpose:**
Slide‑in panel for browsing notes.

**Persona rules:**

- DM: full
- Player: own + shared
- Spectator: global only

---

### **5.2 `<NotePopout />`**

**Purpose:**
Right‑side pop‑out viewer for a single note.

**Persona rules:**

- DM: editable
- Player: editable or read‑only
- Spectator: read‑only

---

## 6. DM‑Only Components

---

### **6.1 `<DMVoiceBar />`**

**Purpose:**
Horizontal bar for DM audio routing.

**Contains:**

- Voice presets
- Environment
- Conditions
- Distance
- Overrides
- PTT
- Clear All

---

### **6.2 `<RoomsPanel />`**

**Purpose:**
Group management.

**Controls:**

- Create group
- Delete group
- Rename group
- Move players
- Set environment

---

### **6.3 `<AudioPanel />`**

**Purpose:**
DM audio routing and bulk actions.

---

## 7. Search, Journal, History, Settings

---

### **7.1 `<SearchPanel />`**

**Purpose:**
Search across notes, chat, players, groups, metadata.

**Persona rules:**

- DM: full
- Player: full
- Spectator: read‑only

---

### **7.2 `<JournalPanel />`**

**Purpose:**
Displays journal entries.

**Persona rules:**

- DM: full
- Player: read‑only
- Spectator: read‑only

---

### **7.3 `<HistoryPanel />`**

**Purpose:**
Timeline of campaign events.

**Persona rules:**

- DM: full
- Player: read‑only
- Spectator: read‑only

---

### **7.4 `<SettingsPanel />`**

**Purpose:**
User‑specific settings.

**Always the last right‑panel tab.**

---

## 8. Tabs & Panels

---

### **8.1 `<RightTabBar />`**

**Purpose:**
Vertical tab selector.

**Persona‑specific tab sets:**
Defined in `UI-LAYOUT.md`.

---

### **8.2 `<SlideInPanels />`**

**Purpose:**
Hosts persona‑specific slide‑in panels.

**Motion:**
Right‑side slide‑in (180ms, primary easing).

---

## 9. Persona Visibility Matrix

| Component       | DM   | Player  | Spectator |
| --------------- | ---- | ------- | --------- |
| Toolbar         | ✔    | ✔       | ✔         |
| CampaignInfo    | ✔    | ✔       | ✔         |
| SystemToasts    | ✔    | ✔       | ✔         |
| DMVoiceBar      | ✔    | ✖       | ✖         |
| PlayerOverrides | ✔    | ✖       | ✖         |
| MessageComposer | ✔    | ✔       | ✖         |
| NotesPanel      | Full | Partial | RO        |
| NotePopout      | Full | Partial | RO        |
| RoomsPanel      | ✔    | ✖       | ✖         |
| AudioPanel      | ✔    | ✖       | ✖         |
| SettingsPanel   | ✔    | ✔       | ✔         |

---

## 10. Summary

This document defines:

- Every UI component
- Persona visibility
- Placement in the layout
- Behavioural constraints
- Alignment with existing architecture

It is the authoritative reference for UI implementation.

---

If you want, I can now generate:

### **A. `/docs/ui/UI-COMPONENT-PROPS.md`**

A full props table for every component.

### **B. `/docs/ui/UI-EVENTS.md`**

Mapping UI interactions → events → reducers.

### **C. `/docs/ui/UI-MOTION.md`**

Motion spec integrated per component.

Just tell me which one you want next.

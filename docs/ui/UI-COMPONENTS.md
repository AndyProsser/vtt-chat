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

Implementation contracts:

- Any user-facing campaign/session tabbed panel or tabbed dialog must use Radix UI Tabs.
- This is mandatory for Information tabs and the main campaign settings dialog tabs.
- Admin UI uses MUI and should use MUI Tabs (or approved MUI-equivalent tab primitives).
- UI implementations must avoid monolithic files; split by responsibility.
- Prefer container + presentational composition and feature-scoped subcomponents over single large files.
- New components should target focused ownership and keep complexity local to their feature area.

---

## 2. Layout Components

These components define the structural regions of the SPA.

---

### **2.1 `<Toolbar />`**

**Purpose:**
Top‑level control strip for audio devices, theme, connection status, Settings, and Information.

**Visible to:**
All personas.

**Contains:**

- Audio device selector
- Theme toggle
- Connection status indicator
- Settings trigger icon
- Information trigger icon

**Notes:**

- Settings and Information are primary topbar entry points.
- Session settings are opened from the campaign/session header via a small cog icon.

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

**Timer behavior:**

- `INACTIVE`: elapsed readiness time since first DM/player joined greenroom membership.
- `ACTIVE`: elapsed time since current session start.
- `PAUSED`: primary timer switches to paused elapsed duration (active elapsed still tracked).
- `ENDED`: cooldown countdown.

**Also hosts:**

- System toasts (stacked, dismissable)

---

### **2.2a `<SessionTimerPopover />`**

**Purpose:**
Details timing metadata behind the topbar session timer.

**Visible to:**
All personas when enabled by session state.

**Availability:**

- Enabled in `ACTIVE`, `PAUSED`, `ENDED`.
- Hidden/disabled in `INACTIVE`.

**Shows:**

- Session state (`ACTIVE | PAUSED | ENDED | INACTIVE`)
- Session start timestamp
- Cumulative paused duration
- Pause count
- Expected end timestamp (rounded to nearest 15 minutes)
- Time left in session
- Session end timestamp and cooldown remaining (when `ENDED`)

**Notes:**

- Values update live while popover is open.
- Anchors come from backend session timestamps so all clients remain synchronized.

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

- `<GroupHeader />` (legacy alias: `<RoomHeader />`)
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

### **4.1 `<GroupHeader />` (legacy alias: `<RoomHeader />`)**

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

### **6.2 `<GroupsPanel />` (legacy alias: `<RoomsPanel />`)**

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

## 7. Information & Settings Panels

---

### **7.1 `<InformationPanel />`**

**Purpose:**
Single topbar-opened panel that hosts informational tabs.

**Default tab order:**

1. Campaign
2. Notes
3. Journal
4. History

**Notes:**

- Journal is a FUTURE feature and is feature-flagged off by default.
- Information content is simple, read-focused, and low-friction.
- Search tab is removed; search is owned within Notes, Journal, and History tabs.
- DM home campaign settings dialog also exposes Notes and Journal as dedicated tabs, alongside campaign settings.

---

### **7.2 `<CampaignInfoPanel />`**

**Purpose:**
Campaign metadata and campaign stats surface for all personas.

**Shows:**

- Campaign name
- Campaign description
- Campaign banner/poster image
- Sessions played by current player (read-only stat)
- Total session duration for current player (read-only stat)

**Persona rules:**

- DM: can edit campaign name, description, and banner/poster image.
- Player: read-only.
- Spectator: read-only.

**Notes:**

- Campaign stats are read-only for all personas.
- Campaign metadata editing is owned here and is not duplicated in rightbar settings.

---

### **7.3 `<NotesPanel />` (Information Tab Variant)**

**Purpose:**
Text-searchable notes/handouts list designed for fast find and fast create.

**Notes rules:**

- DM can `ADD | DELETE | EDIT | SHARE` notes.
- Handout permission model: `PRIVATE | PARTY | SELECTED`.
- Sharing targets can be changed by DM at any time.
- Notes include hashtags for grouping and search.
- Notes use markdown storage with a simple rich-text helper toolbar.
- Notes support attached images rendered below note text.
- Images are scaled to fit available UI space.
- Players and DM can favorite notes; favorites bubble to top.

**Layout notes:**

- Panel may expand to a wider overlay for list-and-detail workflows while preserving the overall 900px target shell.
- Open note view has a clear `X` close action.

---

### **7.4 `<JournalPanel />`**

**Purpose:**
Reverse-chronological session journal list.

**Shows:**

- Session name
- Session start timestamp
- Markdown journal contents
- Hashtags

**Rules:**

- Text and hashtag searchable.
- Same markdown editing experience as Notes.
- No images allowed.
- DM can edit only completed past session journals.
- Full-system mode can auto-populate from transcription/summary, with DM manual fallback.

**Persona rules:**

- DM: edit completed past sessions only.
- Player: read-only.
- Spectator: read-only.

---

### **7.5 `<HistoryPanel />`**

**Purpose:**
Read-only full chat history across past sessions, divided by session bookends.

**Notes:**

- Starts at bottom of the log.
- Scroll-up loading is dynamic with max load window of one session at a time.
- Searchable by DM and players.
- Must respect existing chat privacy visibility rules.
- Read-only for all personas.

**Persona rules:**

- DM: read-only
- Player: read-only
- Spectator: read-only

---

### **7.7 `<SettingsPanel />` (Topbar)**

**Purpose:**
Topbar-opened settings surface for user-account and system-level defaults.

**Sections:**

1. **User Profile** (always available):
   - User name
   - Profile avatar
   - (Outside campaign) Email, password reset, other account settings

2. **System Defaults** (editable only outside campaigns):
   - Default campaign settings templates (match campaign settings in rightbar)
   - DM can pre-configure defaults for new campaigns
   - Never mutates existing campaigns

**Persona rules:**

- All personas: can edit own user profile settings.
- All personas: can set system defaults only when outside any campaign.
- DM: manages system default templates.
- Player/Spectator: system defaults are reference-only.

---

### **7.7a `<CampaignRightbarSettings />` (Rightbar)**

**Purpose:**
Rightbar slide-in panel for campaign, session, and player character settings.

**Availability:**

- Visible when user is inside a campaign context.
- Accessible via rightbar tab icon.

**Sections:**

1. **Campaign Settings** (DM only):
   - Default session duration (hours:minutes)
   - Group audio auto-target on/off (auto-target DM voice when first player joins a group)

   Note: campaign metadata (name, description, banner/poster) is owned by `<CampaignInfoPanel />`.

2. **Session Settings** (DM only; editable during `INACTIVE|ACTIVE|PAUSED` only):
   - Session name
   - Planned session duration (hours:minutes)
   - Editability state: enabled during `INACTIVE|ACTIVE|PAUSED`; disabled during `ENDED` and other states
   - Values apply to next session and persist across sessions
   - Players can see but not edit session duration

3. **Character Settings** (Players):
   - Character name (default: user name)
   - Race (default: Human; editable)
   - Class (default: Fighter; editable)
   - Level (default: 1; editable)
   - Stats (STR, CON, DEX, INT, WIS, CHA; default: 8 for all; editable)
   - Character avatar (default: user avatar)
   - Display applied environmental and conditional effects (read-only)
   - Other campaign-specific character fields as added

**Persona rules:**

- DM: can edit campaign and session settings (with timing gates).
- Players: can edit character information; can view but not edit campaign/session settings.
- Spectators: view-only access to character info and effects.

**Notes:**

- Character values supersede user values; if character field is blank, use user default.
- Character stats default to Fighter/Human/Level 1/8 across all stats if not configured.
- Session values persist in backend and are restored for next session.

---

### **7.8 `<SessionSettingsPopover />` (Legacy)**

**Deprecated:** Use `<CampaignRightbarSettings />` session section instead.

**Legacy behavior:**

Mini popover opened from session header cog for session-scoped overrides.

**Contains:**

- Session name
- Session planned duration
- Editable only during `INACTIVE|ACTIVE|PAUSED`

**Persona rules:**

- DM can edit.
- Player and Spectator can view read-only.

---

## 8. Tabs & Panels

---

### **8.1 `<RightTabBar />`**

**Purpose:**
Vertical tab selector.

**Persona‑specific tab sets:**
Defined in `UI-LAYOUT.md`.

**Notes:**

- Topbar Settings and Information are the primary entry points for these panel groups.
- Right rail remains available for mode-specific utility navigation.

---

### **8.2 `<SlideInPanels />`**

**Purpose:**
Hosts persona‑specific slide‑in panels.

**Motion:**
Right‑side slide‑in (180ms, primary easing).

---

## 9. Persona Visibility Matrix

| Component                    | DM                 | Player        | Spectator   |
| ---------------------------- | ------------------ | ------------- | ----------- |
| Toolbar                      | ✔                  | ✔             | ✔           |
| CampaignInfo                 | ✔                  | ✔             | ✔           |
| SystemToasts                 | ✔                  | ✔             | ✔           |
| DMVoiceBar                   | ✔                  | ✖             | ✖           |
| PlayerOverrides              | ✔                  | ✖             | ✖           |
| MessageComposer              | ✔                  | ✔             | ✖           |
| NotesPanel                   | Full               | Partial       | RO          |
| NotePopout                   | Full               | Partial       | RO          |
| InformationPanel             | ✔                  | ✔             | ✔           |
| CampaignInfoPanel            | Edit metadata only | RO            | RO          |
| NotesPanel (Info Tab)        | Full               | Shared        | RO          |
| JournalPanel                 | Edit past complete | RO            | RO          |
| HistoryPanel                 | RO                 | RO            | RO          |
| SettingsPanel (Topbar)       | ✔                  | ✔             | ✔           |
| CampaignRightbarSettings     | DM settings + view | Character own | RO          |
| SessionSettingsPopover (Leg) | Edit               | RO            | RO          |
| SessionTimerPopover          | State-gated        | State-gated   | State-gated |
| GroupsPanel                  | ✔                  | ✖             | ✖           |
| AudioPanel                   | ✔                  | ✖             | ✖           |

`CampaignRightbarSettings` shows: campaign/session settings (DM only), character settings (players edit own, spectators view only).

`SessionTimerPopover` is state-gated and only available during `ACTIVE`, `PAUSED`, and `ENDED`.

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

# **VTT‑Chat UI Layout Specification (Chat Panel)**

## **1. High‑Level Layout**

The Chat UI is a **three‑zone vertical layout** inside the main VTT‑Chat interface:

1. **Header Bar** — session/history context, unified stream controls, filters, session indicator
2. **Message Stream** — unified chronological flow of all messages the user has experienced
3. **Composer Area** — message input, type selector, whisper controls

**Key principle:** Players see **all messages they have experienced in the current session**, in one unified chronological stream. No messages are "trapped" as they move between groups.

This layout must adapt to:

- Player (current session)
- Player (history panel)
- DM (current session)
- Spectator (current session only)
- Whisper Group (temporary overlay mode)
- Greenroom (temporary overlay mode)

---

## **2. Header Bar**

### **2.1 Session & History Selector**

- **Session Indicator**
  - Shows current session (e.g., "2026-05-12 Evening Game — Active").
  - Color-coded by session state (Active = green, Paused = yellow, Ended = gray).
  - Click to access History panel.

- **History Panel Access** (Non-spectators only)
  - Button/icon to open campaign history sidebar.
  - Shows prior sessions with timestamps and player count.
  - Clicking a prior session switches to read-only history view.
  - History messages show with visual "archived" indicator.

### **2.2 Message Filtering Controls**

- **Filter Chips** (UX convenience, does not override privacy)
  - All (default)
  - IC only
  - OOC only
  - Whispers (if user has any)
  - System only
  - By group (dropdown: "Party A", "Party B", etc.)

- **Search Box**
  - Full-text search across visible messages
  - Search by sender, message content, group

### **2.3 Context Status**

- **Current Group Badge**
  - Shows current group (e.g., "Party A", "Greenroom", "Whisper Group").
  - Color-coded by type.
  - DM sees a dropdown to switch contexts (view as if in that group).

- **Whisper Group Indicator** (when active)
  - "Whisper Sanctuary Active" badge with pulse animation.
  - Shows participant count.
  - Exit button (DM only).

### **2.4 DM Tools** (DM only)

- Campaign settings shortcuts
  - Toggle **Global OOC**
  - Toggle **Player–player Whispers**
  - Toggle **Whisper Group Persistence**
  - Toggle **Suppress Other Streams in Whisper Group**

---

## **3. Message Stream**

### **3.1 Core Principles**

- **Unified chronological stream** — all messages the user has experienced appear in one stream, in temporal order
- **No trapped messages** — once a player visits a group, all IC/OOC/System from that group remain visible even if they move to another group
- **Inline whispers** — whispers appear in chronological order inline with group messages
- **Contextual grouping (optional)** — players can view messages grouped by group/context if preferred (separate UI mode)
- **Ephemeral fade animations** — Greenroom and Whisper Group messages fade when context ends, reinforcing their staging/private nature
- **Minimal clutter** — clear type indicators and visibility icons help players understand message scope
- **Session awareness** — when in History view, messages show "archived" and cannot be interacted with

### **3.2 Default Behavior: Unified Stream**

On login or session join, players see **all messages from the current session in one unified chronological stream**. This is the default view. Players:

- See IC/OOC/Whisper/System messages from all groups they've ever been in during this session
- See Whispers they're party to (inline)
- Can scroll freely through the entire session history
- Do **not** see messages from groups they've never visited
- Can apply filters (By Type, By Group, By Sender, Search) as UI enhancements

### **3.2 Message Cell Structure**

Each message cell contains:

| Element             | Description                                    |
| ------------------- | ---------------------------------------------- |
| **Avatar**          | Sender avatar or DM icon                       |
| **Sender Name**     | Styled by role (Player, DM, System)            |
| **Type Tag**        | IC / OOC / Whisper / System / Greenroom        |
| **Group Tag**       | Group context (always shown for IC/OOC)        |
| **Timestamp**       | Small, subtle (hover shows full timestamp)     |
| **Message Body**    | Markdown‑safe, styled per type                 |
| **Visibility Icon** | Lock (whisper), group icon, globe (global OOC) |
| **Archive Badge**   | _Only in history view:_ "Archived" label       |

### **3.3 Group Tag Display**

- **IC messages:** always show group name (e.g., "Party A", "Tavern")
- **OOC messages (local):** show group name; if global OOC, show globe icon instead
- **Whispers:** show "Whisper" with target name(s) inline
- **System (group-bound):** show group name; if global, show no group tag
- **Greenroom:** show "Greenroom" tag (teal)
- **Whisper Group:** show "Whisper" with participant indicators

### **3.4 Notes and Journal Surfacing Cards**

When DM shares a note as a handout, chat surfaces a one-time card to recipients only.

- Event type: `NOTES:HANDOUT_SURFACED`
- Visibility: recipients only (`PARTY`, `SELECTED`, `SPECTATORS`, or DM-only)
- Card content: note name, short excerpt, hashtag chips, and open-note action
- Excerpt behavior: auto-generated from note markdown by default; DM can optionally override before surfacing
- Auto excerpt rules: strip markdown/link markup, clamp to UI-safe length, use deterministic fallback copy when content is sparse
- Timeline behavior: card is inserted at share timestamp and is not repeatedly re-posted
- Privacy: card must never appear for non-recipients
- Purpose: timeline discoverability for narrative beats (for example: "You find a map of the dungeon")

---

## **4. Message Styling**

### **4.1 Style Tokens**

| Type              | Color               | Icon        | Notes          |
| ----------------- | ------------------- | ----------- | -------------- |
| **IC**            | Warm parchment tint | Quill       | Serif font     |
| **OOC**           | Neutral grey        | Chat bubble | Sans-serif     |
| **Whisper**       | Soft purple         | Lock        | Slight glow    |
| **System**        | Gold/blue           | Cog or star | Italic         |
| **Greenroom**     | Teal translucent    | Leaf        | Soft blur      |
| **Whisper Group** | Deep purple         | Mask        | Ephemeral fade |

### **4.2 Ephemeral Fade**

When leaving Whisper Group or Greenroom:

- Messages fade to 30% opacity
- Then slide down and collapse
- Then removed from DOM

This reinforces privacy and avoids jarring jumps.

---

## **5. Composer Area**

### **5.1 Components**

- **Message Input Box**
  - Multi-line, markdown-safe, auto-expands
  - Disabled in history view and spectator mode
  - Placeholder text reflects context ("Message your group...", "Whisper...", etc.)

- **Message Type Selector** (Context-dependent)
  - **Normal group:** IC / OOC / Whisper (with send-to indicators)
  - **Greenroom:** OOC only
  - **Whisper Group:** Whisper Group messages only
  - Disabled types greyed out (e.g., whispers if disabled by DM)

- **Whisper Target Selector** (appears when Whisper type selected)
  - Multi-select dropdown of available recipients
  - Shows players in current group + DM
  - Displays target avatars/names inline

- **Send Button**
  - Shows icon based on message type (quill for IC, chat bubble for OOC, lock for Whisper)
  - Keyboard shortcut: Enter = send, Shift+Enter = newline
  - Disabled in read-only modes (history, spectator)

### **5.2 Composer Behavior by Context**

**In Normal Group (Session Active):**

- Full IC/OOC/Whisper options
- Message sends to current group

**In Greenroom (Session Paused or Pre-Session):**

- OOC only
- Message marked as Greenroom context
- Cannot send IC or Whispers

**In Whisper Group (DM Active Sanctuary):**

- Whisper Group message type only
- Send targets Whisper Group occupants
- If "Suppress other streams" enabled: cannot see/send to other groups

**In History View (Archived Session):**

- Composer hidden (read-only)
- Message display shows "Archived" badge

**Spectator Mode (Session Active):**

- Composer hidden (no write access)
- Read-only display only

---

## **6. User-Type Views**

### **6.1 Player in Current Session**

**Unified Stream (Default):**

- Sees **all IC/OOC/Whisper/System messages from groups they've ever visited this session**
- Sees whispers they're party to (inline, chronologically ordered)
- Messages appear in unified chronological order
- Can apply filters (By Type, By Group, By Sender, Search)
- Can send IC/OOC/Whisper (if allowed)

**When in Greenroom:**

- Stream temporarily shows Greenroom messages + system bookends only
- Composer allows Greenroom OOC only
- On exit: Greenroom messages fade out visually but remain in session history

**When in Whisper Group:**

- Stream temporarily shows Whisper Group messages only
- Composer allows Whisper Group messages only
- Other players may be suppressed from chat if DM enabled "Suppress other streams"
- On exit: Whisper Group messages deleted immediately (unless persistence enabled)

### **6.2 Player in History View**

- Switching to a prior session shows **read-only archived messages** from that session
- Messages display with "Archived" badge
- Full search/filter capabilities available
- No composer (read-only mode)
- Clicking a message may show metadata (group, context at time of send)

### **6.3 DM**

- Sees all message types in a unified stream
- Can switch between groups/contexts via Header dropdown to see as-if in that group
- Full history access; can review prior sessions
- Can trigger cleanup/archival actions

### **6.4 Spectator**

- **Session-only view:** sees current session only, no history access
- **Limited message types:** sees IC, OOC, and global system only
- **No persistent storage:** session messages not archived to spectator records
- **No composer:** read-only mode always
- **On disconnect:** view cleared; rejoining later shows only the new session

- Sees IC/OOC/System only
- No composer
- No whisper visibility

### **6.5 DM**

- Sees everything
- Can switch groups
- Can override visibility settings

---

## **7. Layout Responsiveness**

### **7.1 Desktop**

- Full three‑zone layout
- Message stream takes majority of vertical space
- Composer anchored at bottom

### **7.2 Tablet**

- Header collapses into two rows
- Filter chips become dropdown

### **7.3 Mobile**

- Composer collapses into a single row
- Message type selector becomes a modal
- Whisper target selector becomes a modal

---

## **8. Interaction Patterns**

### **8.1 Hover States**

- Show message metadata (group, visibility, message ID)
- Whisper messages show “Visible only to X”

### **8.2 Long‑Press (Mobile)**

- Copy text
- Report message (DM only)
- Whisper reply (if allowed)

### **8.3 System Message Anchors**

- System messages can act as timeline markers
- Clicking them opens related context (conditions, environment, etc.)

# Voice Group Panel: Visual Design & Specification

**Status**: W0 Workstream (Frontend Surface Completion) — Updated 2026-05-07
**Last reviewed**: Design finalized with UX decisions; ready for implementation review.

---

## 1) High‑Level Visual Layout

### Viewport Modes

- **Minimalist Mobile**: `<=767px`
- **Balanced Player**: `768px-1279px` (primary target `~900px`)
- **DM Desktop Command**: `>=1280px`

Mode policy:

- DM Desktop Command auto-enables for DM on eligible widths.
- Non-DM users can opt in on eligible widths.
- DM Desktop Command keeps exactly one right-side utility panel pinned open at all times (switch via right-edge icon rail).

### Popout Panel Entry Model

- Topbar opens two primary popout panel families:
  - Settings: `System | Campaign | Profile`
  - Information: `Campaign | Search | Notes | Journal | History`
- Session settings are opened from a small cog in the campaign/session header.
- Journal remains feature-flagged off by default for the current release.

Access rules:

- Campaign settings are DM-editable.
- Player and spectator can view campaign settings read-only by default.
- DM can hide campaign settings from non-DM users.
- Session settings: DM edits; player/spectator read-only.

Notes permission model:

- DM handout visibility uses: `PRIVATE | PARTY | SELECTED`.
- `SELECTED` supports offline roster members.

### Desktop (Wide Panel, 300px fixed width)

```text
VOICE GROUPS PANEL (left rail, ~300px fixed width)
─────────────────────────────────────────────────────

[DM] (sticky, always visible at top)
┌─────────────────────────────────────────────┐
│ [AV●]  Andy Prosser (DM)                    │
│        Online                               │
└─────────────────────────────────────────────┘

Global controls (header, DM only, not shown in greenroom):
- Broadcast icon button with tooltip/popover copy
- Icon color indicates enabled vs disabled state

MAIN GROUP  [🌲] [+]
┌─────────────────────────────────────────────┐
│ Env: Forest (hover for tooltip)             │
├─────────────────────────────────────────────┤
│ [AV●]  Thalia Stormwind                     │
│        Ranger | Lvl 4 | Elf                 │
│        Primary: Poisoned 🪶                │
│        ✎ Hover: "2 more" → popover         │
│                                             │
│ [AV]   Borin Stonefist                      │
│        Fighter | Lvl 4 | Dwarf              │
│        No conditions                        │
└─────────────────────────────────────────────┘

SCOUTS GROUP  [🌙] [+]
┌─────────────────────────────────────────────┐
│ Env: Night (click to edit, DM only)         │
├─────────────────────────────────────────────┤
│ [AV]   Mira Sunshadow                       │
│        Cleric | Lvl 4 | Human               │
│        Primary: Asleep 💤                   │
│        ✎ Hover: "+1 more" → popover        │
│                                             │
│ [AV]   Kess Vex                             │
│        Bard | Lvl 3 | Half-Elf              │
│        No conditions                        │
└─────────────────────────────────────────────┘

[+ Create Group] (compact button at bottom)
```

### Desktop Command (>=1280px, DM default)

```text
LEFT RAIL (Voice Groups) | CENTER (Chat/Notes) | PINNED RIGHT PANEL (Notes/Search/History)

- Left rail remains fixed (~300px)
- Center remains primary workspace and can flex wider
- One right utility panel remains open persistently
- Right-edge icons switch pinned panel content
```

### Mobile (<768px width, Adaptive Collapse)

```text
DM: [AV●]
Main (🌲): [AV●][AV]  [+]
Campfire (🌙): [AV][AV]  [+] [×]

Interaction:
- Tap avatar → expand full widget
- Tap group header → expand/collapse all players
- Long-press avatar → radial menu (Move, Condition, Mute, Close)

Minimalist Mobile additions:

- Left rail defaults to compact stacked controls (group icons + avatars + mute/unmute + meter)
- Expand icon opens full-width left overlay panel
- Right-panel icons move to bottom dock and open bottom popovers
- DM sees one-time dismissible warning that mobile is not command-optimal
```

---

## 2) Core UX Principles

### 2.1 Simplicity & Intuitiveness

- **Click-to-open**: Selectors and condition pickers use click/tap to reveal (no persistent UI clutter).
- **Clean baseline**: Only show what's essential; details appear on demand (hover/tap).
- **Drag-n-drop affordance**: Players inherently draggable to move between groups.

### 2.2 Visual Hierarchy

1. **DM widget** (sticky, always top)
2. **Group headers** (environment icon, create button)
3. **Player widgets** (scrollable list per group)
4. **Condition badges** (secondary, only 1 visible by default + tooltip)

Greenroom exception:

- When session state is `IDLE` (greenroom), DM is rendered in the same participant list as other users.
- Create-group controls are disabled/hidden in greenroom.
- Presence copy in this panel normalizes connected `IDLE` users to `ONLINE`.
- Drag/drop movement is disabled in greenroom.
- Greenroom is treated as the main/out-of-session room and is not rendered in "Other Groups".
- Greenroom cannot be closed.
- Greenroom audio is always neutral: no environment modifier, no DM condition/mute voice overrides, and no broadcast toggle.

Header copy convention:

- Do not render room counts in section headers.
- Do not render "Breakout" text on group rows.

### 2.3 Feedback & Affordance

- **Speaking indicator**: Subtle pulse glow on avatar (not intrusive).
- **Drag feedback**: Ghost preview + highlighted drop zones + dimmed invalid targets.
- **Hover state**: Slight background color change, action icons appear.
- **Broadcast state**: Badge glows/highlights when active.
- **Broadcast state**: Global header icon changes color when active.

---

## 3) Component Anatomy

### 3.1 DM Widget (Sticky Top)

Greenroom behavior:

- DM widget is not rendered in greenroom; DM appears as a standard participant card in the active room list.

**Height**: ~60px
**Layout**: Horizontal flex (avatar + details + controls)

```text
┌──────────────────────────────────────────┐
│ [AV●] Character Name (DM)                │
│       Online · Broadcast Mode ◉         │
│       (click ◉ to toggle)               │
└──────────────────────────────────────────┘
```

**Elements**:

- **Avatar** (36–40px circle): `AvatarOverlay` with role label
- **Details** (name, online status)
- **Speaking indicator** (pulse on avatar if DM is speaking)
- **Muted state**: Small icon overlay on avatar if DM is muted

**CSS Properties**:

```css
.room-selector-dm {
  position: sticky;
  top: 0;
  z-index: 10;
  height: 60px;
  display: flex;
  align-items: center;
  padding: 8px;
  background: var(--panel-bg);
  border-bottom: 1px solid var(--divider);
  gap: 8px;
}

.room-selector-dm__profile {
  flex-shrink: 0;
}

.room-selector-dm__voice-controls {
  flex-grow: 1;
  display: flex;
  align-items: center;
  gap: 4px;
}

.room-selector-dm__vog {
  cursor: pointer;
  background: none;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.room-selector-dm__vog.active {
  background: var(--accent-subtle);
  color: var(--accent);
}

.room-selector-dm__vog:hover {
  background: var(--hover-bg);
}
```

---

### 3.2 Group Section Header

**Height**: ~40px
**Layout**: Horizontal flex (icon + label + environment + controls)

```text
[🌲] Main Group     [Env: Forest]  [Broadcast Active ◉]  [+]  [×]
```

**Elements**:

- **Environment icon** (🌲, 🌙, etc.): Click/hover for tooltip
- **Group name** (label, bold)
- **Environment state** (hover tooltip, DM click to edit)
- **Broadcast indicator** (subtle glow if active, badge)
- **Create group button** (`+` icon, compact)
- **Close button** (`×`, only for non-Main groups)

**CSS Properties**:

```css
.room-selector-room-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 8px;
  background: var(--room-header-bg);
  border-bottom: 1px solid var(--divider);
  font-weight: 600;
  font-size: 14px;
  gap: 8px;
}

.room-selector-room-header__env-icon {
  font-size: 18px;
  cursor: pointer;
}

.room-selector-room-header__broadcast {
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 12px;
  background: var(--accent-subtle);
  color: var(--accent);
  transition: all 0.2s;
}

.room-selector-room-header__broadcast.active {
  background: var(--accent);
  color: var(--accent-text);
  box-shadow: 0 0 4px var(--accent-alpha);
}

.room-selector-room-header__button {
  cursor: pointer;
  background: none;
  border: none;
  padding: 4px;
  border-radius: 4px;
  font-size: 18px;
  transition: all 0.2s;
}

.room-selector-room-header__button:hover {
  background: var(--hover-bg);
}
```

---

### 3.3 Player Widget (Per-Room Card)

**Height**: ~56px (expandable on mobile via tap)
**Layout**: Horizontal flex (avatar + details + condition badge + actions)

```text
┌─────────────────────────────────────────┐
│ [AV●] Thalia Stormwind                  │
│       Ranger | Lvl 4 | Elf              │
│       Primary: Poisoned 🪶              │
│       ✎ Hover to reveal: +2 more       │
│                                         │
│ ✎ Right-click (long-press mobile) →    │
│   Radial menu: Apply Condition,        │
│   Remove, Mute, Move to Room           │
└─────────────────────────────────────────┘
```

**Dragging**:

- Cursor changes to `grab` on hover.
- On drag start:
  - Ghost preview follows cursor (semi-transparent card).
  - Drop zones (groups) highlight with accent color.
  - Invalid targets dim (50% opacity).
- On drag end:
  - Pending move state applied immediately (optimistic UI).
  - Rollback on API error.

**Elements**:

- **Avatar** (36px circle): `AvatarOverlay` with speaking indicator + muted state
- **Name & details** (character name, class/race/level)
- **Condition badge** (primary only, with popover on hover/click)
- **Actions** (revealed on hover, or in radial menu on right-click)

**CSS Properties**:

```css
.room-selector-player-widget {
  height: 56px;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--panel-bg);
  transition: background 0.2s;
  cursor: grab;
  user-select: none;
}

.room-selector-player-widget:hover {
  background: var(--hover-bg);
}

.room-selector-player-widget.dragging {
  opacity: 0.6;
  cursor: grabbing;
}

.room-selector-player-widget.drag-ghost {
  position: fixed;
  opacity: 0.7;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  z-index: 1000;
}

.room-selector-player-avatar {
  flex-shrink: 0;
  position: relative;
}

.room-selector-player-avatar__img {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
}

.room-selector-player-avatar__speaking {
  position: absolute;
  inset: -2px;
  border-radius: 50%;
  box-shadow: 0 0 6px 2px var(--accent);
  animation: speaking-pulse 1.2s infinite;
}

@keyframes speaking-pulse {
  0%,
  100% {
    box-shadow: 0 0 6px 2px var(--accent);
  }
  50% {
    box-shadow: 0 0 10px 4px var(--accent-alpha);
  }
}

.room-selector-player-avatar__muted {
  position: absolute;
  bottom: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  background: var(--error);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: white;
}

.room-selector-player-details {
  flex-grow: 1;
  min-width: 0;
}

.room-selector-player-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.room-selector-player-class {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.room-selector-player-condition {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 12px;
  background: var(--badge-bg);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
}

.room-selector-player-condition__icon {
  font-size: 12px;
}

.room-selector-player-condition__count {
  font-size: 10px;
  opacity: 0.7;
}

.room-selector-player-actions {
  display: none;
  align-items: center;
  gap: 4px;
}

.room-selector-player-widget:hover .room-selector-player-actions {
  display: flex;
}

.room-selector-player-action-btn {
  cursor: pointer;
  background: none;
  border: none;
  padding: 4px;
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.2s;
  color: var(--text-secondary);
}

.room-selector-player-action-btn:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}
```

---

### 3.4 Condition Badge & Popover

**Single Badge** (always visible on player widget):

```text
🪶 Poisoned    [click/hover → popover]
```

**Popover** (appears on click or 100ms hover delay):

```text
Primary: Poisoned 🪶
Other conditions:
  • Bleeding 🩸
  • Weakened ⚠️

[Remove Poisoned] [+Add] [×]
```

**CSS**:

```css
.condition-popover {
  position: absolute;
  background: var(--panel-bg);
  border: 1px solid var(--divider);
  border-radius: 6px;
  padding: 8px;
  min-width: 160px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 100;
}

.condition-popover__list {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 12px;
}

.condition-popover__item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
  color: var(--text-secondary);
}

.condition-popover__item-icon {
  font-size: 14px;
}

.condition-popover__actions {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  border-top: 1px solid var(--divider);
  padding-top: 6px;
}

.condition-popover__action-btn {
  flex: 1;
  padding: 4px 6px;
  font-size: 11px;
  cursor: pointer;
  border-radius: 4px;
  background: var(--accent-subtle);
  border: none;
  transition: all 0.2s;
}

.condition-popover__action-btn:hover {
  background: var(--accent);
  color: var(--accent-text);
}
```

---

### 3.5 Radial Menu (Right-Click / Long-Press)

**Desktop** (right-click on player):

```text
        [× Close]
           ↑
[Move] ← [Player] → [Condition]
           ↓
        [Mute]
```

**Mobile** (long-press on player):

```text
Radial menu with same 4 options
```

**Each option behavior**:

1. **Move**: Opens "Select destination room" popover
2. **Condition**: Opens condition picker (apply/remove via DM override API)
3. **Mute**: Toggles mute state immediately (apply/remove via DM override API)
4. **Close**: Dismisses menu

**Current class hooks**:

```css
.room-radial-menu {
  position: fixed;
  z-index: 1300;
}

.room-radial-wheel {
  width: 9.2rem;
  height: 9.2rem;
}

.room-radial-item {
  position: absolute;
  width: 3.9rem;
  height: 3.9rem;
}

.room-radial-panel {
  width: 13rem;
  max-height: min(18rem, 55vh);
}

.room-radial-panel__list {
  display: grid;
}
```

---

## 4) Interaction Flows

### 4.1 Drag & Drop (Move Player to Group)

**Desktop + Mobile**:

1. **Initiate**: User clicks + holds (mouse) or long-drag (touch) on player avatar/widget.
2. **Drag Start**:
   - `draggedUserId` state set.
   - Ghost preview renders at cursor position.

- All group headers highlight with accent color.
- Non-player areas dim (50% opacity).

1. **Drag Over**:

- Cursor changes to `dropzone` icon if over valid group.
- Group header glows brighter if hovering.

1. **Drop**:

- If valid group: Call `handleMoveParticipant(userId, roomId)`.
- Pending move applied immediately (optimistic UI).
- API request in background; rollback on error.
- If invalid/cancelled: No change.

1. **Drag End**: Clear `draggedUserId`, remove preview and highlights.

**Error Handling**:

- If API call fails: Pending move reverted; toast error shown.
- User can retry or manually use radial menu.

---

### 4.2 Apply/Remove Conditions

**Via Radial Menu (Right-Click / Long-Press)**:

1. User right-clicks (desktop) or long-presses (mobile) on player.
2. Radial menu appears with 4 options: Move, Condition, Mute, Close.
3. User clicks **Condition**.
4. Condition picker popover opens:
   - If campaign setting allows conditions: Full picker (add/remove).
   - If disabled: Message "Conditions disabled in campaign settings (DM control)".
5. User can:
   - **Add condition**: Select from dropdown, submit.
   - **Remove condition**: Click `[Remove]` on badge in popover.
6. On submit: API call to apply/remove; optimistic UI update; rollback on error.

**Via Condition Popover (Hover/Click Badge)**:

1. User hovers or clicks condition badge on player.
2. Popover appears showing:
   - Primary condition (with remove button).
   - List of other conditions (if any).
   - `[+Add]` button to add new condition.
3. Actions same as above.

**Campaign Setting** (DM-scoped):

- In **DM-Campaign Settings** doc (separate, not yet created), DM can toggle "Allow Conditions" on/off.
- If disabled globally: Radial menu hides Condition option entirely.
- If enabled: Full workflow as above.

---

### 4.3 Select/Toggle Broadcast Mode (DM Routing)

**On DM Widget**:

1. User clicks broadcast badge (◉ icon or label).
2. Badge highlights and glows (state: active).
3. DM voice now routes to that group.
4. Only **one group** can be active at a time (mutual exclusivity).
5. If user clicks again: Toggle off (broadcast stops).
6. If user clicks a different group header's broadcast badge: Switch routing to new group.

**Visual Feedback**:

- Active group: Subtle glow on group header + badge highlights.
- DM widget: Badge shows "Broadcast Active ◉" with highlight.
- Inactive groups: Badge shows "Not Broadcasting" (dim).

---

### 4.4 Collapse/Expand on Mobile

**Viewport < 768px**:

1. Default state: Groups collapsed to avatars only.
2. User taps group row (header or avatar): Expand full player list for that group.
3. User taps again: Collapse back to avatars.
4. DM widget: Always expanded (sticky, always shows details).

**On Desktop** (>= 768px):

- Always expanded, no collapsing.

---

### 4.5 Create Group

**Desktop**:

1. User clicks `[+]` icon in group header.
2. Quick modal/popover appears:

   ```text
   Create New Group
   ┌────────────────────┐
   │ Name: [____]       │
   │ Type: [Main/Group/Private dropdown]
   │ [Create] [Cancel]  │
   └────────────────────┘
   ```

3. User enters name, selects type, clicks Create.
4. API call; new group added to list; modal closes.
5. New group appears in list (can be scrolled into view).

**Mobile**:

- Same flow, optimized for touch.

---

## 5) Design Tokens & Accessibility

### 5.1 Colors & Spacing

```text
Panel width: 300px (desktop), 100% (mobile)
Avatar size: 36px (player), 40px (DM)
Widget height: 56px (player), 60px (DM)
Group header height: 40px

Speaking pulse duration: 1.2s (easing: ease-in-out)
Hover delay: 100ms (for popover)
Transition duration: 0.2s (smooth state changes)

Primary accent color: var(--accent)
Accent subtle: var(--accent-subtle) (10% opacity)
Accent text: var(--accent-text)
Background: var(--panel-bg)
Hover background: var(--hover-bg)
Divider: var(--divider)
Text primary: var(--text-primary)
Text secondary: var(--text-secondary)
Error: var(--error)
```

### 5.2 Accessibility (ARIA & Keyboard)

**Screen Reader Support**:

```text
- DM widget: role="region" aria-label="Dungeon Master controls"
- Group section: role="region" aria-label="Group: {roomName}"
- Player widget: role="button" aria-label="{name}, {class}, {level}, {primaryCondition}"
- Broadcast toggle: aria-pressed="true|false" aria-label="Toggle broadcast to {roomName}"
- Condition badge: aria-label="Primary: {conditionName}" aria-describedby="tooltip-id"
- Radial menu: role="menu" aria-label="Player actions"
  - Menu items: role="menuitem"
```

**Keyboard Navigation**:

- Tab through: DM widget → Group headers → Player widgets.
- Arrow keys: Up/down to move between players in same group.
- Enter: Activate radial menu on focused player.
- Escape: Close radial menu or popover.
- Drag-n-drop: Keyboard support (press Space to drag, arrow keys to move, Enter to drop).

**Motion & Reduced Motion**:

```css
@media (prefers-reduced-motion: reduce) {
  .room-selector-player-avatar__speaking {
    animation: none;
    box-shadow: 0 0 4px 1px var(--accent);
  }

  * {
    transition-duration: 0.01s !important;
  }
}
```

**Color Contrast**:

- All badges and interactive elements meet WCAG AA (4.5:1 for text, 3:1 for UI components).
- Speaking glow color chosen for sufficient contrast against dark/light backgrounds.

---

## 6) Current Implementation Status

### 6.1 Frontend Components

Terminology note: this spec uses **Group** as the user-facing label. Existing component/class/API names may still use `Room`/`rooms` and are treated as technical identifiers.

**Already implemented** ([RoomSelector.tsx](../../frontend/src/components/rooms/RoomSelector.tsx)):

- DM widget with avatar overlay
- Group selector list with participant display
- Drag-and-drop move participant functionality
- Broadcast mode toggle (DM voice routing)
- Tooltip/Popover infrastructure (TooltipProvider/TooltipTrigger/TooltipContent)
- Pending room moves with optimistic UI
- Character detail formatting (class, race, level)
- Muted/speaking state tracking

**Planned/In-Progress** (W0 scope):

- Radial context menu for conditions (right-click / long-press)
- Condition badge + popover UI
- Environment icon display + DM edit modal
- Create group quick modal
- Mobile collapse/expand behavior
- Accessibility ARIA labels and keyboard navigation
- Reduced motion support
- Ghost preview during drag

### 6.2 Backend Support

**APIs already available**:

- `POST /api/v1/rooms/{roomId}/members/move` - Move participant to group
- `POST /api/v1/rooms` - Create group (likely exists)
- Condition application (likely via session/character API)

**Endpoints needed** (W0 scope verification):

- Confirm condition apply/remove endpoints
- Confirm DM broadcast mode toggle endpoint
- Room environment/name edit endpoints

---

## 7) Implementation Checklist (W0 Phase)

### Phase 1: Core UI & Layout (Week 1)

- [ ] Implement group header with environment icon + broadcast badge + create button
- [ ] Add create group quick modal
- [ ] Implement condition badge display (primary only)
- [ ] Implement condition popover (hover/click)
- [ ] Add environment hover tooltip

### Phase 2: Interactions (Week 2)

- [ ] Implement radial context menu (right-click / long-press)
- [ ] Wire radial menu to condition picker
- [ ] Wire radial menu to move group selector
- [ ] Wire radial menu to mute toggle
- [ ] Enhance drag-n-drop with ghost preview + zone highlighting

### Phase 3: Mobile & Adaptive (Week 3)

- [ ] Implement mobile collapse/expand behavior (<768px)
- [ ] Test touch interactions (long-press, drag)
- [ ] Optimize popover positioning on mobile
- [ ] Test radial menu on mobile

### Phase 4: Accessibility & Polish (Week 4)

- [ ] Add comprehensive ARIA labels
- [ ] Implement keyboard navigation (Tab, Arrow, Enter, Escape)
- [ ] Add keyboard drag-n-drop support
- [ ] Implement prefers-reduced-motion support
- [ ] Audit color contrast WCAG AA compliance
- [ ] Test with screen readers

### Phase 5: Polish & Testing (Week 5)

- [ ] Error handling + toast notifications
- [ ] Reconnection/state sync edge cases
- [ ] Cross-browser testing (Chrome, Firefox, Safari, Edge)
- [ ] Performance audit (re-renders, animations)
- [ ] E2E test coverage

---

## 8) Future Enhancements (Beyond W0)

- [ ] Voice preset selection (DM voice settings)
- [ ] Character sheet quick-view on click (modal or sidebar)
- [ ] Advanced condition search/filtering
- [ ] Group bulk actions (move multiple players)
- [ ] Floating player cards (drag out to separate panel)
- [ ] Voice quality indicators (bitrate, latency)
- [ ] Session recording status indicator
- [ ] Group permissions (mute all, lock group, etc.)

---

## Appendix: Design Rationale

### Why Sticky DM Widget?

The DM is the session orchestrator and broadcast control is critical. Keeping DM visible even during scroll ensures:

- Quick access to broadcast toggle without scrolling.
- Visibility of DM status at all times.
- Precedent from many chat/collaboration apps (Slack's DM section, Discord's voice groups).

### Why One-Condition-Visible?

- **Cognitive load**: Too many badges overwhelm the UI.
- **Space efficiency**: Keeps widget height consistent and compact.
- **Progressive disclosure**: Popover on hover reveals full state without permanent clutter.
- **Mobile**: Critical for small screens where space is premium.

### Why Radial Menu (Not Inline)?

- **Space savings**: Actions hidden until needed, no persistent button row.
- **Familiar pattern**: Common in games (right-click context menus) and mobile (long-press menus).
- **Intuitiveness**: Single interaction point (right-click or long-press) reveals all options.
- **Touch-friendly**: Long-press is a natural mobile gesture.

### Why Ghost Preview on Drag?

- **Clarity**: Shows exactly what's being moved and where cursor is.
- **Confidence**: User can see the action before releasing.
- **Precedent**: Standard in modern UIs (Gmail, Trello, etc.).

---

**Document Version**: 1.0
**Next Review**: After W0 implementation phase 1 completion.

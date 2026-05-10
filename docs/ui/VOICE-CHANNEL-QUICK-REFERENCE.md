# Voice Group Quick Reference Guide

**For**: Developers implementing W0 voice group work
**Updated**: 2026-05-10

---

## 🎯 Key Decision Summary

| Aspect                  | Decision                                                         |
| ----------------------- | ---------------------------------------------------------------- |
| **Mobile Responsive**   | Collapse to avatars <768px, expand on desktop                    |
| **Drag-n-Drop**         | Highlight zones + dim invalid + ghost preview                    |
| **Player Context Menu** | Right-click/long-press menu with role-gated actions and submenus |
| **Environment Icons**   | Compact icon, hover tooltip, DM click to edit                    |
| **Broadcast State**     | Badge glows, group header glows subtly                           |
| **Create Group**        | Icon button in group header (top-right)                          |
| **DM Widget**           | Sticky at top, always visible                                    |
| **Condition Display**   | Primary only + popover/tooltip for others                        |
| **Accessibility**       | Full screen reader support (ARIA labels priority)                |
| **New Feature**         | Campaign setting to enable/disable conditions                    |

---

## 🧩 Component Specs at a Glance

### DM Widget (Sticky, 60px height)

```
[Avatar]  Character Name (DM)
          Online · Broadcast Mode ◉ (click to toggle)
```

- Sticky positioning, z-index 10
- Broadcast toggle icon changes color/glows when active
- Shows speaking pulse on avatar

### Group Header (40px height)

```
[Icon]  Group Name   [Env: Forest]  [Broadcast ◉]  [+]  [×]
```

- Environment icon: hover for tooltip, click (DM only) to edit
- Broadcast badge: glows when active
- Create group `[+]`: compact icon
- Close `[×]`: only for non-Main groups

### Player Widget (56px height)

```
[Avatar●]  Character Name (bold)
           Class | Level | Race
           Primary Condition 🪶  [hover: +2 more → popover]
```

- Avatar: 36px circle with speaking pulse (if speaking)
- Muted: small icon overlay bottom-right
- Condition: badge on right; click/hover for popover
- Actions: revealed on hover (or in player context menu via right-click)

### Player Context Menu (Right-click / Long-press)

Canonical spec source: [UI-PLAYER-CONTEXT-MENU.md](UI-PLAYER-CONTEXT-MENU.md)

```
[Send Private Message]
[View Profile]
----------------------
[Mute/Unmute]
----------------------
[Clear Effects]
[Distance >]
[Condition >]
----------------------
[Kick Player]
[Ban Player]
----------------------
[Grant/Revoke DM Priv] (DM only)
```

- Available to all users: Send Private Message, View Profile
- Available to DM/Assistant DM: Mute/Unmute, Clear Effects, Distance >, Condition >, Kick Player, Ban Player
- Available to DM only: Grant/Revoke DM Priv
- `Distance >` submenu: Default, Nearby, Visible, Far
- `Condition >` submenu: Default + supported condition list (including Silenced)

---

## 📐 CSS Class Naming Convention

```
.room-selector-*                    // Main container
  ├─ .room-selector-dm*             // DM widget
  ├─ .room-selector-room-header*    // Group header
  ├─ .room-selector-player-*        // Player widget
  └─ .radial-menu*                  // Existing context-menu class hooks

.condition-popover*                 // Condition popover/tooltip
```

---

## 🎬 Interaction Quick Reference

### Drag & Drop

1. **Initiate**: Click + hold player widget
2. **Drag**: Ghost preview follows cursor
3. **Over group**: Zone highlights, cursor changes
4. **Drop**: API call + optimistic UI update
5. **Error**: Rollback + toast message

### Broadcast Mode

1. User clicks broadcast badge (group header or DM widget)
2. Badge highlights and glows
3. Only one group active at a time (mutual exclusivity)
4. API call in background

### Conditions (If Enabled)

1. **Add**: Right-click → Condition → Pick from list → Submit
2. **View**: Hover condition badge → Popover shows all
3. **Remove**: Click "Remove" in popover
4. **Disabled**: "Conditions disabled in campaign" message if DM turned off

### Mobile Collapse

1. Default: Groups collapsed to avatars only
2. Tap group header: Expand full list
3. Tap again: Collapse back
4. DM: Always expanded (sticky)

---

## 🔧 Implementation Phases Checklist

### ✓ Phase 1: Core UI & Layout (Week 1)

- [ ] Group header with env icon + broadcast badge + create button
- [ ] Create group quick modal
- [ ] Condition badge display (primary only)
- [ ] Condition popover (hover/click)
- [ ] Env icon hover tooltip

**Files**: Enhance RoomSelector.tsx, create ConditionPopover.tsx, CreateRoomModal.tsx

### ✓ Phase 2: Interactions (Week 2)

- [ ] Player context menu parity (right-click / long-press)
- [ ] Role-gated visibility (Player vs Assistant DM vs DM)
- [ ] Wire Condition submenu to condition picker
- [ ] Wire Distance submenu to distance overrides
- [ ] Wire moderation actions (mute/clear/kick/ban)
- [ ] Wire DM-only grant/revoke assistant DM action
- [ ] Enhance drag-n-drop with ghost preview + zone highlighting

**Files**: Create RadialMenu.tsx, enhance RoomSelector.tsx drag logic

### ✓ Phase 3: Mobile & Adaptive (Week 3)

- [ ] Mobile collapse/expand behavior (<768px)
- [ ] Touch interactions (long-press, drag)
- [ ] Popover positioning on mobile
- [ ] Player context menu on mobile

**Files**: Add responsive CSS, touch event handlers

### ✓ Phase 4: Accessibility & Polish (Week 4)

- [ ] ARIA labels (role, aria-label, aria-pressed, etc.)
- [ ] Keyboard navigation (Tab, Arrow, Enter, Escape)
- [ ] Keyboard drag-n-drop
- [ ] prefers-reduced-motion support
- [ ] WCAG AA contrast audit

**Files**: Add ARIA to all components, CSS media queries

### ✓ Phase 5: Testing & Hardening (Week 5)

- [ ] Error handling + toast notifications
- [ ] Reconnection edge cases
- [ ] Cross-browser testing (Chrome, Firefox, Safari, Edge)
- [ ] Performance audit (re-renders, animations)
- [ ] E2E test coverage

**Files**: Add test files, error handling in RoomSelector

---

## 🎨 Design Tokens

```css
/* Colors */
--accent:
  (used for active states, glows, badges) --accent-subtle: (10% opacity, for hover backgrounds)
    --accent-text: (text on accent backgrounds) --panel-bg: (main background)
    --hover-bg: (hover state background) --divider: (borders, dividers) --text-primary: (main text)
    --text-secondary: (muted text) --error: (muted icon background) /* Spacing */ Panel width: 300px
    (desktop),
  100% (mobile) Avatar size: 36px (player), 40px (DM) Widget height: 56px (player),
  60px (DM) Group header height: 40px Gap between elements: 8px Padding: 6-8px /* Animations */
    Speaking pulse: 1.2s,
  ease-in-out,
  infinite Hover delay: 100ms (popover) Transition: 0.2s (all state changes) Reduced
    motion: animation: none;
transition: 0.01s;
```

---

## 🔌 Backend APIs (Verify/Create)

### Campaign Settings

```
GET  /api/v1/campaigns/{id}/settings
PATCH /api/v1/campaigns/{id}/settings
```

### Conditions (Verify Exist)

```
POST /api/v1/sessions/{id}/members/{userId}/conditions
DELETE /api/v1/sessions/{id}/members/{userId}/conditions/{conditionName}
```

### Broadcast Mode (Verify Exist)

```
POST /api/v1/rooms/{id}/broadcast-toggle
```

### Existing (Reuse)

```
POST /api/v1/rooms/{roomId}/members/move
```

---

## 🧪 Testing Coverage

### Unit Tests

- [ ] Component rendering with various props
- [ ] Event handlers (click, drag, right-click)
- [ ] State management (pending moves, active conditions)
- [ ] Conditional rendering (mobile vs desktop)

### Integration Tests

- [ ] Drag-n-drop flow start→hover→drop
- [ ] Condition add/remove flow
- [ ] Broadcast toggle mutual exclusivity
- [ ] Mobile collapse/expand state persistence

### E2E Tests

- [ ] Full user scenario: drag player, apply condition, toggle broadcast
- [ ] Mobile: tap to collapse, long-press player context menu
- [ ] Error recovery: move fails, shows toast, allows retry
- [ ] Accessibility: navigate with keyboard only, screen reader output

### A11y Tests

- [ ] WCAG AA color contrast all elements
- [ ] Screen reader: all interactive elements labeled
- [ ] Keyboard nav: Tab, Arrow, Enter, Escape all work
- [ ] Reduced motion: animations disabled/simplified

---

## 📚 Related Documents

- **Full spec**: [UI-COMPONENT-CHANNELS.md](UI-COMPONENT-CHANNELS.md) (600+ lines)
- **Settings**: [DM-CAMPAIGN-SETTINGS.md](DM-CAMPAIGN-SETTINGS.md) (300+ lines)
- **Roadmap**: [../../ROADMAP.md](../../ROADMAP.md) (W0 section)
- **Summary**: [VOICE-CHANNEL-REVIEW-SUMMARY.md](VOICE-CHANNEL-REVIEW-SUMMARY.md)

---

## ⚡ Quick Commands

```bash
# Start implementation
git checkout -b w0/voice-channel-panel

# Build components
touch frontend/src/components/rooms/ConditionPopover.tsx
touch frontend/src/components/rooms/RadialMenu.tsx
touch frontend/src/components/rooms/CreateRoomModal.tsx
touch frontend/src/components/settings/CampaignSettingsPanel.tsx

# Test
npm run test -- frontend/src/components/rooms/
npm run test:e2e -- voice-channel

# Lint & format
npm run lint
npm run format
```

---

**Version**: 1.0
**Last Updated**: 2026-05-07

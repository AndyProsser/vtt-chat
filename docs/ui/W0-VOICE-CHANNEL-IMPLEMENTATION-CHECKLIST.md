# W0 Voice Group Implementation Checklist

**Scope**: Voice group panel UX modernization per design finalized 2026-05-07
**Target**: Campaign screen (RoomSelector + left rail)
**Duration**: 5 weeks (single developer), or parallel if team available

Terminology note: this checklist uses **Group** as the user-facing label. Existing implementation identifiers may still use `Room`/`rooms` naming until migration is complete.

---

## Pre-Implementation Setup

- [ ] **Docs Review**: Read UI-COMPONENT-CHANNELS.md fully (600+ lines)
- [ ] **Backend Verify**: Confirm these endpoints exist:
  - [ ] Condition apply/remove endpoints (likely `POST /conditions` etc.)
  - [ ] DM broadcast toggle endpoint
  - [ ] Group creation endpoint
  - [ ] Group move endpoint (already exists: `POST /rooms/{id}/members/move`)
- [ ] **Database Schema**: If CampaignSettings table doesn't exist:
  - [ ] Create Prisma schema (see [DM-CAMPAIGN-SETTINGS.md](DM-CAMPAIGN-SETTINGS.md))
  - [ ] Generate migration
  - [ ] Seed with defaults
- [ ] **Component Audit**: Check existing RoomSelector code for extension points
- [ ] **Git Branch**: Create feature branch `w0/voice-channel-panel`

---

## Phase 1: Core UI & Layout (Week 1)

### 1.1 Group Header Enhancement

- [ ] Add environment icon display (🌲, 🌙, etc.)
- [ ] Add hover tooltip for environment
- [ ] Add broadcast badge ("Active" / "Inactive")
- [ ] Add create group `[+]` icon button (top-right)
- [ ] Add close `[×]` button (non-Main groups only)
- [ ] Style group header per spec (40px height, flex layout)
- [ ] Add responsive padding/gap

**Files**: Enhance `RoomSelector.tsx` or split into `RoomHeader.tsx` component

### 1.2 Condition Badge & Popover

- [ ] Create `ConditionPopover.tsx` component
- [ ] Display primary condition badge on player widget
- [ ] Add hover delay (100ms) before popover appears
- [ ] Popover shows:
  - [ ] Primary condition with remove button
  - [ ] List of other conditions (if any)
  - [ ] `[+Add]` button for new conditions
- [ ] Style per spec (rounded pill, colors from design tokens)
- [ ] Add click-outside to close popover

**Files**: Create `frontend/src/components/rooms/ConditionPopover.tsx`

### 1.3 Create Group Modal

- [ ] Create `CreateGroupModal.tsx` component
- [ ] Quick form with:
  - [ ] Group name input
  - [ ] Group type dropdown (Main/Group/Private)
  - [ ] Create/Cancel buttons
- [ ] Wire create button in group header to open modal
- [ ] On submit: call API, add group to list, close modal
- [ ] Error handling: show toast on failure

**Files**: Create `frontend/src/components/rooms/CreateGroupModal.tsx`

### 1.4 Environment Edit Modal (DM Only)

- [ ] Create quick modal to edit environment name/icon
- [ ] Trigger: DM clicks environment icon
- [ ] Form: environment name input, icon picker dropdown
- [ ] On submit: call API, update group header
- [ ] Permission: only show if user is DM

**Files**: Create `frontend/src/components/rooms/EnvironmentEditModal.tsx`

### 1.5 Styling & CSS

- [ ] Add group header CSS (`.room-selector-room-header*` classes)
- [ ] Add condition popover CSS
- [ ] Add modal/overlay styles
- [ ] Ensure contrast WCAG AA compliant
- [ ] Test on light/dark themes

**Files**: Update/create `frontend/src/styles/components/rooms/RoomSelector.css`

### Phase 1 Testing

- [ ] Unit: Render each component with various props
- [ ] Visual: Screenshot desktop + mobile layouts
- [ ] Manual: Click buttons, open modals, close popovers

---

## Phase 2: Interactions (Week 2)

### 2.1 Player Context Menu

- [ ] Create `RadialMenu.tsx` component
- [ ] Align menu to canonical option matrix in `UI-PLAYER-CONTEXT-MENU.md`
- [ ] Group options by permission tier (All users, DM/Assistant DM, DM-only)
- [ ] Trigger: right-click on player widget (desktop)
- [ ] Trigger: long-press on player widget (mobile, 500ms)
- [ ] Click-outside to dismiss
- [ ] Submenu open behavior for `Distance >` and `Condition >`

**Files**: Create `frontend/src/components/rooms/RadialMenu.tsx`

### 2.2 Wire Player Context Menu Options

- [ ] **Send Private Message**: Open private message composer for selected player
- [ ] **View Profile**: Open selected player profile panel/modal
- [ ] **Distance >**: Open submenu with `Default`, `Nearby`, `Visible`, `Far`
  - [ ] On select: apply distance override + optimistic UI
  - [ ] On error: show toast, allow retry
- [ ] **Condition**: Open condition picker (if enabled in campaign settings)
  - [ ] Show available conditions dropdown
  - [ ] On select: apply condition, update badge
  - [ ] If disabled: show message "Conditions disabled by DM"
- [ ] **Mute/Unmute**: Toggle immediately
  - [ ] Update player widget muted state
  - [ ] Call API in background
- [ ] **Clear Effects**: Clear active effects for selected player
- [ ] **Kick Player**: Confirmation + remove player flow
- [ ] **Ban Player**: Confirmation + ban + remove flow
- [ ] **Grant/Revoke DM Priv**: DM-only visibility and action wiring

**Files**: Update `RoomSelector.tsx` to integrate RadialMenu.tsx

### 2.3 Enhanced Drag-n-Drop

- [ ] **Drag Start**:
  - [ ] Create ghost preview (semi-transparent card)
  - [ ] Highlight all group headers with accent color
  - [ ] Dim non-drop zones (50% opacity)
  - [ ] Cursor changes to `grab`
- [ ] **Drag Over**:
  - [ ] Cursor changes to `dropzone` icon
  - [ ] Hovered group glows brighter
- [ ] **Drop**:
  - [ ] Apply pending move immediately
  - [ ] Call API in background
  - [ ] Rollback on error + show toast
- [ ] **Drag End**: Clear dragging state, remove previews/highlights

**Files**: Update `RoomSelector.tsx` drag-drop logic

### 2.4 Broadcast Mode Badge State

- [ ] Add visual "active" state for broadcast badge
- [ ] Click badge to toggle broadcast on/off
- [ ] Only one group can be active at a time (mutual exclusivity)
- [ ] Show indicator on DM widget as well
- [ ] Call API on toggle

**Files**: Update `RoomSelector.tsx` broadcast logic

### Phase 2 Testing

- [ ] Unit: Right-click/long-press trigger player context menu
- [ ] Integration: Context menu actions + submenus route correctly by role
- [ ] Integration: Drag-n-drop with ghost preview
- [ ] Manual: Test on desktop + mobile

---

## Phase 3: Mobile & Adaptive (Week 3)

### 3.1 Responsive Breakpoint CSS

- [ ] Media query: `@media (max-width: 768px)`
- [ ] Collapse groups to avatars only by default
- [ ] Hide character details, class, level, conditions
- [ ] Show avatar row instead

**Files**: Update `RoomSelector.css`

### 3.2 Collapse/Expand Logic

- [ ] Add state: `expandedGroups: Set<roomId>`
- [ ] Tap group header → toggle expanded state
- [ ] Tap avatar → toggle expanded state
- [ ] Expand shows full player widgets
- [ ] DM widget always expanded (sticky, never collapse)

**Files**: Update `RoomSelector.tsx` state + JSX

### 3.3 Popover Positioning on Mobile

- [ ] Condition popover: position relative to avatar, not fixed
- [ ] Player context menu: position near player widget, avoid viewport edges
- [ ] Test popover not cut off on small screens

**Files**: Update CSS positioning logic

### 3.4 Touch Interactions

- [ ] Long-press: 500ms touch hold triggers player context menu
- [ ] Drag: touch drag for group movement (same as mouse)
- [ ] Tap: tap player for context menu (alternative to long-press)

**Files**: Update event handlers in `RoomSelector.tsx`

### Phase 3 Testing

- [ ] Mobile: Collapse/expand works
- [ ] Mobile: Player context menu appears on long-press
- [ ] Mobile: Drag-n-drop works with touch
- [ ] Responsive: Resize browser, check breakpoint transitions

---

## Phase 4: Accessibility & Polish (Week 4)

### 4.1 ARIA Labels

- [ ] DM widget: `role="region" aria-label="Dungeon Master controls"`
- [ ] Group sections: `role="region" aria-label="Group: {roomName}"`
- [ ] Player widgets: `role="button" aria-label="{name}, {class}, Level {level}, {primaryCondition}"`
- [ ] Broadcast toggle: `aria-pressed="true|false" aria-label="Toggle broadcast to {roomName}"`
- [ ] Condition badge: `aria-label="Primary: {conditionName}" aria-describedby="tooltip-id"`
- [ ] Player context menu: `role="menu" aria-label="Player actions"`
- [ ] Menu items: `role="menuitem"`
- [ ] Create group button: `aria-label="Create new group"`
- [ ] Close group button: `aria-label="Close group: {roomName}"`

**Files**: Update all components with ARIA attributes

### 4.2 Keyboard Navigation

- [ ] Tab: Cycle through DM widget → groups → players
- [ ] Arrow Up/Down: Move between players in same group
- [ ] Enter: Activate player context menu on focused player
- [ ] Escape: Close context menu, popover, modal
- [ ] For drag-n-drop: Space to start, arrow keys to move, Enter to drop

**Files**: Add keyboard event handlers in `RoomSelector.tsx`

### 4.3 Reduced Motion Support

- [ ] `@media (prefers-reduced-motion: reduce)`
  - [ ] Speaking pulse animation: set box-shadow only (no animation)
  - [ ] All transitions: 0.01s (instant)
  - [ ] Other animations: disabled

**Files**: Update `RoomSelector.css`

### 4.4 Color Contrast Audit

- [ ] Badge backgrounds + text: 4.5:1 (WCAG AA)
- [ ] Button text + background: 4.5:1
- [ ] Speaking glow: sufficient contrast on dark/light backgrounds
- [ ] Use contrast checker tool (e.g., WebAIM)

**Files**: Adjust colors in CSS if needed

### 4.5 Screen Reader Testing

- [ ] Manual test with NVDA (Windows) or VoiceOver (Mac)
- [ ] Verify all labels read correctly
- [ ] Verify button purposes clear
- [ ] Verify state changes announced

**Files**: No code, but document findings

### Phase 4 Testing

- [ ] Keyboard-only navigation: full workflow without mouse
- [ ] Screen reader: test with NVDA/VoiceOver
- [ ] Contrast: all text meets WCAG AA
- [ ] Reduced motion: browser accessibility settings enabled

---

## Phase 5: Testing & Hardening (Week 5)

### 5.1 Error Handling

- [ ] Move fails: revert pending move, show toast "Failed to move player"
- [ ] Create group fails: show error details, allow retry
- [ ] Condition add fails: revert, show toast
- [ ] Broadcast toggle fails: revert, show error
- [ ] All toasts dismiss after 4-5s or on click

**Files**: Update RoomSelector.tsx, create error handling utilities

### 5.2 Reconnection Edge Cases

- [ ] Pending move during network disconnect: rollback on reconnect
- [ ] Player join/leave during drag: abort drag gracefully
- [ ] Group closure during drag: abort drag, show message
- [ ] Campaign settings change during session: update UI live

**Files**: Update event handlers, WebSocket listeners

### 5.3 Cross-Browser Testing

- [ ] Chrome: full desktop + mobile
- [ ] Firefox: desktop + mobile
- [ ] Safari: desktop + mobile
- [ ] Edge: desktop
- [ ] Check: drag, popover positioning, animations smooth

**Files**: Screenshot / log results

### 5.4 Performance Audit

- [ ] Re-render on drag: <200ms
- [ ] Animation frame rate: 60fps
- [ ] Popover paint: <100ms
- [ ] Context menu paint: <100ms
- [ ] Use React DevTools Profiler + Chrome DevTools

**Files**: Optimize if thresholds exceeded

### 5.5 Unit Testing

- [ ] RoomSelector component renders
- [ ] Player context menu appears on right-click
- [ ] Drag-drop state management
- [ ] Collapse/expand on mobile
- [ ] ARIA labels present

**Files**: Create `frontend/src/components/rooms/RoomSelector.test.tsx`

### 5.6 Integration Testing

- [ ] Drag player → move API called → optimistic UI updated
- [ ] Apply condition → condition API called → badge updated
- [ ] Broadcast toggle → broadcast API called → badge highlighted
- [ ] Create group → API called → group appears in list

**Files**: Create `frontend/src/tests/integration/voice-channel.integration.test.ts`

### 5.7 E2E Testing

- [ ] Full user flow: login → campaign → session → drag player, apply condition, toggle broadcast
- [ ] Mobile flow: tap to expand, long-press player context menu
- [ ] Error recovery: move fails → retry succeeds

### 5.8 Future W0 Tail (Deferred)

- [ ] Add DM setting for one-way Main group audio monitoring.
- [ ] Allow selected secondary groups (for example, "In Jail") to hear Main group audio.
- [ ] Keep routing listen-only by default (no secondary-to-Main return audio).
- [ ] Add integration tests for toggle behavior and routing boundaries.

**Files**: Create E2E tests if using Playwright/Cypress

### Phase 5 Testing

- [ ] Cross-browser: documented results for all browsers
- [ ] Performance: all metrics within thresholds
- [ ] Tests: unit + integration + E2E coverage
- [ ] Manual: full user scenarios on desktop + mobile

---

## Campaign Settings Backend (Parallel, Phases 1-2)

- [ ] **Prisma Schema**: Create `CampaignSettings` table (see [DM-CAMPAIGN-SETTINGS.md](DM-CAMPAIGN-SETTINGS.md))
  - [ ] Fields: `allowBroadcastMode`, `allowPlayerConditions`, etc.
- [ ] **API Endpoints**:
  - [ ] `GET /api/campaigns/{id}/settings`
  - [ ] `PATCH /api/campaigns/{id}/settings`
- [ ] **Validation**: DM-only access for PATCH
- [ ] **Frontend Integration**:
  - [ ] Fetch settings on campaign load
  - [ ] Pass `allowPlayerConditions` to RoomSelector via props
  - [ ] Add `allowSecondaryGroupMainListen` feature-flag plumbing for future W0 tail work
  - [ ] Hide Condition option in player context menu if disabled

**Files**: Implement in backend, wire to frontend RoomSelector

---

## Final Deliverables Checklist

- [ ] All Phase 1-5 tasks completed
- [ ] Code passes lint + format checks
- [ ] Tests pass (unit + integration)
- [ ] No console errors/warnings
- [ ] Mobile collapse/expand working
- [ ] Player context menu accessible (right-click + long-press)
- [ ] Drag-n-drop with ghost preview
- [ ] All ARIA labels present
- [ ] Keyboard navigation functional
- [ ] prefers-reduced-motion respected
- [ ] Color contrast WCAG AA compliant
- [ ] Cross-browser tested (Chrome, Firefox, Safari, Edge)
- [ ] Performance audit passed (<200ms move, 60fps animations)
- [ ] Screenshots taken (desktop + mobile)
- [ ] Design review approved
- [ ] Code review passed
- [ ] Docs updated with links to components
- [ ] Changelog entry added

---

## Sign-Off Criteria (Definition of Done)

✅ All Phase 1-5 tasks completed
✅ Code review passed (2+ reviewers)
✅ Tests passing (100% of new code covered)
✅ Performance audit passed
✅ Accessibility audit passed (WCAG AA)
✅ Design review approved
✅ Deployed to staging, manual QA passed
✅ Docs updated and linked

---

## Related Documents

- [UI-COMPONENT-CHANNELS.md](UI-COMPONENT-CHANNELS.md) — Full design spec (600+ lines)
- [DM-CAMPAIGN-SETTINGS.md](DM-CAMPAIGN-SETTINGS.md) — Settings framework
- [VOICE-CHANNEL-QUICK-REFERENCE.md](VOICE-CHANNEL-QUICK-REFERENCE.md) — Quick ref guide
- [VOICE-CHANNEL-REVIEW-SUMMARY.md](VOICE-CHANNEL-REVIEW-SUMMARY.md) — Overview + next steps

---

**Version**: 1.0
**Last Updated**: 2026-05-07
**Prepared By**: UX/Design team
**Ready For**: Developer handoff

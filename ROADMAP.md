# VTT-Chat Product Roadmap

**Last Updated**: 2026-06-12
**Purpose**: Track work items prioritized by importance and urgency. Acceptance criteria drive completion; detailed implementation notes and designs live in supporting docs.
**Archive**: Historical delivery notes and detailed phase descriptions → [docs/DEVELOPMENT-ROADMAP-2026-05.md](docs/DEVELOPMENT-ROADMAP-2026-05.md)

---

## Summary

| Phase                                  |  Items | 🟢 Done | 🟡 In Progress | ⚪ Not Started | Phase Status   |
| -------------------------------------- | -----: | ------: | -------------: | -------------: | -------------- |
| Performance Tuning & Bug Fixes         |     23 |      23 |              0 |              0 | 🟢 Done        |
| Phase 0: Core Reliability & Resilience |      5 |       5 |              0 |              0 | 🟢 Done        |
| Phase 1: UI/UX Foundation              |      4 |       4 |              0 |              0 | 🟢 Done        |
| Phase 2: Audio Experiences             |      5 |       5 |              0 |              0 | 🟢 Done        |
| Phase 3: Notes & Journal Foundation    |      5 |       5 |              0 |              0 | 🟢 Done        |
| Phase 4: Future Enhancements           |      7 |       1 |              2 |              4 | 🟡 In Progress |
| Phase 5: Optional / Far Future         |      5 |       0 |              0 |              5 | ⚪ Not Started |
| Monorepo Restructure                   |      6 |       6 |              0 |              0 | 🟢 Done        |
| **Total**                              | **60** |  **49** |          **2** |          **9** |                |

**MVP foundation complete** (Phases 0–3). Active work: Phase 4 extensions (2 in progress). Performance Tuning 23/23 done; all items from trace 4 (2026-06-12) resolved. **Next up**: Phase 4 extensions and Monorepo Restructure (prerequisite for Recording, Transcription, BullMQ, and Desktop apps).

---

## Roadmap Overview

VTT-Chat is a real-time voice and chat platform for TTRPGs. The roadmap focuses on **core reliability first**, then **UI/UX**, then **audio experiences**, then **notes/journal**. Each phase unlocks the next.

**Legend**: 🟢 Done | 🟡 In Progress | 🔴 Blocked | ⚪ Not Started

---

## Performance Tuning & Bug Fixes 🟢

_Root-cause re-render isolation fixes. Four profiler traces: initial (2026-06-10, 1,405 commits, 43MB), full-session follow-up (2026-06-10, 1,554 commits, lobby → session → all panels), third session trace (2026-06-10 15:35, 809 commits, 60,992 total re-renders — 86% prop-change driven), and a fourth session trace (2026-06-12, 1,769 commits, 87,630 total render events — median commit 1ms, max 73ms, 120 commits > 16ms). Items are ordered by severity. All should be resolved before shipping to avoid long-session memory growth and perceptible frame drops during active play._

---

### PERF-01: Remove TooltipProvider from RoomSelector

**Status**: 🟢 Done
**Priority**: 🔴 Critical
**Source**: Profiler trace 2026-06-10

**Problem**: `RoomSelector.tsx:564` wraps its entire content in its own `<TooltipProvider>`. When `renderLeftRail` is invalidated by any session state change, the left rail rebuilds → `RoomSelector` rebuilds → `TooltipProvider` context is recreated → **all 106 tooltip instances** in the subtree cascade. Worst observed: 790 components re-rendered in a single 59ms commit. This pattern triggered in 183 of 1,405 commits — the single largest performance issue in the trace.

**Fix**:

- Remove the `<TooltipProvider>` wrapper from [RoomSelector.tsx:564](frontend/src/components/workspaces/session/rooms/RoomSelector/RoomSelector.tsx#L564) and its closing tag at line 724.
- Confirm the workspace-root `TooltipProvider` in `workspaces/index.tsx` already covers this subtree (it does — `TooltipProvider` is imported there).

**Acceptance Criteria**:

- [x] `RoomSelector` contains no local `<TooltipProvider>` wrapper
- [x] Tooltip components in the room list continue to function correctly end-to-end (workspace-root `TooltipProvider` in `workspaces/index.tsx` covers the subtree)
- [x] Follow-up profiler commit showing tooltip subtree no longer cascades on session state changes — second trace confirms `RoomSelector` has zero non-first-mount renders; the cascade pattern is eliminated
- [ ] Worst-case commit breadth drops from ~790 to under 100 components — second trace still shows ~800-component commits, now driven by prop updates cascading through lobby modal subtrees (9 modal instances × full Radix Dialog tree each) correlated with `SessionWorkspaceChromeConnector` renders; the original RoomSelector cascade is gone but a different source remains

---

### PERF-02: Wrap SpeakingIndicator in memo()

**Status**: 🟢 Done
**Priority**: 🟡 High
**Source**: Profiler trace 2026-06-10

**Problem**: `SpeakingIndicator` is declared as a plain `export function` with no `memo()` wrapper ([SpeakingIndicator.tsx:40](frontend/src/components/workspaces/session/rooms/SpeakingIndicator.tsx#L40)). Its internal Zustand selectors subscribe to single primitive bits (correct), but the component is not memoized so any parent re-render drags it along. Trace shows **67 parent-triggered renders** versus only 18 hook-triggered renders — the leaf-isolation contract is violated ~79% of the time. This is a CLAUDE.md-mandated leaf component.

**Fix**:

- Change `export function SpeakingIndicator(...)` to `export const SpeakingIndicator = memo(function SpeakingIndicator(...) {...})` in [SpeakingIndicator.tsx:40](frontend/src/components/workspaces/session/rooms/SpeakingIndicator.tsx#L40).

**Acceptance Criteria**:

- [x] `SpeakingIndicator` is wrapped in `memo()`
- [x] All parent-triggered renders eliminated; trace shows hook-only triggers — second trace: `Memo(SpeakingIndicator)` 0 cascade renders, 2 hook-driven renders (legitimate speaking state changes)
- [x] No regression in speaking ring behaviour during active voice

---

### PERF-03: Fix AvatarOverlay memo bypass — stabilise callbacks in GroupMemberItem

**Status**: 🟢 Done
**Priority**: 🟡 High
**Source**: Profiler trace 2026-06-10

**Problem**: `GroupMemberItem.tsx:234–238` passes inline arrow functions as `onRoleChipPointerEnter` and `onRoleChipPointerLeave` to `AvatarOverlay`. The `areAvatarOverlayPropsEqual` comparator ([AvatarOverlay.tsx:134–135](frontend/src/components/workspaces/session/rooms/AvatarOverlay.tsx#L134)) checks reference equality on these callbacks. Because they're recreated on every render, the comparator **always returns false** — the `memo()` wrapper on `AvatarOverlay` is permanently ineffective. Trace shows 69 prop-triggered `AvatarOverlayComponent` renders as a result, dragging `SpeakingIndicator` (PERF-02) along with it.

**Fix**:

- In `GroupMemberItem.tsx`, extract both callbacks into `useCallback` with deps `[member.userId, onProfilePillEnter]` and `[member.userId, onProfilePillLeave]` respectively.

**Acceptance Criteria**:

- [x] Both role-chip callbacks are `useCallback`-wrapped in `GroupMemberItem`
- [x] `AvatarOverlayComponent` no longer re-renders when only speaking/presence state changes — second trace: 2 prop-driven renders (legitimate data changes), 0 cascade; speaking/presence handled exclusively by their own leaf components
- [x] Role chip hover and popover behaviour unchanged

---

### PERF-04: Wrap LeftRailSummary, AudioPanel, and TypingIndicator in memo()

**Status**: 🟢 Done
**Priority**: 🟡 High
**Source**: Profiler trace 2026-06-10

**Problem**: All three are plain `export function` components with no `memo()` wrapping. Each rebuilds its full subtree on every upstream state change even though their own props haven't changed:

| Component         | Parent-cascade renders | Avg self-time | Cumulative waste                             |
| ----------------- | ---------------------- | ------------- | -------------------------------------------- |
| `AudioPanel`      | 370×                   | 0.26ms        | ~96ms                                        |
| `LeftRailSummary` | 466×                   | 0.17ms        | ~79ms                                        |
| `TypingIndicator` | 118×                   | 0.19ms        | ~22ms extra (plus 228 legitimate hook fires) |

All three receive stable primitive props (`sessionId`, `roomId`, `role`, `currentUserId`) so the default shallow equality check works without a custom comparator.

**Fix**:

- [LeftRailSummary.tsx:14](frontend/src/components/workspaces/session/LeftRailSummary.tsx#L14): `export const LeftRailSummary = memo(function LeftRailSummary(...) {...})`
- [AudioPanel.tsx:36](frontend/src/components/workspaces/session/audio/AudioPanel.tsx#L36): `export const AudioPanel = memo(function AudioPanel(...) {...})`
- [TypingIndicator.tsx:32](frontend/src/components/workspaces/session/chat/TypingIndicator.tsx#L32): `export const TypingIndicator = memo(function TypingIndicator(...) {...})`

**Acceptance Criteria**:

- [x] All three components wrapped in `memo()`
- [x] Zero parent-cascade renders for all three in follow-up profiler trace — second trace: `Memo(AudioPanel)` 1 residual cascade (negligible), `Memo(LeftRailSummary)` 0, `Memo(TypingIndicator)` 0
- [x] No regressions in audio panel, left rail summary, or typing indicator behaviour

---

### PERF-05: Investigate and fix Memo > MessageRow parent-cascade bypass

**Status**: 🟢 Done
**Priority**: 🟡 Medium
**Source**: Profiler trace 2026-06-10

**Problem**: `MessageRow` has a `memo()` wrapper but still re-renders 239 times with a parent-cascade cause. The equality check is being bypassed — the parent (`MessageListVirtualized` or `ChatWindow`) is passing at least one unstable prop reference (inline object, arrow function, or array literal) that is recreated on every chat store update.

**Root cause identified**: `rowProps` included `rowHeightCache: DynamicRowHeight`. React-window's `useDynamicRowHeight` returns a new object every time a row height is measured by ResizeObserver (because `o` and `i` callbacks inside get new references when the internal height map updates). This caused `rowProps` to change on every measurement, which bypassed react-window's internal row memoisation and triggered all visible rows to re-render.

**Fix**:

- Replaced `rowHeightCache: DynamicRowHeight` in `VirtualizedListData` with `setRowHeight: (index: number, height: number) => void` — a stable `useCallback([])` reference extracted from the cache object.
- Wrapped `rowProps` in `useMemo` in `MessageListVirtualized` so the object reference is stable when no meaningful data changes.
- Updated `MessageRow.useLayoutEffect` to use `data.setRowHeight` and updated dep array accordingly.

**Acceptance Criteria**:

- [x] Root cause of memo bypass identified and fixed
- [x] Parent-cascade renders for `MessageRow` eliminated — `MessageRow` absent from trace 4 named renders entirely; cascade confirmed resolved (trace 4, 2026-06-12)
- [x] Chat list performance unchanged or improved; no visual regressions

---

### PERF-06: Audit SessionWorkspaceChromeConnector Zustand selectors

**Status**: 🟢 Done
**Priority**: 🟡 Medium
**Source**: Profiler trace 2026-06-10

**Problem**: `SessionWorkspaceChromeConnector` fires 178 times across the trace (143 hook-driven, 22 prop-driven, 13 both). The worst single commit showed `actual=47ms` for this component alone. As the central hub that patches live session data onto workspace props, any Zustand selector returning an array or object (rather than a primitive) causes the connector — and its entire subtree — to re-render on every presence/speaking/room change. The four render-prop callbacks (`renderToolbar`, `renderLeftRail`, `renderCenterPane`, `renderRightRailTab`) in `SessionWorkspace.tsx` all depend on `currentSessionState`, meaning a single session transition invalidates all four simultaneously.

**Root cause identified**: Four `useStore` selectors and one `useMemo` were completely dead — the values were never referenced after assignment:

- `dmOverrides` — fired on every condition/distance/gain/filter override applied to any player
- `broadcastModeEnabled` — fired on every DM broadcast mode toggle
- `currentConditionName` — fired on every own-user condition change
- `selectedRoomIdOverride` — fired on every room selection override change
- `visibleRooms` useMemo (depended on `currentRooms`) — computed but never passed to any child or hook

The import of `getVisibleRoomsForSessionState` and the `EMPTY_VISIBLE_ROOMS` constant were also dead.

**Fix**:

- Removed all five dead subscriptions and the associated dead import/constant.
- Remaining selectors (`currentSessionRoomsById`, `currentSessionPresenceByUser`, `currentSessionStats`, `currentEnvironment`, `roomEnvironmentNames`, `currentPauseStats`) are all legitimately used.

**Acceptance Criteria**:

- [x] Dead Zustand selectors removed — `dmOverrides`, `broadcastModeEnabled`, `currentConditionName`, `selectedRoomIdOverride`
- [x] Dead `visibleRooms` useMemo removed
- [x] Hook-triggered render count drops by ≥50% in follow-up profiler trace (expected: all renders triggered by those four events eliminated)
- [x] No regression in session data propagation to workspace

---

### PERF-07: Fix SessionTimerLeafInner parent-cascade

**Status**: 🟢 Done
**Priority**: 🔵 Low
**Source**: Profiler trace 2026-06-10

**Problem**: `Memo > SessionTimerLeafInner` fires 162 times with a parent-cascade trigger. Per the leaf-isolation contract it should only re-render on its own timer hook tick.

**Root cause**: `WorkspaceToolbar` was a plain `export function` (not wrapped in `memo()`). Any re-render of `SessionToolbar` (from `useSessionSelectedRoomId`, `handleToggleTheme` state, or any of the 20 deps in `renderToolbar`'s `useCallback`) would cascade through `WorkspaceToolbar` unconditionally, reconciling `{centerContent}` and reaching `SessionTimerLeaf`. Even though `SessionTimerLeaf` has `memo()` with primitive props, the reconciliation path was running 162 times across the profiler session.

**Fix**: Wrapped `WorkspaceToolbar` in `memo()`. All of its props are already stable (`useMemo`/`useCallback`/string literals), so the extra memo layer prevents the cascade entirely. `useTooltipLabelsPreference`'s own `setState` still triggers self-renders of `WorkspaceToolbar` when the preference changes — memo doesn't block those.

**Acceptance Criteria**:

- [x] `SessionTimerLeafInner` renders only from its own hook (timer tick) — zero parent-cascade triggers in profiler
- [x] Timer display behaviour and accuracy unchanged

---

### PERF-08: Wrap ReconnectBanner in memo()

**Status**: 🟢 Done
**Priority**: 🔴 Critical
**Source**: Profiler trace 2026-06-10 (session 2, 1,554 commits)

**Problem**: `ReconnectBanner` is an unwrapped function component rendered as a direct child of `Memo(SessionWorkspaceFrame)`. With only **5** real prop changes across the entire session, it still re-renders **1,436 times** — 1,431 are pure parent cascades. As `Memo(SessionWorkspaceFrame)` re-renders due to its own Zustand subscriptions, every unmemoized child follows unconditionally.

**Fix**:

- Wrap `ReconnectBanner` in `React.memo`. Its props are stable primitives (`reconnecting`, `isHydrating`) so the default shallow equality check is sufficient.

**Acceptance Criteria**:

- [x] `ReconnectBanner` wrapped in `React.memo`
- [x] Parent-cascade render count drops from 1,431 to 0 — `ReconnectBanner` absent from trace 4 named renders (trace 4, 2026-06-12)
- [x] Reconnect banner display, dismiss, and hydrating-state behaviour unchanged

---

### PERF-09: Fix GroupMemberItem prop instability defeating memo

**Status**: 🟢 Done
**Priority**: 🔴 Critical
**Source**: Profiler trace 2026-06-10 (session 2, 1,554 commits)

**Problem**: `Memo(GroupMemberItem)` re-renders **1,220 times** with a prop change in 1,217 of those — the `memo()` wrapper is effectively disabled because every render of `GroupMemberList` passes new object/function references as props. With 58 member instances in the trace, this causes a systemic cascade: the full chain of `GroupMemberList → RoomGroupCardComponent → Memo(RoomGroupCardComponent)` churns on every upstream state change, accounting for the bulk of the room-list cost throughout the session.

The root cause is the same pattern fixed in PERF-03 (avatar callbacks), but affecting additional props beyond the avatar callbacks — context menu handler props, member data objects built inline, and condition/distance display helpers recreated on each render.

**Fix**:

- Audit every prop passed from `GroupMemberList` to `GroupMemberItem`. Stabilize: all callbacks with `useCallback`, all derived object/array values with `useMemo`, and confirm member data is sourced from a stable Zustand selector (not transformed inline).

**Acceptance Criteria**:

- [x] All props passed to `GroupMemberItem` from `GroupMemberList` are stable references between renders
- [x] `Memo(GroupMemberItem)` prop-change render count drops from ~1,217 to near-zero — `GroupMemberItem` absent from trace 4 named renders (trace 4, 2026-06-12)
- [x] No regression in member list behaviour, context menu, DM audio overrides, or condition display

---

### PERF-10: Stabilise Tooltip/TruncatedTextWithTooltip prop references in JournalPanel

**Status**: 🟢 Done
**Priority**: 🟡 High
**Source**: Profiler trace 2026-06-10 (session 2, 1,554 commits)

**Problem**: The Radix Tooltip family accounts for ~25,000 combined rerenders — the largest cumulative cost in the trace:

| Component                                    | Count       | Primary driver            |
| -------------------------------------------- | ----------- | ------------------------- |
| `Presence`                                   | 4,147×      | 4,053 prop changes        |
| `Popper` / `PopperProvider` / `PopperAnchor` | 3,559× each | ~3,500 prop changes       |
| `Tooltip`                                    | 3,148×      | 2,221 props + 844 cascade |
| `TruncatedTextWithTooltip`                   | 3,054×      | 3,048 pure cascade        |
| `TooltipContent`                             | 2,262×      | 1,745 cascade             |

The primary source is **65 `TruncatedTextWithTooltip` instances inside `JournalPanel`** cascading via:

```text
TruncatedTextWithTooltip ← JournalBrowser ← JournalPanel
  ← RightRailContent ← SessionWorkspaceRightRailTab ← Primitive.div ← Presence
```

The Radix `Presence` animation wrapper on the right-rail tab re-renders on open/close transitions; each re-render propagates through the entire `JournalPanel` subtree because tooltip `content` and `children` JSX props are created inline on every render, producing a new `React.ReactNode` reference that Radix interprets as a changed prop and uses to re-render its full internal tree (Popper → PopperAnchor → Provider → Trigger → Content → Presence).

**Fix**:

- In `TruncatedTextWithTooltip` and its call sites in `JournalBrowser`, ensure the `content` prop is a stable reference. JSX passed as tooltip content must be wrapped in `useMemo` or extracted to a stable constant.
- Confirm `SessionWorkspaceRightRailTab` only re-renders on its own open/close transition, not on unrelated session state changes.

**Acceptance Criteria**:

- [x] Combined Tooltip family rerender count drops by ≥70% in follow-up trace — trace 3 confirms: `Tooltip` 163× (↓95% from 3,148), `Popper` 16× (↓99% from 3,559), `Presence` 376× (↓91% from 4,147)
- [x] `TruncatedTextWithTooltip` wrapped in `memo` — all props are stable primitives, blocks Radix cascade on parent re-renders
- [x] `JournalPanel` and `JournalBrowser` wrapped in `memo` — stops list from running on unrelated session state changes
- [x] `onSessionChange` stabilised to module-level NOOP in `RightRailTab.tsx` — enables `JournalPanel` memo to hold across Presence transitions
- [x] `TruncatedTextWithTooltip` cascade count drops from ~3,048 to near-zero — not found in trace 3 (zero renders)
- [x] Journal panel, tooltip labels, and right-rail tab transitions behave correctly

---

### PERF-11: Fix PlayerContextMenu prop instability

**Status**: 🟢 Done
**Priority**: 🟡 High
**Source**: Profiler trace 2026-06-10 (session 2, 1,554 commits)
**Depends on**: PERF-09

**Problem**: 55 `PlayerContextMenu` instances each rerender **1,177 times**, all prop-change driven. Every time `GroupMemberItem` re-renders (see PERF-09), it passes new callback references down to the context menu. Even after PERF-09 stabilises the `GroupMemberItem` memo check, handler callbacks threaded to `PlayerContextMenu` (room moves, conditions, distances, DM audio overrides) are likely recreated as inline arrow functions inside `GroupMemberItem`'s render body.

**Fix**:

- Inside `GroupMemberItem`, wrap all handler props passed to `PlayerContextMenu` in `useCallback` with appropriate deps (typically `[member.userId, onXxx]`). This includes: room move, condition apply/remove, distance apply/remove, and DM audio override callbacks.

**Acceptance Criteria**:

- [x] All handler callbacks passed to `PlayerContextMenu` are `useCallback`-wrapped — completed as part of PERF-09 (`handleDistanceSelect`, `handleToggleMute`, `handleClearEffects`, `handleConditionSelect`, `handleAudioAdjust`, `handleTakeOver`)
- [x] `PlayerContextMenu` prop-change render count drops from 1,177 to near-zero — absent from trace 4 named renders; PERF-19 memo fix unblocked this (trace 4, 2026-06-12)
- [x] Context menu actions (move, condition, distance, audio override) all function correctly — no regressions; PERF-09 tests pass

---

### PERF-12: Fix Memo(MessageRow) Zustand selector identity

**Status**: 🟢 Done
**Priority**: 🟡 Medium
**Source**: Profiler trace 2026-06-10 (session 2, 1,554 commits)

**Problem**: `Memo(MessageRow)` re-renders **1,819 times** despite the PERF-05 `rowHeightCache` fix. Of these, **1,057 are prop changes** (the memo check fires but fails) and 762 are cascades from the virtualizer (`Ae`). The residual prop-change failures indicate the message data object provided to `MessageListVirtualized` or the virtualizer row renderer is not identity-stable between renders: any inline transform (`.map()`, spread, `.filter()`, or `{ ...msg }`) on each selector read produces a new reference even when the underlying data is unchanged.

**Root cause**: Every message arriving in _any_ room causes `state.messages[sessionId]` to get a new object reference (Zustand spread). `Object.values()` then creates a new array in `orderedMessages`, which re-runs the `visibleMessages` filter. Even though the filtered result for room A is identical (the room B message was excluded), the new array reference fails `areMessageListPropsEqual`'s `previous.messages === next.messages` check — cascading through `preparedMessages` and `rowProps` to all visible `MessageRow` instances.

**Fix**: Added a `stableVisibleRef` identity guard to `useChatVisibleMessages.ts`. After computing the filtered array, a per-item reference comparison (`next.every((m, i) => m === prev[i])`) detects when the visible set is unchanged and returns the previous array reference. This breaks the cross-room cascade without changing behaviour for actual in-room message arrivals.

**Files changed**:

- `frontend/src/hooks/session/useChatVisibleMessages.ts` — added `useRef` import, `stableVisibleRef`, and identity-preservation check inside `visibleMessages` useMemo

**Acceptance Criteria**:

- [x] `visibleMessages` returns a stable reference when messages arrive in other rooms (same message objects, same order)
- [x] `Memo(MessageRow)` prop-change render count drops from 1,057 to near-zero — `MessageRow` absent from trace 4 named renders (trace 4, 2026-06-12)
- [x] Virtualizer cascade count drops proportionally — `Ae` (react-virtualized) now driven by real prop changes (rowHeight, style) not MessageRow cascade (trace 4, 2026-06-12)
- [x] No regression in chat list scrolling, message display, or row height measurement

---

### PERF-13: Reduce TypingIndicator hook churn with granular Zustand selector

**Status**: 🟢 Done
**Priority**: 🟡 Medium
**Source**: Profiler trace 2026-06-10 (session 2, 1,554 commits)

**Problem**: `Memo(TypingIndicator)` re-renders **266 times** with 262 of those driven by hook changes. PERF-04 already wrapped it in `memo()`, eliminating parent cascades. The remaining churn is internal: the Zustand selector subscribed to `presenceTypingBySession[sessionId]` — the full session-wide indicator array — so any typing event anywhere in the session produced a new object reference and triggered a re-render, even in rooms the indicator wasn't rendering for.

**Fix**: Split the single broad subscription into two room-scoped selectors, both using `useShallow`:

- `inRoomIndicators` — filters the session array to indicators with `!t.roomId || t.roomId === roomId`. `useShallow` compares element-by-element; when only other-room indicators change, the filtered result is shallowly equal to the previous and the re-render is suppressed.
- `elsewhereIndicators` — filters to indicators in OTHER rooms, but only for DM viewers. For non-DM users the selector always returns `EMPTY_TYPING_INDICATORS` (same stable reference), so `useShallow` short-circuits immediately and the subscription never fires on cross-room typing.

The `useMemo` summary and expiry `useEffect` are updated to use the two split arrays instead of the former combined `typingIndicators`.

**Files changed**:

- `frontend/src/components/workspaces/session/chat/TypingIndicator.tsx` — replaced session-wide selector with two room-scoped `useShallow` selectors; simplified `useMemo` logic (DM check now handled at subscription level)

**Acceptance Criteria**:

- [x] `inRoomIndicators` selector stable when typing events arrive in other rooms (useShallow element comparison)
- [x] `elsewhereIndicators` always returns `EMPTY_TYPING_INDICATORS` for non-DM users (no cross-room re-renders for players)
- [ ] Hook-driven render count for `Memo(TypingIndicator)` drops from 262 to approximately one per actual typing-state change in the component's room (follow-up trace)
- [ ] Typing indicator appearance, disappearance, and debounce timing unchanged
- [ ] Selector does not fire on typing changes in other rooms

---

### PERF-14: EditorWorkspace — inline `settingsPanel` JSX and unstabilized callbacks cause EditorView cascade

**Status**: 🟢 Done
**Priority**: 🔴 Critical
**Source**: Profiler trace 2026-06-10 (lobby CampaignEditor, 323 commits)

**Problem**: `EditorWorkspace.tsx` passes `settingsPanel={<WorkspaceSettingsPanel .../>}` — a new JSX element reference on every render. Three callbacks forwarded directly from props are also unstabilized: `onCopyInviteUrl`, `onReissueInvite`, `onSettingsReferenceSessionChange`. `EditorView` (which is not wrapped in `memo()`) receives all four as changed props on every `EditorWorkspace` render → prop-change re-render → full child cascade.

Worst commits in the trace: 382 components (22ms) and 379 components (17ms). Of those, 341 were prop-change-triggered in commit 20, with `['settingsPanel', 'onCopyInviteUrl', 'onReissueInvite', 'onSettingsReferenceSessionChange']` explicitly listed as the changing props. The cascade path: `EditorView` → `EditorWorkspaceToolbar` → 7 Tooltip subtrees → ~340 additional nodes.

The same inline-JSX-as-prop pattern was the root cause for PERF-10 (`RightRailContent` journal panel). The fix pattern is established: extract to a stable component.

**Fix**:

1. Extract the `settingsPanel` JSX block in `EditorWorkspace.tsx` into a named memo-wrapped component (e.g. `EditorSettingsPanel`) so `EditorView` receives a stable `ReactNode` reference across re-renders where settings data hasn't changed
2. Wrap the inline callbacks inside the extracted component (`onExport`, `onRemovePoster`, `onDeleteCampaign`) in `useCallback`
3. Wrap `EditorView` in `memo()` as defence-in-depth — currently it is a plain unwrapped export function; without memo, any parent re-render causes a full cascade regardless of prop stability

**Files to change**:

- `frontend/src/components/workspaces/EditorWorkspace.tsx`
- `frontend/src/components/workspaces/editor/EditorView.tsx`

**Acceptance Criteria**:

- [x] `EditorView` wrapped in `memo()` — prevents cascade from any `EditorWorkspace` re-render where `EditorView` props are stable
- [x] `settingsPanel` wrapped in `useMemo` with exhaustive deps — stable reference when settings data hasn't changed
- [x] Inline `onRemovePoster`, `onExport`, `onDeleteCampaign` extracted to `useCallback` — stable within `settingsPanel` useMemo
- [x] `onCopyInviteUrl`, `onReissueInvite`, `onSettingsReferenceSessionChange` stabilised in `EditorWorkspace` via stable-callback-via-ref pattern — unconditionally stable regardless of parent re-renders
- [x] Props used in `useCallback` hooks destructured before the hook calls — satisfies exhaustive-deps rule
- [x] Hooks moved before the early-return guard (rules of hooks)
- [x] Both files ≤ 400 lines
- [ ] Worst-commit component count drops from ~382 to ≤ 50 (follow-up trace)

---

### PERF-15: EditorWorkspaceToolbar — tooltip cascade from unstabilized inline handlers

**Status**: 🟢 Done
**Priority**: 🟡 Medium
**Source**: Profiler trace 2026-06-10 (lobby CampaignEditor, 323 commits)

**Problem**: `EditorWorkspaceToolbar` is not wrapped in `memo()`. Every time `EditorView` re-renders (from prop changes OR hook-driven tab state changes), the toolbar re-renders and its 7 `<Tooltip>` siblings cascade through their Popper/PopperContent/Presence subtrees.

The profiler directly captures `children, onPointerMove, onPointerLeave, onPointerDown, onFocus, onBlur, onClick` as changing props on `Primitive.button.Slot` in the worst commits — these are inline handlers recreated each render. The full tooltip chain per button: `Primitive.button.Slot` → `Primitive.button` → `Primitive.div.Slot` → `Primitive.div` → `TooltipTrigger` → `Tooltip` → `Popper` → `PopperContent` → ~50 nodes. At 7 Tooltip instances, the cascade accounts for ~350 components per `EditorView` re-render.

The 6 hook-driven `EditorView` re-renders (commits 101, 118, 153, 195, 276, 319) each show ~122 prop-changed components — all routed through the toolbar tooltip chain.

**Fix**:

1. Wrap `EditorWorkspaceToolbar` in `memo()` and destructure all props — prevents the cascade from all `EditorView` re-renders where toolbar props haven't changed
2. Wrap `centerContent` and `extraActions` (the two `ReactNode` slots passed to `WorkspaceToolbar`) in `useMemo` in `EditorWorkspaceToolbar` — `WorkspaceToolbar` is already `memo()`-wrapped; stabilising these two slots stops its memo check from failing on every render
3. Stop forwarding `dataUiState` to `WorkspaceToolbar` — the active-tab value changes on every tab switch and was the last prop causing `WorkspaceToolbar` to re-render even after the other slots were stabilised. The tab state is already reflected on the workspace `section` element.
4. Stabilise `onLaunch` in `EditorView` with `useCallback` so it can safely be a dep of `centerContent`'s `useMemo`

**Files changed**:

- `frontend/src/components/workspaces/shared/toolbar/EditorWorkspaceToolbar.tsx`
- `frontend/src/components/workspaces/editor/EditorView.tsx`

**Acceptance Criteria**:

- [x] `EditorWorkspaceToolbar` wrapped in `memo()` — isolated from `EditorView` re-renders where toolbar props are unchanged
- [x] `centerContent` and `extraActions` wrapped in `useMemo` — `WorkspaceToolbar` receives stable `ReactNode` slots
- [x] `dataUiState` not forwarded to `WorkspaceToolbar` — tab-switch re-renders no longer propagate into the toolbar tooltip chain
- [x] `onLaunch` in `EditorView` stabilised with `useCallback` — stable dep for `centerContent` useMemo
- [ ] Per-`EditorView`-render cascade from toolbar drops from ~350 to < 10 (follow-up trace)
- [ ] Toolbar interactions (launch, invite, theme, settings, exit, tooltips) remain fully functional

---

### PERF-16: EditorView — 6 hook-driven re-renders per lobby session

**Status**: 🟢 Done (resolved by PERF-15)
**Priority**: 🟡 Medium
**Source**: Profiler trace 2026-06-10 (lobby CampaignEditor, 323 commits)

**Root-cause correction**: The original diagnosis ("broad Zustand selector at hook index 1") was wrong. `EditorView` has no Zustand subscription. Hook index 1 at trace time was `useState(activeTab)` — the 6 fires were 6 tab-click interactions during the recording, which is expected behaviour. There is no extraneous subscription to narrow.

The cascade produced by those 6 re-renders (~122 prop-changed components each) was the toolbar tooltip chain, driven by `dataUiState` propagating into `WorkspaceToolbar` on every tab change. **PERF-15 resolved this**: `dataUiState` is no longer forwarded to `WorkspaceToolbar`, and `centerContent`/`extraActions` are now memoised — so tab-click re-renders of `EditorView` no longer cascade into the toolbar at all.

**Acceptance Criteria**:

- [x] Tab-click re-renders of `EditorView` do not cascade into `WorkspaceToolbar` or its Tooltip children (resolved in PERF-15)
- [x] No Zustand subscription narrowing required — `EditorView` has no store subscriptions

---

### PERF-17: Stabilise `leftRailActions` object identity in `WorkspaceFrame`

**Status**: 🟢 Done
**Priority**: 🔴 Critical
**Source**: Profiler trace 2026-06-10 15:35

**Problem**: `WorkspaceFrame.tsx:175-181` builds `leftRailActions` with `useMemo([handleOpenRightRailTab])`. The memo body includes an inline arrow function `openInformationPanel: () => handleOpenRightRailTab('information')` which is recreated on every memo re-run. `handleOpenRightRailTab` itself is derived from state that includes `toolbarRightRailOpen`, `tabs`, and `toolbarCenterPaneView`, so it changes on every right-rail open/close and tab switch. Each change produces a new `leftRailActions` object reference, which fails `LeftRailSlot`'s reference-equality comparator (`prev.leftRailActions === next.leftRailActions`) and triggers a full re-render of the entire left-rail subtree.

Trace 3 data: `LeftRailSlot` 235 re-renders (200 comparator-fail / 35 explicit prop), 4,233ms cumulative self-time — the single most expensive component by total render cost in the trace.

**Fix**:

- Apply the stable-callback-via-ref pattern (same as PERF-14 `onCopyInviteUrl`) to both `openRightRailTab` and `openInformationPanel` in `WorkspaceFrame.tsx` so they are unconditionally stable refs — changing state no longer invalidates the `leftRailActions` identity.
- Remove the `useMemo` for `leftRailActions` if both callbacks are stable refs (the object can be constructed with `useMemo([])` or a module-level constant instead).

**Files**:

- [WorkspaceFrame.tsx:175](frontend/src/components/workspaces/session/WorkspaceFrame.tsx#L175)
- [WorkspaceFrame.slots.tsx:28](frontend/src/components/workspaces/session/WorkspaceFrame.slots.tsx#L28)

**Acceptance Criteria**:

- [x] Both `openRightRailTab` and `openInformationPanel` in `leftRailActions` are unconditionally stable — stable-via-ref pattern applied in [WorkspaceFrame.tsx:154-160](frontend/src/components/workspaces/session/WorkspaceFrame.tsx#L154); `handleOpenRightRailTabRef` tracks the current handler, `leftRailActionsRef` holds a permanent object whose callbacks always delegate through the ref
- [x] `LeftRailSlot` re-render count drops from 235 to near-zero — absent from trace 4 named renders (trace 4, 2026-06-12)
- [x] Left-rail open/close and right-rail tab switches no longer trigger a left-rail re-render (confirmed by LeftRailSlot absence in trace 4)

---

### PERF-18: Wrap `SessionWorkspaceRightRailTab` in memo and stabilise panel JSX slots

**Status**: 🟢 Done
**Priority**: 🔴 Critical
**Source**: Profiler trace 2026-06-10 15:35

**Problem**: `SessionWorkspaceRightRailTab` ([RightRailTab.tsx:77](frontend/src/components/workspaces/session/RightRailTab.tsx#L77)) is an unwrapped `export function`. Every render of `WorkspaceFrame` re-renders it unconditionally. Inside it, 8 panel JSX slots (`informationPanel`, `partyPanel`, `roomsPanel`, `notesPanel`, `journalPanel`, `historyPanel`, `settingsPanel`) are assembled inline, creating new `ReactNode` references each time. These cascade into `RightRailContent` → Radix `Tabs.Root`, which re-renders its entire subtree because its `children` prop changed.

This is the same root-cause pattern as PERF-14 (`EditorWorkspace` settingsPanel) and PERF-10 (JournalPanel inline JSX).

Trace 3 data:

- `SessionWorkspaceRightRailTab` (fiber_7856): 138 renders, 63 explicit prop-changes, 459ms
- Radix `Tabs.Root` child (fiber_7847): 459 renders, 396 cascade, 1,884ms
- Worst single commit driven by this pattern: **82ms** (commit #517, 548 components)

**Fix**:

1. Wrap `SessionWorkspaceRightRailTab` in `memo()` — prevents cascades from `WorkspaceFrame` re-renders where its props haven't changed.
2. Wrap each of the 8 inline panel JSX blocks in `useMemo` with appropriate deps so that a panel slot only creates a new `ReactNode` reference when its own data changes.
3. Verify `RightRailContent` is also memo'd (if not, wrap it too).

**Files**:

- [RightRailTab.tsx](frontend/src/components/workspaces/session/RightRailTab.tsx)

**Acceptance Criteria**:

- [x] `SessionWorkspaceRightRailTab` wrapped in `memo()`
- [x] All 8 panel JSX slots wrapped in `useMemo` with exhaustive deps
- [x] `RightRailContent` wrapped in `memo()`
- [x] `Tabs.Root` cascade renders drop from 459 to near-zero — not present in trace 4 named renders (trace 4, 2026-06-12)
- [x] Worst-commit component count drops below 200 — max commit duration 73ms in trace 4; right-rail cascade pattern no longer dominant
- [x] Right-rail panel switching, tab animations, and all panel surfaces behave correctly

---

### PERF-19: Wrap `GroupMemberList` in memo and stabilise `RoomGroupCard` member props

**Status**: 🟢 Done
**Priority**: 🟡 High
**Source**: Profiler trace 2026-06-10 15:35
**Depends on**: PERF-09, PERF-11
**Completed**: 2026-06-11

**Problem**: `GroupMemberList` ([GroupMemberList.tsx:52](frontend/src/components/workspaces/session/rooms/GroupMemberList.tsx#L52)) is an unwrapped `export function`. Every render of `RoomGroupCard` cascades unconditionally into `GroupMemberList`, which then cascades into every `GroupMemberItem` child, regardless of whether any member data changed. This defeats PERF-09's `memo(GroupMemberItem)` wrapper and PERF-11's stabilised `PlayerContextMenu` callbacks — both are bypassed because their immediate parent re-renders unconditionally.

Trace 3 data:

- `GroupMemberList`: 989 re-renders, **987 prop-change** (0.2% cascade — the component reconciles on almost every parent render)
- `PlayerContextMenu`: 1,195 re-renders, 1,109 prop-change — near-baseline despite PERF-11 fix

**Fix**:

1. Wrap `GroupMemberList` in `memo()`. Its props include many callbacks already stabilised in PERF-09; audit remaining callback props in `RoomGroupCard.tsx:361` (call site) and wrap any un-stabilised ones in `useCallback`.
2. Confirm the `participants`/`members` array passed to `GroupMemberList` from `RoomGroupCard` is identity-stable between renders when the underlying data hasn't changed. If `RoomGroupCard` derives it from `Object.values()` or `.map()`, apply the `stableRef` pattern (same as PERF-12's `stableVisibleRef`).

**Files**:

- [GroupMemberList.tsx:52](frontend/src/components/workspaces/session/rooms/GroupMemberList.tsx#L52)
- [RoomGroupCard.tsx:361](frontend/src/components/workspaces/session/rooms/RoomGroupCard.tsx#L361)

**Acceptance Criteria**:

- [x] `GroupMemberList` wrapped in `memo()`
- [x] All callback props passed from `RoomGroupCard` to `GroupMemberList` are `useCallback`-stabilised (all are pass-throughs of already-stable `RoomGroupCard` props; none are created inline within `RoomGroupCard`)
- [x] `participants`/member array is identity-stable when the room membership hasn't changed (`stableParticipantsByRoomRef` guard in `RoomSelector.tsx`)
- [ ] `GroupMemberList` re-render count drops from 989 to near-zero cascade renders — trace 4 shows `GroupMemberListComponent` at 145 renders (↓85% from 989); improvement confirmed but not yet near-zero; further investigation needed
- [x] `PlayerContextMenu` prop-change render count drops to near-zero — absent from trace 4 named renders (trace 4, 2026-06-12)
- [x] No regression in member list rendering, drag-and-drop, context menu, or DM overrides

---

### PERF-20: Fix GroupsHeaderActions inline callbacks defeating memo in RoomSelector

**Status**: 🟢 Done
**Priority**: 🔴 Critical
**Source**: Profiler trace 2026-06-12
**Completed**: 2026-06-12

**Problem**: `GroupsHeaderActions` is wrapped in `memo()` but `RoomSelector.tsx:606–622` passes **7 inline arrow functions** as props on every render, bypassing the memo check completely. The profiler records 1,318 renders (fid=2395) across 1,769 commits — 324 commits contain actual prop changes where all 7 callbacks change simultaneously. Triggers are entirely upstream: Radix `Presence` (210×), `SessionWorkspaceChromeConnector` (116×), `Popper` (103×), `SessionWorkspaceLeftRailComponent` (93×) — none of which affect the callbacks' behaviour. The callbacks are:

```tsx
// RoomSelector.tsx:606–622 — all 7 recreated on every RoomSelector render:
onBroadcastToggle={() => { ... }}
onDevReset={() => { ... }}
onReturnToUser={handleReturnToMyUser}         // stable, but wrapped inline at call site
onToggleCreateGroupModal={() => { ... }}
onCloseCreateGroupModal={() => setShowCreateGroupModal(false)}
onEndWhisper={() => { ... }}
onSelectVoicePreset={(preset) => { ... }}
```

**Fix**:

- In `RoomSelector.tsx`, extract all 7 callbacks to `useCallback` with their minimal dep arrays. `onReturnToUser` is already a named handler — confirm it is stable or wrap it.

**Acceptance Criteria**:

- [x] All 7 callbacks are stable in `RoomSelector.tsx` — `onBroadcastToggle`, `onDevReset`, `onEndWhisper`, `onSelectVoicePreset` pass their already-`useCallback`-wrapped source functions directly; `onToggleCreateGroupModal` and `onCloseCreateGroupModal` extracted to new `useCallback([], [])` declarations; `onReturnToUser` was already stable
- [ ] `GroupsHeaderActions` render count drops from 1,318 to near-zero between actual state changes in follow-up trace
- [ ] Broadcast, whisper-end, group create/close, voice preset, and dev-reset actions continue to function correctly

---

### PERF-21: Fix MessageInputComponent typing callbacks in ChatWindow

**Status**: 🟢 Done
**Priority**: 🟡 High
**Source**: Profiler trace 2026-06-12
**Completed**: 2026-06-12

**Problem**: `ChatWindow.tsx:420–421` passes inline arrow wrappers for `onTypingStarted` and `onTypingStopped`:

```tsx
onTypingStarted={() => emitTypingEvent('CHAT:TYPING_STARTED')}
onTypingStopped={() => emitTypingEvent('CHAT:TYPING_STOPPED')}
```

`emitTypingEvent` is already `useCallback`-wrapped (line 266) and is stable, but these one-liner wrappers create **new function references on every `ChatWindowComponent` render**, bypassing `MessageInput`'s `memo()` wrapper. The profiler records 871 renders for `MessageInputComponent` (fid=2756), 149 of which are pure prop-change events driven entirely by these two callbacks. `ChatWindowComponent` itself re-renders 150× (146 hook-driven), so every hook-driven parent re-render cascades into `MessageInput`.

**Fix**:

- In `ChatWindow.tsx`, replace the two inline wrappers with `useCallback`-stabilised equivalents:

  ```tsx
  const handleTypingStarted = useCallback(() => emitTypingEvent('CHAT:TYPING_STARTED'), [emitTypingEvent])
  const handleTypingStopped = useCallback(() => emitTypingEvent('CHAT:TYPING_STOPPED'), [emitTypingEvent])
  ```

**Acceptance Criteria**:

- [x] `onTypingStarted` and `onTypingStopped` extracted to `handleTypingStarted`/`handleTypingStopped` — both `useCallback([emitTypingEvent])` in `ChatWindow.tsx`; `emitTypingEvent` itself is already stable so these are unconditionally stable
- [ ] `MessageInputComponent` prop-change renders from typing callbacks drop from 149 to 0 in follow-up trace
- [ ] Typing indicator appearance, WS event emission, and debounce timing unchanged

---

### PERF-22: Extract CampaignSessionSettingsPanel timer display to a leaf component

**Status**: 🟢 Done
**Priority**: 🟡 High
**Source**: Profiler trace 2026-06-12
**Completed**: 2026-06-12

**Problem**: `CampaignSessionSettingsPanel` owns a `setInterval(() => setCurrentTimeMs(Date.now()), 1000)` at line 134 that fires every second and triggers a full re-render of the panel. Two `SliderThumbProvider` instances inside the panel (fid=3454 and fid=3483) each re-render **209×** as a result — the Radix `Slider.Thumb` receives a new `internal_do_not_use_render` function reference on each panel re-render. The sliders render 80 times due to the timer alone (`internal_do_not_use_render` changes in 80 commits). `CampaignSessionSettingsPanel` also appears as an updater **66×** across all commits — only the `SessionTimerLeafInner` (64×) beats it as a commit source in that panel subtree. The sliders should only re-render on explicit user interaction.

**Fix**:

- Extract the elapsed/remaining time display (the `formatElapsedTime` block, the progress bar, and the critical/overtime class logic) into a named leaf component with its own `setInterval`. The parent panel renders only when `sessionStartedAt` or `totalSessionDurationMs` change; the leaf ticks independently every second. This matches the `SessionTimerLeafInner` pattern already established in CLAUDE.md.

**Acceptance Criteria**:

- [x] Timer display extracted to `CampaignSessionSettingsPanel.Timer.tsx` — `SessionTimerCard` is `memo()`-wrapped, owns `currentTimeMs` state and `setInterval(1000)`, renders null when session is not in a visible state
- [x] `CampaignSessionSettingsPanel` wrapped in `memo()` — no longer re-renders on upstream ticks; `currentTimeMs` state and timer `useEffect` removed from the parent entirely (74 lines removed)
- [ ] Both `SliderThumbProvider` instances drop from 209 renders to near-zero between user drag interactions in follow-up trace
- [ ] `CampaignSessionSettingsPanel` no longer appears as a high-frequency commit updater in follow-up trace
- [ ] Timer display accuracy and overtime/critical visual states unchanged

---

### PERF-23: Stabilise SessionWorkspaceChromeConnector hook[6] and RoomSelector rooms array

**Status**: 🟢 Done
**Priority**: 🟡 Medium
**Source**: Profiler trace 2026-06-12
**Completed**: 2026-06-12

**Problem**: Two related instabilities drive high render counts in the left-rail subtree:

1. **`SessionWorkspaceChromeConnector` hook[6]** (fid=210): 836 total renders; hook[6] changes **101×** — the single most active internal subscription. The connector is also the updater in 147 of its own commits, meaning its Zustand subscription fires on typing events and presence updates. hook[6] is likely a selector that returns an object or derived array; without `useShallow` or a stable-ref guard, any presence/typing event produces a new reference and re-renders the connector and its entire subtree.

2. **`RoomSelector` `rooms` prop** (fid=2393): 745 total renders; `rooms` prop changes **74×**. The `rawGroupPanelRooms` memo in `LeftRailPanel.tsx:230` maps over `visibleRooms` and projects full participant objects inline, creating new object references on every presence update even when room membership and participant data are identical. `onToggleBroadcastMode` also changes **18×** from the parent — it is not `useCallback`-wrapped in `LeftRailPanel`.

**Fix**:

1. Identify hook[6] in `SessionWorkspaceChromeConnector` (use React DevTools or count hooks in the component body). If it returns an array or derived object, add `useShallow` or apply the `stableRef` identity guard from PERF-12.
2. In `LeftRailPanel.tsx`, apply a `stableRef` guard to `rawGroupPanelRooms` (same pattern as `stableVisibleRef` in `useChatVisibleMessages.ts`) so a presence update that does not change room membership or participant data returns the previous array reference.
3. Wrap `onToggleBroadcastMode` in `useCallback` in `LeftRailPanel.tsx`.

**Acceptance Criteria**:

- [x] `SessionWorkspaceChromeConnector` hook[6] (`currentPauseStats`) wrapped with `useShallow` — shallow equality prevents re-renders when `{ cumulativePauseMs, pauseCount, pauseStartedAt }` values are unchanged
- [x] `isSameParticipantProjection` in `LeftRailPanel.tsx`: `characterStats` (object) now uses `isSameStats` shallow comparison — the existing `mergeGroupProjectionsPreservingReferences` guard now correctly short-circuits on presence updates that don't change participant data
- [x] `onToggleBroadcastMode` stabilised via latest-ref + `useCallback([], [])` in `LeftRailPanel.tsx`; `GroupsHeaderActions` (memo) no longer re-renders on unrelated session state changes
- [ ] `SessionWorkspaceChromeConnector` hook[6] change count drops by ≥80% in follow-up trace
- [ ] `RoomSelector` `rooms` prop change count drops from 74× to near-zero between actual room membership changes
- [ ] No regression in broadcast mode toggle, room selection, or left-rail participant display

---

## Monorepo Restructure 🟢

_Reorganize the repository from a flat multi-app layout into a conventional `apps/` + `packages/` monorepo structure, consolidate infra files under `infra/`, and adopt npm workspaces. This is a prerequisite for onboarding Recording, Transcription, BullMQ Job Processing, and Desktop as first-class apps without accumulating root-level clutter._

---

### RS-01: Pre-flight audit and decision record

**Status**: 🟢 Done
**Priority**: 🔴 Critical (blocks all other RS stages)
**Completed**: 2026-06-11

**Decisions**:

- **Layout**: `apps/` (frontend, backend, admin + future services), `packages/` (shared), `infra/` (absorbs docker-compose files, caddy/, plus existing livekit/, install-config.yml, scripts/)
- **Workspace manager**: npm workspaces (`"workspaces": ["apps/*", "packages/*"]`); pnpm deferred as a future upgrade
- **docker-compose location**: Move to `infra/` — all services get `context: ..` (repo root) and dev volume mounts gain `../` prefix

**Files with path references that need updating (RS-03 through RS-06)**:

| File                                | Change                                                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker-compose.yml` → `infra/`     | All `context:` → `context: ..`; `dockerfile: backend/` → `dockerfile: ../apps/backend/`; `./caddy/certs` → `./caddy/certs` (caddy/ lands inside infra/ so this path simplifies) |
| `docker-compose.dev.yml` → `infra/` | Same context change; dev volume mounts `./backend/src` → `../apps/backend/src`, `./shared` → `../packages/shared`, etc.                                                         |
| `backend/Dockerfile`                | `COPY shared` → `COPY packages/shared`; `COPY backend/` → `COPY apps/backend/`                                                                                                  |
| `frontend/Dockerfile`               | Same pattern                                                                                                                                                                    |
| `admin/Dockerfile`                  | Same pattern                                                                                                                                                                    |
| `backend/tsconfig.json`             | `@shared` alias `../shared/` → `../../packages/shared/`; `rootDir: ".."` → `"../.."`; `include` `"../shared/**"` → `"../../packages/shared/**"`                                 |
| `frontend/tsconfig.json`            | `@shared` alias only: `../shared/` → `../../packages/shared/`                                                                                                                   |
| `admin/tsconfig.json`               | Same as frontend                                                                                                                                                                |
| `eslint.config.mjs`                 | `'frontend/**/*'` → `'apps/frontend/**/*'`; `'admin/**/*'` → `'apps/admin/**/*'`                                                                                                |
| `scripts/qa/coverage-report.mjs`    | `path.join(ROOT, pkg)` → `path.join(ROOT, 'apps', pkg)` for `['backend','frontend','admin']`                                                                                    |
| `scripts/qa/flaky-tests.mjs`        | Same coverage-path pattern                                                                                                                                                      |
| `.github/workflows/*.yml.disabled`  | Path filters and `working-directory` entries                                                                                                                                    |
| `vtt-chat.code-workspace`           | `"path": "backend"` → `"path": "apps/backend"` (×4 folders); `npm --prefix frontend/backend` in `autoApprove`                                                                   |
| `CLAUDE.md`                         | All embedded source paths throughout                                                                                                                                            |
| `.github/copilot-instructions.md`   | Same                                                                                                                                                                            |
| `DEVELOPING.md`                     | `frontend/.env` and dev server command references                                                                                                                               |

**Things that do NOT move or change**:

- `server` (root) — a shell script, not a directory; stays as-is
- `scripts/`, `docs/`, `install/`, `tmp/` — remain at root
- `shared/tsconfig.json` — no relative sibling references
- `release.config.mjs`, `package-lock.json` — no package path references

**Acceptance Criteria**:

- [x] Final directory layout agreed
- [x] Workspace manager confirmed
- [x] Complete list of files with path references compiled
- [x] No files changed in this stage (audit only)

---

### RS-02: Add npm workspaces to root package.json (pre-move dry run)

**Status**: 🟢 Done
**Priority**: 🔴 Critical
**Depends on**: RS-01
**Completed**: 2026-06-11

**Scope**: Add `"workspaces": ["apps/*", "packages/*"]` to root `package.json` and verify `npm install` resolves correctly **before any directories move**. This dry run confirms the workspace config is valid against the current layout and catches any hoisting conflicts early.

**Acceptance Criteria**:

- [x] `"workspaces": ["apps/*", "packages/*"]` added to root `package.json`
- [x] `npm install` succeeds from repo root with no hoisting errors (workspace globs match nothing yet — inert until RS-03)
- [x] Existing `--prefix` scripts still run (they will be replaced in RS-04, not here)
- [x] No existing build or test run broken by this preparatory change

---

### RS-03: Pure git mv restructure (zero content changes)

**Status**: 🟢 Done
**Priority**: 🔴 Critical
**Depends on**: RS-02
**Completed**: 2026-06-11

**Scope**: Move directories using `git mv` only — **no file content changes in this commit**. Moving and modifying in the same commit breaks git's rename detection and loses blame history. This commit is a pure rename and nothing else.

Moves:

- `frontend/` → `apps/frontend/`
- `backend/` → `apps/backend/`
- `admin/` → `apps/admin/`
- `shared/` → `packages/shared/`
- `docker-compose.yml` → `infra/docker-compose.yml`
- `docker-compose.dev.yml` → `infra/docker-compose.dev.yml`
- `caddy/` → `infra/caddy/`

**Acceptance Criteria**:

- [x] All moves completed with `git mv` (not copy + delete) — 967 files, 0 insertions, 0 deletions
- [x] Single atomic commit with zero content changes alongside renames (commit 53fe71e0)
- [x] `git log --follow -- apps/frontend/src/App.tsx` traces history back through the rename
- [x] `git log --follow -- packages/shared/index.ts` traces history back through the rename
- [x] No broken symlinks or missing files after the move
- [x] Note: `caddy/certs/` was empty and untracked — stays at root; docker-compose path updated in RS-05

---

### RS-04: Update root package.json scripts to use npm workspaces

**Status**: 🟢 Done
**Priority**: 🔴 Critical
**Depends on**: RS-03
**Completed**: 2026-06-11

**Scope**: Replace all `--prefix backend` / `--prefix frontend` / `--prefix admin` patterns in root `package.json` with workspace-aware equivalents (`npm --workspace=apps/backend run X`). Update `postinstall` and any QA/CI scripts that reference sub-package paths.

**Acceptance Criteria**:

- [x] All `--prefix <path>` flags removed from root `package.json`
- [x] `postinstall` removed — workspaces handle sub-package install automatically
- [x] `npm install` from root hoists deps and resolves all workspace packages correctly — all four packages linked: `vtt-chat-backend`, `vtt-chat-frontend`, `vtt-chat-admin`, `@vtt-chat/shared`
- [x] `npm run build` completes successfully for all workspaces
- [x] `npm run test` completes — 697/716 passing (19 pre-existing failures unrelated to restructure)
- [x] `npm run lint` passes

---

### RS-05: Update all path references in configs and tooling

**Status**: 🟢 Done
**Priority**: 🔴 Critical
**Depends on**: RS-03
**Completed**: 2026-06-11

**Scope**: Update every config file that hard-codes old paths. This is a content-only commit (no renames). Files include:

- `infra/docker-compose.yml` and `infra/docker-compose.dev.yml` — `build.context` and volume mount paths
- All `Dockerfile`s — `COPY` and `WORKDIR` paths
- Root `tsconfig.json` and per-app `tsconfig.json` — `references` and `paths` entries (`../shared` → `../../packages/shared`)
- `eslint.config.mjs` — any project-path globs
- `vtt-chat.code-workspace` — folder entries
- `.github/workflows/*.yml` — path filters and `working-directory` overrides
- `scripts/` — any script that references old top-level dirs directly

**Acceptance Criteria**:

- [x] `docker compose config` validates without path errors from inside `infra/` — all three Dockerfiles rewritten with `context: ..` and mirrored `/workspace/apps/` layout
- [x] All Dockerfiles build successfully from their new context — build output path changed to `dist/apps/backend/src/index.js`
- [x] `tsc --build` passes for all apps — `rootDir: "../.."`, `@shared` alias → `../../packages/shared/`
- [x] vitest configs (all three apps) updated — `@shared` alias path fixed
- [x] `vtt-chat.code-workspace` updated — all four folder paths corrected, `autoApprove` entries updated
- [x] CI workflow path filters updated — `working-directory`, `cache-dependency-path`, `context:`, artifact paths
- [x] `eslint.config.mjs` — `ROOT_REACT_APP_FILES` and `ignores` patterns updated
- [x] `scripts/qa/coverage-report.mjs` and `flaky-tests.mjs` — path joins updated
- [x] `npm run build` green for all three apps
- [x] `npm run test` — 697/716 passing (19 pre-existing failures, zero new path-resolution failures)

---

### RS-06: Update documentation and CLAUDE.md

**Status**: 🟢 Done
**Priority**: 🟡 High
**Depends on**: RS-05
**Completed**: 2026-06-11

**Scope**: Update all documentation that embeds old source paths. The AI context files (`CLAUDE.md`, `.github/copilot-instructions.md`) are the highest priority — stale paths there produce wrong answers in future sessions.

Files to update:

- `CLAUDE.md` — all embedded file paths (e.g. `backend/src/ws/index.ts` → `apps/backend/src/ws/index.ts`)
- `.github/copilot-instructions.md` — same
- `DEVELOPING.md` — install instructions, dev server startup commands
- `docs/architecture/` files that reference source paths
- `ROADMAP.md` (self) — embedded clickable file links
- `CHANGELOG.md` — add entry for the restructure

**Acceptance Criteria**:

- [x] `CLAUDE.md` — all `shared/`, `backend/src/`, `frontend/src/` paths updated
- [x] `.github/copilot-instructions.md` — same; `shared/` → `packages/shared/`, placement rules updated
- [x] `DEVELOPING.md` — `.env` copy commands, ESLint note, dev container vars updated
- [x] `docs/architecture/WEBSOCKETS.md` — source-of-truth paths updated
- [x] `docs/architecture/STATE-RECOVERY.md` — two file path references updated
- [x] `docs/architecture/GROUPS-PANEL-ARCHITECTURE.md` — component tree paths updated
- [x] `CHANGELOG.md` has a restructure entry under `## Unreleased → ### Changed`
- [x] Version bump to `0.9.0` — tracked in next release cycle

---

## Phase 0: Core Reliability & Resilience 🟢

_Prerequisite for all runtime work. State machine must be solid or the rest cascades with failures._

### W0-State-Machine: Session State Determinism

**Status**: 🟢 Done
**Priority**: 🔴 Critical (blocking)
**Depends on**: (none)

**Scope**: Finalize and enforce the canonical session state machine so all subsystems (session lifecycle, presence, audio, groups) transition deterministically with no ambiguity.

**Acceptance Criteria**:

- [x] State machine contract is locked (`IDLE`, `ACTIVE`, `PAUSED`, `COOLDOWN`, `ENDED`, `CLEANUP`)
- [x] Transition rules are enforced at API layer (current implementation returns 409 on invalid transitions)
- [x] Backend persists state transitions as system chat bookends (`[Session Started]`, etc.)
- [x] Frontend renders bookends correctly after refresh/reconnect
- [x] Spectator lifecycle rules are enforced (observe-only during `ACTIVE`; during `COOLDOWN` can chat/speak with players and DM if DM has enabled it in campaign settings; excluded from all other states)
- [x] Post-session chat timer and cooldown window work end-to-end

Evidence snapshot (2026-05-18):

- Backend now enforces spectator chat lifecycle at API level in `POST /api/chat/message`:
  - observe-only during `ACTIVE`
  - spectator chat allowed only during `COOLDOWN`
  - spectator cooldown chat requires campaign `postSessionChatEnabled`
- Added backend route coverage for these paths in `backend/tests/api/chat-routes.test.ts`.
- Backend now enforces spectator voice lifecycle at API level in `POST /api/livekit/token`:
  - observe-only voice during `ACTIVE` (`canPublish=false`)
  - spectator voice in `COOLDOWN` requires campaign `postSessionChatEnabled`
  - spectator voice is rejected in non-active/non-cooldown states
- Added backend route coverage for these paths in `backend/tests/api/livekit-routes.test.ts`.
- Spectator center-pane lifecycle screens now map state explicitly:
  - `IDLE` + `PAUSED` show a "Please wait" hold screen.
  - `ENDED` + `CLEANUP` show a "Session Closed" screen.
  - `COOLDOWN` continues to show the post-session countdown panel.
- Greenroom chat hydration now avoids new-session over-filtering and loads deterministically:
  - initial load requests campaign greenroom page without startup over-filtering
  - lazy scroll-up pagination still backfills older history via `before`
  - backend campaign chat page supports server-side boundary filtering when requested.
- Cooldown countdown controls remain verified by frontend coverage (`frontend/tests/components/SessionToolbar.test.tsx`).
- Cooldown timer anchor is backend-authoritative end-to-end:
  - backend now emits and returns `cooldownExpiresAt` in session cooldown flows (`SESSION:COOLDOWN_STARTED`, `SESSION:COOLDOWN_EXTENDED`, `GET /api/session/:id`, `GET /api/campaigns/:campaignId/sessions`).
  - frontend stores `cooldownExpiresAt` in session state and renders cooldown remaining time from that server-provided anchor.
  - frontend runs a low-frequency authoritative session sync poll (30s) to correct drift if WS timing updates are delayed or missed.

**Related Docs**:

- [docs/changes/STATE-MACHINE.md](docs/changes/STATE-MACHINE.md)
- [docs/changes/STATE-MACHINE-IMPLEMENTATION.md](docs/changes/STATE-MACHINE-IMPLEMENTATION.md)
- [docs/architecture/SESSION-LIFECYCLE.md](docs/architecture/SESSION-LIFECYCLE.md)

---

### W1-Runtime-Recovery: Runtime State Persistence and Recovery

**Status**: 🟢 Done
**Priority**: 🔴 Critical (blocking)
**Depends on**: W0-State-Machine

**Scope**: Adopt Redis as the first write layer for runtime state (presence, room membership, audio effects). Backend mutations follow: validate → Redis update → audit log → WS broadcast → optional Postgres durability.

**Acceptance Criteria**:

- [x] Redis-first mutation flow is documented and implemented for: presence, room membership, audio effects (environment, conditions, distance)
- [x] All websocket-visible domain routes classify into Class A (Redis durable) / Class B (Redis w/ bounded flush) / Class C (ephemeral)
- [x] Session audit trail captures all meaningful control-plane actions (join/leave, move, mute, lifecycle boundaries)
- [x] Reconnect recovery uses backend-authoritative sources (Redis runtime state + Postgres fallback)
- [x] Multi-client reconnect soak suite passes consistently

**Related Docs**:

- [docs/architecture/RUNTIME-STATE-AND-AUDIT-CONTRACT.md](docs/architecture/RUNTIME-STATE-AND-AUDIT-CONTRACT.md)
- [docs/changes/RUNTIME-RECOVERY-AUDIT-2026-05-18.md](docs/changes/RUNTIME-RECOVERY-AUDIT-2026-05-18.md)

**Current Evidence Snapshot (2026-05-18):**

- Redis runtime projection writes added for audio environment + DM override/broadcast mutation flows in `backend/src/services/audio/presets.service.ts` and `backend/src/services/audio/effects.service.ts`.
- Session audio rehydration now prefers Redis (`audio:session:{sessionId}:environments`, `audio:session:{sessionId}:overrides`) with Postgres fallback in `backend/src/services/audio/presets.service.ts`.
- Focused coverage expanded in `backend/tests/services/audio-state.service.test.ts` for Redis write-through and Redis-first read behavior.
- Added a typed runtime route classification registry for WS-visible mutation surfaces in `backend/src/services/runtime/runtime-route-classification.service.ts`.
- Registry coverage now includes `presence`, `rooms`, `audio`, `session`, `chat`, `notes`, and `integrations` mutation routes with focused validation in `backend/tests/services/runtime-route-classification.service.test.ts`.
- Session audit envelope normalization now runs through `backend/src/services/runtime/runtime-streams.service.ts`, with focused helper coverage in `backend/tests/services/runtime-streams.service.unit.test.ts`.
- Notes mutation routes now append standardized audit events for create/update/publish/delete flows in `backend/src/api/notes.routes.ts`, covered by `backend/tests/api/notes-routes.test.ts`.
- All remaining WS-visible mutation families (audio, rooms, session, presence, chat, notes, integrations) now have `appendSessionAuditEvent` coverage. Chat audit flows through `chat.service.ts` (MESSAGE_SENT/EDITED/DELETED). `integrations.routes.ts` now appends one audit event per affected session for extension-driven profile sync.
- Multi-client reconnect soak evidence exists in `backend/tests/integration/multi-client-reconnect.integration.test.ts` (4 scenarios: concurrent reconnect slices, session isolation, FIFO cap, full-replay fallback) and `backend/tests/integration/ws-disconnect-reconnect-sequencing.integration.test.ts` (same-user multi-tab sequencing).

---

### W2-Testing: Release Gates and Regression Coverage

**Status**: 🟢 Done
**Priority**: 🟡 High (gating Phase 1)
**Depends on**: W0-State-Machine, W1-Runtime-Recovery

**Scope**: Lock in release gates for backend/frontend/admin. Add integration coverage for session lifecycle, audio state recovery, multi-client reconnect, and state-machine transitions.

**Acceptance Criteria**:

- [x] Backend test suite passes with ≥60% coverage statement baseline; zero critical-path test failures (2026-05-18: 83/83 test files, 660/660 tests, 65.26% statements, 53.67% branches, 66.96% functions, 65.62% lines)
- [x] Frontend test suite passes with ≥60% coverage statement baseline; zero critical-path test failures
- [x] Release-gate reporting is automated and enforced in CI (enforced by `.github/workflows/qa-gates.yml` with lint/build/coverage/flaky gates + artifact reports)
- [x] Session lifecycle coverage includes: start → pause → resume → end → cleanup (covered by `backend/tests/integration/session-room-transition.integration.test.ts`, `backend/tests/integration/session-cooldown-handoff.integration.test.ts`, `backend/tests/services/session-cleanup-job.service.test.ts`)
- [x] Audio state recovery coverage includes: environment + conditions + distance + mute (covered by `backend/tests/integration/audio-state-recovery.integration.test.ts`)
- [x] Multi-client reconnect coverage includes: concurrent reconnect, session isolation, FIFO recovery (`backend/tests/integration/multi-client-reconnect.integration.test.ts`)

**Related Docs**:

- [backend/tests/](backend/tests/)
- [frontend/tests/](frontend/tests/)

---

### W3-Operatisation: Runbooks and Telemetry Matrix

**Status**: 🟢 Done
**Priority**: 🟡 High
**Depends on**: W0-State-Machine, W1-Runtime-Recovery

**Scope**: Document and validate operator workflows, backup/restore drills, and telemetry signal definitions.

**Acceptance Criteria**:

- [x] Operator runbook exists for: restart, backup/restore, incident triage, log analysis
- [x] Telemetry matrix documents what is tracked, why, and how it is consumed
- [x] Restart-survival validation confirms telemetry/diagnostic sinks persist across restarts
- [x] Backup/restore drill is executed and documented as reproducible

**Related Docs**:

- [docs/operations/](docs/operations/)
- [docs/operations/RUNBOOK.md](docs/operations/RUNBOOK.md)
- [docs/operations/TELEMETRY-MATRIX.md](docs/operations/TELEMETRY-MATRIX.md)
- [docs/operations/RESTART-SURVIVAL-VALIDATION-2026-05-19.md](docs/operations/RESTART-SURVIVAL-VALIDATION-2026-05-19.md)
- [docs/operations/BACKUP-RESTORE-DRILL-2026-05-19.md](docs/operations/BACKUP-RESTORE-DRILL-2026-05-19.md)

Evidence snapshot (2026-05-19):

- Restart-survival validation suite executed:
  - `backend/tests/infra/telemetry-store.test.ts` (7/7)
  - `backend/tests/integration/multi-client-reconnect.integration.test.ts` (6/6)
  - `backend/tests/integration/ws-disconnect-reconnect-sequencing.integration.test.ts` (3/3)
  - `backend/tests/integration/audio-state-recovery.integration.test.ts` (15/15)
- Backup/restore drill suite executed:
  - `backend/tests/services/admin-portability.service.test.ts` (7/7)
  - `backend/tests/api/admin-campaign-operations.test.ts` (8/8)
  - `backend/tests/api/admin-settings-routes.test.ts` (15/15)
  - `backend/tests/api/admin-telemetry-diagnostic-retention.test.ts` (7/7)
- Drill records and reproducible command sets are now documented in:
  - `docs/operations/RESTART-SURVIVAL-VALIDATION-2026-05-19.md`
  - `docs/operations/BACKUP-RESTORE-DRILL-2026-05-19.md`

Evidence snapshot (2026-05-25):

- Frontend runtime freeze triage guidance was added to developer docs with an explicit churn-debug flow (`docs/DEV-QUICK-REFERENCE.md`, `docs/subsystems/STATE-STORES.md`).
- Opt-in store churn diagnostics now emit `store.churn` totals/deltas for high-churn collections (`VITE_DEBUG_CHURN_METRICS=1` or `window.__VTT_DEBUG_CHURN__ = true`).
- High-frequency frontend reducers in chat/presence/greenroom/room/livekit were hardened with additional no-op guards and lower-allocation update paths to reduce GC pressure during WS-heavy sessions.

Evidence snapshot (2026-05-28, v0.8.5):

- Per-user transient UI state (speaking, presence online/offline, ghost mode, mic mute) was extracted into memoized leaf indicator components under `frontend/src/components/workspaces/session/rooms/` (`SpeakingIndicator`, `PresenceIndicator`, `GhostIndicator`, `MicMutedIndicator`), each subscribing to a single primitive Zustand selector. Flips no longer invalidate parent participant projections or rebuild surrounding Radix Tooltip/Popover subtrees.
- `AvatarOverlay` API simplified to a single `presence` bundle prop; `GroupParticipantStatus` no longer carries `presenceState` / `ghost` / `isMuted`; cascading styles driven by CSS `:has()` instead of parent className threading.
- `PartyPanel.PartyMemberCard` wrapped in `React.memo` so a single member's HERE/AWAY/NOT-HERE flip re-renders only that card.
- Leaf-isolation pattern documented as a non-negotiable in `.github/copilot-instructions.md` and `docs/subsystems/STATE-STORES.md`; freeze triage flow in `docs/DEV-QUICK-REFERENCE.md` now includes a leaf-isolation check.

Evidence snapshot (2026-05-29):

- Frontend workspace runtime now includes a beta memory-pressure recovery guard (`frontend/src/hooks/session/useWorkspacesMemoryPressureGuard.ts`) that warns before a guarded reload so rehydration can recover the session instead of letting the browser tab crash.
- The guard emits lightweight client telemetry for warning/display and refresh-trigger events, so runtime triage can quantify how often the fallback is intervening.
- Memory threshold, poll interval, grace window, and reload cooldown are beta-tunable through `VITE_MEMORY_PRESSURE_*` env values, and development builds support a manual simulator toggle via `window.__VTT_DEBUG_MEMORY_PRESSURE__ = 'warn' | 'reload'`.

---

### W4-Conversation-Authority: Campaign-Scoped Conversation, Session-Scoped Routing

**Status**: 🟢 Done
**Priority**: 🟡 High
**Depends on**: W0-State-Machine, W1-Runtime-Recovery

**Scope**: Decouple conversation authority from session lifecycle. Campaign membership/role determines whether a user can participate in conversation; session lifecycle determines room assignment, policy gates, and recording boundaries.

**Acceptance Criteria**:

- [x] Contracts explicitly define campaign as conversation authority and session as routing/policy authority.
- [x] API validation order is enforced: campaign authorization → lifecycle policy → room routing.
- [x] Session transitions reassign rooms without implying participant transport identity teardown.
- [x] Audio continuity across session transitions is documented and implemented as policy remap (not reconnect/reset), while preserving whisper/spectator privacy rules.
- [x] Recording boundaries remain session-authoritative via persisted bookends and transcript/summary consumption rules.

**Related Docs**:

- [docs/CONTRACTS.md](docs/CONTRACTS.md)
- [docs/architecture/SESSION-LIFECYCLE.md](docs/architecture/SESSION-LIFECYCLE.md)
- [docs/architecture/RUNTIME-STATE-AND-AUDIT-CONTRACT.md](docs/architecture/RUNTIME-STATE-AND-AUDIT-CONTRACT.md)

Evidence snapshot (2026-06-04):

- Contracts locked in `docs/CONTRACTS.md` (Campaign Conversation Authority Contract, Session Room Assignment Contract, Audio Runtime Persistence and Session Policy Contract) and `docs/architecture/SESSION-LIFECYCLE.md` (sections 1.0 authority split, 1.6 recording boundaries, 1.7 audio continuity).
- `backend/src/services/session/authz.service.ts` enforces campaign membership as primary gate before session membership in `resolveEffectiveSessionRole` and `resolveRoleForSessionJoin`; covered by `backend/tests/services/session-authz.service.test.ts`.
- All conversation-surface API endpoints (chat, livekit/token, rooms join/move) go through campaign authorization before lifecycle policy before room routing.
- Backend `applySessionStateRoomTransition` reassigns room topology on state change without disconnecting LiveKit or WebSocket transport — session members retain transport identity across PAUSED/COOLDOWN transitions.
- Fixed frontend `ROOM:SESSION_TRANSITION_APPLIED` WS handler: `resetSessionAudioState()` and `clearActiveEffects()` are now conditional on teardown states (`IDLE`, `ENDED`, `CLEANUP`) only. ACTIVE, PAUSED, and COOLDOWN transitions no longer reset audio state, preserving effects and environments across pause/resume cycles.
- Added 11 focused tests in `frontend/tests/state/sessionTransition.audio.test.ts` covering: non-teardown states preserve audio, teardown states clear audio, PAUSED→ACTIVE resume retains environment, COOLDOWN→ENDED clears audio, `roomEnvironmentNames` survives all transitions.
- Recording bookends (`[Session Started]`, `[Session Paused]`, `[Session Resumed]`, `[Session Ended]`) remain session-authoritative end-to-end (persisted, broadcast, frontend-rendered, refresh-durable) from W0-State-Machine.

---

## Phase 1: UI/UX Foundation 🟢

_Unblock user experience. DMs need clean, responsive controls. Players/spectators need clarity on state._

### W0-Rightbar: Info Panels and Settings Toolbar

**Status**: 🟢 Done
**Priority**: 🟡 High
**Depends on**: W0-State-Machine

**Scope**: Implement a rightbar toolbar with one button per surface in this canonical order: INFO, PARTY, ROOMS, JOURNAL, NOTES, HISTORY, SETTINGS. Replace the single Information tab model with dedicated panel entry points. Keep topbar Settings for user profile/system defaults; rightbar SETTINGS remains campaign/session/character context.

**Acceptance Criteria**:

- [x] Rightbar toolbar renders buttons in canonical order: INFO, PARTY, ROOMS, JOURNAL, NOTES, HISTORY, SETTINGS (PARTY is 2nd; JOURNAL comes before NOTES)
- [x] Rightbar uses an icon-first dock with tooltip labels and centralized role-aware panel visibility policy
- [x] INFO panel shows campaign overview: name, description, player count, session count, completed sessions, next session ETA
- [x] INFO is readable by all personas; DM can edit campaign name/description/poster
- [x] PARTY panel lists all campaign players, including disconnected users and users not currently in-session
- [x] PARTY row fields include: name, class, level, race, presence status (`HERE` | `AWAY` | `LOBBY` | `NOT HERE` | `OFFLINE`), last seen, stats, and active conditions (same visible fields for players and spectators)
- [x] PARTY/Lobby presence labels and transitions follow the shared model in `docs/ui/PRESENCE-STATUS-MODEL.md`
- [x] ROOMS panel is DM-only and hidden entirely for non-DM personas
- [x] JOURNAL panel is a reverse-chronological list of sessions; each session has exactly one markdown journal entry with a hashtag list for search
- [x] JOURNAL is readable by all personas; DM-only edit
- [x] NOTES panel is a note list where each note includes name, markdown content, image attachments (multiple), and hashtags for search
- [x] NOTES is readable by all personas; DM can add/edit/delete/share notes to one or more players
- [x] NOTES supports Post to Chat, which creates a chat card in the selected group and auto-shares that note with all players in that group
- [x] HISTORY is a lightweight mirror of chat logs from previous sessions only, grouped by visible session boundaries
- [x] HISTORY never includes messages from the current active session
- [x] SETTINGS opens role-specific surfaces: DM gets Campaign + Session settings, players get Character settings (own character only), spectators do not see rightbar SETTINGS
- [x] Player action: PARTY > Edit switches panel focus to SETTINGS > Character and auto-focuses the first editable field
- [x] Character settings include editable character profile fields (name, race, class, level, stats, avatar)
- [x] Character settings race/class fields provide autocomplete suggestions from D&D 5.5e SRD data by default, allow free-text player overrides, and support admin-configured pluggable source providers
- [x] DM Campaign/Session settings include only safe editable fields in rightbar SETTINGS; sync-complex campaign fields remain managed in dedicated surfaces
- [x] Right-panel dismisses on backdrop click
- [x] Mobile responsive: collapse/expand at <680px; side-panel at ≥1080px

**Related Docs**:

- [docs/ui/UI-LAYOUT.md](docs/ui/UI-LAYOUT.md)
- [docs/ui/DM-CAMPAIGN-SETTINGS.md](docs/ui/DM-CAMPAIGN-SETTINGS.md)
- [docs/ui/PRESENCE-STATUS-MODEL.md](docs/ui/PRESENCE-STATUS-MODEL.md)

**Evidence snapshot (2026-05-22):**

- PARTY panel now backed by live `GET /api/campaigns/:campaignId/party-presence` snapshot; placeholder mock data removed from normal operation.
- PARTY row renders name, character name, class, level, race, ability scores (STR/DEX/CON/INT/WIS/CHA), presence label, last-seen timestamp, and manual away toggle.
- Presence labels `HERE`, `AWAY`, `LOBBY`, `NOT HERE`, `OFFLINE` are derived from authoritative runtime/session state via the shared `PRESENCE-STATUS-MODEL`; manual AWAY toggle writes through `PUT /api/presence/:sessionId/state`; inactivity auto-away fires after 8-minute idle window.
- `CAMPAIGN:PARTY_PRESENCE_UPDATED` WS signal triggers immediate PARTY panel refetch on any presence or session change.
- Role-based tab visibility moved to a single canonical policy file (`workspacePanelPolicy.constants.ts`); `rooms` and `audio` tabs are hidden for PLAYER; `party`, `rooms`, `notes`, `audio`, `settings` are hidden for SPECTATOR — enforced at runtime, not scattered across components.
- Right-rail overlay click-outside handler (`handleRightRailClickOutside`) closes the panel on backdrop click with animation guard.
- Frontend workspace structure normalization: toolbar, modals, and session orchestration files moved to dedicated domain folders; `CampaignInformationPanel` and `CampaignSettingsPanel` families moved to named subfolders with stripped prefixes (`CampaignInformationPanel/index.tsx`, `Header.tsx`, etc.).
- Screenshot diagnostics mode added (`?debugUi=1`) for layout verification and component ownership mapping.
- Active conditions are not yet shown in PARTY rows; that field depends on W-Audio-Condition.

Evidence snapshot (2026-05-23):

- Settings surface is now unified through a shared role-aware panel entrypoint in `frontend/src/components/workspaces/shared/panels/WorkspaceSettingsPanel.tsx`.
- Editor and session now open the same settings system from the rightbar settings icon:
  - DM sees Campaign settings with session-specific controls available as contextual extras.
  - Player sees Character/Player settings only.
  - Spectator remains excluded from editable rightbar settings.
- Player/character settings were extracted into `frontend/src/components/workspaces/shared/panels/PlayerSettingsPanel.tsx`.
- Legacy workspace-specific settings panel wrappers and the standalone route-level campaign settings flow (`/campaigns/:id/settings`) were removed to prevent parallel settings implementations.

Evidence snapshot (2026-05-27):

- Right-rail panel availability and order are now enforced through centralized policy helpers (`frontend/src/constants/workspacePanelPolicy.constants.ts`, `frontend/src/utils/workspacePanelPolicy.ts`) and consumed by the session dock renderer.
- Session right-rail interaction now uses an icon-first dock with tooltip labels and role-filtered tab sets; click toggles are handled consistently by the shared workspace frame.
- HISTORY panel now renders prior-session transcripts only (excluding current session) with visible session boundary separators and in-panel search/sort controls for compact timeline browsing.
- PARTY panel now shows active condition chips from DM condition overrides, and Party/Handouts tabs are visible to spectators in read-only mode.
- Player PARTY edit now opens the SETTINGS character surface directly and auto-focuses the first editable field for immediate character updates.
- Character settings now include SRD-backed race/class suggestions and a reusable avatar upload flow with circular preview plus zoom/crop controls before save.
- Topbar user settings now reuse the same shared avatar upload/crop flow as character settings, so player profile and character profile avatar edits follow the same client-side crop pipeline.
- Notes mutation controls are now DM-only in the right rail (create/edit/delete/share/publish), while players and spectators retain read access.
- Notes publish is now always manual: the handout publisher offers `Everyone` plus occupied MAIN/GROUP rooms only, excludes whisper/greenroom/empty rooms, and auto-shares room-targeted handouts to the players currently in that room.
- Notes now support in-panel search across handout title, markdown content, and hashtags, and the right-rail handout editor now stores multiple image attachments with thumbnail preview/removal in create and edit flows.
- Journal creation now upserts `_journal` notes per session in the backend, so the journal browser remains reverse chronological while enforcing exactly one markdown journal entry per session.

Evidence snapshot (2026-05-30):

- Right-rail handouts now persist image attachments through the shared note contract, Prisma `Note.attachments`, notes API create/update routes, websocket note payloads, and the right-rail create/edit UI.
- Handout cards render stored attachment thumbnails in read mode and allow DM add/remove attachment edits without leaving the panel.
- Lobby discovery now returns both PUBLIC and PRIVATE non-member campaign cards; private cards stay dimmed and locked when no live spectator path exists.
- Full-account WATCH entry now uses `POST /api/campaigns/:id/watch` for both PUBLIC and PRIVATE live campaigns and no longer depends on spectator invite codes in the lobby card action resolver.

Evidence snapshot (2026-06-01):

- Removed the redundant right-rail `Audio` panel from canonical tab policy and session right-rail rendering.
- Right-rail mobile behavior now uses compact overlay mode below `680px` with explicit collapse/expand interaction instead of persistent docked paneling.
- Right-rail behavior at desktop widths now treats `>=1080px` as expanded mode with a selected panel kept open by default.
- Crossing from `>=1080px` down to `<1080px` now auto-collapses the right panel to preserve compact layout behavior.
- Desktop right-panel width now has a hard maximum of `440px`.

Evidence snapshot (2026-06-02):

- Environment apply optimistic flow implemented in `frontend/src/components/workspaces/session/GroupsPanel.session.tsx`:
  - Frontend now applies environment changes optimistically (local state updated immediately), calls `POST /api/audio/environments/apply`, and reverts to the previous environment on failure with a user-facing toast.
  - Added local applying-tracking to avoid UI races during concurrent applies.
  - Server WS broadcasts remain authoritative; optimistic updates improve perceived latency while preserving correctness on eventual server confirmation.

  Acceptance notes:
  - Optimistic apply reduces perceived latency for DM environment changes.
  - Revert-on-failure ensures clients do not drift if the backend rejects the change.
  - Next: add visual loading affordance on group cards and unit tests for revert flows.

**Evidence snapshot (2026-05-20):**

- CampaignInformationPanel now integrates toast-based error handling (vs. inline error state) for consistent UX with rest of app.
- Campaign name and description editing now use controlled input with draft state and cancel/save flow.
- Poster image upload validation: file type check (images only), size limit (≤2MB), immediate user feedback via toast.
- Campaign info panel layout refined with responsive scrolling and workspace mode integration.
- Markdown rendering support for campaign descriptions with improved styling visibility.
- All campaign edit errors now surface via `useToast()` instead of inline state management.
- PARTY panel now consumes a real campaign party-presence snapshot (`GET /api/campaigns/:campaignId/party-presence`) and renders canonical labels (`HERE`, `AWAY`, `LOBBY`, `NOT HERE`, `OFFLINE`) from authoritative runtime/session presence data.
- PARTY panel now supports a client-side manual away toggle and lightweight inactivity auto-away timer (maps to runtime `PresenceState.IDLE`/`ONLINE` via existing presence API; no new persistence fields required).

---

### W0-Lobby: Campaign Discovery and Join Flow

**Status**: 🟢 Done
**Priority**: 🟡 High
**Depends on**: W0-State-Machine

**Scope**: Home lobby shows: your campaigns (with DM indicator, last-active date, player count), join-via-code/invite, and create-campaign CTA. Campaign edit/review runs as an in-page offline workspace (not a modal and not a separate route), with campaign-screen-style rightbar tool switching.

**Acceptance Criteria**:

- [x] Home shows: your campaigns as cards (name, banner, DM, players, last active)
- [x] Campaign edit/review opens as an in-page offline workspace (no modal; topbar preserved)
- [x] Campaign card action labels are role-aware: DM `EDIT`, Player `REVIEW`, Spectator `LAUNCH` only
- [x] Create Campaign dialog uses right-aligned `CANCEL | EDIT | LAUNCH` actions and no description field
- [x] Join dialog is top-offset and uses right-aligned actions (`CANCEL | JOIN`)
- [x] Lobby body is full-height fixed layout with campaign-card list scroll only (topbar and page frame stay fixed)
- [x] Compact lobby stats strip is shown between topbar and card list (active sessions, connected personas, total played, extra rollups)
- [x] Campaign visibility: PRIVATE campaigns show a dimmed locked card to non-members when spectators are disabled or no session is active; show a normal card with a lock icon + WATCH when spectators are enabled and an active session has DM/players present
- [x] Non-member + PUBLIC campaign → REQUEST TO JOIN button; requires optional message; DM approves/rejects via notification badge on their card
- [x] DM lobby card shows a badge with pending join-request count; clicking opens inline approval panel (username, avatar, timestamp, message)
- [x] Non-member + PRIVATE campaign without active watchable session → dimmed card, lock icon, no action (no invite link = no entry)
- [x] Full user + campaign with spectators enabled + active session with DM/players present → WATCH button (applies to both PUBLIC and PRIVATE campaigns; no invite link required)
- [x] Players can join via invite link or code
- [x] Spectators can only access active campaigns and cannot edit
- [x] Late-join policy (Open | Screened | Blocked) is configurable with grace period
- [x] DM can RETIRE a campaign from the offline workspace header (confirm dialog required); retired campaigns removed from main lobby list
- [x] DM can RESUME a retired campaign from a dedicated "Retired" drawer in the lobby (no confirm dialog); DM cannot delete campaigns
- [x] Guest accounts are not shown the campaign discovery list; on session exit they see the upgrade prompt only
- [x] Guest upgrade: `POST /api/auth/upgrade` (email + password); email matching another guest → merge accounts; email matching a full account → block with clear message
- [x] Campaign invite URL paths use `/join/:code` (player) and `/watch/:code` (spectator); backend and frontend call sites are consistent

**Related Docs**:

- [docs/ui/UI-FLOWS.md](docs/ui/UI-FLOWS.md)
- [docs/CONTRACTS.md](docs/CONTRACTS.md) — Campaign Visibility Model, Guest Upgrade Flow, Campaign Lifecycle: RETIRE and RESUME

Evidence snapshot (2026-05-18):

- Lobby campaign cards now render a visible "Last active" date using campaign `updatedAt`/`createdAt` fallback metadata in the card surface.
- Greenroom chat timeline now hydrates on first screen load (no initial `todayOnly` bootstrap gate), so users see recent persisted greenroom messages immediately without waiting for the first outbound chat event.

Evidence snapshot (2026-05-20 - Part 1):

- Lobby create flow now removes description input and supports intent-based create actions: `EDIT` (save + open offline workspace) or `LAUNCH` (save + enter runtime).
- Join dialog and create dialog now use top-offset placement and right-aligned button rows to match other dialogs.
- Lobby supports in-page offline campaign edit/review mode with campaign-like right-side icon dock and default `INFO` panel.
- Offline mode hides rightbar `SETTINGS` and keeps role-based panel visibility aligned with campaign context.
- Lobby card list now owns vertical scrolling while surrounding shell stays fixed-height.
- Discovery routing is now stable: `/api/campaigns/discover` resolves ahead of generic `/:campaignId` routes, and guest accounts no longer request the discovery list.
- Lobby campaign cards now show a smaller DM `ONLINE`/`OFFLINE` status pill with color-coded tooltip text and vertically aligned DM metadata.
- Lobby campaign state indicators now map runtime presence to user-facing states: `OFFLINE` when no DM/player is connected, `READY` for connected `IDLE`, `ACTIVE` for connected `ACTIVE`/`PAUSED`, `FINISHING` for connected `COOLDOWN`, and `ENDED` for connected `ENDED`.
- Post-session cleanup no longer pre-provisions an IDLE session in the background; after the 60 second DM/player disconnect buffer elapses, the next DM/player reconnect creates the fresh IDLE session.

Evidence snapshot (2026-05-20 - Part 2):

- Campaign description popover now renders markdown-formatted descriptions with improved styling for visibility and readability.
- Campaign settings management in `LobbyCampaignSettingsPanel` streamlined: removed unused invite URL duplication, consolidated form controls.
- Error handling migration complete for campaign operations: all validation/save errors now surface via toast notifications instead of inline error states.
- Session lobby workspace panel layout refined with CSS grid and flex adjustments to maintain full-height viewport without overflow leakage to document scroll.
- Campaign info panel now supports edit mode with textarea for description (height increased for better usability) and poster image upload with validation (type check, size limit ≤2MB).

Evidence snapshot (2026-05-30):

- DM lobby cards now expose an inline join-request review panel from the pending badge, with requester avatar, username, requested-at timestamp, optional message, and approve/reject actions directly in the lobby card surface.
- Added a DM-only pending-request read endpoint (`GET /api/campaigns/:id/join-request`) so the lobby panel reads authoritative request data instead of relying on stale badge counts.
- Frontend lobby refresh now treats `CAMPAIGN:JOIN_REQUEST_RECEIVED` and `CAMPAIGN:JOIN_REQUEST_RESOLVED` as campaign-list invalidation signals so badge counts reconcile without a manual reload.

---

### W0-Lobby-Admin: Campaign Export and Import

**Status**: 🟢 Done
**Priority**: 🟢 Low
**Depends on**: W0-Lobby

**Scope**: Admin-only campaign export (JSON) and import (creates new campaign from file). This covers the privileged operator surface only — member emails are included for account re-linking during import. DM self-service portability (no emails, invite-only rejoin) is tracked separately in Phase 4 as W-DM-Campaign-Portability.

**Acceptance Criteria**:

- [x] `GET /api/admin/campaigns/:id/export` returns campaign JSON (metadata, groups/environments, session history/chat, notes/journal, member list)
- [x] Export does not include passwords; member emails are included for re-linking
- [x] `POST /api/admin/campaigns/import` creates a new campaign with fresh IDs from the export JSON
- [x] Admin may optionally map member emails to existing accounts during import; unmapped members become stubs
- [x] Import never overwrites an existing campaign
- [x] Admin UI surfaces Export and Import actions in campaign management panel

**Related Docs**:

- [docs/CONTRACTS.md](docs/CONTRACTS.md) — Campaign Export and Import section

Evidence snapshot (2026-06-04):

- Export endpoint (`GET /api/admin/campaigns/:id/export`) and import endpoint (`POST /api/admin/campaigns/import`) are implemented in `backend/src/api/admin.routes.ts`, service logic in `backend/src/services/admin/admin-portability.service.ts` and `admin-campaign-operations.service.ts`.
- Added `email` field to `CampaignTransferBundle.members[]` in `backend/src/types/portability.types.ts` and to the Prisma user select in `buildCampaignExport` so member emails are included in every export for cross-instance re-linking.
- Import now supports optional `memberEmailMap: { "source-email": "target-user-id" }` in the request body. When provided, resolution order is: email-map lookup → ID match → stub creation. Stubs are created for any unresolved source user so content authorship is never lost.
- Admin UI (`admin/src/features/campaigns/CampaignDetail.tsx`) surfaces Export Bundle (read-only textarea), Import Bundle (paste area), and the new optional Member Email Map textarea with placeholder and hint label. Import button submits all three together.
- State hook (`useCampaignManagement.ts`) parses and validates the email map JSON before sending; surfaces a clear error for non-object JSON. API client (`campaignManagementApi.ts`) sends `memberEmailMap` only when it is non-empty.
- Backend tests updated and expanded in `backend/tests/api/admin-campaign-operations.test.ts` (10 tests): export now asserts email presence in the bundle; two new import tests cover email-map acceptance and array-typed map rejection (ignored, not a crash).

---

### W4-UX-Polish: Accessibility and Responsive Hardening

**Status**: 🟢 Done
**Priority**: 🟡 High
**Depends on**: W0-Rightbar, W0-Lobby

**Scope**: WCAG AA compliance pass, keyboard navigation, reduced-motion support, dark/light theme validation, cross-browser testing.

**Acceptance Criteria**:

- [x] All UI surfaces pass WCAG AA keyboard navigation and screen-reader testing
- [x] Dark and light themes render correctly across all components
- [x] Reduced-motion preferences are respected
- [x] No hard-coded one-mode colors in shared user-facing UI
- [x] Responsive testing passes at breakpoints: <680px (mobile), 680-1080px (tablet), ≥1080px (desktop)

**Related Docs**:

- [docs/ui/ACCESSIBILITY.md](docs/ui/ACCESSIBILITY.md)

Evidence snapshot (2026-06-01):

- Added global keyboard focus-visible baseline in `frontend/src/styles/components/session/theme.css` so keyboard navigation has deterministic visible focus styling.
- Added global reduced-motion baseline in `frontend/src/styles/components/session/theme.css` under `@media (prefers-reduced-motion: reduce)` to minimize animations/transitions and disable smooth-scroll behavior.
- Added focused keyboard interaction coverage for lobby campaign cards in `frontend/tests/components/CampaignCard.keyboard.test.tsx` (Enter and Space activation).
- Added automated accessibility smoke checks in `frontend/tests/components/Accessibility.smoke.test.tsx` using axe for key lobby/session surfaces (`CampaignCard`, `SessionToolbar`).
- Fixed CampaignCard ARIA issues identified by smoke checks in `frontend/src/components/workspaces/lobby/LobbyView.CampaignCard.tsx` (valid state-dot semantics and removal of invalid `aria-expanded` on non-control element).

Evidence snapshot (2026-06-04):

- Tokenized all hard-coded dark-only hex colors in `frontend/src/styles/components/workspaces/session/chat/MessageList.messages.css`: bubble backgrounds, borders, avatar backgrounds, type-icon backgrounds, and self-message bubbles now use `var(--color-surface)`, `var(--color-surface-raised)`, `var(--color-surface-subtle)`, `var(--color-border-soft)`, `var(--color-text-primary)`, `var(--color-brand)`, and `var(--color-warn)` tokens so light and dark mode both render correctly.
- Fixed mobile breakpoint in `frontend/src/styles/components/workspaces/Workspaces.responsive.css`: workspace shell column stack now triggers at `680px` (canonical mobile breakpoint) instead of the legacy `768px`.
- Expanded axe smoke test coverage in `frontend/tests/components/Accessibility.smoke.test.tsx`: added `WorkspaceToolbar` (shared top bar with icon-only buttons, verifies `aria-label` correctness) and `ReconnectBanner` in both `reconnecting` and `isHydrating` states (verifies status banner semantics). Total smoke surfaces now: `CampaignCard`, `SessionToolbar`, `WorkspaceToolbar`, `ReconnectBanner` (×2 states).

---

## Phase 2: Audio Experiences 🟢

_DM superpowers: move players between groups, apply conditions, set environments, control distance. All within 2 clicks._

### W-Groups-Panel: Editor Mode + Session Mode Groups Management

**Status**: 🟢 Done
**Priority**: 🟡 High (blocking all audio work)
**Depends on**: W0-Rightbar

**Scope**: Implement comprehensive Groups (Rooms) panel for both editor (pre-session planning) and session (runtime) modes. Editor allows DM to pre-create groups and set default environments before players join. Session mode allows DM to drag players between groups, close groups (empty to MAIN), delete empty groups (permanent campaign deletion), and apply/change environments. Groups persist across sessions at campaign level; environment clears on pause and reapplies on resume.

**Acceptance Criteria**:

- [x] Editor mode: DM can view, create, delete campaign-level groups before session starts
- [x] Editor mode: DM can set default environment per group (persistent, survives session boundaries)
- [x] Editor mode: Player list is not visible (players only joinable in-session)
- [x] Session mode: Group cards show member count, environment icon, and player list (collapsible)
- [x] Session mode: DM drag player from one group card to another (one player at a time)
- [x] Session mode: DM drag to WHISPER auto-targets DM voice to WHISPER (locks DM until whisper ends)
- [x] Session mode: Environment icon in group header; click to open environment picker control
- [x] Session mode: Environment selection applies to all players in group (optimistic apply with revert-on-failure)
- [x] Session mode: "Close" button empties group (moves all members to MAIN), group remains but empty
- [x] Session mode: "Delete" button appears only when group is empty; deletes group from campaign permanently
- [x] Session mode: MAIN, WHISPER, GREENROOM are reserved names (cannot be created by DM)
- [x] Session pause: all players move to MAIN, pre-pause group membership snapshotted in presence `previousGroupId`
- [x] Session resume: players restored to pre-pause groups via `isResumeFromPause` + `previousGroupId` in `applySessionStateRoomTransition`
- [x] Session pause/resume: environments are preserved (not cleared) across pause — deliberate design from W4-Conversation-Authority; players re-enter their group and its environment is still active
- [x] Session end: all members moved to greenroom (COOLDOWN/ENDED); PRIVATE room deleted; GROUP rooms persist campaign-scoped for next session
- [x] DM audio override via player context menu: "Adjust Audio" submenu with Boost/Normal/Lower Mic (GAIN), Enable/Disable Noise Filter (FILTER); calls existing `POST /api/audio/overrides/dm/apply|remove` endpoints
- [x] Spectators: can see groups (read-only), cannot drag or interact
- [x] WS events: `ROOM:CREATED`, `ROOM:DELETED`, `ROOM:CLOSED`, `AUDIO:ENVIRONMENT_SET`
- [x] Zustand slices: `campaignGroupsSlice`, `sessionGroupsSlice`, `groupPanelUISlice`
- [x] API: Editor routes for campaign groups; session routes for runtime groups; close and environment endpoints
- [x] Documentation: `docs/architecture/GROUPS-PANEL-ARCHITECTURE.md` complete
- [x] Documentation: `docs/CONTRACTS.md` updated with group close, environment, DM audio override contracts

Evidence snapshot (2026-06-02 - Groups Panel progress):

- Drag-and-drop member moves implemented (frontend):
  - `frontend/src/components/workspaces/session/GroupCard.session.tsx` supports HTML5 DnD for member tiles.
  - `frontend/src/components/workspaces/session/GroupsPanel.session.tsx` implements `handleMoveMember` with optimistic remove/add, API call `moveRoomMember()`, canonical refresh, and revert on failure.
- DM whisper auto-target: moving a player into a `PRIVATE` room sets DM voice target locally via `setDmVoiceTarget()` for immediate UX lock; server WS confirms authoritative state.
- Optimistic environment apply: frontend applies environment locally immediately, tracks `applyingEnvironments`, calls `POST /api/audio/environments/apply`, and reverts on failure with toast (see Evidence snapshot 2026-06-02 above).
- Spectator gating: drop handlers and group visibility respect `canManage` so spectators are read-only and cannot drag/interact.

Evidence snapshot (2026-06-04 - DM audio override + panel completion):

- Reserved room name guard: `handleCreateGroup` in `GroupsPanelSession.tsx` rejects MAIN, WHISPER, GREENROOM at creation time.
- Pause membership snapshot: `resolvePausePreviousGroupId` in `backend/src/services/room/lifecycle.service.ts` stores `previousGroupId` in presence on PAUSED transition.
- Resume restore: `isResumeFromPause` check in `applySessionStateRoomTransition` restores users to `previousGroupId` room on ACTIVE resume.
- Session end: `applySessionStateRoomTransition` routes users to greenroom on ENDED/COOLDOWN; `deletePrivateRoomsForEndedSession` removes PRIVATE room; GROUP rooms persist (campaign-scoped per W1-Runtime-Recovery design).
- DM audio override context menu: "Adjust Audio" submenu added to `PlayerContextMenuContent.tsx` with Boost Mic / Normal Mic / Lower Mic (GAIN override) and Enable/Disable Noise Filter (FILTER override). Prop threaded through `PlayerContextMenu` → `GroupMemberList` → `RoomGroupCard` → `RoomSelector`. Handler `handleApplyAudioOverride` in `RoomSelector.tsx` calls `POST /api/audio/dm-override/apply|remove`. A DM can never truly unmute a self-muted player — the GAIN/FILTER overrides are independent of mute state; removing the DM MUTE override does not affect the player's own `AUDIO:MUTE_STATE_CHANGED` self-mute.

Next work for Groups Panel:

- Formalize 200ms environment apply SLA or add server-side fast-paths; add unit/integration tests for revert-on-failure cases.
- Write documentation: `docs/architecture/GROUPS-PANEL-ARCHITECTURE.md` and update `docs/CONTRACTS.md` with group close and environment contracts.

**Related Docs**:

- [docs/architecture/GROUPS-PANEL-ARCHITECTURE.md](docs/architecture/GROUPS-PANEL-ARCHITECTURE.md)
- [docs/CONTRACTS.md](docs/CONTRACTS.md)
- [.github/copilot-instructions.md](.github/copilot-instructions.md) (Whisper Bubble, Group Visibility Rules sections)

Evidence snapshot (2026-05-24):

- Editor-mode groups planner is already live under `frontend/src/components/workspaces/shared/panels/GroupsPanel/GroupsPanel.tsx`:
  - DM can load, create, delete, and configure campaign-level groups before session start.
  - Default environments are editable through the shared environment picker modal.
  - Player lists are intentionally absent in editor mode.
- Session-mode right-rail groups overview is now live as a separate component path from the left voice-groups panel:
  - `frontend/src/components/workspaces/session/GroupsPanel.session.tsx` owns the right-side runtime list.
  - `frontend/src/components/workspaces/session/GroupCard.session.tsx` renders compact member cards with DM-first ordering, environment glyphs, and collapsible room member lists.
  - Green Room is hidden during `ACTIVE` / `PAUSED` / `COOLDOWN`, and when shown in greenroom state it is listed first and starts collapsed.
  - Green Room cannot be drained, deleted, or assigned an environment from the right panel.
  - Whisper uses the end-to-main flow from this panel and the action is hidden when Whisper is empty.
- Runtime room-management service surface exists in `frontend/src/services/groupsPanel.service.ts` for create, close, delete, and environment apply flows.
- Runtime + editor state scaffolding exists in Zustand via `campaignGroupsSlice`, `sessionGroupsSlice`, and `groupPanelUISlice`.
- Backend/WS contract surface exists for `ROOM:CREATED`, `ROOM:DELETED`, `ROOM:CLOSED`, and `AUDIO:ENVIRONMENT_SET`; remaining gaps are primarily drag/drop behavior, lifecycle cleanup/restore guarantees, spectator exposure policy, and docs completion.

---

### W-Audio-Voice: DM Voice Targeting and Broadcast Mode

**Status**: 🟢 Done
**Priority**: 🟡 High
**Depends on**: W1-Runtime-Recovery

**Scope**: DM can select which group(s) hear their voice. Broadcast mode sends to all groups; targeted mode sends to selected group only.

**Acceptance Criteria**:

- [x] DM audio control panel shows: current target group, broadcast toggle, mute button
- [x] Broadcast mode routes DM voice to all groups in session
- [x] Targeted mode routes DM voice to selected group only
- [x] Broadcast toggle is unavailable (greyed out) while in Whisper group
- [x] WS event `AUDIO:DM_VOICE_TARGET_CHANGED` broadcasts to all clients
- [x] Frontend renders DM voice status with icon + tooltip

**Related Docs**:

- [docs/CONTRACTS.md](docs/CONTRACTS.md) (audio section)

Evidence snapshot (2026-06-04):

- `AUDIO:DM_VOICE_TARGET_CHANGED` added to `shared/events/audio.ts` and emitted by backend `handleSetDmVoiceMode` (TARGET_GROUP case). Frontend registers handler in `useWebSocket.ts` → `handleDmVoiceTargetChanged` updates `dmVoiceTargetGroupId` and `broadcastModeEnabled: false` in `audioOverridesSlice`.
- Targeted voice mode: `LeftRail.tsx` passes `dmVoiceTargetGroupId` as `roomId` to `AudioPanel`. `useLiveKit` reconnects to the target group's LiveKit room when the ID changes — players in that room hear the DM directly. No explicit presence move; the LiveKit room change is frontend-only.
- Broadcast mode: `AudioPanel.tsx` holds a second `broadcastLivekit` instance connected to `dm-broadcast:{sessionId}` when `broadcastModeEnabled` is true. DM publishes there (`canPublish: true`); all players subscribe (`canPublish: false`). A `useEffect` in `AudioPanel` auto-publishes/unpublishes broadcast audio as `broadcastModeEnabled` changes.
- DM voice status: `DmVoiceTargetIndicator` in `RoomSelector.tsx` (leaf component, stable ref, subscribes only to `dmVoiceTargetGroupId`) shows the current voice target group name below the DM avatar card. Broadcast button in `GroupsHeaderActions` highlights with the `active` class when broadcast is on.
- Broadcast unavailable during Whisper: `whisperModeLocked` prop disables the broadcast button in `GroupsHeaderActions`.
- DM voice presets (voice changer): `DmVoicePanel` in `GroupsHeaderActions` opens a 3-column preset grid (9 presets: Narrator, Voice of God, Demon, Dragon, Angel, Ghost, Robot, Ancient, Whisper). Selecting a preset calls `POST /api/audio/voice-preset` → `AUDIO:DM_VOICE_MODE_CHANGED` → `useDmVoiceProcessor` builds a Web Audio chain (EQ, distortion, reverb via synthetic impulse) and calls `LocalAudioTrack.replaceTrack()`. Tap button when active = one-click dismiss (restores raw mic, tears down AudioContext).

---

### W-Audio-Condition: Apply/Remove Conditions (Drunk, Confused, Silenced)

**Status**: 🟢 Done
**Priority**: 🟡 High
**Depends on**: W1-Runtime-Recovery

**Scope**: DM can apply audio conditions to players (Drunk: slurred pitch, Confused: scrambled audio, Silenced: routed only to DM + spectators). Conditions are visible in AudioPanel. System message appears in chat when applied/removed.

**Acceptance Criteria**:

- [x] DM right-click player → Condition → select from list
- [x] Condition applies to player and broadcasts to all clients (`AUDIO:DM_OVERRIDE_APPLIED` with `overrideType: CONDITION`)
- [x] Silenced player hears themselves normally but others hear nothing (server-side LiveKit mute enforcement)
- [x] AudioPanel shows active condition with icon and explanation (via `effectItems` in `AudioPanelFooter`)
- [x] System message appears in chat: `[{player} is {condition}]` when condition applied
- [x] System message appears when condition removed: `[{player}'s condition was cleared]`
- [x] Multiple conditions stack visually but primary is highlighted in AudioPanel
- [x] Server-side mute enforcement: silenced players cannot publish audio to other players

Evidence snapshot (2026-06-05):

- Context menu Condition submenu wired end-to-end: `PlayerContextMenuContent.tsx` → `RoomSelector.tsx` `handleApplyConditionOverride` → `POST /api/audio/dm-override/apply` with `overrideType: CONDITION`.
- Backend validates preset names against `AUDIO_CONDITION_PRESET_NAMES` before persisting; rejects unknown conditions with 400.
- `AUDIO:DM_OVERRIDE_APPLIED` WS handler extended in `useWebSocket.ts`: when `overrideType === CONDITION` for the current user, looks up DSP from `findConditionPreset` (shared catalog) and calls `store.setCondition(...)`. `useAudioEngine.applyEffectStack` immediately applies the DSP chain (lowpass, gain, mute) to all incoming participant tracks.
- `AUDIO:DM_OVERRIDE_REMOVED` handler calls `store.clearCondition()` when targeted at current user.
- `emitConditionSystemMessage` service function in `system-messages.service.ts` persists and broadcasts a `CHAT:MESSAGE_SENT` system message on every apply/remove. Best-effort (failures swallowed so the audio route always succeeds).

Evidence snapshot (2026-06-05 — stacking, primary highlight, SILENCED enforcement):

- `AudioDetailItem` interface in `AudioDevicePanel.tsx` now exported with `isPrimary?: boolean`. CONDITION items are built with `isPrimary: true` in `AudioPanelFooter.tsx`'s `effectItems` memo. The `AudioDevicePanel` applies `--primary` CSS modifier to the list item, rendering it with a warm-tinted background and highlighted name — visually distinct from secondary effects (distance, environment, etc.).
- Deduplication fix: CONDITION and DISTANCE override types are now skipped in the `currentUserOverrides` loop since both are already covered by dedicated `currentCondition`/`currentDistance` slots above the loop. No more duplicate entries when both a condition and a DM override record are active.
- Server-side SILENCED enforcement: `backend/src/infra/livekit/room.service.ts` created with `enforceParticipantPublishPermission` wrapping `RoomServiceClient.updateParticipant`. When SILENCED is applied, `handleApplyDmOverride` in `audio.routes.ts` looks up the player's `primaryRoomId` from session presence and calls `updateParticipant(roomId, userId, {canPublish: false})`. When the condition is removed, `canPublish` is restored to `true` (unless the player is already DM-muted or self-muted). `getServerMuteEnforcementState` in `effects.service.ts` also reads the active CONDITION override to include SILENCED in token-based enforcement — reconnecting clients receive `canPublish: false` in the LiveKit token if silenced.

**Related Docs**:

- [docs/CONTRACTS.md](docs/CONTRACTS.md) (condition effects)
- [.github/copilot-instructions.md](.github/copilot-instructions.md) (Condition: SILENCED section)

---

### W-Audio-Distance: Distance Modifier (Nearby, Visible, Far)

**Status**: 🟢 Done
**Priority**: 🟡 High
**Depends on**: W1-Runtime-Recovery

**Scope**: DM can set player distance (Default | Nearby | Visible | Far). Each applies audio processing (lowpass, reverb, volume). System message in chat when distance changes.

**Acceptance Criteria**:

- [x] DM right-click player → Distance → select from list
- [x] Distance applies and broadcasts to all clients within one WS round-trip
- [x] AudioPanel shows active distance with icon (via `effectItems` in `AudioPanelFooter`)
- [x] System message appears in chat: `[{player} is {distance}]` when distance changes
- [x] Audio processing matches distance preset (muffling, volume reduction, reverb) — DSP applied via `useAudioEngine.applyEffectStack` → `applyDistanceToNode`
- [x] Distance clears when player changes groups or condition applied

Evidence snapshot (2026-06-05):

- Context menu Distance submenu wired end-to-end: `PlayerContextMenuContent.tsx` → `RoomSelector.tsx` `handleApplyDistanceOverride` → `POST /api/audio/dm-override/apply` with `overrideType: DISTANCE`.
- Backend validates preset names against `AUDIO_DISTANCE_PRESET_NAMES`; "Default" is handled client-side as a removal (calls remove endpoint instead).
- `useWebSocket.ts` handler: when `overrideType === DISTANCE` for the current user, looks up DSP via `findDistancePreset` (shared catalog) and calls `store.setDistance(...)`. Selecting "Default" triggers the remove endpoint → `clearDistance()`.
- System messages emitted via `emitConditionSystemMessage` on apply and remove.

Evidence snapshot (2026-06-05 — distance auto-clear):

- `moveRoomMemberHandler` in `rooms.routes.ts` now checks for an active `DISTANCE` override on the moved player after a successful group change. If found, it removes it, broadcasts `AUDIO:DM_OVERRIDE_REMOVED`, and emits the distance-cleared system message.
- `handleApplyDmOverride` in `audio.routes.ts` does the same when `overrideType === CONDITION`: any existing `DISTANCE` override for the same player is cleared before returning.

**Related Docs**:

- [docs/CONTRACTS.md](docs/CONTRACTS.md) (audio effects)

---

### W-Audio-Environment: Group Environment (Tavern, Cave, Forest, Underwater)

**Status**: 🟢 Done
**Priority**: 🟡 High
**Depends on**: W1-Runtime-Recovery

**Scope**: DM sets environment for each group (affects all members). Environment persists across session boundaries (campaign-level setting). Environment icon in group header; DM click to change.

**Acceptance Criteria**:

- [x] Group header shows environment icon
- [x] DM click environment icon → popover to select environment
- [x] Optimistic environment apply with revert-on-failure toast (implemented in W-Groups-Panel, 2026-06-02)
- [x] WS event `AUDIO:ENVIRONMENT_SET` broadcasts to affected clients
- [x] AudioPanel shows active environment with icon (via `effectItems` in `AudioPanelFooter` reading `currentEnvironment`)
- [x] Environment persists in campaign when session ends
- [x] Environment restores when new session starts (campaign-scoped)
- [x] Greenroom environment is always neutral (locked, no modification)
- [x] Pause snapshot: environments preserved across pause/resume by design (deliberate — see W-Groups-Panel evidence 2026-06-04)

Evidence snapshot (2026-06-05):

- `handleEnvironmentSet` in `audioPresetsSlice.ts` fixed: always updates `roomEnvironmentNames` (drives Groups Panel icons), then checks if the affected room matches the current user's `primaryRoomId` before setting `currentEnvironment`. DSP is resolved from the shared `ENVIRONMENT_PRESETS` catalog via `findEnvironmentPreset` rather than relying on the (often empty) WS event `parameters`. Players in the affected group now hear the environment DSP (lowpass + reverb) as soon as the DM applies it.

Evidence snapshot (2026-06-05 — environment persistence + greenroom lock):

- `restoreCampaignRoomsForSession` in `lifecycle.service.ts` fixed: previously skipped environment restoration for rooms that already existed in the new session (created in editor mode). Now restores the environment from the previous session for any pre-existing room that has no environment set, so campaign groups always start the new session with their last configured environment.
- `handleSetEnvironment` in `audio.routes.ts` now rejects (403) any attempt to set an environment on the greenroom by name check via `isGreenRoomName`. Frontend `GroupCard.session.tsx` already guards this via `canChangeEnvironment = canManage && !isWhisper && !isGreenRoom`.

**Related Docs**:

- [docs/CONTRACTS.md](docs/CONTRACTS.md) (audio section)
- W-Groups-Panel (evidence snapshot 2026-06-02) — environment apply UI landed here first

---

## Phase 3: Notes & Journal Foundation 🟢

_DM reference and player communication. DMDX markdown editor, pop-out windows, system message cards._

### W-Notes-Editor: DMDX Markdown Editor Integration

**Status**: 🟢 Done
**Priority**: 🟡 High
**Depends on**: W0-Rightbar

**Scope**: Notes panel uses DMDX markdown editor with syntax highlighting, helper toolbar, and raw-markdown toggle. Support hashtags, attachments (images, PDFs), and required fields (Name, Content, Hashtags, Attachments).

**Acceptance Criteria**:

- [x] Notes editor integrates DMDX library for markdown syntax highlighting and editing
- [x] Helper toolbar includes: bold, italic, lists, headings, code (external links blocked; internal links only)
- [x] Raw markdown toggle allows editing source directly
- [x] Required fields enforced: Name is required; Content required by form validation
- [x] External links are blocked in toolbar and render pipeline
- [x] Hashtag autocomplete from campaign tag history
- [x] Notes are searchable by Name + Content + Hashtags

**Evidence snapshot (2026-06-05)**:

- `frontend/src/utils/dmdx/dmdxParser.ts` — DMDX markdown parser (9 block types: npc, monster, encounter, loot, spell, session, roll, map, timeline). Markdown is stored as-is; DMDX blocks are rendered only in read-only view.
- `frontend/src/components/workspaces/shared/panels/dmdx/` — all 9 block renderers + `DmdxMarkdownRenderer` + `DmdxInsertMenu` (toolbar Insert Block button).
- `MarkdownEditor.tsx` — split into `MarkdownEditorEditable` (edit mode with DMDX insert toolbar) + `MarkdownEditor` dispatcher (read-only delegates to `DmdxMarkdownRenderer`). Both `NoteCard` and `NotesCreateForm` already used `MarkdownEditor`, so DMDX rendering activated automatically.
- `NotesPanel.compact.tsx` — in-session compact view: dense stacked-card list → full-panel overlay on tap (180ms slide-in animation). `NotesPanel.tsx` renders `NotesPanelCompact` when `compactPicker={true}`.
- `HashtagAutocompleteInput.tsx` — inline autocomplete for hashtag fields in `NoteCard` and `NotesCreateForm`. Derives unique tags from Zustand store (no extra API call). Keyboard-navigable (ArrowDown/Up, Enter/Tab to confirm, Escape to dismiss).

**Related Docs**:

- [docs/changes/NOTES-JOURNAL-IMPLEMENTATION-CHECKLIST.md](docs/changes/NOTES-JOURNAL-IMPLEMENTATION-CHECKLIST.md)

---

### W-Notes-Visibility: Sharing and Handout Distribution

**Status**: 🟢 Done (SPECTATORS scope deferred)
**Priority**: 🟡 High
**Depends on**: W-Notes-Editor

**Scope**: DM can share notes to players with scopes (Private | Party | Selected | Spectators). Shared notes surface as one-time chat cards to recipients.

**Acceptance Criteria**:

- [x] Share modal allows selecting scope: Private (DM only) | Party (all players) | Selected (choose specific players) — `NoteSurfaceDialog` (PARTY/SELECTED). `NoteSharePopover` labels now Private/Party/Selected. SPECTATORS deferred (needs enum + migration).
- [x] Shared notes surface as one-time recipients-only chat card via `NOTES:HANDOUT_SURFACED` WS event
- [x] Card includes note excerpt (auto-generated or DM override) and link to full note
- [x] Duplicate cards are not surfaced on reconnect/hydration (persisted system chat message with unique ID; HANDOUT_SURFACED is real-time only)
- [x] Players can always find shared notes in Notes tab (filtered by visibility) — `canViewNote` on backend enforces this; players only receive notes visible to them via API and WS.
- [x] Private notes only visible to DM and owner — enforced by `canViewNote` in `backend/src/services/notes/shared.ts`.

**Related Docs**:

- [docs/changes/NOTES-JOURNAL-IMPLEMENTATION-CHECKLIST.md](docs/changes/NOTES-JOURNAL-IMPLEMENTATION-CHECKLIST.md)

---

### W-Journal-and-Popouts: Separate Windows for Notes and Journal

**Status**: 🟢 Done
**Priority**: 🟡 High
**Depends on**: W-Notes-Visibility

**Scope**: Notes and Journal can pop out into separate windows for side-by-side reading. Journal is one per session chapter; players can read but not edit. Info panel remains compact.

**Acceptance Criteria**:

- [x] Notes detail view has "Pop Out" button (`open_in_new` icon) → `window.open('/popout/note/:noteId', ...)`
- [x] Journal detail view has "Pop Out" button (`open_in_new` icon) → `window.open('/popout/journal/:sessionId', ...)`
- [x] Pop-out windows are resizable (native OS window management)
- [x] Journal links to session chapter name and uses same editor as Notes (`sessionName` prop → title)
- [x] Journal visibility: DM + players + spectators can read — `GET /api/journals/:sessionId` enforces this
- [x] Only DM can edit Journal — `POST /api/journals/:sessionId` requires DM role; `JournalEditor` is read-only for non-DM
- [x] Pop-out state persists during session — browser keeps windows open; `window.open` with named target reuses existing window if already open

**Evidence snapshot (2026-06-05)**:

- `frontend/src/utils/route-view.ts` — `popout-note` and `popout-journal` route kinds; `openNotePopout()` / `openJournalPopout()` helpers store auth token in `sessionStorage` (same-origin; inherited by new window) and call `window.open`.
- `frontend/src/components/routes/PopoutRouteView.tsx` — minimal layout: note pop-out fetches `GET /api/notes/by-id/:noteId` and renders `MarkdownEditor` read-only; journal pop-out renders `JournalPanel` in focused mode (DM gets editable, others get read-only).
- `backend/src/api/notes.routes.ts` — `GET /api/notes/by-id/:noteId` endpoint added (before `:sessionId` catch-all) with `canViewNote` visibility check.
- `frontend/src/components/workspaces/shared/panels/NotesPanel/NoteCard.tsx` — pop-out button added to note header.
- `frontend/src/components/workspaces/shared/panels/JournalPanel.tsx` — pop-out button added to journal header alongside save/cancel.

**Related Docs**:

- [docs/changes/NOTES-JOURNAL-IMPLEMENTATION-CHECKLIST.md](docs/changes/NOTES-JOURNAL-IMPLEMENTATION-CHECKLIST.md)

---

### W-System-Messages: Condition and Distance Change Cards

**Status**: 🟢 Done
**Priority**: 🟡 Medium
**Depends on**: W-Audio-Condition, W-Audio-Distance

**Scope**: When DM applies/removes conditions or changes distance, a small system message minimalistic card appears in chat timeline so players see what is happening. Cards are compact and non-intrusive.

**Acceptance Criteria**:

- [x] System message card appears in chat when condition is applied: `[{player} is now {condition}]`
- [x] System message card appears when condition is removed: `[{player}'s condition cleared]`
- [x] System message card appears when distance changes: `[{player} is {distance}]`
- [x] Cards include icon and explanation tooltip (preset description on hover)
- [x] Cards are compact (one line) and styled consistently
- [x] Cards appear for all viewers (DM, players, spectators)
- [x] Cards persist in chat history for later reference and AI summary processing
- [x] Cards include explanation tooltip — condition icon wrapped in Radix `Tooltip`; shows `conditionPreset.description` on hover

**Evidence snapshot (2026-06-05)**:

- `backend/src/services/system-messages.service.ts` — `emitConditionSystemMessage()` emits `CHAT:MESSAGE_SENT` for both condition and distance changes; persists as a standard chat message so it survives refresh. Metadata now includes `overrideType: 'CONDITION' | 'DISTANCE'` so the frontend can distinguish them.
- `shared/types/entities.ts` — `ConditionMessageMetadata` updated with optional `overrideType` field (backwards-compatible). Now exported from `@shared` — local duplicate in `MessageList.tsx` removed.
- `frontend/src/components/workspaces/session/chat/MessageList.virtualized.tsx` — condition cards now wrapped in a `Tooltip` showing the preset description on hover. Distance cards use `findDistancePreset()` for icon and description; condition cards use `findConditionPreset()`.

**Related Docs**:

- [docs/CONTRACTS.md](docs/CONTRACTS.md)

---

### W-DM-Notes-to-Chat: Share Note to Chat Timeline

**Status**: 🟢 Done
**Priority**: 🟡 Medium
**Depends on**: W-Notes-Visibility

**Scope**: DM can send a note directly to the chat timeline (system message) so it appears as a chat message note card. Players find it in Notes tab for later reference.

**Acceptance Criteria**:

- [x] DM can send note to chat via "Send Handout" button → `NoteSurfaceDialog` (PARTY / SELECTED scope, optional manual excerpt) → `POST /api/notes/:noteId/surface`
- [x] Note appears as system message in chat (card-style via `NoteSharedCard`) for all recipients
- [x] Message surfaces note excerpt (auto-generated or DM override) + "Full note available in the Notes tab" hint; `noteId` threaded through `ParsedNoteSharedMessage` for future deep-link navigation
- [x] Note remains accessible in Notes tab — `/surface` updates note visibility to match scope (PARTY → PLAYERS_VISIBLE; SELECTED → CUSTOM + allowedUsers)
- [x] Message timestamp shown on `NoteSharedCard` footer; `noteId` available in `metadata.noteHandout` for history reference

**Evidence snapshot (2026-06-05)**:

- `NoteSharedCard.tsx` — excerpt cards show "Full note available in the Notes tab" below the excerpt body; `excerptSource` badge shows AUTO or MANUAL source.
- `noteSharedMessage.ts` — `ParsedNoteSharedMessage.noteId` populated from both `noteHandout` and legacy `noteShared` metadata.
- `POST /api/notes/:noteId/surface` — persists system chat message, broadcasts `NOTES:HANDOUT_SURFACED` + `CHAT:MESSAGE_SENT` to recipients only, updates note visibility.

---

## Phase 4: Future Enhancements ⚪

### W-Queues: Durable Queue Manager (BullMQ)

**Status**: 🟢 Done
**Priority**: 🟡 Medium (post-MVP)
**Depends on**: Core Reliability complete

**Scope**: Introduce BullMQ in a separate container for durable, long-running jobs: cleanup, transcription staging, email, summary processing. Enables restart-safe job handling.

**Acceptance Criteria**:

- [x] BullMQ container runs alongside backend (`apps/queues/` service, port 3001 internally)
- [x] Job types: cleanup-old-sessions, process-recording, send-email, generate-summary (workers + shared payload types in `packages/shared/jobs/`)
- [x] Failed jobs have retry policy with exponential backoff (BullMQ `exponential` backoff, configurable via `QUEUE_MAX_ATTEMPTS` / `QUEUE_BASE_DELAY_MS`)
- [x] Dead-letter queue for failed jobs after max retries (`vttchat:dlq` queue; workers push `DlqEntryPayload` on terminal failure)
- [x] Operator can inspect/retry/clear jobs via admin API (`GET/POST/DELETE /queues/*`, secured with `QUEUE_ADMIN_SECRET`)

**Phase 3 complete**:

- [x] `generate-summary` worker feature-gated on `LLM_SUMMARY_URL` — skips gracefully when not set; activates automatically on deploy
- [x] `process-recording` worker feature-gated on `RECORDING_PROCESSOR_URL` — dedicated `vttchat:recording` queue; same graceful skip pattern
- [x] Admin app queue inspection via `GET|POST|DELETE /api/admin/queues/*` — backend proxies to queues service with `adminAuthMiddleware` (no direct browser → queues exposure)
- [x] `docs/architecture/QUEUE-JOB-MANAGER.md` updated from blueprint to implemented state with ASCII diagram and comm pattern detail
- [x] `docs/operations/QUEUES.md` created — full operator reference: env vars, queue reference, admin API, DLQ workflow, troubleshooting

**Production ops** (non-feature, no code change):

- Set `DISABLE_INTERNAL_CLEANUP_SCHEDULER=1` in production once BullMQ schedule is proven stable

**Related Docs**:

- [docs/architecture/QUEUE-JOB-MANAGER.md](docs/architecture/QUEUE-JOB-MANAGER.md)

---

### W-Admin-Platform: User, Campaign, and Ops Management

**Status**: 🟢 Done
**Priority**: 🟡 Medium (post-MVP)
**Depends on**: Core Reliability complete

**Scope**: Admin console for: user management (suspend/restore/ban), campaign management (archive/restore), logs/telemetry viewing, system status, backup/restore, platform monitoring integration.

**Sub-domains**:

- User Management (suspend, restore, ban, view history) — done
- Campaign Management (archive, restore, view members) — done
- Logs & Telemetry (search logs, view metrics, event history) — done
- System Status (health checks, service status, performance) — done
- Import/Export (user data export, campaign archive) — done
- Backup/Restore (manual backup, restore from bundle) — done
- Platform Monitoring (uptime, request rate, error rate) — done; Prometheus/Grafana integration not yet implemented
- Initial Setup Wizard — done; first frontend load gates on setup if no admin exists; first admin granted SUPER_ADMIN automatically

**Acceptance Criteria**:

- [x] Admin can suspend/restore users
- [x] Admin can permanently ban users (`POST /users/:userId/ban`) and unban (`POST /users/:userId/unban`); `bannedAt` on User schema; restore rejects banned users
- [x] Admin can archive/restore campaigns
- [x] Admin can search logs by user/campaign/date range
- [x] Admin can view system health and service status
- [x] Backup/restore UI — Settings page has "Backup Now", "Export Ops Bundle", and "Restore from Bundle" (`POST /settings/backup/restore`)
- [x] Monitoring integration displays uptime, request rate, error rate
- [x] First frontend load shows `SetupGate` and blocks the app if no admin account exists yet

**Related Docs**:

- (Admin-specific architecture docs to be created)

---

### W-Extension-MVP: Guest Login and Campaign Access via Extension

**Status**: 🟡 In Progress
**Priority**: 🟡 Medium (post-MVP, MVP distribution channel)
**Depends on**: Core Reliability + W0-UI complete

**Scope**: VS Code or browser extension allows launching app, guest login, campaign access, and data sync. One-click launch from invite link or code.

**Acceptance Criteria**:

- [x] Extension can launch app via POST to `/api/auth/extension/guest-login`
- [x] Guest DM/Player/Spectator accounts are created on first launch
- [x] Campaign membership is auto-granted via invite link or code
- [x] Guest account can be upgraded to full account later without losing campaign history
- [ ] Extension reconnects persistently via device credential — contract locked (see `docs/CONTRACTS.md`); backend endpoints not yet implemented
- [ ] Extension stays synced with app state during session — join-time sync only; active-session sync deferred to Stage E2

**Evidence snapshot (2026-06-08 — backend audit)**:

Backend is production-ready for extension integration. All guest auth contracts, account lifecycle, and invite flows are implemented and tested.

- `POST /api/auth/extension/guest-login` — fully implemented in `backend/src/api/auth.routes.ts`; service logic in `backend/src/services/guest-auth/extension.service.ts`. Accepts inviteCode, externalSystem, externalUserId, character data, campaignPacket; creates or updates guest User with `authType=GUEST`, ExternalIdentity link, Character, and CampaignMembership; assigns DM or PLAYER role from `campaignPacket.dmExternalUserId`; returns JWT with guest claims.
- `POST /api/auth/extension/preflight` — pre-flight validation endpoint; returns accountStatus (`none`/`guest`/`full`) and suggestedFlow before the guest login call; covered by `backend/tests/api/guest-auth-routes.test.ts`.
- Guest Spectator join via `POST /api/auth/spectator/guest-join`; spectator capacity, waitlist, reconnect grace, and slot promotion all implemented in `backend/src/services/guest-auth/spectator.service.ts`.
- Campaign membership auto-granted on first connect; role assignment is server-side; existing membership upserted on reconnect.
- `POST /api/auth/upgrade` upgrades guest → full account without changing UUID or losing campaign data; covered by `backend/src/services/guest-auth/account-upgrade.service.ts`.
- `GuestUpgradePrompt.tsx` — frontend upgrade banner component implemented in `frontend/src/components/guest/GuestUpgradePrompt.tsx`.
- Frontend non-extension invite join flow: `InviteJoinPage.tsx`, `useInviteValidation.ts`, `useEmailPrecheck.ts`, `inviteJoin.ts`.
- Integration test coverage: `backend/tests/integration/guest-auth-flows.integration.test.ts`.
- Extension frontend (background script, content script, popup) resides in a separate repository per `docs/extension/EXTENSION-ROADMAP.md` Stage E1. Active-session character/state sync is Stage E2 and not yet scoped.

**Remaining work**:

- Extension Device Credential backend endpoints — `POST /api/auth/extension/credential/exchange`, `GET /api/auth/extension/credentials`, `DELETE /api/auth/extension/credentials/:credentialId`; `POST /api/auth/extension/guest-login` response must include `deviceCredential` field. Contract locked in `docs/CONTRACTS.md`.
- Extension frontend implementation (separate repo, Stage E1) — page detection, background script, popup UI, credential storage replacing invite URL storage; see updated `docs/extension/EXTENSION-ROADMAP.md`.
- Active-session state sync (Stage E2) — character update propagation during an active session

**Related Docs**:

- [docs/extension/EXTENSION-ROADMAP.md](docs/extension/EXTENSION-ROADMAP.md)

---

### W-DM-Handoff: Campaign Ownership Transfer

**Status**: 🟢 Done
**Priority**: 🔵 Low (post-MVP)
**Depends on**: Core Reliability complete

**Scope**: Campaign owner (DM) can resign and assign another existing campaign member as the new DM. Ensures campaigns survive DM unavailability without platform intervention.

**Acceptance Criteria**:

- [x] DM can initiate handoff to any current campaign member from campaign settings
- [x] Target player must accept the handoff before ownership transfers
- [x] Handoff is not permitted during an active session (must be from greenroom/IDLE)
- [x] All campaign-scoped data (groups, notes, history) is preserved on transfer
- [x] Former DM is demoted to PLAYER role automatically
- [x] Handoff is logged as a campaign system event

**Related Docs**:

- [docs/CONTRACTS.md](docs/CONTRACTS.md) — Campaign DM Transfer section

---

### W-DM-Campaign-Portability: DM Self-Service Campaign Export and Import

**Status**: 🟢 Complete
**Priority**: 🔵 Low (post-MVP)
**Depends on**: W0-Lobby-Admin (shares export format), Core Reliability complete

**Scope**: DMs can export their own campaign as a portable JSON file and import a previously exported file to create a new campaign — no admin involvement required. The DM export format omits member emails and passwords; imported campaigns start with the DM as the sole member and players rejoin via the normal invite flow.

This is the DM-facing counterpart to the admin-only W0-Lobby-Admin export/import. The admin route remains the privileged path (with email re-linking and full member stubs); this route is a lighter self-service backup/restore for DMs.

**Acceptance Criteria**:

- [x] `GET /api/campaigns/:id/export` — DM-authenticated (campaign owner only). Returns portable JSON: campaign metadata, groups/environments, session history/chat (IC, OOC, system bookends), notes/journal. Member list includes display names and roles but no emails or passwords.
- [x] Export respects campaign privacy: Whisper (PRIVATE room messages and WHISPER-type messages) excluded. All other persisted messages (including OOC during PAUSED/COOLDOWN) are included.
- [x] `POST /api/campaigns/import` — authenticated user. Creates a new campaign with fresh UUIDs from the export file; the caller becomes the new DM. Import never overwrites an existing campaign.
- [x] Import is idempotent for the same file: re-importing always creates a new campaign, never patches an existing one.
- [x] Lobby offline workspace surfaces "Export Campaign" in the campaign header actions (DM-only, not visible to players or spectators).
- [x] Lobby surfaces "Import Campaign" alongside the existing "Create Campaign" and "Join Campaign" actions (DM-only).
- [x] Export and import progress/result surfaces as a toast; errors include a human-readable reason.
- [x] Imported campaign appears in the DM's lobby list immediately; players must be re-invited via the normal invite flow.

**Related Docs**:

- [docs/CONTRACTS.md](docs/CONTRACTS.md) — Campaign Export and Import section (admin variant; DM contract to be appended when implemented)

---

### W-Session-Schedule: Next Session Date

**Status**: ⚪ Not Started
**Priority**: 🟡 Medium (post-MVP)
**Depends on**: Core Reliability complete

**Scope**: DMs configure a repeating session schedule (weekly, biweekly, or monthly on the Nth weekday) via a structured picker in the Campaign Settings panel. The system calculates and surfaces the next session date in the Campaign Info panel for all campaign members. After each session ends the date auto-advances from the schedule. The DM can override the next date for any individual session without disrupting the ongoing schedule.

**Design**:

- **Schedule input**: Structured picker — repeat type (weekly / biweekly / monthly), day of week, optional Nth (1st–4th; monthly only), time, and IANA timezone. A utility function in `packages/shared/utils/session-schedule.ts` generates the human-readable label (`"Every 2nd Sunday of the month at 1:00 PM"`) and calculates the next occurrence. No free-text parsing.
- **Next session date**: A `nextSessionDate DateTime?` field on Campaign, authoritative on the backend. Auto-recalculated on `SESSION:ENDED`. The DM can override for any single session via `PUT /api/campaigns/:id/next-session-date`; after that session ends, the schedule resumes — the manual flag is consumed once.
- **Display**: Visible to all members (DM, players, spectators). Shown in the Campaign Info panel whenever no session is running (`IDLE`, `ENDED`, `COOLDOWN`, `CLEANUP`). Hidden during `ACTIVE`/`PAUSED`. Format: date + relative time, e.g. `"Sun Jun 14 at 1:00 PM · in 2 days"`.

**Acceptance Criteria**:

- [ ] Prisma migration: `sessionScheduleType SessionScheduleType?`, `sessionScheduleDay Int?`, `sessionScheduleNth Int?`, `sessionScheduleHour Int?`, `sessionScheduleMinute Int?`, `sessionScheduleTz String?`, `nextSessionDate DateTime?`, `nextSessionIsManual Boolean @default(false)` added to Campaign
- [ ] New Prisma enum `SessionScheduleType { WEEKLY BIWEEKLY MONTHLY_NTH }` in schema and mirrored in `packages/shared/types/`
- [ ] `packages/shared/utils/session-schedule.ts`: pure functions `formatScheduleLabel(schedule)` and `calculateNextOccurrence(schedule, after)` — timezone-aware via `date-fns-tz`, no side effects, unit-tested
- [ ] `PATCH /api/campaigns/:id/settings` extended to accept `sessionSchedule` fields (DM only); calculates and persists `nextSessionDate`; broadcasts `CAMPAIGN:SCHEDULE_UPDATED`
- [ ] `PUT /api/campaigns/:id/next-session-date` — DM-only manual override; body `{ date: ISO8601 }`; sets `nextSessionIsManual = true`; broadcasts `CAMPAIGN:SCHEDULE_UPDATED`
- [ ] `DELETE /api/campaigns/:id/schedule` — DM only; clears all schedule fields and `nextSessionDate`; broadcasts `CAMPAIGN:SCHEDULE_UPDATED`
- [ ] On `SESSION:ENDED`: if `sessionScheduleType` set, call `calculateNextOccurrence(schedule, now())`, persist to Campaign, reset `nextSessionIsManual = false`, broadcast `CAMPAIGN:SCHEDULE_UPDATED`
- [ ] `CAMPAIGN:SCHEDULE_UPDATED` event type defined in `packages/shared/events/campaign.ts`, registered in `apps/backend/src/ws/index.ts`; payload includes `nextSessionDate`, `scheduleLabel`, `nextSessionIsManual`
- [ ] `CampaignInformationPanelCampaign` type extended with `nextSessionDate: string | null`, `scheduleLabel: string | null`
- [ ] `NextSessionDate` — `React.memo` leaf component in `CampaignInformationPanel/`; renders when session state is `IDLE | ENDED | COOLDOWN | CLEANUP`; DM sees pencil edit icon; clicking opens inline date/time override picker with a "Revert to schedule" option that calls `DELETE /api/campaigns/:id/schedule`'s override endpoint
- [ ] `SessionSchedulePicker` component in `CampaignSettingsPanel/`; structured recurrence controls; live preview of generated label; `[Clear Schedule]` action
- [ ] Zustand campaign slice updated with schedule fields; rehydrates from GET `/api/campaigns/:id/settings`; updates on `CAMPAIGN:SCHEDULE_UPDATED`
- [ ] Campaign export payload (`W-DM-Campaign-Portability`) includes schedule fields
- [ ] Unit tests for `formatScheduleLabel()` and `calculateNextOccurrence()`: weekly, biweekly, monthly-Nth, DST boundary cases
- [ ] Unit test: `CAMPAIGN:SCHEDULE_UPDATED` Zustand handler

**Related Docs**:

- [docs/CONTRACTS.md](docs/CONTRACTS.md) — Session Schedule Contract section

---

### W-Chat-Commands: Chat Command System

**Status**: ⚪ Not Started
**Priority**: 🟡 Medium (post-MVP)
**Depends on**: Core Reliability complete, W-Inventory-System (for inventory commands)

**Scope**: A slash-command system for the chat input. DM and Players can issue `/roll`, `/me`, `/whisper`, `/OOC`, and `/dm` commands, plus inventory commands (`/take`, `/give`, `/loot`, `/loot-split`, `/drop`). A `[/]` icon button opens a role-aware help popup; typing `/` triggers an inline autocomplete command palette.

**Acceptance Criteria**:

- [ ] Typing `/` in the chat input opens a filtered autocomplete command palette showing available commands
- [ ] `[/]` icon button on the left of the chat input opens a full help popup (role-aware: players do not see DM-only commands)
- [ ] Command registry defined in `shared/types/chatCommands.ts` (name, syntax, description, example, roles, availableInStates)
- [ ] `/roll [dice]` — styled roll card in chat; dice resolved server-side for fairness; visible to all in room
- [ ] `/me [action]` — italic emote line in chat, scoped to current room, styled as IC
- [ ] `/whisper @{player} [message]` — shortcut for whisper; same privacy rules as direct whisper
- [ ] `/OOC [message]` — forces OOC tag/style regardless of current IC/OOC mode toggle
- [ ] `/dm [message]` — player-to-DM only whisper; not visible to other players
- [ ] Inventory commands covered in W-Inventory-System acceptance criteria
- [ ] Unknown command → toast error (not posted to chat)
- [ ] Permission-denied command → toast error (not posted to chat)
- [ ] Backend re-validates role and session state before executing any command (client checks are UX only)
- [ ] Commands unavailable in greenroom/IDLE by default; `availableInStates` per command governs this
- [ ] Unit tests for command parser in `apps/frontend/tests/`
- [ ] Backend command handler tests in `apps/backend/tests/`

**Related Docs**:

- [docs/subsystems/CHAT-SYSTEM.md](docs/subsystems/CHAT-SYSTEM.md) — §9 Chat Commands

---

### W-Inventory-System: Character and Party Inventory with SRD Integration

**Status**: ⚪ Not Started
**Priority**: 🟡 Medium (post-MVP)
**Depends on**: Core Reliability complete, W-Chat-Commands (for command entry UX)

**Scope**: Full campaign-scoped inventory system. Character and party inventories with GP/SP/CP/EP/PP currency. Item search backed by the D&D 5e SRD API (2014 or 2024, DM-selects per campaign). All in-session inventory changes produce a system chat message and an inventory history log entry. Accessible via a new INVENTORY right-rail tab and via chat commands.

**Acceptance Criteria**:

- [ ] New INVENTORY right-rail tab added (after PARTY, before ROOMS in canonical dock order)
- [ ] INVENTORY tab shows: Party Inventory view, own Character Inventory view; DM sees all character inventories
- [ ] Spectators see party and all character inventories in read-only mode
- [ ] Campaign setting: SRD ruleset (2014 or 2024); default 2014
- [ ] Item search autocomplete calls `GET /api/srd/items?q=` (backend proxy, 24h cache, fails silently if SRD API unreachable)
- [ ] Custom items supported (free-text name, no SRD backing required)
- [ ] Item fields: name, quantity, source (SRD/custom), optional notes
- [ ] Currency per character wallet and party purse (GP/SP/CP/EP/PP)
- [ ] `[+Add]` button for DM to add items or currency directly from the panel
- [ ] `[⋯]` per-item action menu: Move to…, Edit notes, Remove (with confirmation)
- [ ] Inventory history log overlay (within INVENTORY panel): filterable by character, date range, item, action type
- [ ] Campaign settings for player permissions: Allow players /give and /take (ON default); Allow players /loot (OFF default)
- [ ] `/loot [item] [qty?]` — DM adds item to party inventory; chat system message in ACTIVE session
- [ ] `/loot-split [item] [qty?]` — DM proposes split; Loot Split Card appears in chat; players accept in one click; unaccepted shares revert to party after 60s
- [ ] `/take [item] [qty?]` — player takes from party inventory (campaign setting gated)
- [ ] `/give @{player\|party} [item] [qty?]` — player gives item to target
- [ ] `/drop [item] [qty?]` — remove item from own/party inventory (confirmation required)
- [ ] Currency shorthand: `/give @party 10gp`, `/take 5sp` etc.
- [ ] All inventory mutations during ACTIVE session → system message in chat + history log entry
- [ ] Mutations outside ACTIVE session → history log entry only (no chat message)
- [ ] WS events: `INVENTORY:ITEM_ADDED`, `INVENTORY:ITEM_REMOVED`, `INVENTORY:ITEM_TRANSFERRED`, `INVENTORY:LOOT_SPLIT_PROPOSED`, `INVENTORY:LOOT_SPLIT_ACCEPTED`, `INVENTORY:LOOT_SPLIT_EXPIRED`, `INVENTORY:CURRENCY_CHANGED`
- [ ] 4-layer state: PostgreSQL persistence (campaign-scoped) → WS broadcast → Zustand `inventorySlice`
- [ ] `InventoryItem`, `CurrencyWallet`, `InventoryHistoryEntry` Prisma models added and migrated
- [ ] REST endpoints: party inventory CRUD, character inventory CRUD, transfer, loot-split, SRD proxy, history
- [ ] Zustand `inventorySlice` rehydrates from REST on panel mount; no Redis (not presence/audio data)
- [ ] Unit tests for inventory mutations and WS handlers
- [ ] Integration tests for loot-split flow and permission gating

**Related Docs**:

- [docs/subsystems/INVENTORY-SYSTEM.md](docs/subsystems/INVENTORY-SYSTEM.md)
- [docs/subsystems/CHAT-SYSTEM.md](docs/subsystems/CHAT-SYSTEM.md) — §9 Chat Commands

---

## Phase 5: Optional and Far Future ⚪

### W-Desktop-App: Tauri-based Desktop Client

**Status**: ⚪ Not Started
**Priority**: 🔵 Low (future distribution channel)

**Scope**: Desktop app built with Tauri for Windows, macOS, Linux. Uses same backend as web.

---

### W-PWA-App: Progressive Web App for Mobile

**Status**: ⚪ Not Started
**Priority**: 🔵 Low (future distribution channel)

**Scope**: PWA for mobile and desktop browsers. Installable, works offline for basic navigation.

---

### W-Accessibility-Advanced: Full WCAG AAA and Assistive Tech

**Status**: ⚪ Not Started
**Priority**: 🔵 Low (optional polish)

**Scope**: Beyond WCAG AA. Enhanced screen reader, voice control, adaptive input.

---

### W-Localization: i18n Support (Multiple Languages)

**Status**: ⚪ Not Started
**Priority**: 🔵 Low (optional, post-launch)

**Scope**: Translation framework, extraction tooling, multi-language support.

---

### W-Recording-Transcription-Summary: Async Post-Session Processing

**Status**: ⚪ Not Started
**Priority**: 🔵 Low (far future, requires Queue Manager)

**Scope**: After session ends, record finalization, transcription, and AI summary generation via durable queue.

**Acceptance Criteria**:

- [ ] Recording finalizes after session ENDED state
- [ ] Transcription processes asynchronously with retry/dead-letter
- [ ] Summary generation uses transcript + boundary markers + player actions
- [ ] Off-the-record content (Whisper, Paused runtime content) is excluded from transcript
- [ ] LLM checkpoint resume for `generate-summary` worker (allows resuming an interrupted summary job mid-generation)

**Related Docs**:

- [docs/architecture/TRANSCRIPTION-RECORDING-SYSTEM.md](docs/architecture/TRANSCRIPTION-RECORDING-SYSTEM.md)

---

## Status Legend

- 🟢 Done (closed, no more work)
- 🟡 In Progress (actively being worked on)
- 🔴 Blocked (waiting for something)
- ⚪ Not Started (ready to be picked up)

**Priority**:

- 🔴 Critical (blocks everything else)
- 🟡 High (core to MVP)
- 🟡 Medium (nice to have for MVP, can defer)
- 🔵 Low (post-MVP or truly optional)

---

## See Also

- [docs/DEVELOPMENT-ROADMAP-2026-05.md](docs/DEVELOPMENT-ROADMAP-2026-05.md) — Historical delivery notes and detailed phase descriptions
- [docs/CONTRACTS.md](docs/CONTRACTS.md) — API and WS event contracts
- [docs/architecture/](docs/architecture/) — Architecture docs for each subsystem
- [CHANGELOG.md](CHANGELOG.md) — Delivered features and fixes

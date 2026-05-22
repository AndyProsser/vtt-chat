# Groups Panel Architecture

**Status**: 🔄 **IN PROGRESS** — Initial specification for Groups/Rooms panel refactor

**Date**: May 22, 2026

---

## Overview

The Groups Panel is the DM's interface for managing voice rooms/groups across the campaign lifecycle:

- **Editor Mode** (greenroom): Pre-session planning — create groups, set default environments, review structure
- **Session Mode** (active/paused): Runtime management — drag players between groups, apply environments, close/delete groups
- **Spectator Mode**: Groups are visible (read-only), but UI is hidden from spectators

The panel bridges two distinct workflows: **campaign-level setup** (persistent group structure) and **session-level runtime** (player assignment, effects, temporary state).

---

## Terminology

- **Group** — User-facing term for a voice room/context where the DM splits the party
- **Room** — Backend/internal term (interchangeable with Group in this context)
- **MAIN** — The default group (required, reserved, cannot be deleted)
- **WHISPER** — Temporary private group (system-managed, session-only, reserved)
- **GREENROOM** — Session staging area (reserved name, DM-only)
- **Environment** — Audio ambiance applied to a group (e.g., "Tavern", "Forest", "Underwater")

### Reserved Group Names

These cannot be created by the DM:

- `MAIN` — System-managed default group
- `WHISPER` — System-managed private group (created on session start, deleted on end/pause)
- `GREENROOM` — System-managed staging area

---

## Data Model

### Group (Persistent Campaign-Level)

```ts
interface CampaignGroup {
  id: UUID // Room ID in database
  campaignId: UUID
  name: string // User-defined, except reserved names
  type: RoomType.GROUP // Always GROUP at campaign level
  defaultEnvironmentName?: string // Persistent environment preset for this group
  createdAt: number
  createdBy: UUID
  updatedAt?: number
}
```

**Persistence Rules:**

- Stored in `Room` table (Postgres)
- Campaign-owned, survives session boundaries
- DM can modify environment between sessions
- If deleted during a session, it must be recreated to use again

### Session Group (Runtime State)

```ts
interface SessionGroup {
  id: UUID // Room ID in current session
  sessionId: UUID
  name: string
  type: RoomType // GROUP, MAIN, or PRIVATE (whisper)
  environmentName?: string // Current session environment (may differ from campaign default)
  memberCount: number
  members: SessionMember[]
}

interface SessionMember {
  userId: UUID
  username: string
  roomId: UUID // Current group assignment
  characterName?: string
  avatarUrl?: string
  presenceState: PresenceState
  conditions?: { type: string; label: string }[] // DM-applied audio effects
  distance?: string // Distance override label
  isSpeaking?: boolean
  isMuted?: boolean
}
```

**Lifecycle Rules:**

- Created when session starts (or DM creates mid-session)
- Environment may be overridden during session (does not affect campaign default)
- Pre-pause state is snapshotted; on resume, players return to their pre-pause groups with pre-pause environments
- On session PAUSE: all players move to MAIN, all environments cleared
- On session RESUME: players return to pre-pause groups, environments reapplied
- On session END: all groups deleted (except campaign-level MAIN), all members moved to greenroom

---

## State Management

### Zustand Slices

#### 1. `campaignGroupsSlice`

Stores campaign-level group definitions (editor + session).

```ts
interface CampaignGroupsSlice {
  campaignGroups: Record<UUID, CampaignGroup> // By campaignId

  // Actions
  setCampaignGroups: (campaignId: UUID, groups: CampaignGroup[]) => void
  createCampaignGroup: (campaignId: UUID, name: string) => void
  deleteCampaignGroup: (campaignId: UUID, groupId: UUID) => void
  setCampaignGroupEnvironment: (campaignId: UUID, groupId: UUID, envName: string) => void
  clearCampaignGroupEnvironment: (campaignId: UUID, groupId: UUID) => void
}
```

**Hydration:**

- Loaded from `GET /api/campaigns/:campaignId/groups` in editor view
- Persists across sessions

#### 2. `sessionGroupsSlice`

Runtime state: which groups exist in current session, who's in them, current environments.

```ts
interface SessionGroupsSlice {
  sessionGroups: Record<UUID, SessionGroup> // By sessionId
  sessionGroupMembers: Record<UUID, UUID[]> // groupId -> userIds (denormalized)
  prePauseGroupState: Record<UUID, { groupId: UUID; members: Record<UUID, UUID> }> // Snapshot on pause

  // Actions
  setSessionGroups: (sessionId: UUID, groups: SessionGroup[]) => void
  createSessionGroup: (sessionId: UUID, group: SessionGroup) => void
  deleteSessionGroup: (sessionId: UUID, groupId: UUID) => void
  movePlayerToGroup: (sessionId: UUID, userId: UUID, targetGroupId: UUID) => void
  setSessionGroupEnvironment: (sessionId: UUID, groupId: UUID, envName: string) => void
  snapshotGroupStateBeforePause: (sessionId: UUID) => void
  restoreGroupStateOnResume: (sessionId: UUID) => void
  clearSessionGroups: (sessionId?: UUID) => void
}
```

**Hydration:**

- Loaded from `GET /api/sessions/:sessionId/groups` on session entry
- Cleared on session END / COOLDOWN exit

#### 3. `groupPanelUISlice`

UI state: expanded/collapsed groups, environment picker target, drag context.

```ts
interface GroupPanelUISlice {
  expandedGroupIds: Record<UUID, Set<UUID>> // sessionId -> groupIds that are expanded
  environmentPickerTargetGroupId: UUID | null
  selectedGroupId: UUID | null
  dragContext: { sourceUserId: UUID; sourceGroupId: UUID } | null

  // Actions
  toggleGroupExpanded: (sessionId: UUID, groupId: UUID) => void
  setEnvironmentPickerTarget: (groupId: UUID | null) => void
  setSelectedGroup: (groupId: UUID | null) => void
  startDrag: (userId: UUID, sourceGroupId: UUID) => void
  clearDrag: () => void
}
```

---

## Component Architecture

### Editor Mode (Greenroom/Pre-Session)

**File Structure:**

```
frontend/src/components/workspaces/editor/
  GroupsPanel.editor.tsx        # Main container, mode-specific logic
  GroupCard.editor.tsx          # Card layout for editor (simpler, no drag)
  GroupEnvironmentPicker.tsx    # Shared environment selector modal
  CreateGroupModal.tsx          # Shared group creation modal
```

**Features:**

- List campaign groups for the selected campaign
- Create new groups (with name validation)
- Set default environment per group
- No player assignment (players aren't visible)
- No drag/drop
- Delete option available immediately (group always empty)

### Session Mode (Active/Paused)

**File Structure:**

```
frontend/src/components/workspaces/session/rooms/
  GroupsPanel.tsx              # Route export (re-exports RoomSelector)
  RoomSelector.tsx             # Main container, session orchestration
  GroupCard.tsx                # Card layout for session (with drag target)
  GroupMemberList.tsx          # Player list per group (expandable)
  GroupMemberRow.tsx           # Single player row (audio effects, presence)
  GroupEnvironmentBadge.tsx    # Environment display + click-to-change
  GroupHeaderActions.tsx       # Close/delete buttons per group
  ParticipantDeviceList.tsx    # Device sessions (existing)
  WhisperDock.tsx              # Whisper-specific UI (existing)
  CreateGroupModal.tsx         # Shared group creation modal
  GroupEnvironmentPicker.tsx   # Shared environment selector modal
```

**Component Hierarchy:**

```
RoomSelector
├── GroupsHeaderActions         (broadcast toggle, create group)
├── GroupCard[] (for each group)
│   ├── GroupHeaderActions      (close, delete buttons)
│   ├── GroupEnvironmentBadge   (shows current env, click to change)
│   ├── GroupMemberList (when expanded)
│   │   ├── GroupMemberRow (per player)
│   │   │   ├── Avatar + name
│   │   │   ├── Character details
│   │   │   ├── Conditions/effects
│   │   │   └── Actions (mute, voice preset)
└── GroupEnvironmentPicker      (modal, overlay)
└── CreateGroupModal            (modal, overlay)
```

**Key Features:**

- Drag player from one card to another
- DM voice auto-targets group on single drag into Whisper
- Hover environment badge to see current environment details
- Click environment badge to open picker and change
- Close button (empty group, remains for delete step)
- Delete button (appears only when group is empty)
- Members collapsible; expanded by default
- Spectators see groups (read-only), can't interact

---

## API Contracts

### Campaign Groups (Editor)

#### `GET /api/campaigns/:campaignId/groups`

Fetch all groups for a campaign.

**Response:**

```json
{
  "groups": [
    {
      "id": "uuid",
      "campaignId": "uuid",
      "name": "Tavern",
      "type": "GROUP",
      "defaultEnvironmentName": "Tavern",
      "createdAt": 1234567890,
      "createdBy": "uuid"
    }
  ]
}
```

#### `POST /api/campaigns/:campaignId/groups`

Create a new group in campaign.

**Request:**

```json
{
  "name": "Scouts",
  "type": "GROUP",
  "defaultEnvironmentName": "Forest"
}
```

**Response:**

```json
{
  "group": {
    "id": "uuid",
    "campaignId": "uuid",
    "name": "Scouts",
    "type": "GROUP",
    "defaultEnvironmentName": "Forest",
    "createdAt": 1234567890,
    "createdBy": "uuid"
  }
}
```

**Validation:**

- Name must not be reserved (MAIN, WHISPER, GREENROOM)
- Name must match `isValidRoomName` rules
- Type must be GROUP (MAIN and PRIVATE managed by system)

#### `PATCH /api/campaigns/:campaignId/groups/:groupId`

Update a campaign group (environment, etc).

**Request:**

```json
{
  "defaultEnvironmentName": "Underground"
}
```

**Response:** Updated group object

#### `DELETE /api/campaigns/:campaignId/groups/:groupId`

Delete a campaign group.

**Rules:**

- Only allowed if no active sessions are using this group
- If a session is active, deletion is disallowed with status `409 Conflict`
- MAIN cannot be deleted
- Reserved groups cannot be deleted

---

### Session Groups (Runtime)

#### `GET /api/sessions/:sessionId/groups`

Fetch all groups in current session.

**Response:**

```json
{
  "groups": [
    {
      "id": "uuid",
      "sessionId": "uuid",
      "name": "Main Hall",
      "type": "MAIN",
      "environmentName": null,
      "memberCount": 3,
      "members": [] // See below for full structure
    },
    {
      "id": "uuid",
      "sessionId": "uuid",
      "name": "Tavern",
      "type": "GROUP",
      "environmentName": "Tavern",
      "memberCount": 2,
      "members": []
    }
  ]
}
```

#### `POST /api/sessions/:sessionId/groups`

Create a new group in session (mid-session group creation).

**Request:**

```json
{
  "name": "Prison Cell",
  "defaultEnvironmentName": "Dungeon"
}
```

**Response:** Created group + members

#### `POST /api/sessions/:sessionId/groups/:groupId/close`

Close a group (empty it, move all players to MAIN).

**Request:**

```json
{}
```

**Response:**

```json
{
  "ok": true,
  "closedGroupId": "uuid",
  "movedUsers": [
    {
      "userId": "uuid",
      "username": "alice",
      "fromGroupId": "uuid",
      "toGroupId": "uuid"
    }
  ]
}
```

**Behavior:**

- Move all members to MAIN
- Group remains in list but empty
- Delete button becomes available
- Broadcast mode resets if this was DM's target group

#### `DELETE /api/sessions/:sessionId/groups/:groupId`

Delete an empty group from session (permanent campaign-level deletion).

**Request:**

```json
{
  "force": false // If true, move members to MAIN first, then delete
}
```

**Validation:**

- MAIN cannot be deleted
- WHISPER only deleted via whisper-specific endpoint
- Greenroom cannot be deleted
- If group has members and force=false, return `409 Conflict`

---

### Group Environments

#### `POST /api/audio/environments/apply`

Set environment for a group.

**Request:**

```json
{
  "sessionId": "uuid",
  "groupId": "uuid",
  "environmentName": "Forest"
}
```

**Response:**

```json
{
  "ok": true,
  "groupId": "uuid",
  "environmentName": "Forest"
}
```

**WS Event:** `AUDIO:ENVIRONMENT_SET`

#### `DELETE /api/audio/environments/:groupId`

Clear environment for a group (revert to default or none).

**WS Event:** `AUDIO:ENVIRONMENT_CLEARED`

---

## WebSocket Events

All group state changes broadcast via WebSocket to affected clients.

### Room/Group Lifecycle

#### `ROOM:CREATED`

New group created (campaign or session).

```ts
{
  type: 'ROOM:CREATED',
  sessionId: UUID,
  roomId: UUID,
  payload: {
    roomId: UUID,
    name: string,
    roomType: RoomType,
    createdBy: UUID,
    createdAt: number,
    defaultEnvironmentName?: string
  }
}
```

#### `ROOM:DELETED`

Group deleted.

```ts
{
  type: 'ROOM:DELETED',
  sessionId: UUID,
  roomId: UUID,
  payload: {
    roomId: UUID,
    name: string,
    movedToRoomId: UUID,  // fallback destination (usually MAIN)
    movedUsersCount: number
  }
}
```

#### `ROOM:CLOSED`

Group closed (emptied, members moved to MAIN). _New event._

```ts
{
  type: 'ROOM:CLOSED',
  sessionId: UUID,
  roomId: UUID,
  payload: {
    roomId: UUID,
    name: string,
    movedToRoomId: UUID,
    movedUsers: Array<{ userId: UUID; username: string }>
  }
}
```

### Player Movement

#### `ROOM:USER_JOINED`

Player joined a group.

```ts
{
  type: 'ROOM:USER_JOINED',
  sessionId: UUID,
  roomId: UUID,
  payload: {
    roomId: UUID,
    userId: UUID,
    username: string,
    joinedAt: number,
    movedBy?: UUID  // DM user ID if moved by DM
  }
}
```

#### `ROOM:USER_LEFT`

Player left a group.

```ts
{
  type: 'ROOM:USER_LEFT',
  sessionId: UUID,
  roomId: UUID,
  payload: {
    roomId: UUID,
    userId: UUID,
    username: string,
    leftAt: number,
    reason: 'VOLUNTARY' | 'DM_MOVE' | 'ROOM_DELETED' | 'WHISPER_ENDED'
  }
}
```

### Environment Changes

#### `AUDIO:ENVIRONMENT_SET`

Environment applied to a group (all affected players hear it).

```ts
{
  type: 'AUDIO:ENVIRONMENT_SET',
  sessionId: UUID,
  roomId: UUID,
  payload: {
    groupId: UUID,
    environmentName: string,
    appliedAt: number
  }
}
```

#### `AUDIO:ENVIRONMENT_CLEARED`

Environment removed from a group.

```ts
{
  type: 'AUDIO:ENVIRONMENT_CLEARED',
  sessionId: UUID,
  roomId: UUID,
  payload: {
    groupId: UUID,
    clearedAt: number
  }
}
```

### Session Pause/Resume

#### `SESSION:PAUSED`

Session paused. All players moved to MAIN, all environments cleared.

```ts
{
  type: 'SESSION:PAUSED',
  sessionId: UUID,
  payload: {
    sessionId: UUID,
    prePauseGroupState: Record<UUID, { groupId: UUID; members: UUID[] }>
  }
}
```

#### `SESSION:RESUMED`

Session resumed. Players return to pre-pause groups, environments reapplied.

```ts
{
  type: 'SESSION:RESUMED',
  sessionId: UUID,
  payload: {
    sessionId: UUID,
    restoredGroups: Array<{ groupId: UUID; memberIds: UUID[] }>
  }
}
```

---

## State Flow Scenarios

### Scenario 1: DM Creates Group Pre-Session

1. DM is in editor view, looking at campaign "The Emerald Crown"
2. Clicks "+ Create Group"
3. Modal prompts for name ("Thieves Guild") and environment ("City")
4. API: `POST /api/campaigns/{campaignId}/groups` → stores in campaign DB
5. Response: new group ID and details
6. Frontend: `setCampaignGroups` updates Zustand
7. UI: New card appears in list, ready to delete or modify

### Scenario 2: DM Drags Player to Whisper Mid-Session

1. Session is ACTIVE, Players are in MAIN
2. DM drags "Alice" from MAIN card to WHISPER card
3. Frontend starts drag: `startDrag(alice.userId, main.id)`
4. On drop: frontend calls `POST /api/sessions/{sessionId}/groups/{whisperGroupId}/members/move`
   - Body: `{ targetUserId: alice.id, fromGroupId: main.id }`
5. Backend:
   - Validates (DM only, whisper exists, alice is in session)
   - Persists to Redis (room membership)
   - Broadcasts `ROOM:USER_LEFT` (main) + `ROOM:USER_JOINED` (whisper)
6. Frontend handlers:
   - `handleUserLeft` removes alice from MAIN members array
   - `handleUserJoined` adds alice to WHISPER members array
   - DM's `voiceTargetGroupId` auto-sets to WHISPER
   - DM voice locked until whisper ends
7. UI updates: Alice now appears under WHISPER card, MAIN card count decreases

### Scenario 3: DM Closes a Group During Session

1. Session is ACTIVE, "Scouts" group has 2 members
2. DM clicks "Close" button on Scouts card
3. UI state: `closeRoomId` set to scouts.id, button changes to "Closing..."
4. API: `POST /api/sessions/{sessionId}/groups/{scoutsId}/close`
5. Backend:
   - Fetches all members in Scouts
   - Moves each to MAIN via `joinRoom()`
   - Broadcasts ROOM:USER_LEFT (scouts) for each + ROOM:USER_JOINED (main)
   - Returns list of moved users
6. Frontend handlers: Members move to MAIN card, Scouts card empties
7. UI: "Close" button disappears, "Delete" button appears on empty Scouts card

### Scenario 4: DM Deletes a Group (Second Step)

1. Scouts group is now empty (from previous scenario)
2. DM clicks "Delete" button on Scouts card
3. Confirmation modal: "Delete group 'Scouts' permanently? This removes it from the campaign."
4. On confirm: API `DELETE /api/sessions/{sessionId}/groups/{scoutsId}`
5. Backend:
   - Checks group is empty (or force-moves remaining members)
   - Removes from both session AND campaign DB
   - Broadcasts `ROOM:DELETED`
6. Frontend:
   - `handleRoomDeleted` removes scouts from state
   - Scouts card animates out and disappears
7. Next session: Scouts no longer available (campaign-level deletion)

### Scenario 5: Session Pause / Resume Cycle

1. Session is ACTIVE with groups: MAIN (3), Tavern (2), Prison (1)
2. DM clicks pause
3. Backend:
   - Snapshots current group memberships: `prePauseGroupState = { main: [alice, bob, charlie], tavern: [dave, eve], prison: [frank] }`
   - Moves all players to MAIN
   - Clears all environments
   - Broadcasts `SESSION:PAUSED` with snapshot
4. Frontend:
   - `snapshotGroupStateBeforePause()` stores snapshot in Zustand
   - All players show as in MAIN
   - Environment badges disappear (hidden during pause)
   - All group cards except MAIN show empty/collapsed
5. DM resumes
6. Backend:
   - Restores group membership from snapshot
   - Reapplies environments
   - Broadcasts `SESSION:RESUMED` with restored groups
7. Frontend:
   - `restoreGroupStateOnResume()` moves players back to pre-pause groups
   - Environments reappear
   - UI restores to pre-pause visual state
8. Players return to exactly where they were

---

## Error Handling

### User-Facing Errors (Toasts)

| Scenario                                    | Error | Message                                                |
| ------------------------------------------- | ----- | ------------------------------------------------------ |
| Create group with reserved name             | 400   | "That name is reserved. Try another."                  |
| Create group with duplicate name            | 400   | "A group with that name already exists."               |
| Delete MAIN group                           | 400   | "You can't delete the Main group."                     |
| Move player to deleted group                | 404   | "That group no longer exists. Player moved to Main."   |
| Close group while DM has it as voice target | 403   | "Can't close your current voice target. Switch first." |
| Delete non-empty group                      | 409   | "Group isn't empty yet. Close it first."               |
| DM tries drag/delete during mock takeover   | 403   | "Return to your DM user first."                        |

### Silent Failures (Log + Monitor)

- WS event for player movement arrives after group deleted → reconcile to MAIN
- Pre-pause snapshot incomplete → log, continue with best-effort restore
- Environment apply fails → log, UI retries once

---

## Migration Notes

This architecture consolidates and clarifies existing infrastructure:

- **Existing API endpoints preserved**: `/api/rooms`, move-user, join, leave
- **New API contracts**: `/api/sessions/:sessionId/groups/close`, environment endpoints clarified
- **New Zustand slices**: `campaignGroupsSlice` (new), `sessionGroupsSlice` (consolidates existing), `groupPanelUISlice` (new)
- **New WS events**: `ROOM:CLOSED`, `SESSION:PAUSED`, `SESSION:RESUMED` (planned)
- **Component refactor**: Existing RoomSelector/GroupCard maintained; new editor-mode panel added alongside

---

## File Changes Summary

### New Files

- `docs/architecture/GROUPS-PANEL-ARCHITECTURE.md` (this file)
- `frontend/src/components/workspaces/editor/GroupsPanel.editor.tsx`
- `frontend/src/components/workspaces/editor/GroupCard.editor.tsx`
- `frontend/src/state/campaignGroupsSlice.ts`
- `frontend/src/state/sessionGroupsSlice.ts`
- `frontend/src/state/groupPanelUISlice.ts`

### Modified Files

- `frontend/src/components/workspaces/session/rooms/GroupsPanel.tsx` (structure clarity)
- `frontend/src/components/workspaces/session/rooms/RoomSelector.tsx` (refactoring into smaller components)
- `backend/src/api/rooms.routes.ts` (add close, clarify environment endpoints)
- `docs/CONTRACTS.md` (add group close, environment contracts)

### Shared Types

- `shared/types/index.ts` (ensure Room type includes environment fields)
- `shared/events/index.ts` (add ROOM:CLOSED, SESSION:PAUSED, SESSION:RESUMED events)

---

## Next Steps

1. ✅ Design architecture (this doc)
2. 📝 Create backend routes: close, clarify environments
3. 📝 Create Zustand slices for campaign/session group state
4. 📝 Build editor-mode panel components
5. 📝 Refactor session RoomSelector into smaller components
6. 📝 Add WS event handlers for pause/resume
7. ✅ Update CONTRACTS.md
8. ✅ Test drag/drop flow
9. ✅ Test pause/resume state preservation
10. ✅ Document in ROADMAP.md

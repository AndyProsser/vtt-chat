# Groups Panel Architecture

**Status**: ✅ **DONE** — Implementation complete as of 2026-06-04

---

## Overview

The Groups Panel is the DM's interface for managing voice rooms across the campaign lifecycle:

- **Editor Mode** (greenroom / pre-session): Create groups, set default environments, delete unused groups. No player list shown — players only join in-session.
- **Session Mode** (ACTIVE / PAUSED): Drag players between groups, apply environments, close and delete groups, access per-player audio adjustments.
- **Spectator Mode**: Groups and member lists are visible (read-only). DM controls are hidden.

The panel bridges two distinct workflows: **campaign-level setup** (persistent group structure) and **session-level runtime** (player assignment, audio effects, temporary state).

---

## Terminology

| Term            | Meaning                                                                                |
| --------------- | -------------------------------------------------------------------------------------- |
| **Group**       | User-facing term for a voice room where the DM splits the party                        |
| **Room**        | Backend/internal term (interchangeable with Group in code)                             |
| **MAIN**        | Default group — required, reserved, cannot be deleted or renamed                       |
| **WHISPER**     | System-managed private group — created on session start, deleted at end; reserved name |
| **GREENROOM**   | Session staging area — reserved name, hidden during ACTIVE/PAUSED/COOLDOWN             |
| **Environment** | Audio ambiance set on a group (e.g. Tavern, Forest, Cave, Underwater, Default)         |

### Reserved Group Names

The frontend blocks creation of groups with these names (case-insensitive):

- `MAIN`
- `WHISPER`
- `GREENROOM`

Backend enforces the same restriction at the API layer.

---

## Persistence Scope

| Data                                         | Scope                                   | On Session END                               |
| -------------------------------------------- | --------------------------------------- | -------------------------------------------- |
| GROUP rooms                                  | Campaign-scoped (Postgres `Room` table) | Persist — available next session             |
| PRIVATE (Whisper) room                       | Session-scoped                          | Deleted on COOLDOWN/ENDED                    |
| Room environment settings                    | Campaign-scoped via Redis + Postgres    | Persist                                      |
| Player room assignment                       | Session-scoped (Redis presence)         | Cleared — users moved to greenroom           |
| Pre-pause group snapshot (`previousGroupId`) | Session-scoped presence field           | Cleared on resume; overwritten on next pause |

Campaign groups persist across all session boundaries. The DM pre-creates groups in editor mode and they are carried forward automatically by `restoreCampaignRoomsForSession` when a new session starts.

---

## Session Pause / Resume Group Behaviour

On **PAUSE**:

1. `applySessionStateRoomTransition` fires with `nextState = PAUSED`.
2. Every user is moved to MAIN (the staging room for paused sessions).
3. Each user's current group at pause time is written to presence as `previousGroupId` via `resolvePausePreviousGroupId`.
4. Group environments are **preserved** in Redis — they are not cleared. The pause is a temporary staging event, not a cleanup event.

On **RESUME** (PAUSED → ACTIVE):

1. `applySessionStateRoomTransition` fires with `previousState = PAUSED`, `nextState = ACTIVE`.
2. `isResumeFromPause = true` triggers per-user restore: each user whose `previousGroupId` still exists is placed back in that group.
3. Users whose snapshot group was deleted fall back to MAIN.
4. Environments remain in place — no reapplication step needed.

> **Design note (W4-Conversation-Authority):** Environments are intentionally preserved across PAUSED ↔ ACTIVE transitions. Clearing and reapplying added latency for no user benefit; preserving them means resume is invisible to players in terms of audio continuity.

---

## Component Architecture

### Editor Mode

```text
apps/frontend/src/components/workspaces/shared/panels/GroupsPanel/
  GroupsPanel.tsx                 # Editor groups panel (campaign-level)
  CreateGroupModal.tsx            # Group creation with environment picker
```

Features: load/create/delete campaign groups; set default environment per group; no player list.

### Session Mode (Left Rail — Voice Groups)

```text
apps/apps/frontend/src/components/workspaces/session/rooms/
  GroupsPanel.tsx                 # Re-export (points to RoomSelector)
  RoomSelector.tsx                # Main orchestrator — all DM group management
  RoomGroupCard.tsx               # Individual group card (exported as GroupCard)
  GroupCard.tsx                   # Thin re-export of RoomGroupCard
  GroupMemberList.tsx             # Member list per group with drag + context menu
  GroupMemberProfileCard.tsx      # Profile hover card
  GroupMemberSharedProfileHoverCard.tsx
  GroupsHeaderActions.tsx         # Broadcast toggle + create button
  AvatarOverlay.tsx               # Leaf-isolated speaking/presence indicators
  SpeakingIndicator.tsx           # Leaf component (subscribes to single selector)
  PresenceIndicator.tsx           # Leaf component
  GhostIndicator.tsx              # Leaf component
  MicMutedIndicator.tsx           # Leaf component
  RadialMenu.tsx                  # Touch-optimised radial for mobile DM controls
  context-menu/
    PlayerContextMenu.tsx         # Right-click context menu wrapper
    PlayerContextMenuContent.tsx  # Menu items: mute, effects, audio adjust
```

**Component hierarchy (session mode):**

```text
RoomSelector
├── GroupsHeaderActions         (broadcast toggle, create group button)
├── RoomGroupCard[]             (one per visible group)
│   ├── Environment badge       (click to open picker)
│   ├── Environment picker      (inline popover)
│   ├── Group actions           (close / delete buttons)
│   └── GroupMemberList
│       └── GroupMemberItem[]
│           ├── AvatarOverlay   (mounts leaf indicators)
│           └── PlayerContextMenu (right-click)
│               └── PlayerContextMenuContent
│                   ├── Mute / Unmute
│                   ├── Clear Effects
│                   ├── Distance submenu
│                   ├── Condition submenu
│                   └── Adjust Audio submenu  ← GAIN + FILTER overrides
└── WhisperRoom card            (pinned at footer)
```

### Session Mode (Right Rail — Groups Overview)

```text
apps/frontend/src/components/workspaces/session/
  GroupsPanel.session.tsx         # Right-rail runtime groups overview (DM + spectators)
  GroupCard.session.tsx           # Compact card with member list, environment, close/delete
```

The right-rail overview is a secondary summary. The left-rail `RoomSelector` owns all mutation actions.

---

## State Management (Zustand)

### `campaignGroupsSlice`

Stores campaign-level group definitions. Loaded from `GET /api/campaigns/:campaignId/groups`. Persists across sessions.

### `sessionGroupsSlice` / rooms slice

Runtime group-membership state. Loaded from `GET /api/rooms/session/:sessionId`. Cleared on teardown (ENDED/IDLE). Updated via WS events `ROOM:USER_JOINED`, `ROOM:USER_LEFT`, `ROOM:CREATED`, `ROOM:DELETED`.

### `groupPanelUISlice`

Environment picker target, selected room, drag context.

### `audioOverridesSlice`

DM override state per user (`MUTE`, `GAIN`, `GATE`, `FILTER`, `DISTANCE`, `CONDITION`). Updated via `AUDIO:DM_OVERRIDE_APPLIED` and `AUDIO:DM_OVERRIDE_REMOVED` WS events.

---

## API Contracts

### Campaign Groups (Persistent, Editor + Session)

| Method   | Path                                         | Description                                                     |
| -------- | -------------------------------------------- | --------------------------------------------------------------- |
| `GET`    | `/api/campaigns/:campaignId/groups`          | List campaign groups                                            |
| `POST`   | `/api/campaigns/:campaignId/groups`          | Create group (`name`, `type: GROUP`, `defaultEnvironmentName?`) |
| `PATCH`  | `/api/campaigns/:campaignId/groups/:groupId` | Update default environment                                      |
| `DELETE` | `/api/campaigns/:campaignId/groups/:groupId` | Delete group (campaign-permanent)                               |

### Session Rooms (Runtime)

| Method   | Path                              | Description                                             |
| -------- | --------------------------------- | ------------------------------------------------------- |
| `GET`    | `/api/rooms/session/:sessionId`   | List rooms in session                                   |
| `POST`   | `/api/rooms/session/:sessionId`   | Create room mid-session                                 |
| `POST`   | `/api/rooms/:roomId/members/move` | Move a user to this room                                |
| `POST`   | `/api/rooms/:roomId/close`        | Close room — move all members to MAIN, room stays empty |
| `POST`   | `/api/rooms/:roomId/end-whisper`  | End whisper — restores all members to previous rooms    |
| `DELETE` | `/api/rooms/:roomId`              | Delete room (permanent campaign deletion)               |

### Audio

| Method | Path                             | Description                    |
| ------ | -------------------------------- | ------------------------------ |
| `POST` | `/api/audio/environments/apply`  | Set environment for a group    |
| `POST` | `/api/audio/overrides/dm/apply`  | Apply DM override to a user    |
| `POST` | `/api/audio/overrides/dm/remove` | Remove DM override from a user |

---

## DM Audio Override (Adjust Audio)

The DM can remotely adjust a player's local audio settings via the player context menu → **Adjust Audio** submenu.

**Purpose:** Removes the "Hey Jo, can you boost your mic gain?" round-trip. The DM makes the adjustment directly.

**Available adjustments:**

| Option               | Override type   | Parameters                |
| -------------------- | --------------- | ------------------------- |
| Boost Mic            | `GAIN`          | `{ factor: 1.5 }`         |
| Normal Mic           | `GAIN` remove   | `null` (removes override) |
| Lower Mic            | `GAIN`          | `{ factor: 0.5 }`         |
| Enable Noise Filter  | `FILTER`        | `{ enabled: true }`       |
| Disable Noise Filter | `FILTER` remove | `null` (removes override) |

**Rules:**

- DM **cannot** unmute a player who muted themselves. `AUDIO:MUTE_STATE_CHANGED` (self-mute) and `AUDIO:DM_OVERRIDE_APPLIED(MUTE)` are independent state tracks. Removing a DM MUTE override does not clear the player's own mute. The combined `useIsUserMuted` hook returns `true` if either is set.
- Players can always adjust their own settings back. DM overrides are hints, not locks.
- DM cannot change a player's input device selection.

**WS events:** `AUDIO:DM_OVERRIDE_APPLIED` and `AUDIO:DM_OVERRIDE_REMOVED` are broadcast to all session members.

---

## WebSocket Events (Group-Relevant Subset)

| Event                             | When                             | Key payload fields                                        |
| --------------------------------- | -------------------------------- | --------------------------------------------------------- |
| `ROOM:CREATED`                    | New group created                | `roomId, name, roomType, createdBy, createdAt`            |
| `ROOM:DELETED`                    | Group deleted                    | `roomId, name, movedToRoomId, movedUsersCount`            |
| `ROOM:USER_JOINED`                | Player moved into room           | `roomId, userId, username, joinedAt, movedBy?`            |
| `ROOM:USER_LEFT`                  | Player moved out of room         | `roomId, userId, username, leftAt`                        |
| `ROOM:SESSION_TRANSITION_APPLIED` | Session state change moved users | per-user room assignments                                 |
| `AUDIO:ENVIRONMENT_SET`           | Environment applied to group     | `environmentId, environmentName, roomId, setBy, setAt`    |
| `AUDIO:DM_OVERRIDE_APPLIED`       | DM applied override to user      | `targetUserId, dmId, overrideType, parameters, appliedAt` |
| `AUDIO:DM_OVERRIDE_REMOVED`       | DM removed override from user    | `targetUserId, dmId, overrideType, removedAt`             |
| `SESSION:PAUSED`                  | Session paused                   | triggers room transition — users go to MAIN               |
| `SESSION:RESUMED`                 | Session resumed                  | triggers room restore — users return to `previousGroupId` |

---

## State Flow Scenarios

### DM Drags Player to Whisper

1. DM drags player avatar from any group card onto the WHISPER card.
2. `optimisticMoveMember` fires: removes from source group, adds to whisper locally.
3. API call: `POST /api/rooms/:whisperRoomId/members/move`.
4. Backend persists to Redis, broadcasts `ROOM:USER_LEFT` + `ROOM:USER_JOINED`.
5. DM voice target auto-sets to WHISPER (`setDmVoiceTarget(whisperRoomId)`); broadcast mode locks off.
6. Ending whisper: `POST /api/rooms/:whisperRoomId/end-whisper` restores all members to their prior rooms.

### DM Closes a Group

1. DM clicks Close on a non-empty group card.
2. `POST /api/rooms/:groupId/close`.
3. Backend moves all members to MAIN, broadcasts `ROOM:USER_LEFT` (group) + `ROOM:USER_JOINED` (MAIN) per user.
4. Group card empties; Delete button becomes available.

### DM Deletes an Empty Group

1. DM clicks Delete on an empty group card.
2. `DELETE /api/rooms/:groupId`.
3. Backend removes group from Postgres (permanent campaign-level deletion), broadcasts `ROOM:DELETED`.
4. Frontend removes the card. Next session: group is gone.

### DM Adjusts Player Audio

1. DM right-clicks a player in any group card.
2. Context menu → Adjust Audio → Boost Mic.
3. `POST /api/audio/overrides/dm/apply` with `{ overrideType: 'GAIN', parameters: { factor: 1.5 } }`.
4. Backend writes to Redis, broadcasts `AUDIO:DM_OVERRIDE_APPLIED`.
5. Target player's client receives the event and applies the gain to their audio pipeline.
6. DM can reset with Normal Mic → `POST /api/audio/overrides/dm/remove` with `overrideType: 'GAIN'`.

# Stage 0: Contract Lock

**Status**: ✅ **LOCKED** — Foundational contracts frozen. Ready for Stage 1.

**Date Locked**: April 17, 2026

---

## Overview

Stage 0 defines and freezes all event contracts, permission rules, and error models that will guide Stages 1–8. This is the **canonical reference** for:

1. **Event types and payloads** — What can happen in a session
2. **Permission matrix** — Who can do what
3. **Error codes** — How failures are communicated
4. **Validators** — Input validation rules (deterministic, side-effect-free)

All subsequent work must conform to these contracts. No breaking changes without explicit re-lock.

### Compatibility Scope

This document is the implementation contract for Stage 0 and currently matches `/shared`.
Some subsystem and UI docs include richer product terminology that is planned or conceptual.
Where names differ, treat this file as canonical for current runtime behavior.

Runtime persistence and audit addendum:

- Redis-first runtime state and session audit requirements are defined in [architecture/RUNTIME-STATE-AND-AUDIT-CONTRACT.md](architecture/RUNTIME-STATE-AND-AUDIT-CONTRACT.md).
- Use this addendum when designing websocket-visible mutation flows that need explicit Redis + Postgres + audit responsibilities.

### Greenroom Chat Paging Contract

- `GET /api/chat/campaign/:campaignId/chat/page` accepts `todayOnly=1` to bound the initial greenroom timeline to messages created on the current local day.
- When `todayOnly=1` is used on the first page, the response may include `hasEarlier: boolean` to indicate that older pre-today campaign chat exists and should remain available for intentional upward history reveal.
- Frontend greenroom bootstraps must treat `todayOnly=1` + `hasEarlier` as a viewport contract only: older messages stay fetchable via subsequent `before=<timestamp>` paging and are not deleted or reclassified.

### Room Presence Safety Contract

Players must never be left without a valid room assignment.

- If a destination room is missing, deleted, or invalid during move operations, backend must fail back to `MAIN`.
- If Whisper/private restoration target is unavailable, backend must fail back to `MAIN`.
- If any presence record is detected with no valid `primaryRoomId`, reconciliation must move that user to `MAIN`.
- Group deletion must migrate all remaining members to `MAIN` before final delete completes.

### Campaign Conversation Authority Contract

Conversation authority is campaign-scoped. Session state is policy- and routing-scoped.

- Campaign membership (`CampaignMembership`) is the authoritative gate for whether a user can participate in campaign conversation surfaces (voice eligibility, chat eligibility, handout visibility), subject to role policy.
- Session membership determines runtime placement (`primaryRoomId`, private-room projection) and lifecycle policy application, but does not by itself grant campaign conversation authority.
- A session transition may move users between rooms, but must not be treated as a transport/audio identity reset.
- If a user is not campaign-authorized, session room assignment cannot elevate them into conversation channels.

Required enforcement order for conversational actions:

1. Validate campaign membership + role policy.
2. Validate session lifecycle policy (state gates, spectator windows, recording rules).
3. Apply room routing / delivery scope.
4. Persist + broadcast.

Examples:

- User is in the room but not campaign-authorized: reject chat/voice participation (`403 FORBIDDEN`).
- User is campaign-authorized but session is paused with policy denying runtime speech: transport may remain connected, but speaking delivery remains policy-muted.
- Session state changes (`ACTIVE` → `PAUSED` → `COOLDOWN`) remap policy/routing only; they do not imply identity teardown of conversation participants.

### Session Room Assignment Contract

Session state controls where users are assigned, not who is campaign-authorized to converse.

- Session transitions may remap `primaryRoomId` according to lifecycle rules (for example, move to `MAIN`, greenroom, or private whisper handling).
- `PAUSED` is a temporary staging state: when a pause moves users to `MAIN`, backend must preserve each participant's last valid non-greenroom room (`previousGroupId`), including the room remembered before Whisper.
- Resume from `PAUSED` must restore each participant to that preserved room when it still exists; if the stored room is missing or invalid, fail back to `MAIN`.
- Room reassignment must preserve participant identity continuity for transport/presence reconciliation.
- Room reassignment events (`ROOM:SESSION_TRANSITION_APPLIED`, `ROOM:USER_JOINED`, `ROOM:USER_LEFT`) are topology/routing contracts and must not encode campaign authorization decisions.
- `ROOM:SESSION_TRANSITION_APPLIED` may carry per-user `roomId` targets when a bulk transition restores different users to different rooms; clients must apply those per-user targets instead of assuming one shared destination.
- Campaign authorization decisions remain upstream and explicit in API validation and permission checks.

### Audio Runtime Persistence and Session Policy Contract

Audio transport continuity should be decoupled from session lifecycle boundaries.

- Audio runtime identity is campaign-scoped (or campaign-participant scoped) and may survive session state transitions.
- Session lifecycle controls policy overlays: recording windows, spectator interaction windows, DM override applicability, and room-based mix/routing targets.
- Whisper/private and spectator privacy constraints remain hard policy boundaries regardless of transport continuity.
- Recording bookends remain session-authoritative (`[Session Started]`, `[Session Paused]`, `[Session Resumed]`, `[Session Ended]`) even when transport/audio state remains continuous.

### Audio Broadcast Terminology (Canonical + Legacy Aliases)

Canonical runtime naming for DM session-wide narration is **broadcast**.

- REST endpoint (canonical): `POST /api/audio/broadcast`
- REST endpoint (legacy alias): `POST /api/audio/voice-of-god`
- Response field (canonical): `broadcast`
- Response field (legacy alias): `voiceOfGod`
- WebSocket event (canonical): `AUDIO:BROADCAST_STATE_CHANGED`
- WebSocket event (legacy alias): `AUDIO:VOICE_OF_GOD_CHANGED`
- LiveKit token channel (canonical): `broadcast`
- LiveKit token channel (legacy alias): `voice_of_god`

Compatibility policy:

- New integrations should use canonical broadcast names.
- Legacy aliases remain accepted during migration to avoid breaking existing clients.

### Rightbar Surface Contract (Roadmap W0-Rightbar)

Canonical rightbar toolbar order is fixed as:

- `INFO`
- `PARTY`
- `ROOMS`
- `NOTES`
- `JOURNAL`
- `HISTORY`
- `SETTINGS`

Visibility and editability contract:

- `INFO`: readable by all personas; DM-edit for campaign metadata (name/description/poster).
- `PARTY`: readable by all personas; must include all campaign players even when disconnected or not currently in-session.
- `PARTY`: spectators see the same row-level character detail fields as players (including stats and active conditions).
- `ROOMS`: DM-only; hidden (not disabled) for non-DM personas.
- `NOTES`: readable by all personas; DM edit controls.
- `NOTES`: current rightbar handouts contain name, markdown content, and hashtags, and the panel search must cover name + content + hashtags.
- `NOTES`: structured image attachment fields are not yet implemented in the current runtime contract and remain pending roadmap work.
- `NOTES`: DM may share a note to one or more players, and may post a note card to a selected group chat; posting auto-shares to all players in that group.
- `JOURNAL`: readable by all personas, DM edit controls only, reverse-chronological by session, exactly one markdown entry per session with hashtag list.
- `HISTORY`: readable by all personas, grouped by session boundaries, and excludes current-session messages.
- `SETTINGS`: role-routed surface; DM opens campaign/session settings, player opens own character settings, spectator does not see rightbar `SETTINGS`.
- `SETTINGS` character fields for race/class use D&D 5.5e SRD as the default autocomplete source, allow free-text override, and support admin-configured pluggable source providers.
- `SETTINGS` DM campaign/session forms expose only safe editable fields in rightbar; sync-complex fields stay in dedicated management surfaces.

Party presence status contract:

- PARTY rows use canonical campaign-context labels: `HERE`, `AWAY`, `LOBBY`, `NOT HERE`, `OFFLINE`.
- `HERE` means runtime-connected in the same campaign session.
- `AWAY` maps to runtime presence `IDLE` only while the selected runtime session is live (`ACTIVE`/`PAUSED`/`COOLDOWN`).
- `LOBBY` means connected to platform transport but not runtime-bound.
- `NOT HERE` means runtime-connected in another campaign context.
- `OFFLINE` means no active runtime/lobby transport presence detected.

Authoritative PARTY snapshot API:

- Endpoint: `GET /api/campaigns/:campaignId/party-presence`
- Access: campaign members only.
- Response:
  - `campaignId: UUID`
  - `sessionId: UUID | null` (latest runtime session for status projection)
  - `snapshotAt: number` (epoch ms)
  - `members: Array<{ userId, username, role, playerName, avatarUrl, characterName, characterClass, characterRace, level, characterStats, status, runtimePresenceState, lastSeenAt, currentRuntimeSessionId, manualAway }>`
- Source-of-truth order: campaign membership + active character profile + runtime presence projection + websocket connection snapshot.
- Reconnect/rehydrate: frontend must treat this endpoint as authoritative snapshot after reconnect or suspected WS gap.

PARTY refresh signal event:

- WebSocket event: `CAMPAIGN:PARTY_PRESENCE_UPDATED`
- Scope: campaign members only.
- Purpose: trigger immediate PARTY panel snapshot refetch so presence chips update without waiting for poll cadence.
- Payload: `{ campaignId, sessionId, reason, changedAt }`
- This event is a refresh signal; client still hydrates authoritative row content via `GET /api/campaigns/:campaignId/party-presence`.

Away control contract:

- Manual away toggle uses existing endpoint `PUT /api/presence/:sessionId/state` with `state: IDLE` to set away and `state: ONLINE` to clear.
- Lightweight client inactivity timer may auto-apply away by setting `state: IDLE` after threshold inactivity while runtime-connected.
- Any user activity may clear auto-away by setting `state: ONLINE` unless manual-away lock is still active.

Offline workspace settings parity contract:

- In offline campaign workspace mode, the same role-routed settings contract applies to the `SETTINGS` tab.
- DM sees campaign settings controls inline (profile, poster, invites, visibility/spectator/policy toggles).
- Player sees character settings inline.
- Spectator sees a read-only non-edit notice.

Platform status metric contract:

- `GET /api/platform/status` includes `peakConcurrentUsers24h` as a number representing the highest concurrent connected users observed in the previous 24 hours.
- This value is computed from persisted telemetry connection state events and is authoritative for lobby peak display.
- `GET /api/platform/status` also includes `lobbyStats`, computed via `getLobbyStatsSnapshot(platformStatus)`, containing the current campaign/session lobby aggregate counters used by pre-join UI surfaces.

Party-to-settings navigation contract:

- Player selecting `Edit` from `PARTY` must switch active panel to `SETTINGS` with character section active.
- The first editable character field must receive focus after the transition.
- Character settings use D&D 5.5e SRD race/class suggestions by default via autocomplete, but must still allow free-text overrides.
- Character avatar editing uses an upload-first flow with circular preview and client-side zoom/crop before save; the resulting avatar remains a standard `avatarUrl` payload value.

### Connection Status Naming (Roadmap Alignment)

Roadmap-aligned implementation naming for cross-surface status indicators:

- `coreWsState`: `CONNECTED | CONNECTING | ERROR`
- `livekitState`: `CONNECTED | CONNECTING | ERROR | NOT_APPLICABLE`
- `statusContext`: `OUTSIDE_CAMPAIGN | INSIDE_CAMPAIGN`
- `statusIconState`: `OK | OK_PARTIAL | CONNECTING | DEGRADED_AUDIO | ERROR`
- `statusColorKey`: `GREEN | PALE_GREEN | YELLOW | ORANGE | RED`

Placement boundary:

- Shared enum/type contracts should live in `shared/`.
- Admin keeps admin-specific presentation constants local, mapped to the same shared enums.

### WebSocket Session Binding

- Frontend WebSocket auth must include the active `sessionId` alongside the JWT token when a session is loaded.
- Backend session broadcasts only fan out to sockets whose authenticated connection state is bound to the matching session id.
- A socket can authenticate successfully without being eligible for session broadcasts if it is not session-bound.

Multi-device addendum (May 2026):

- Frontend WebSocket auth must include `deviceSessionId` and inferred `deviceClass` (`DESKTOP`, `MOBILE`, `TABLET`).
- Backend WS connect acknowledgement includes `deviceSessionId` and `deviceClass` for client-side reconciliation.
- `deviceSessionId` is transport-scoped identity used for device transfer/arbitration; it does not create additional visible participant entities.

### Presence Profile Updates

- `PRESENCE:PROFILE_UPDATED` is the session-scoped event for character sheet / player card metadata changes while the user remains in-session.
- The payload carries the latest profile fields needed to refresh live room cards in place: player name, avatar, character name, class, subclass, race, level, and character stats.
- New profile data should be broadcast after persistence succeeds and before the acting user relies on a refresh to see the change.

Presence hydration addendum:

- `GET /api/presence/:sessionId` may include `deviceSessions` on each presence entry.
- `deviceSessions` is derived from active authenticated WS connections and carries `deviceSessionId`, `deviceClass`, inferred label, connected time, and active/muted flags.
- Player/DM avatar poppers render device rows only when more than one device is currently connected for that user.

### Presence API Runtime Contract (Backend Source-Of-Truth)

Implemented in `backend/src/api/presence.routes.ts`.

- `GET /api/presence/:sessionId`
  - Auth: bearer token required.
  - Validation: invalid `sessionId` returns `400 INVALID_INPUT`.
  - Access: allowed for session DM or current session members.
  - Forbidden: non-members return `403 FORBIDDEN`.
  - Not found: missing session returns `404 NOT_FOUND`.
  - Side effects:
    - Triggers mock-simulation bootstrap (`ensureMockSimulationRunning`).
    - Reads session stats snapshot (`getSessionStatsSnapshot`).
    - Reads active takeover identity snapshot (`getMockTakeoverSnapshot`).
  - Response shape:
    - `presence`: filtered to users currently in session membership.
    - Per entry includes role projection, optional profile fields, and `deviceSessions` when WS manager snapshot is available.
    - `stats`: session connected counters.
    - `identity`: takeover projection for the requesting user.

- `PUT /api/presence/:sessionId/state`
  - Auth: bearer token required.
  - Validation:
    - Invalid `sessionId`, `state`, `roomId`, `privateRoomId`, `previousGroupId`, or non-boolean `ghostMode` returns `400 INVALID_INPUT`.
    - `roomId` and `privateRoomId` may be `null`.
  - Access: allowed for session DM or current session members.
  - Not found:
    - Missing session returns `404 NOT_FOUND`.
    - Non-existent `roomId` returns `404 NOT_FOUND`.
  - Behavior:
    - If `roomId` is provided, joins that room first.
    - Updates presence with state + ghost/group/private-room projection fields.
    - Appends `PRESENCE.STATE_CHANGED` audit event with previous/new state metadata.
    - If WS manager exists: broadcasts `PRESENCE:STATE_CHANGED` and conditionally `PRESENCE:USER_GHOST_MODE_CHANGED` when ghost flag flips.
    - If campaign broadcaster is ready: emits `CAMPAIGN:PARTY_PRESENCE_UPDATED` with reason `PRESENCE_STATE_CHANGED`.
  - Response shape: `{ presence: <updatedPresenceEntity> }`.

- `POST /api/presence/:sessionId/recover`
  - Auth: bearer token required.
  - Validation: invalid `sessionId` returns `400 INVALID_INPUT`.
  - Access: allowed for session DM or current session members.
  - Behavior:
    - Executes `ensurePresenceRecoveredFromSnapshots`.
    - Persists snapshot count via `snapshotSessionPresence`.
    - Appends `PRESENCE.RECOVERY_TRIGGERED` audit event.
  - Response shape:
    - `recoveredFromSnapshots: boolean`
    - `snapshotCount: number`
    - `presence: PresenceEntity[]`

### WS Disconnect/Reconnect Sequencing Contract (Backend Source-Of-Truth)

Implemented in `backend/src/ws/index.ts` and `backend/src/services/session/disconnect-cascade.service.ts`.

- Multi-tab gating:
  - Disconnect cascade starts only when the user has no remaining active socket in that session.
  - If another tab/device remains active for the same user+session, disconnect cascade is skipped.

- On WS authenticate (session-bound):
  - Connection registers in-memory with `sessionId` binding.
  - `handleUserConnected(sessionId, userId)` cancels pending ghost/ttl/everyone-leaves timers.
  - Presence recovery path marks user `ONLINE` and may emit campaign presence invalidation when transitioning from non-online.
  - Device snapshot event `SESSION:DEVICE_SESSION_CONNECTED` is broadcast with full `deviceSessions` payload for reconciliation.

- On WS disconnection:
  - Socket connection is removed from active map.
  - Device snapshot event `SESSION:DEVICE_SESSION_DISCONNECTED` is broadcast with full `deviceSessions` payload.
  - If no remaining active user connection exists in-session, backend triggers disconnect cascade:
    - Immediate presence update to `OFFLINE` with `ghost=false` + `PRESENCE:STATE_CHANGED` broadcast.
    - If previously ghosted, emits `PRESENCE:USER_GHOST_MODE_CHANGED` with `ghostMode=false`.
    - Starts ghost-entry timer (`5s`).
    - If still disconnected at 5s, sets `ghost=true` and emits `PRESENCE:USER_GHOST_MODE_CHANGED`.
    - Starts presence TTL timer (`60s`).
    - If still disconnected at TTL expiry, removes presence projection and emits `ROOM:USER_LEFT` with `reason: DISCONNECT`.

- Everyone-leaves session behavior:
  - When no active connections remain in a session in `ACTIVE` or `PAUSED`, backend starts `everyoneLeavesAutoStop` timer (`60s`).
  - If still empty at expiry, backend transitions session to `COOLDOWN` and applies transition orchestration.
  - For non-`ACTIVE`/`PAUSED` states (for example `IDLE`/`ENDED`), immediate cleanup transition is not forced by disconnect cascade.

---

## Location

All contracts are in `/shared/` (monorepo root):

```text
shared/
  index.ts                    # Main export
  package.json               # Private package for shared types
  types/index.ts             # Core domain types (Role, Session, Room, User, etc.)
  events/
    base.ts                  # EventEnvelope schema + validation rules
    chat.ts                  # Chat system events (IC, OOC, whisper, DM, typing)
    session.ts               # Session lifecycle events (IDLE→ACTIVE→PAUSED→ENDED)
    room.ts                  # Room management + presence events
    audio.ts                 # Audio effects + DM overrides + notes
    index.ts                 # Event type union export
  permissions/index.ts       # Permission matrix (68 rules) + helpers
  errors/index.ts            # Error codes (50+) + catalog + factory
  validators/index.ts        # Input/event validators (pure functions)
```

---

## 1. Core Types

**File**: `types/index.ts`

### Roles

```typescript
Role.DM // Full authority: create/delete/override
Role.PLAYER // Agency + privacy: act in session, private notes
Role.SPECTATOR // Read-only: observe, no actions
Role.SYSTEM // Autonomous events (not user-triggered)
```

Role scoping:

- `DM`, `PLAYER`, and `SPECTATOR` are campaign-scoped roles — they exist only within the context of a specific `CampaignMembership`.
- Outside any campaign membership context, an authenticated user's identity is simply `User`.
- There is no global DM or global SPECTATOR identity; a user may be DM in one campaign and Player in another.

Compatibility note: `ASSISTANT_DM` appears in some product-level docs as a delegated authority persona.
Until a contract re-lock, runtime authorization still resolves to the locked roles above.

### Session States

```typescript
SessionState.IDLE // Not yet started; greenroom mode
SessionState.ACTIVE // Players can join and act; session running
SessionState.PAUSED // DM control; state frozen, off-the-record runtime
SessionState.COOLDOWN // Post-session cooldown window before final end
SessionState.ENDED // Session stopped; cooldown/archive lock active; this session can never be restarted
SessionState.CLEANUP // Post-session terminal archive state; no users connected; background cleanup job purges greenroom chat
```

GREENROOM is a calculated runtime state, not an enum member:

- `isGreenroomSessionState(state) := state !== SessionState.ACTIVE && state !== SessionState.PAUSED`
- This evaluates true for `IDLE`, `COOLDOWN`, `ENDED`, and `CLEANUP`.

**State transitions and authority:**

- `IDLE` → `ACTIVE`: DM explicit action (start session) for a never-started draft session only
- `ACTIVE` → `PAUSED`: DM explicit action OR automatic on DM disconnect
- `ACTIVE` → `COOLDOWN`: DM explicit action (end session)
- `PAUSED` → `ACTIVE`: DM explicit action (resume session)
- `PAUSED` → `COOLDOWN`: DM explicit action (end session from paused state)
- `COOLDOWN` → `ENDED`: Automatic when cooldown timer expires (default 60 seconds, configurable per campaign, range 1-60 minutes)
- `ENDED` → `CLEANUP`: Automatic after all players and DM disconnect and remain away for 60 seconds (spectators do not block this; background scheduled job detects and transitions)

Archive lock rules:

- A session that has ever transitioned to `ENDED` is archive-locked and can never be restarted.
- Starting after an ended session must create a new session record.
- Only a session that is currently `IDLE` and has never started is eligible to be activated.
- Once a session reaches `ENDED`, it remains in that state until all participants disconnect, triggering automatic transition to `CLEANUP`.

**Multi-session campaigns:**

- Every new session starts with a clean session-scoped chat timeline (no prior session chat).
- Campaign Greenroom chat persists across session boundaries at the campaign level and is always separate from session-scoped chat.
- On `IDLE` → `ACTIVE`: session-scoped chat starts clean, but campaign Greenroom remains visible as a persistent context.
- New IDLE sessions are created on the next DM or PLAYER reconnect to a campaign whose latest runtime sessions are all in `CLEANUP`.
- Cleanup job runs once per campaign after all users disconnect from an ENDED session, purges ephemeral session-scoped data (Whisper, Paused runtime, Cooldown runtime), and archives the session record.
- Chat hydration supports lazy paging for late-join and long timelines: `limit` (default `20`, max `100`) and `before` (unix ms cursor). Response includes `pagination.hasMore` and `pagination.nextBefore` so clients can continuously load older messages while scrolling.

**Cooldown state:**

- Enters automatically when DM ends the session (ACTIVE or PAUSED → COOLDOWN).
- All players remain in the MAIN room.
- A `[Session Ended]` bookend is inserted into session chat.
- OOC-only chat is allowed; IC chat is disabled.
- Players can view full session chat history.
- Spectators are elevated to post-session interaction mode only when campaign post-session chat is enabled.
- During `ACTIVE`, spectators are observe-only and cannot send chat.
- During non-cooldown states, spectators cannot send session chat.
- All cooldown chat is ephemeral by default (cleared during cleanup), but DM can toggle persistence per campaign.
- DM audio effects are frozen; no new effects, conditions, or environment changes allowed.
- DM cannot create, delete, or move groups during cooldown.
- Default cooldown duration is 1 minute; configurable per campaign in range 1-60 minutes.
- DM can extend cooldown (up to 3 times) to add more time, or dismiss early.
- When cooldown timer expires, session auto-transitions to ENDED.

**Post-session:**

- ENDED is the archive-locked terminal state for that session record (session can never be restarted).
- The session remains in ENDED until all players and DM disconnect.
- Once all DM/player table members disconnect, a 60 second buffer starts. If none reconnect during that buffer, the session transitions to CLEANUP automatically. Spectator presence does not block cleanup.
- The next time a DM or player reconnects to the campaign, a new IDLE session is created.

### Other Enums

- `RoomType`: MAIN, GROUP, PRIVATE
- `NoteVisibility`: DM_ONLY, PLAYERS_VISIBLE, CUSTOM
- `MessageType`: IC, OOC, WHISPER, DM, SYSTEM
- `PresenceState`: ONLINE, TYPING, SPEAKING, IDLE, OFFLINE
- `DeviceClass`: DESKTOP, MOBILE, TABLET

Compatibility note:

- Product docs may refer to `GREEN_ROOM` as a presence/location state rather than a `RoomType` enum value.
- Product docs may use `PARTY`/`INDIVIDUALS`/`GLOBAL` as note-visibility language; Stage 0 uses `PLAYERS_VISIBLE`/`CUSTOM`.
- Product docs may use broader chat taxonomies (for example `METAGAME`); Stage 0 chat contracts currently lock to the four values above.

### Domain Objects

```typescript
User // id, username, role, createdAt
Session // id, name, dmId, state, timestamps
Room // id, sessionId, name, type, createdAt
Message // id, sessionId, roomId, authorId, content, type, createdAt
Note // id, sessionId, title, content, authorId, visibility, timestamps
Metadata // id, sessionId, roomId, type, title, tags, timestamps
```

Campaign-model compatibility addendum (2026-05-04 lock):

- Canonical relationship chain for campaign participation is `User -> CampaignMembership(role) -> Character`.
- A player has one active character per campaign; character replacement is allowed.
- Message/history records preserve send-time character snapshot fields (for example name/avatar) so prior logs remain historically accurate after character replacement.
- Spectators do not own characters and cannot create campaign-state mutations.
- Campaign settings include `postSessionChatEnabled: boolean` (default true) and `postSessionChatDurationMs: integer` (default 300000 ms / 5 minutes, range 60000–3600000 ms).
- Campaign settings PATCH compatibility: metadata-only saves are valid. Clients may send only changed metadata fields (for example `name`, `description`, `posterUrl`) without resending visibility/spectator policy booleans.
- For omitted campaign settings fields on PATCH (for example `discoverable`, `spectatorsEnabled`, `lateJoinPolicy`), backend must retain current persisted values rather than rejecting the request.
- GREENROOM (via RoomType) persists at campaign scope; shared across all sessions for that campaign.

---

## 2. Event Contracts

All events conform to `EventEnvelope<T>`:

```typescript
interface EventEnvelope<T = Record<string, any>> {
  id: UUID // Unique, for idempotency
  type: string // Canonical Stage 0 format: DOMAIN:ACTION (e.g., CHAT:MESSAGE_SENT)
  version: 1 // Forward compatibility
  userId: UUID // Who triggered it (or SYSTEM)
  userRole: Role // For permission checks
  sessionId: UUID // Always required
  roomId: UUID | null // null for session-level events
  timestamp: number // Unix ms
  payload: T // Subsystem-specific data
  meta?: {
    traceId?: string
    source?: 'WS' | 'REST' | 'INTERNAL'
  }
}
```

### Validation Rules (All Events)

- ✅ Must have valid type string in `DOMAIN:ACTION` format
- ✅ Must reference existing session
- ✅ User must have permission to perform action
- ✅ Payload must match subsystem schema
- ✅ Timestamp must be within ±5 minute skew window

Naming compatibility note: UI-local docs may describe interaction intents using slash-style names,
and conceptual architecture docs may show dotted names. Runtime transport contracts are the
`DOMAIN:ACTION` event names listed below.

### Event Categories

**Session Lifecycle** (file: `events/session.ts`)

- `SESSION:CREATED` — DM creates session
- `SESSION:STARTED` — IDLE → ACTIVE (DM only)
- `SESSION:PAUSED` — ACTIVE → PAUSED (DM only, with optional reason)
- `SESSION:RESUMED` — PAUSED → ACTIVE (DM only)
- `SESSION:ENDED` — ACTIVE → ENDED, freezes all changes
- `SESSION:ARCHIVED` — Admin cleanup, no more joins
- `SESSION:DEVICE_SESSION_CONNECTED` — device session attached for a user
- `SESSION:DEVICE_SESSION_DISCONNECTED` — device session detached for a user
- `SESSION:DEVICE_SESSION_TRANSFERRED` — active device ownership transferred
- `SESSION:DEVICE_MIC_OWNER_CHANGED` — authoritative active mic device switched
- `SESSION:DEVICE_MIC_HARD_UNPUBLISHED` — sibling device forced unpublish on ownership change
- Device session connect/disconnect payloads include the user's full current `deviceSessions` snapshot for client reconciliation.

**Chat** (file: `events/chat.ts`)

- `CHAT:MESSAGE_SENT` — IC/OOC/whisper/DM/system, delivery metadata includes room scope, send-time audience, off-the-record state, and optional structured message metadata for special system cards; DM messages are sender + DM only, and private whisper-group messages target the visible private-room audience off the record
- `CHAT:MESSAGE_EDITED` — Author or DM can edit
- `CHAT:MESSAGE_DELETED` — Author or DM can delete
- `CHAT:TYPING_STARTED` — Ephemeral, room-scoped payload, never durable
- `CHAT:TYPING_STOPPED` — Ephemeral, room-scoped payload, never durable

**Rooms & Presence** (file: `events/room.ts`)

- `ROOM:CREATED` — DM creates room
- `ROOM:USER_JOINED` — User joins (system message generated)
- `ROOM:USER_LEFT` — User leaves (system message generated)
- `ROOM:CLOSED` — DM closes room (moves all members to MAIN, group remains but empty) _New event_
- `ROOM:DELETED` — DM cleanup (must occur only after Close → Delete flow)
- `PRESENCE:STATE_CHANGED` — User state transition (ONLINE→TYPING→SPEAKING, etc.)
- `PRESENCE:USER_GHOST_MODE_CHANGED` — Ghost projection toggle for disconnected/reconnected presence lifecycle
- `PRESENCE:PROFILE_UPDATED` — Live profile metadata update while user remains in-session
- `PRESENCE:HEARTBEAT` — Internal keepalive
- `PRESENCE:RECONNECTED` — Restore state after disconnect

Room close/delete sequencing contract:

- For GROUP room removal, backend must execute Close → Delete as two separate steps.
- **Close step**: Moves every remaining member to MAIN, emits `ROOM:USER_LEFT` (reason: `ROOM_CLOSED`) for each member from old room, then `ROOM:USER_JOINED` for each member to MAIN. Room remains in group list but is now empty. `ROOM:CLOSED` event emitted. Delete button becomes available on group card.
- **Delete step**: Runs only when the room is empty. Removes room from both session AND campaign DB (permanent campaign deletion). Emits `ROOM:DELETED`. Room card disappears from UI. Group no longer available in future sessions.
- Example flow:
  1. DM clicks "Close" on "Scouts" group (has 2 members)
  2. Backend moves alice and bob to MAIN, broadcasts ROOM:USER_LEFT + ROOM:USER_JOINED events, emits ROOM:CLOSED
  3. UI: Scouts card empties, "Delete" button appears
  4. DM clicks "Delete" on now-empty Scouts group
  5. Backend deletes Scouts from campaign, broadcasts ROOM:DELETED
  6. UI: Scouts card disappears, no longer available next session

**Notes** (file: `events/audio.ts`)

- `NOTES:CREATED` — Private/shared/DM-only, visibility controlled
- `NOTES:UPDATED` — Author or DM can update
- `NOTES:DELETED` — Author or DM can delete
- `NOTES:SHARED` — Author shares with specific users
- `NOTES:TAG_ADDED` — Tagging support

Notes visibility/publish sequencing contract:

- `NOTES:CREATED` and `NOTES:UPDATED` must be emitted with the computed visibility audience from note metadata (DM-only, custom allowed users, and author/DM inclusion rules).
- `POST /api/notes` with the reserved journal tag (`_journal`) or canonical journal title (`Session Journal`) is an upsert for that session's journal entry: if a journal note already exists for the session, backend must update it in place, return `200`, and emit `NOTES:UPDATED` instead of creating a duplicate.
- `POST /api/notes/:noteId/publish` is manual and accepts either `audience: 'EVERYONE'` or `audience: 'ROOM'` with a valid `roomId`.
- Publish room targets must exclude whisper/private rooms, greenroom, and empty rooms; frontend should offer `Everyone` plus occupied MAIN/GROUP rooms only.
- Publishing to `Everyone` upgrades the note visibility to `PLAYERS_VISIBLE`; publishing to a room upgrades/shares the note to the players currently in that room before emitting chat.
- Publishing a note emits `NOTES:UPDATED` first and then `CHAT:MESSAGE_SENT`, both using the same visibility audience for that note and the selected room/global destination.
- Published note chat messages must include `message.metadata.noteShared = { kind: 'NOTE_SHARED', noteId, title, markdown, sharedWith, hashtags }` so recipients render a handout card from structured data rather than reparsing the chat text body.
- Publishing writes both an audit record (`NOTES.PUBLISHED`) and a session-log record for traceability.

**Audio** (file: `events/audio.ts`)

- `AUDIO:EFFECT_APPLIED` — DM applies effects to room or user
- `AUDIO:EFFECT_REMOVED` — DM removes effect
- `AUDIO:PRESET_LOADED` — Load audio preset
- `AUDIO:ENVIRONMENT_SET` — DM sets room ambience
- `AUDIO:ENVIRONMENT_CLEARED` — DM clears room ambience (revert to default) _New event_
- `AUDIO:DM_OVERRIDE_APPLIED` — Mute, gain, filter, gate (DM only)
- `AUDIO:DM_OVERRIDE_REMOVED` — Remove override

### Group Environment API Contracts

**Campaign-Level Groups** (persistent structure)

- `GET /api/campaigns/:campaignId/groups` → List all groups for campaign with their default environments
- `POST /api/campaigns/:campaignId/groups` → Create new campaign group (name, optional defaultEnvironmentName)
- `PATCH /api/campaigns/:campaignId/groups/:groupId` → Update group (defaultEnvironmentName, etc.)
- `DELETE /api/campaigns/:campaignId/groups/:groupId` → Delete campaign group (only if no active sessions using it; return 409 if session active)

**Session-Level Groups** (runtime state)

- `GET /api/sessions/:sessionId/groups` → List all groups in session with member counts and current environments
- `POST /api/sessions/:sessionId/groups` → Create new group mid-session (name, optional defaultEnvironmentName)
- `POST /api/sessions/:sessionId/groups/:groupId/close` → Close group (move all members to MAIN, group remains empty, delete button appears)
  - Response: list of moved users `{ userId, username, fromGroupId, toGroupId }`
  - Emits: `ROOM:USER_LEFT` (reason: `ROOM_CLOSED`), `ROOM:USER_JOINED`, `ROOM:CLOSED`
- `DELETE /api/sessions/:sessionId/groups/:groupId` → Delete group (only if empty or force=true; permanent campaign deletion)
  - Response: deleted groupId
  - Emits: `ROOM:DELETED`

**Environment Application**

- `POST /api/audio/environments/apply` → Set environment for a session group
  - Request: `{ sessionId, groupId, environmentName }`
  - Response: `{ ok, groupId, environmentName }`
  - Emits: `AUDIO:ENVIRONMENT_SET` to all players in that group
  - Broadcast to all session members (all clients update roomEnvironmentNames in Zustand)
  - Valid environments: `Default, Forest, Cave, Tavern, City, Dungeon, Night, Storm` (extensible)
- `DELETE /api/audio/environments/:groupId` → Clear environment for a group
  - Response: `{ ok, groupId }`
  - Emits: `AUDIO:ENVIRONMENT_CLEARED`
  - Note: environment still persists at campaign level; this clears session-level override

**Environment Lifecycle**

- Campaign groups have a `defaultEnvironmentName` that persists across sessions
- On session start, campaign groups are carried into session; session environment defaults to campaign default
- DM can override session environment (does not affect campaign default)
- On session PAUSE: all environments cleared
- On session RESUME: pre-pause environments reapply from session snapshot (not campaign default)
- On session END: session environments discarded; campaign environments remain unchanged
- MAIN always has neutral environment (cannot be changed)
- WHISPER uses no environment (system-managed)
- GREENROOM uses neutral environment (cannot be changed)

**Metadata** (future expansion)

- Not yet fully specified; hook exists for Stage 3+

---

## 3. Permission Matrix

**File**: `permissions/index.ts`

**68 permission rules** covering all domains:

### Quick Reference

| Domain   | Action                             | DM  | Player | Spectator |
| -------- | ---------------------------------- | --- | ------ | --------- |
| SESSION  | CREATE, START, PAUSE, END, ARCHIVE | ✅  | ❌     | ❌        |
| CHAT     | SEND_IC                            | ✅  | ✅     | ❌        |
| CHAT     | SEND_OOC                           | ✅  | ✅     | ✅        |
| CHAT     | SEND_WHISPER                       | ✅  | ✅     | ❌        |
| CHAT     | SEND_DM                            | ❌  | ✅     | ❌        |
| CHAT     | SEND_SYSTEM                        | ✅  | ❌     | ❌        |
| CHAT     | EDIT_OWN                           | ✅  | ✅     | ✅        |
| CHAT     | EDIT_ANY                           | ✅  | ❌     | ❌        |
| CHAT     | DELETE_OWN                         | ✅  | ✅     | ✅        |
| CHAT     | DELETE_ANY                         | ✅  | ❌     | ❌        |
| NOTES    | CREATE_PRIVATE                     | ✅  | ✅     | ✅        |
| NOTES    | CREATE_SHARED                      | ✅  | ✅     | ❌        |
| NOTES    | CREATE_DM_ONLY                     | ✅  | ❌     | ❌        |
| NOTES    | VIEW_DM_ONLY                       | ✅  | ❌     | ❌        |
| AUDIO    | APPLY_EFFECT_PERSONAL              | ❌  | ✅     | ❌        |
| AUDIO    | APPLY_EFFECT_ROOM                  | ✅  | ❌     | ❌        |
| AUDIO    | APPLY_OVERRIDE                     | ✅  | ❌     | ❌        |
| ROOM     | CREATE, DELETE, INVITE, KICK       | ✅  | ❌     | ❌        |
| PRESENCE | UPDATE_OWN                         | ✅  | ✅     | ✅        |

**Full matrix** in `permissions/index.ts` with 68 rules and 3 helpers:

- `canPerformAction(role, domain, action): boolean`
- `getAllowedActions(role): string[]`
- `getDomainRules(domain): PermissionRule[]`

---

## 4. Error Model

**File**: `errors/index.ts`

**50+ standardized error codes**:

### Error Categories

**Validation** (4xx)

- `INVALID_INPUT`, `INVALID_EVENT`, `INVALID_PAYLOAD`
- `MISSING_REQUIRED_FIELD`
- → HTTP 400

**Authorization** (4xx)

- `UNAUTHORIZED`, `FORBIDDEN`, `PERMISSION_DENIED`
- `INVALID_TOKEN`, `TOKEN_EXPIRED`
- `INSUFFICIENT_PERMISSIONS`
- → HTTP 401/403

**Not Found** (4xx)

- `SESSION_NOT_FOUND`, `ROOM_NOT_FOUND`, `USER_NOT_FOUND`
- `MESSAGE_NOT_FOUND`, `NOTE_NOT_FOUND`
- → HTTP 404

**Conflict / State** (4xx)

- `SESSION_ALREADY_ACTIVE`, `SESSION_ALREADY_ENDED`
- `INVALID_STATE_TRANSITION`
- `USER_ALREADY_IN_ROOM`, `USER_NOT_IN_ROOM`
- → HTTP 409

**Connection / Transport** (5xx)

- `NETWORK_ERROR`, `CONNECTION_FAILED`, `WEBSOCKET_ERROR`
- `TIMEOUT`, `DISCONNECTED`
- → HTTP 503/504

**Server** (5xx)

- `INTERNAL_ERROR`, `NOT_IMPLEMENTED`
- `SERVICE_UNAVAILABLE`, `DATABASE_ERROR`
- → HTTP 500/501/503

**Rate Limiting** (4xx)

- `RATE_LIMITED`, `TOO_MANY_REQUESTS`
- → HTTP 429

### Error Response Shape

```typescript
interface AppError {
  code: ErrorCode
  message: string
  status?: number // HTTP status
  context?: Record<string, any>
  errorId?: string // For logging
  stack?: string // Dev only
}
```

**Factory function**: `createError(code, overrides?)` — use this for all errors.

---

## 5. Validators (Pure Functions)

**File**: `validators/index.ts`

All validators are **deterministic, side-effect-free** (suitable for both backend and frontend).

### UUID & IDs

- `isValidUUID(value): boolean` — RFC 4122 v4 format

### Names & Content

- `isValidUsername(value): boolean` — 3–32 chars, alphanumeric + underscore
- `isValidSessionName(value): boolean` — 1–100 chars, no control chars
- `isValidRoomName(value): boolean` — 1–100 chars, no control chars
- `isValidMessageContent(value): boolean` — 1–4000 chars
- `isValidNoteTitle(value): boolean` — 1–200 chars
- `isValidNoteContent(value): boolean` — 1–50,000 chars
- `isValidTag(value): boolean` — 1–50 chars, alphanumeric + `-` / `_`

### Enums & Types

- `isValidMessageType(value): boolean` — One of IC/OOC/WHISPER/DM/SYSTEM
- `isValidNoteVisibility(value): boolean` — One of DM_ONLY/PLAYERS_VISIBLE/CUSTOM
- `isValidPresenceState(value): boolean` — One of ONLINE/TYPING/SPEAKING/IDLE/OFFLINE

### Event Validation

- `validateEventEnvelope(event): ValidationResult` — Check all required fields
- `isValidEventType(value): boolean` — DOMAIN:ACTION format
- `isValidTimestamp(timestamp, now?): boolean` — Within ±5 min skew

### Batch Validation

- `validateFields(data, schema): FieldValidation[]` — Validate multiple fields at once
- `allFieldsValid(validations): boolean` — Check if all passed
- `getFieldErrors(validations): ValidationError[]` — Collect error details

---

## Stage 0 Completion Checklist

- ✅ **Event contracts** frozen (35+ events across 5 domains)
- ✅ **Permission matrix** locked (68 rules, 3 query helpers)
- ✅ **Error model** defined (50+ codes, catalog, factory)
- ✅ **Validators** implemented (25+ pure functions)
- ✅ **Types** consolidated (6 enums, 6 domain objects)
- ✅ **Shared package** structure created (`/shared`)
- ✅ **Documentation** complete (this file)

---

## Usage from Backend and Frontend

### Backend (tsconfig.json path alias)

```typescript
// src/api/auth.routes.ts
import { Role, SessionState, createError, canPerformAction, isValidUsername } from '@shared'
```

### Frontend (tsconfig.json path alias)

```typescript
// src/store/chatSlice.ts
import { CHAT:MESSAGE_SENT, EventEnvelope, validateEventEnvelope } from '@shared'
```

### Path Alias Setup

Both `backend/tsconfig.json` and `frontend/tsconfig.json` must define:

```json
"compilerOptions": {
  "paths": {
    "@shared": ["../../shared/index.ts"]
  }
}
```

(To be implemented in Stage 1 setup)

---

## No Changes Permitted

This contract document is **locked**. No new event types, permission rules, or error codes may be added without:

1. Explicit documented rationale
2. Agreement from all three teams (backend, frontend, admin)
3. Written amendment to this file with timestamp and author

Violations constitute contract breakage and will cause stage regression.

---

## Next Stage: Stage 1 (Backend Foundation)

Once Stage 0 is locked (✅), proceed to Stage 1:

**Stage 1 tasks**:

1. Set up Express middleware for auth, validation, error handling
2. Implement `/api/health` endpoint (working)
3. Implement `/api/auth/...` endpoints (JWT + password hashing)
4. Implement `/api/session` CRUD (Create, Read, Update, End)
5. Set up WebSocket handshake and event dispatcher
6. Write deterministic, schema-validating event handler skeleton
7. Implement state recovery on reconnect

**Deliverable**: Minimal REST + WS infrastructure, validated against Stage 0 contracts, all endpoints return deterministic responses.

---

## Campaign Display Rules

These rules govern how campaign state is presented in the lobby and dashboard. They are product contracts, not implementation details.

### DM Presence on Campaign Cards

- Campaign cards in the lobby show the DM's presence as `Online` or `Offline`.
- No finer-grained status (e.g. typing, speaking) is surfaced at the campaign card level.
- `Online` means the DM is connected to the campaign's active realtime session context.
- `Offline` means the DM is not connected to that campaign's active realtime session context (including while the DM is only in lobby/offline workspace mode).

### Lobby Campaign State Mapping

- Campaign status badges are derived from canonical session state plus live connected-table presence.
- `OFFLINE` is shown when no DM/player is connected to the active table for that campaign.
- `READY` is shown for connected `IDLE` sessions.
- `ACTIVE` is shown for connected `ACTIVE` or `PAUSED` sessions.
- `FINISHING` is shown for connected `COOLDOWN` sessions.
- `ENDED` is shown for connected `ENDED` sessions.
- `CLEANUP` is treated as not-live for lobby card state and must not be presented as a separate user-facing campaign status.

#### Lobby Campaign State Matrix (Quick Reference)

| Canonical Session State | Connected DM/Player Present | Lobby Card Status |
| ----------------------- | --------------------------- | ----------------- |
| `IDLE`                  | No                          | `OFFLINE`         |
| `IDLE`                  | Yes                         | `READY`           |
| `ACTIVE`                | No                          | `OFFLINE`         |
| `ACTIVE`                | Yes                         | `ACTIVE`          |
| `PAUSED`                | No                          | `OFFLINE`         |
| `PAUSED`                | Yes                         | `ACTIVE`          |
| `COOLDOWN`              | No                          | `OFFLINE`         |
| `COOLDOWN`              | Yes                         | `FINISHING`       |
| `ENDED`                 | No                          | `OFFLINE`         |
| `ENDED`                 | Yes                         | `ENDED`           |
| `CLEANUP`               | Either                      | `OFFLINE`         |

### Lobby Connected Count Contract

- Campaign list player/spectator counts must reflect real currently connected users in the campaign's active realtime session.
- Guest users are included in those connected counts.
- DEV/mock users are excluded from lobby connected counts.
- Presence aggregation uses a short disconnect grace buffer to reduce visible flapping from heartbeat jitter/reconnect churn.

### Lobby Sync and Invalidation

- Lobby campaign cards are server-authoritative and refresh via websocket invalidation; manual page refresh is not required.
- `CAMPAIGN:LIST_INVALIDATED` is the lobby invalidation event and must be emitted after lifecycle/membership mutations that change lobby-visible campaign state.
- Explicit `Exit Session`/leave actions must invalidate lobby projections immediately after persistence so DM/card status transitions are visible without heartbeat delay.

### Lobby List Structure

- Campaign cards are grouped into two lobby sections: `Member or DM Of` and `Discoverable`.
- The campaign card container is fixed-height within the lobby shell; section headers are sticky and only the campaign list body scrolls.

### Dashboard Metrics Privacy

- Home dashboard aggregate metrics (e.g. active players, session counts) are privacy-limited.
- Exact counts are never shown; values are rounded or expressed as approximate signals (e.g. "a few active", "10+").
- This prevents information leakage about campaign size or player activity to unauthenticated users or casual observers.

---

## Campaign Visibility Model

The `discoverable` boolean on the `Campaign` model is the backing field for campaign visibility. UI surfaces label it as **PUBLIC** (discoverable=true) or **PRIVATE** (discoverable=false).

### Lobby card rendering rules

| Viewer                 | PUBLIC campaign             | PRIVATE — spectators off, or no active session | PRIVATE — spectators on + active session with DM/players present |
| ---------------------- | --------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| DM (owns campaign)     | Full card + EDIT            | Full card + EDIT                               | Full card + EDIT                                                 |
| Existing member        | Full card + REVIEW/LAUNCH   | Full card + REVIEW/LAUNCH                      | Full card + REVIEW/LAUNCH                                        |
| Non-member (full user) | Full card + REQUEST TO JOIN | Dimmed card + lock icon (no action)            | Normal card + lock icon + WATCH                                  |
| Non-member (guest)     | Not shown                   | Not shown                                      | Not shown                                                        |

Private card visual rules for non-members:

- **Dimmed + lock icon**: campaign is PRIVATE and either spectators are disabled or no session is currently active with at least one DM or player present. No action available without an invite link.
- **Normal card + lock icon + WATCH**: campaign is PRIVATE but spectators are enabled and an `ACTIVE` session exists with at least one DM or player connected. The lock icon remains to signal the campaign is not publicly joinable. The WATCH button is available without an invite link.
- Guests are always scoped to the specific campaign they were invited to and do not see the lobby discovery list.

### Request-to-Join Flow (PUBLIC campaigns only)

- `POST /api/campaigns/:id/join-request` — authenticated full user submits a join request with an optional message (max 300 chars). Returns `201` with the pending request record.
- If the user already has a pending or approved membership, return `409 Conflict`.
- `POST /api/campaigns/:id/join-request/:requestId/approve` — DM-only. Converts pending request to `CampaignMembership` with role `PLAYER`.
- `POST /api/campaigns/:id/join-request/:requestId/reject` — DM-only. Deletes the pending request.
- WS event `CAMPAIGN:JOIN_REQUEST_RECEIVED` is broadcast to the DM immediately after a request is persisted. Payload: `{ campaignId, requestId, userId, displayName, avatarUrl, requestedAt, message? }`.
- DM's campaign card in the lobby shows a notification badge with the count of pending join requests. Clicking the badge opens an inline approval panel showing: requester username, avatar, requested-at timestamp, and optional message with approve/reject buttons.
- On approval, the WS event `CAMPAIGN:JOIN_REQUEST_RESOLVED` is broadcast to the requester so their lobby card updates immediately.

### WATCH Entry for Full Users

A full (non-guest) user may enter spectator view of a campaign without a spectator invite link if **all** of the following are true:

1. The session is in `ACTIVE` state.
2. The campaign has spectators enabled (`spectatorPolicy !== NONE`).
3. At least one DM or player is currently connected in the session.
4. The viewer is a full account (not a guest).

Visibility applies to both PUBLIC and PRIVATE campaigns under these conditions. For PRIVATE campaigns the card is rendered at normal opacity with a lock icon (not dimmed) when all four conditions are met, making the WATCH button discoverable.

- Backend `POST /api/campaigns/:id/watch` validates all four conditions and returns a LiveKit spectator token on success.
- Guest users must still enter via a spectator invite link (`/watch/:code`); they cannot use the WATCH button flow.
- `POST /api/campaigns/:id/watch` returns `403` with a descriptive reason if any condition is unmet (e.g. `"No active session"`, `"Spectators not enabled"`, `"No players currently connected"`).
- The lobby query that populates campaign cards must include `activeSessionState`, `spectatorsEnabled`, and `activeConnectedCount` so the frontend can determine card treatment without an additional round-trip.

---

## Campaign Lifecycle: RETIRE and RESUME

DMs can retire a campaign to remove it from their default lobby listing without permanently deleting it.

- Schema: `retiredAt DateTime?` added to `Campaign`. Non-null value means the campaign is retired.
- Default lobby listing excludes campaigns where `retiredAt IS NOT NULL`.
- Retired campaigns are accessible from a separate "Retired campaigns" list visible only to the DM.

### Endpoints

- `POST /api/campaigns/:id/retire` — DM-only. Sets `retiredAt = now()`. Returns `200` with updated campaign. DM must own the campaign.
- `POST /api/campaigns/:id/resume` — DM-only. Clears `retiredAt`. Returns `200` with updated campaign.
- Both endpoints reject non-DM callers with `403`.

### UI contract

- RETIRE button is shown in the offline campaign workspace header (alongside Back and Launch).
- Clicking RETIRE opens a confirmation dialog: _"This removes the campaign from your list. You can resume it any time."_ — with Cancel and Retire actions.
- RESUME: No confirmation dialog. A dedicated icon/button at the top-right of the lobby campaign list opens a "Retired campaigns" drawer; clicking Resume on a card restores it immediately.

### Deletion rules

- DMs **cannot delete** a campaign. Retire is the DM lifecycle action.
- Admin-only hard delete is available in the admin panel via `DELETE /api/admin/campaigns/:id`. This is irreversible and requires explicit confirmation in the admin UI.
- If an active session exists for the campaign, `POST /api/campaigns/:id/retire` returns `409` — the session must be ended first.

---

## Guest Upgrade Flow

Guests who exit a session are routed to an upgrade screen only — they do not see the campaign discovery lobby.

### Upgrade screen contract

- The upgrade screen presents a single form: display name, email, and password.
- Submitting calls `POST /api/auth/upgrade` (authenticated as the current guest JWT).
- On success: guest account is promoted to a full account; the user is issued a new full-account JWT and routed to the normal lobby.

### Email conflict resolution

| Email match                              | Outcome                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| No existing account with that email      | Upgrade succeeds.                                                                                                         |
| Email matches another guest account      | Merge: the two guest accounts are merged; all campaign memberships from both accounts are unified under one account.      |
| Email matches a full (non-guest) account | Block. Return `409` with message: _"An account with this email already exists. Log in to your existing account instead."_ |

### Linked memberships

- On upgrade, if the new email matches prior guest campaign memberships (from any merged guest account), those memberships are transferred to the new full account automatically.
- The system never exposes matched email addresses in error messages beyond the generic conflict response above.

---

## Campaign Export and Import (Admin-Only)

### Export

- `GET /api/admin/campaigns/:id/export` — admin-only. Returns a JSON payload (or downloadable `.json` file).
- Export scope:
  - Campaign metadata (name, description, poster URL, visibility, policies)
  - Groups/rooms and their environment assignments
  - Session history and associated chat messages (all types: IC, OOC, system bookends)
  - Notes and journal entries
  - Member list with roles (no passwords; email addresses included for re-linking on import)
- DMs cannot self-export. Only admin-authenticated callers may access this endpoint.

### Import

- `POST /api/admin/campaigns/import` — admin-only. Creates a **new** campaign from the export payload. Original IDs are discarded; all records receive fresh UUIDs.
- The admin may optionally supply a member email-to-user mapping to link exported member records to existing accounts. Unmapped members are created as stubs with no active account link.
- Import never overwrites an existing campaign. Each import always produces a new campaign record.
- On success, returns `201` with the new campaign ID and a summary of imported records (groups, sessions, messages, members).

---

**Document Version**: 1.1
**Locked By**: Stage 0 Build Agent
**Lock Date**: April 17, 2026
**Amendment Date**: 2026-05-21 — Campaign visibility model, request-to-join, WATCH entry, guest upgrade, campaign retire/resume, admin export/import contracts added.

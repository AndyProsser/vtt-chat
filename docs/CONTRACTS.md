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
- `NOTES`: rightbar handouts now support structured image attachments in create/edit/read flows. Attachments persist on the note record, travel through `NOTES:CREATED` and `NOTES:UPDATED`, and render as thumbnail cards alongside markdown content.
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
- `characterStats` shape: the canonical **flat** `NormalizedCharacterStats` (from `packages/shared/utils/character-stats.ts`) — `{ strength, dexterity, constitution, intelligence, wisdom, charisma, hpCurrent, hpMax, hpTemp?, ac, initiative, passivePerception, speed, proficiencyBonus, level }`. This is the SINGLE format used for mock and extension-synced players, online and offline, and over all WS presence/profile events. External/integration payloads (nested `{ stats: { abilityScores, hp, ... } }`) are transformed via `normalizeCharacterStats` at ingestion and at every read projection. Consumers must read flat keys only — never special-case a nested `stats`/`abilityScores` shape.
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
- The payload carries the latest profile fields needed to refresh live room cards in place: player name, avatar, character name, class (merged primary class string, e.g. `"Warlock / Archfey Patron"`), classes (full array for multiclassed characters — see Character Multiclass Contract), multiclass flag, race, level, and character stats.
- `subclass` is deprecated from this payload; class+subclass are merged into the `class` field and the full array is in `classes`.
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
- `POST /api/session/:id/join` must enforce campaign `lateJoinPolicy` and `lateJoinGraceMinutes` for brand-new player joins after a session has started; DMs and already-joined reconnects continue to bypass that late-join gate.
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
- If more than one publishable room currently has at least one player, publish must require explicit room selection (`audience: 'ROOM'`); backend must reject `audience: 'EVERYONE'` for that state with `409 CONFLICT`.
- Publishing to `Everyone` upgrades the note visibility to `PLAYERS_VISIBLE`; publishing to a room upgrades/shares the note to the players currently in that room before emitting chat.
- Publishing a note emits `NOTES:UPDATED` first and then `CHAT:MESSAGE_SENT`, both using the same visibility audience for that note and the selected room/global destination.
- `NOTES:CREATED`, `NOTES:UPDATED`, and `NOTES:DELETED` payloads must include `campaignId` so campaign-scoped clients can apply updates without relying on `sessionId` bucket keys; `NOTES:UPDATED` should also include `publishedAt` when present.
- Published note chat messages must include `message.metadata.noteShared = { kind: 'NOTE_SHARED', noteId, title, markdown, sharedWith, hashtags }` so recipients render a handout card from structured data rather than reparsing the chat text body.
- Publishing writes both an audit record (`NOTES.PUBLISHED`) and a session-log record for traceability.
- Note attachments are currently image-only in runtime (`image/*`, max 6 attachments per note, stored as note-scoped attachment objects with `id`, `campaignId`, `mime`, `name`, `uri`, `createdAt`). PDF attachment support remains planned work.

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

#### Environment Application

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

#### Environment Lifecycle

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
- `GET /api/campaigns/:id/join-request` — DM-only. Returns the current pending request list for inline lobby review, including requester username, display name, avatar, timestamp, and optional message.
- `POST /api/campaigns/:id/join-request/:requestId/approve` — DM-only. Converts pending request to `CampaignMembership` with role `PLAYER`.
- `POST /api/campaigns/:id/join-request/:requestId/reject` — DM-only. Deletes the pending request.
- WS event `CAMPAIGN:JOIN_REQUEST_RECEIVED` is broadcast to the DM immediately after a request is persisted. Payload: `{ campaignId, requestId, userId, displayName, avatarUrl, requestedAt, message? }`.
- DM's campaign card in the lobby shows a notification badge with the count of pending join requests. Clicking the badge opens an inline approval panel showing: requester username, avatar, requested-at timestamp, and optional message with approve/reject buttons.
- On approval, the WS event `CAMPAIGN:JOIN_REQUEST_RESOLVED` is broadcast to the requester so their lobby card updates immediately. Frontend lobby clients also treat join-request received/resolved campaign events as list-refresh signals so DM badge counts converge without a manual reload.

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
- Non-member lobby discovery must include PRIVATE campaigns even when they are not currently watchable so the frontend can render the canonical dimmed locked card state instead of hiding them entirely.

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

## Campaign DM Transfer (W-DM-Handoff)

Two-phase ownership handoff: DM initiates, target player accepts or declines. Pending state is stored in Redis with a 24-hour TTL.

### Endpoints

| Method | Path                                    | Auth           | Description                                                                       |
| ------ | --------------------------------------- | -------------- | --------------------------------------------------------------------------------- |
| `POST` | `/api/campaigns/:id/dm/handoff`         | DM of campaign | Initiate transfer — stores pending offer in Redis, notifies target via WS         |
| `GET`  | `/api/campaigns/:id/dm/handoff/pending` | Any member     | Returns current pending offer or `null`                                           |
| `POST` | `/api/campaigns/:id/dm/handoff/accept`  | Target player  | Accept offer — executes DB transaction, broadcasts `CAMPAIGN:DM_TRANSFERRED`      |
| `POST` | `/api/campaigns/:id/dm/handoff/decline` | Target player  | Decline offer — clears Redis, notifies DM via `CAMPAIGN:DM_TRANSFER_RESPONDED`    |
| `POST` | `/api/campaigns/:id/dm/handoff/cancel`  | Initiating DM  | Cancel offer — clears Redis, notifies target via `CAMPAIGN:DM_TRANSFER_CANCELLED` |

### Constraints

- Transfer is rejected (`409`) if the latest session is `ACTIVE`, `PAUSED`, or `COOLDOWN`.
- Target must be an existing `PLAYER` member (not a spectator, not already DM).
- Only one pending transfer per campaign at a time; re-initiating replaces the previous.
- On `accept`: `Campaign.currentDmId` updates, both `CampaignMembership.role` rows swap, old DM's `user.role` demotes to `PLAYER` only if they hold no other DM campaigns.

### WS Events (all campaign-scoped, no `sessionId` required)

| Event                            | Sent to              |
| -------------------------------- | -------------------- |
| `CAMPAIGN:DM_TRANSFER_INITIATED` | Target player        |
| `CAMPAIGN:DM_TRANSFER_RESPONDED` | Initiating DM        |
| `CAMPAIGN:DM_TRANSFER_CANCELLED` | Target player        |
| `CAMPAIGN:DM_TRANSFERRED`        | All campaign members |

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

## Groups Panel Contracts (W-Groups-Panel)

### Reserved Room Names

The names `MAIN`, `WHISPER`, and `GREENROOM` (case-insensitive) are reserved and cannot be used when creating DM groups. Both the API and frontend enforce this.

### Group Close Contract

`POST /api/rooms/:roomId/close` — DM only.

Empties a group by moving all its members to MAIN. The group record is preserved and appears empty. The Delete action becomes available after Close.

- Only GROUP-type rooms can be closed. MAIN and WHISPER have dedicated flows.
- Returns `{ ok: true, closedGroupId, movedUsers: [{ userId, username, fromGroupId, toGroupId }] }`.
- Broadcasts `ROOM:USER_LEFT` (source room) and `ROOM:USER_JOINED` (MAIN) per affected user.

### Group Delete Contract

`DELETE /api/rooms/:roomId` — DM only.

Permanently deletes a group from both the session and the campaign (Postgres). The group will not be available in future sessions.

- Only allowed on empty groups (no current members). Returns `409` if members remain.
- MAIN, WHISPER, and GREENROOM cannot be deleted.
- Broadcasts `ROOM:DELETED` after successful deletion.

### Group Environment Contract

`POST /api/audio/environments/apply` — DM only.

Sets the ambient environment for a group. Affects all players currently in that group.

Request body: `{ sessionId, roomId, environmentName }`.

- `environmentName` must be a non-empty string. `"Default"` clears the active environment.
- Persisted to Redis (`audio:session:{sessionId}:environments`) and Postgres for recovery.
- Broadcasts `AUDIO:ENVIRONMENT_SET` to all session members after persistence.
- Environments are **preserved across PAUSED ↔ ACTIVE transitions**. They are only cleared on ENDED/CLEANUP teardown.

### DM Audio Override Contract

`POST /api/audio/overrides/dm/apply` and `POST /api/audio/overrides/dm/remove` — DM only.

Allows the DM to remotely adjust a player's local audio settings.

Apply body: `{ sessionId, targetUserId, overrideType, parameters? }`.
Remove body: `{ sessionId, targetUserId, overrideType }`.

Supported override types for audio quality adjustment:

| Type     | Purpose                 | Example parameters                                     |
| -------- | ----------------------- | ------------------------------------------------------ |
| `GAIN`   | Mic gain multiplier     | `{ factor: 0.5 }` (lower) or `{ factor: 1.5 }` (boost) |
| `FILTER` | Background noise filter | `{ enabled: true }`                                    |
| `GATE`   | Noise gate threshold    | `{ threshold: 0.2 }`                                   |

Mute-override constraint:

- A DM may apply a `MUTE` override to silence a player. Removing that override only removes the DM's mute — it does not affect the player's own self-mute (`AUDIO:MUTE_STATE_CHANGED`). A player who self-muted remains muted after a DM `MUTE` override is removed.
- `GAIN`, `FILTER`, and `GATE` overrides are independent of mute state and can always be applied or removed.

Broadcasts `AUDIO:DM_OVERRIDE_APPLIED` / `AUDIO:DM_OVERRIDE_REMOVED` to all session members after persistence.

---

## Extension Device Credential Contract

The extension device credential is a **per-user, per-browser opaque token** issued after the first successful extension authentication. It replaces the invite URL as the reconnection mechanism so extensions remain connected even when the campaign invite code is rotated or regenerated.

### Credential issuance

Credentials are issued from two endpoints:

- **Player:** `POST /api/auth/extension/guest-login` — included in the response as `deviceCredential` when the request body contains a `deviceId`. Shape: `{ credential: string, deviceId: string }`.
- **DM:** `POST /api/auth/extension/dm-link` — always returns `deviceCredential: { credential: string, deviceId: string }` on success (the DM's `deviceId` is a required field in the request body).

Both responses use the same `{ credential, deviceId }` object shape so the extension can store and exchange credentials without path-specific handling. See [extension/DEVICE-CREDENTIALS.md](extension/DEVICE-CREDENTIALS.md) for the storage key convention and reconnect code.

- Preserved (not re-issued) when a guest upgrades via `POST /api/auth/upgrade` — the credential automatically becomes associated with the now-full account.
- The extension **must** store the credential object in `localStorage` keyed by role and campaign. The original invite URL or code **must not** be stored for reconnection purposes.
- Each browser installation generates and persists a stable `deviceId` (UUID v4) in `localStorage` on first install. This `deviceId` is sent on the initial join/link call and on every subsequent credential exchange.

### Credential exchange

`POST /api/auth/extension/credential/exchange`

Request body: `{ credential: string, deviceId: string }`

On success (`200`): returns `{ token: string, credential: string }` — a fresh short-lived JWT and a **rotated** credential. The old credential is immediately invalidated. The extension must replace the stored credential on every successful exchange.

`lastUsedAt` and `expiresAt` (= `lastUsedAt + 90 days`) are updated on every successful exchange.

On failure (`401`):

| Code                       | Meaning                                                  | Required extension behaviour                          |
| -------------------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| `CREDENTIAL_INVALID`       | Token not found, already rotated, or explicitly revoked  | Treat as first launch — prompt for invite code        |
| `CREDENTIAL_EXPIRED_GUEST` | 90-day inactivity window elapsed; account is still guest | Prompt user to re-enter a fresh invite code           |
| `CREDENTIAL_EXPIRED_FULL`  | 90-day inactivity window elapsed; account is full        | Prompt user for email and password to re-authenticate |

### Expiry policy

- Credentials expire 90 days after `lastUsedAt` (rolling window — refreshed on every successful exchange).
- Explicit revocation invalidates the credential immediately, regardless of remaining window.
- On expiry, the path to restore access differs by account type: guest users need a fresh invite code (the join flow re-runs); full users are prompted for their password (no invite code required).

### Credential scope

- One credential per browser/device per user account. A single user may hold multiple active credentials across different browsers or installations.
- A credential grants the right to obtain a JWT for any campaign the user is already a member of. It does not grant new campaign memberships — access is still governed by `CampaignMembership`.

### Revocation

- `DELETE /api/auth/extension/credentials/:credentialId` — requires valid JWT. A user may revoke their own credentials; admin may revoke any.
- `GET /api/auth/extension/credentials` — requires valid JWT. Returns active credentials for the authenticated user with `deviceId`, `createdAt`, `lastUsedAt`, `expiresAt`. Intended for an account settings "Connected Devices" panel.

### Account upgrade preservation

When a guest upgrades to a full account (`POST /api/auth/upgrade`), all active extension credentials are preserved unchanged. The next credential exchange by any of those extensions returns a full-account JWT automatically — no re-authentication required from the extension.

### Security constraints

- Credentials are stored server-side as salted hashes; the plaintext is never persisted.
- Credential exchange is rate-limited: maximum 10 exchanges per `deviceId` per minute.
- All extension credential endpoints require HTTPS.
- Rotation on every exchange prevents replay of intercepted tokens.

### Campaign Session Status (Extension Popup Display)

`GET /api/campaigns/:campaignId/session-status`

No authentication required. The `campaignId` path parameter acts as an implicit access gate — it is only known to users who have previously joined the campaign via the extension.

Response (200):

```json
{
  "campaignId": "uuid",
  "sessionState": "IDLE | ACTIVE | PAUSED | COOLDOWN | ENDED | null",
  "campaignDisplayState": "IDLE | GREENROOM | ACTIVE | PAUSED | COOLDOWN",
  "connectedCount": 3,
  "sessionId": "uuid | null"
}
```

- `sessionState` is the raw `SessionState` enum value of the most recent session, or `null` if no session has ever been created.
- `campaignDisplayState` is derived via `deriveCampaignDisplayState()` and is what the extension popup should display.
- `connectedCount` is the number of currently connected campaign members (DM + players; excludes spectators). The extension uses this to show whether anyone else is online.
- `sessionId` is included so the extension can pass it to `POST /api/campaigns/:campaignId/session/ensure` without a separate lookup.

This endpoint must not expose user identities, character names, or any personally identifiable information. It is a public signal surface — treat it accordingly.

### Session Ensure (Extension GREENROOM Launch)

`POST /api/campaigns/:campaignId/session/ensure`

Requires a valid extension-credential JWT (any campaign member, any role). This is the only session-creation path available to non-DM users.

Request body: none required.

Response (200):

```json
{
  "sessionId": "uuid",
  "sessionState": "IDLE | ACTIVE | PAUSED | COOLDOWN | ENDED",
  "campaignDisplayState": "IDLE | GREENROOM | ACTIVE | PAUSED | COOLDOWN",
  "created": true
}
```

- `created: true` means the backend created a new IDLE session. `created: false` means an existing session was returned unchanged.
- If a session in any state already exists for the campaign, it is returned as-is. This endpoint never advances or regresses session state.
- DM-only session controls (`ACTIVE`, `PAUSED`, etc.) continue to require the DM role and are unaffected by this endpoint.
- Non-extension JWTs (standard web auth) receive `403 EXTENSION_CREDENTIAL_REQUIRED`. This endpoint is intentionally not accessible from the main web app.

---

## Extension Inventory Sync Policy Contract (W-Extension-MVP)

`POST /api/integrations/external/sync` enforces two independent layers of campaign policy on every
call. See [EXTENSION-INTEGRATION.md §5e](extension/EXTENSION-INTEGRATION.md) and
[INVENTORY-SYSTEM.md §12.3](subsystems/INVENTORY-SYSTEM.md) for the full design spec — this section
is the locked wire contract, including the party-target payload shape (not previously specified).

### Layer 1 — `extensionSyncPolicy` (existing)

Gates **all** sync payloads — character, inventory, currency. `NONE` rejects everything;
`DM_ONLY` permits only `source: 'dm'` requests; `DM_AND_PLAYERS` permits both.

### Character-target resolution

A `characterUpdate` resolves the target character by `(campaignId, externalSystem, externalId)`,
preferring the **active** character then the most-recently-updated. The matched character is marked
the single **active** character for its owner (deactivating siblings) in the same transaction as the
column/metadata writes. This guarantees the sync writes to the exact row the PARTY/presence
projections render — which always read the active character — so synced data is never stranded on a
hidden/duplicate row.

Extension data is the **source of truth** and is applied with section-wise **overwrite** semantics
(shared `mergeCharacterMetadata`): each section present in the packet fully replaces its metadata
counterpart, the stats section is reset wholesale to the canonical flat shape (see the party-presence
`characterStats` contract above) with any legacy nested `stats` dropped, and sections **absent** from
the packet are preserved (the extension sends multiple packets; the first often omits stats, so a
stats-less packet never wipes stats). The metadata read+write runs under a row lock
(`SELECT … FOR UPDATE`) so concurrent packets serialize. Guest-auth login ingestion uses the same
`mergeCharacterMetadata` helper for identical behaviour.

### Layer 2 — inventory-specific campaign settings

Four `Campaign` fields, evaluated independently once Layer 1 permits the caller:

| Field | Type | Default |
| --- | --- | --- |
| `extensionInventorySyncEnabled` | `boolean` | `true` |
| `extensionCurrencySyncEnabled` | `boolean` | `true` |
| `extensionPartyInventorySyncAccess` | `DISABLED \| DM_ONLY \| ALL_PLAYERS` | `DM_ONLY` |
| `extensionSyncConflictResolution` | `OVERWRITE \| IGNORE \| PROMPT` | `OVERWRITE` |

Managed via `GET`/`PATCH /api/campaigns/:campaignId/settings` (DM-only); locked while a session is
`ACTIVE`/`PAUSED`, same as `extensionSyncPolicy`.

### Party-target wire shape

Party-targeted sync uses **separate top-level payload keys** — `partyInventoryUpdate` and
`partyCurrencyUpdate` — mirroring `inventoryUpdate`/`currencyUpdate` but with no
`externalCharacterId` (the target is always the campaign's party inventory/purse):

```json
{
  "campaignId": "uuid",
  "externalSystem": "DDB",
  "source": "dm",
  "partyInventoryUpdate": { "items": [{ "externalId": "ddb-item-999", "name": "Bag of Holding", "quantity": 1 }] },
  "partyCurrencyUpdate": { "wallet": { "gp": 200 } }
}
```

`extensionPartyInventorySyncAccess` gates these two keys: `DISABLED` always skips them;
`DM_ONLY` skips unless `source === 'dm'`; `ALL_PLAYERS` never skips. They are additionally gated by
the master toggles above (`extensionInventorySyncEnabled` for `partyInventoryUpdate`,
`extensionCurrencySyncEnabled` for `partyCurrencyUpdate`).

### Conflict resolution (`extensionSyncConflictResolution`)

A conflict is an incoming item/wallet value that differs from an existing persisted record
(matched by `externalSource`+`externalId` for items; any non-zero requested denomination for
currency). Net-new items and zero-balance wallets are never conflicts and always apply immediately.

| Value | Behaviour |
| --- | --- |
| `OVERWRITE` | Incoming value always wins (historical default behaviour). |
| `IGNORE` | Conflicting item discarded, existing record untouched; conflicting currency update discarded in full. |
| `PROMPT` | Conflicting change written to `PendingExtensionSync` (campaign+characterId-scoped, see INVENTORY-SYSTEM.md §2.3); `INVENTORY:EXTENSION_SYNC_PENDING` sent to the DM only (`eventBroadcaster.sendToUser`). |

**Party-owned conflicts under `PROMPT` fall back to `OVERWRITE`.** `PendingExtensionSync` is
schema-locked to a single `characterId` — there is no DM-review queue shape for party-owned
records — so a party item/wallet conflict applies immediately rather than queuing, regardless of
the campaign's `PROMPT` setting. Only character-owned conflicts queue for DM review.

### Response shape (`applied`)

`characterUpdate` and `campaignUpdate` are always present booleans. Every other key
(`inventoryItemsUpserted`, `currencyUpdated`, `partyInventoryItemsUpserted`, `partyCurrencyUpdated`,
`pendingConflicts`, `skippedReasons`) is present **only** when its corresponding request section
(`inventoryUpdate`, `currencyUpdate`, `partyInventoryUpdate`, `partyCurrencyUpdate`) was present in
the request. `skippedReasons` maps a blocked section name to `SYNC_POLICY_DISABLED` or
`SYNC_POLICY_PARTY_ACCESS_DENIED`.

### Error responses

| Status | Code | Cause |
| --- | --- | --- |
| 403 | `SYNC_POLICY_DISABLED` | Request contains only sections blocked by a Layer 2 master toggle (no other section present). |
| 403 | `SYNC_POLICY_PARTY_ACCESS_DENIED` | Request contains only party sections blocked by `extensionPartyInventorySyncAccess`. |

A request that mixes blocked and allowed sections is never rejected wholesale — allowed sections
apply and blocked ones are reported via `applied.skippedReasons` (HTTP 200).

### DM Review Endpoints (`PROMPT` mode)

Mounted alongside the existing inventory routes at `/api/inventory/:campaignId/...` (the real
runtime prefix — see the corrective note in INVENTORY-SYSTEM.md §8):

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/inventory/:campaignId/sync/pending` | List non-expired pending syncs (DM only) |
| `POST` | `/api/inventory/:campaignId/sync/pending/:pendingId/approve` | Apply the change via the standard 4-layer contract; broadcasts the normal `INVENTORY:ITEM_ADDED`/`ITEM_EDITED`/`CURRENCY_CHANGED` event (DM only) |
| `POST` | `/api/inventory/:campaignId/sync/pending/:pendingId/reject` | Discard the pending change (DM only) |

Pending syncs expire 24h after creation (TTL field, checked on read — same convention as
`DeviceCredential`; no separate sweep job). Expired or missing rows return `404 NOT_FOUND` from
approve/reject.

---

## Session Schedule Contract (W-Session-Schedule)

DMs can configure a repeating session schedule on a campaign. The schedule drives the next session date displayed in the Campaign Info panel for all members.

### Data model

Four fields on Campaign (all nullable; absence means no schedule configured):

| Field | Type | Description |
| ----- | ---- | ----------- |
| `sessionScheduleType` | `SessionScheduleType` enum | `WEEKLY`, `BIWEEKLY`, or `MONTHLY_NTH` |
| `sessionScheduleDay` | `Int` (0–6) | Day of week (0 = Sunday) |
| `sessionScheduleNth` | `Int` (1–4) | Nth occurrence of the day; `MONTHLY_NTH` only |
| `sessionScheduleHour` | `Int` (0–23) | Hour component of session start time |
| `sessionScheduleMinute` | `Int` (0–59) | Minute component of session start time |
| `sessionScheduleTz` | `String` | IANA timezone (e.g. `"America/New_York"`) |
| `nextSessionDate` | `DateTime?` | Authoritative next session datetime |
| `nextSessionIsManual` | `Boolean` | `true` when DM has overridden auto-calc for this one session |

### Endpoints

**Update schedule** (extends existing settings endpoint, DM only):

```http
PATCH /api/campaigns/:id/settings
Body: {
  sessionSchedule?: {
    type: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY_NTH'
    day: 0–6
    nth?: 1–4          // required when type === 'MONTHLY_NTH'
    hour: 0–23
    minute: 0–59
    timezone: string   // IANA timezone
  }
}
Response 200: { nextSessionDate: ISO8601 | null, scheduleLabel: string | null }
```

On success: calculates `nextSessionDate` as the first occurrence after `now()`, persists all fields, emits `CAMPAIGN:SCHEDULE_UPDATED`.

**Manual override for next session** (DM only):

```http
PUT /api/campaigns/:id/next-session-date
Body: { date: ISO8601 }
Response 200: { nextSessionDate: ISO8601 }
```

Sets `nextSessionIsManual = true`. Does not alter the recurring schedule. Emits `CAMPAIGN:SCHEDULE_UPDATED`. Rejected with `400` if no schedule is configured (use `PATCH /settings` to set the schedule first, or set an explicit one-off date there).

**Clear schedule** (DM only):

```http
DELETE /api/campaigns/:id/schedule
Response 204
```

Clears all `sessionSchedule*` fields and `nextSessionDate`. Emits `CAMPAIGN:SCHEDULE_UPDATED` with all null values.

### Auto-advance on session end

On `SESSION:ENDED`:

1. If `sessionScheduleType` is set: call `calculateNextOccurrence(schedule, now())` and persist the result to `nextSessionDate`.
2. Reset `nextSessionIsManual = false` unconditionally — the manual override (if any) was consumed by the session that just ended.
3. Broadcast `CAMPAIGN:SCHEDULE_UPDATED`.

The DM's manual override therefore applies to exactly one session. After that session ends, the schedule resumes automatically.

### WS Event

```ts
CAMPAIGN:SCHEDULE_UPDATED
{
  campaignId:          string
  scheduleType:        SessionScheduleType | null
  scheduleDay:         number | null
  scheduleNth:         number | null
  scheduleHour:        number | null
  scheduleMinute:      number | null
  scheduleTz:          string | null
  nextSessionDate:     string | null   // ISO8601
  scheduleLabel:       string | null   // e.g. "Every 2nd Sunday of the month at 1:00 PM"
  nextSessionIsManual: boolean
}
```

Broadcast to all connected campaign members (DM, players, spectators).

### Display contract

The next session date is visible to **all campaign members**. It is shown in the Campaign Info panel when session state is `IDLE`, `ENDED`, `COOLDOWN`, or `CLEANUP`. It is hidden during `ACTIVE` and `PAUSED` (the session is already running). Display format: `"Sun Jun 14 at 1:00 PM · in 2 days"` (date localised to the viewing user's browser timezone; the relative label uses the authoritative `nextSessionDate` from the server).

DM-only controls: pencil icon to open an inline override date/time picker; "Revert to schedule" link to clear the manual override without clearing the schedule.

### Constraints

- Only the campaign DM may set, override, or clear the schedule.
- `sessionScheduleNth` is required when `type === MONTHLY_NTH` and must be 1–4.
- `sessionScheduleTz` must be a valid IANA timezone string; backend validates with `Intl.DateTimeFormat`.
- `nextSessionDate` is always stored in UTC; display conversion happens client-side.
- Schedule fields persist across session boundaries (campaign-scoped). Exporting a campaign includes all schedule fields.
- Clearing the schedule does not clear session history or any other campaign state.

---

## Character Multiclass Contract (W-Character-Multiclass)

This section defines the data model, UI rules, and extension sync contract for multiclassed characters.

### DB Schema — `classes` column

A new `classes` JSONB column is added to the `Character` table. Each element represents one class the character has taken levels in:

```json
[
  { "name": "Warlock / Archfey Patron", "level": 4 },
  { "name": "Fighter / Battle Master", "level": 3 }
]
```

- `classes[0]` is the **primary class** — it cannot be removed by the player.
- The `name` field stores the merged `className / subclassName` string. The `" / subclassName"` suffix is omitted if `subclassName` is absent or empty.
- The sum of all per-class `level` values **must equal** the character's top-level `level` field. The backend enforces this — it derives `level` from the `classes` array when the new format is received.
- The existing `class` top-level column is kept for backward compat reads and is always updated to `classes[0].name`. The existing `subclass` column is deprecated; new writes ignore it.

### UI rules

| Character type | Class/level display | Per-class editor |
| --- | --- | --- |
| Single-class (1 entry in `classes`) | Merged class string + total level, same as today | Hidden |
| Multiclassed (2+ entries in `classes`) | Per-class breakdown visible | Shown per class; total level is auto-computed (read-only) |

- The class input in PlayerSettingsPanel is a **single free-text field** combining class and subclass (e.g. `"Fighter / Battle Master"`), not two separate fields.
- Players can add secondary classes; they can never remove the primary class (`classes[0]`).
- A character must always have at least one class entry.

### Extension sync format

`POST /api/integrations/external/sync` → `characterUpdate` accepts two formats. When `classes` is present, it takes precedence over the legacy flat fields.

**New multiclass format (preferred):**

```json
{
  "characterUpdate": {
    "externalCharacterId": "...",
    "multiclass": true,
    "classes": [
      { "classExternalID": "1", "className": "Warlock", "classLevel": 4, "subclassName": "Archfey Patron" },
      { "classExternalID": "2", "className": "Fighter", "classLevel": 3, "subclassName": "Battle Master" }
    ]
  }
}
```

**Legacy single-class format (backward compat — used when `classes` is absent):**

```json
{
  "characterUpdate": {
    "externalCharacterId": "...",
    "class": "Warlock",
    "subclass": "Archfey Patron",
    "level": 4
  }
}
```

Backend processing of the new format:

1. For each `classes` entry: merge `className + " / " + subclassName` (drop the `" / subclassName"` suffix if absent/empty).
2. Persist the full array to the `classes` JSONB column; `classes[0]` is the primary class.
3. Set the `class` column to `classes[0].name`.
4. Derive and persist `level` as the sum of all `classLevel` values.
5. Ignore legacy `class`, `subclass`, and `level` top-level fields when `classes` is present.

### `PRESENCE:PROFILE_UPDATED` payload additions

| Field | Type | Notes |
| --- | --- | --- |
| `class` | `string \| null` | Merged primary class string (e.g. `"Warlock / Archfey Patron"`) |
| `classes` | `Array<{ name: string, level: number }>` | Full class array; single-element for non-multiclassed characters |
| `multiclass` | `boolean` | `true` when `classes.length > 1` |
| `subclass` | — | **Deprecated — removed from payload** |

---

### DM Campaign Sync endpoint

`POST /api/integrations/external/dm-sync` — DM-only. Provisions unowned character stubs for players with no VTT-Chat account, and upserts characters for players whose ExternalIdentity is already known.

**Auth:** Caller must be the `currentDmId` of the campaign. Returns `403 FORBIDDEN` otherwise.

**Request:**

```json
{
  "campaignId": "uuid",
  "externalSystem": "dndbeyond",
  "externalCampaignId": "string",
  "characters": [
    {
      "externalCharacterId": "string (required)",
      "externalUserId": "string (required)",
      "name": "string | null",
      "displayName": "string | null",
      "level": "number | null",
      "avatarUrl": "string | null",
      "characterUrl": "string | null"
    }
  ]
}
```

**Response (200):**

```json
{
  "message": "DM campaign sync completed",
  "applied": {
    "campaignUpdated": true,
    "charactersProvisioned": 3,
    "charactersLinked": 1,
    "charactersSkipped": 0
  }
}
```

| Field | Meaning |
| --- | --- |
| `campaignUpdated` | `CampaignExternalLink` was created or updated |
| `charactersProvisioned` | Stub records created/updated (no ExternalIdentity match) |
| `charactersLinked` | Characters upserted against an existing VTT-Chat user |
| `charactersSkipped` | Entries missing `externalCharacterId` or `externalUserId` |

**Character stub schema change:** `Character.userId` is now nullable. Stubs have `userId = null` until the player connects via the extension — at which point `loginGuestViaExtension` promotes the stub by setting `userId` and creating the `CampaignMembership`.

---

**Document Version**: 1.2
**Locked By**: Stage 0 Build Agent
**Lock Date**: April 17, 2026
**Amendment Date**: 2026-05-21 — Campaign visibility model, request-to-join, WATCH entry, guest upgrade, campaign retire/resume, admin export/import contracts added.
**Amendment Date**: 2026-06-04 — Groups panel contracts added: reserved names, group close, group delete, environment apply, DM audio override (GAIN/FILTER/GATE).
**Amendment Date**: 2026-06-08 — Extension Device Credential Contract added: per-browser persistent credential, 90-day rolling expiry, credential exchange endpoint, expiry behaviour by account type, revocation.
**Amendment Date**: 2026-06-12 — Session Schedule Contract added: structured recurrence picker, next session date auto-advance, DM manual override, CAMPAIGN:SCHEDULE_UPDATED event.
**Amendment Date**: 2026-06-22 — Character Multiclass Contract added: classes JSONB column, merged class/subclass field, per-class level model, multiclass extension sync format (backward-compat with legacy flat fields), PRESENCE:PROFILE_UPDATED payload update (subclass deprecated).

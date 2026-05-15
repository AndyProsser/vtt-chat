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

### Room Presence Safety Contract

Players must never be left without a valid room assignment.

- If a destination room is missing, deleted, or invalid during move operations, backend must fail back to `MAIN`.
- If Whisper/private restoration target is unavailable, backend must fail back to `MAIN`.
- If any presence record is detected with no valid `primaryRoomId`, reconciliation must move that user to `MAIN`.
- Group deletion must migrate all remaining members to `MAIN` before final delete completes.

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

### Presence Profile Updates

- `PRESENCE:PROFILE_UPDATED` is the session-scoped event for character sheet / player card metadata changes while the user remains in-session.
- The payload carries the latest profile fields needed to refresh live room cards in place: player name, avatar, character name, class, subclass, race, level, and character stats.
- New profile data should be broadcast after persistence succeeds and before the acting user relies on a refresh to see the change.

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
    chat.ts                  # Chat system events (IC, OOC, whisper, typing)
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

Compatibility note: `ASSISTANT_DM` appears in some product-level docs as a delegated authority persona.
Until a contract re-lock, runtime authorization still resolves to the locked roles above.

### Session States

```typescript
SessionState.IDLE // Not yet started; greenroom mode
SessionState.ACTIVE // Players can join and act; session running
SessionState.PAUSED // DM control; state frozen, off-the-record runtime
SessionState.ENDED // Session stopped; recording/summary work triggered; new session cannot begin yet
SessionState.CLEANUP // Post-session terminal state; no users connected; background cleanup job purges greenroom chat
```

GREENROOM is a calculated runtime state, not an enum member:

- `isGreenroomSessionState(state) := state !== SessionState.ACTIVE && state !== SessionState.PAUSED`
- This evaluates true for `IDLE`, `ENDED`, and `CLEANUP`.

**State transitions and authority:**

- `IDLE` → `ACTIVE`: DM explicit action (start session)
- `ACTIVE` → `PAUSED`: DM explicit action OR automatic on DM disconnect
- `ACTIVE` → `ENDED`: DM explicit action (stop session)
- `PAUSED` → `ACTIVE`: DM explicit action (resume session)
- `PAUSED` → `ENDED`: DM explicit action (stop session)
- `ENDED` → `CLEANUP`: Automatic when all users disconnect (background scheduled job detects and transitions)
- `CLEANUP` → `IDLE`: Background cleanup job completes (greenroom chat purged; session ready for fresh start)

**Multi-session campaigns:**

- GREENROOM chat persists across all sessions for a campaign
- On `IDLE` → `ACTIVE`: existing GREENROOM remains; if no prior session, create new GREENROOM
- On final session `ENDED` + all users disconnect: ALL previously ENDED sessions (from same campaign) transition to `CLEANUP` simultaneously
- Cleanup job runs once per campaign, purges greenroom for all transitioned sessions

**Post-session cooldown:**

- If `postSessionChatEnabled` (campaign setting, default true): spectators remain connected until cooldown expires (default 300000 ms / 5 minutes)
- During cooldown, players/DM/spectators can chat/speak; interaction never recorded
- After cooldown expiry or DM early-end: all users disconnected; background job transitions `ENDED` → `CLEANUP`

### Other Enums

- `RoomType`: MAIN, GROUP, PRIVATE
- `NoteVisibility`: DM_ONLY, PLAYERS_VISIBLE, CUSTOM
- `MessageType`: IC, OOC, WHISPER, SYSTEM
- `PresenceState`: ONLINE, TYPING, SPEAKING, IDLE, OFFLINE

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

**Chat** (file: `events/chat.ts`)

- `CHAT:MESSAGE_SENT` — IC/OOC/whisper/system, role-filtered
- `CHAT:MESSAGE_EDITED` — Author or DM can edit
- `CHAT:MESSAGE_DELETED` — Author or DM can delete
- `CHAT:TYPING_STARTED` — Ephemeral, room-scoped
- `CHAT:TYPING_STOPPED` — Ephemeral

**Rooms & Presence** (file: `events/room.ts`)

- `ROOM:CREATED` — DM creates room
- `ROOM:USER_JOINED` — User joins (system message generated)
- `ROOM:USER_LEFT` — User leaves (system message generated)
- `ROOM:DELETED` — DM cleanup (must occur only after Close -> Delete flow)
- `PRESENCE:STATE_CHANGED` — User state transition (ONLINE→TYPING→SPEAKING, etc.)
- `PRESENCE:HEARTBEAT` — Internal keepalive
- `PRESENCE:RECONNECTED` — Restore state after disconnect

Room close/delete sequencing contract:

- For GROUP room removal, backend must execute Close -> Delete.
- Close step moves every remaining member to MAIN and emits `ROOM:USER_LEFT` + `ROOM:USER_JOINED` with reason `ROOM_CLOSED`.
- Delete step runs only when the room is empty and then emits `ROOM:DELETED`.

**Notes** (file: `events/audio.ts`)

- `NOTES:CREATED` — Private/shared/DM-only, visibility controlled
- `NOTES:UPDATED` — Author or DM can update
- `NOTES:DELETED` — Author or DM can delete
- `NOTES:SHARED` — Author shares with specific users
- `NOTES:TAG_ADDED` — Tagging support

**Audio** (file: `events/audio.ts`)

- `AUDIO:EFFECT_APPLIED` — DM applies effects to room or user
- `AUDIO:EFFECT_REMOVED` — DM removes effect
- `AUDIO:PRESET_LOADED` — Load audio preset
- `AUDIO:ENVIRONMENT_SET` — DM sets room ambience
- `AUDIO:DM_OVERRIDE_APPLIED` — Mute, gain, filter, gate (DM only)
- `AUDIO:DM_OVERRIDE_REMOVED` — Remove override

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

- `isValidMessageType(value): boolean` — One of IC/OOC/WHISPER/SYSTEM
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

**Document Version**: 1.0
**Locked By**: Stage 0 Build Agent
**Lock Date**: April 17, 2026

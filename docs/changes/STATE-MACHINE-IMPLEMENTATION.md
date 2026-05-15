# State Machine Implementation Mapping

**Purpose:** Map contract concepts from [STATE-MACHINE.md](STATE-MACHINE.md) to codebase locations and implementation status.

**Status:** W0 implementation tracking document. Update checklist items as contract work lands.

---

## 1. State Management & Storage

### 1.1 Session State

**Contract:** `session.state ∈ { IDLE, ACTIVE, PAUSED, ENDED, CLEANUP }`

**Current Codebase:**

| Component           | Location                                          | Current                                                                  | Contract Required                                                                          |
| ------------------- | ------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **Backend DB**      | `backend/src/db/schema.prisma`                    | `SessionState` enum with IDLE, ACTIVE, PAUSED, ENDED, CLEANUP            | Keep IDLE (canonical), ensure CLEANUP state ready for use                                  |
| **Backend API**     | `backend/src/api/session.routes.ts`               | Transitions: IDLE→ACTIVE, ACTIVE→(PAUSED\|ENDED), PAUSED→(ACTIVE\|ENDED) | Implement backend detection of ENDED + all users → CLEANUP                                 |
| **Backend Service** | `backend/src/services/session.service.ts`         | `updateSessionState()` validates transitions                             | Implement scheduled job for CLEANUP detection/transition                                   |
| **Cleanup Job**     | `backend/src/jobs/session-cleanup.job.ts`         | Scheduled job runs periodically                                          | Detect ENDED sessions with no connected users; transition to CLEANUP; purge greenroom chat |
| **Frontend Store**  | `frontend/src/state/sessionSlice.ts`              | Zustand store caches session state                                       | Handle CLEANUP state on hydration and WS events                                            |
| **Frontend API**    | `frontend/src/components/session/SessionInit.tsx` | Calls `PUT /api/session/:id/state`                                       | No change (endpoint stays same)                                                            |

**Action Items:**

- [x] Ensure `SessionState` enum has IDLE, ACTIVE, PAUSED, ENDED, CLEANUP (don't rename IDLE)
- [x] Add `listEndedSessionsWithCampaign()` repo function — ENDED sessions with campaign cooldown settings
- [x] Add `campaignHasActiveSessions(campaignId)` repo function — detect final session in campaign
- [x] Add `listEndedSessionIdsByCampaign(campaignId)` repo function — all ENDED sessions for batch transition
- [x] Implement `phaseEndedToCleanup()` in cleanup job: scan ENDED sessions, check cooldown + disconnected, detect final campaign session, batch-transition to CLEANUP, purge greenroom
- [x] Implement `phaseCleanupToIdle()` in cleanup job: refactored from original `runOnce()`; resets CLEANUP → IDLE after minCleanupAge
- [x] Update frontend to handle CLEANUP state on store hydration — handled via canonical lifecycle state (`SessionState.CLEANUP`) and greenroom-state checks
- [ ] Broadcast `SESSION:STATE_CHANGED` WS event when job transitions ENDED → CLEANUP — **deferred**: all users are disconnected when this transition fires; no active listeners to receive it

---

### 1.2 User Presence & Ghost-mode

**Contract:** `user.presence ∈ { CONNECTED, DISCONNECTED }` + `user.ghost: boolean`

**Current Codebase:**

| Component          | Location                              | Current                      | Contract Required                                    |
| ------------------ | ------------------------------------- | ---------------------------- | ---------------------------------------------------- |
| **Redis Presence** | `backend/src/infra/redis/presence.ts` | User hash with presence data | Add `ghost` flag; manage 5s/60s timers in Redis keys |
| **Backend WS**     | `backend/src/ws/handlers/`            | Presence events exist        | Add `PRESENCE:USER_GHOST_MODE_CHANGED` event         |
| **Frontend Store** | `frontend/src/state/presenceSlice.ts` | Caches user presence         | Add ghost-mode cache; use WS event to sync           |
| **Frontend UI**    | `frontend/src/components/session/`    | Shows user state             | Add visual ghost-mode styling (faded, grayed)        |

**Action Items:**

- [x] Add `ghost: boolean` to Redis presence hash
- [x] Implement 5s backend timer: on disconnect, set ghost=false → true after 5s
- [x] Implement 60s backend timer: on WS failure, remove user from session after 60s (or cancel on reconnect)
- [x] Add `PRESENCE:USER_GHOST_MODE_CHANGED` WS event handler in frontend
- [x] Update presenceSlice to handle ghost-mode sync
- [x] Add ghost-mode styling to player cards

---

### 1.3 User Previous Group Tracking

**Contract:** `user.previousGroupId: GroupId | null` (one-level only)

**Current Codebase:**

| Component          | Location                               | Current                     | Contract Required                         |
| ------------------ | -------------------------------------- | --------------------------- | ----------------------------------------- |
| **Redis Presence** | `backend/src/infra/redis/presence.ts`  | User presence hash          | Add `previousGroupId` field               |
| **Group Movement** | `backend/src/services/room.service.ts` | `joinRoom()`, `leaveRoom()` | Populate/clear `previousGroupId` on moves |
| **Frontend Store** | `frontend/src/state/presenceSlice.ts`  | Presence cache              | Add `previousGroupId` field               |

**Action Items:**

- [x] Add `previousGroupId` to Redis presence hash
- [x] On room join: if new room is not GREEN_ROOM, set `previousGroupId` for the current non-greenroom group
- [x] On room join: if new room is GREEN_ROOM, set `previousGroupId` = null
- [x] On private room exit: restore user to `previousGroupId` (or MAIN if null/invalid)
- [x] Sync `previousGroupId` via presence WS payload propagation

---

## 2. Audio Routing

### 2.1 DM Voice Modes

**Contract:** `dm.voiceMode ∈ { TARGET_GROUP, BROADCAST }` + `dm.backgroundVolume: number`

**Current Codebase:**

| Component             | Location                                              | Current                                         | Contract Required                                                                  |
| --------------------- | ----------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Backend Model**     | `backend/src/db/schema.prisma`                        | No DM audio mode schema                         | Add `dmVoiceMode` (TARGET_GROUP\|BROADCAST), `dmBackgroundVolume` to User/DM model |
| **Backend Audio API** | `backend/src/api/audio.routes.ts`                     | Broadcast endpoint exists; TARGET_GROUP missing | Add `POST /api/audio/voice-mode` to set mode + backgroundVolume                    |
| **Backend LiveKit**   | `backend/src/services/livekit.service.ts`             | Token generation for broadcast                  | Modify token generation to reflect voiceMode (channel scopes)                      |
| **Frontend Store**    | `frontend/src/state/audioSlice.ts`                    | `broadcastModeEnabled` field                    | Add `dmVoiceMode`, `dmBackgroundVolume`, `dmVoiceTargetGroupId`                    |
| **Frontend UI**       | `frontend/src/components/session/DMAudioControls.tsx` | Broadcast toggle                                | Add voice mode selector + background volume slider                                 |

**Action Items:**

- [x] Add `dmVoiceMode` and `dmBackgroundVolume` columns to User table (Prisma)
- [x] Create `POST /api/audio/voice-mode` endpoint to set mode + volume
- [x] Broadcast `AUDIO:DM_VOICE_MODE_CHANGED` WS event to all session users
- [x] Validate voiceMode enum, targetGroupId UUID, backgroundVolume range (0–1)
- [x] Add `handleDmVoiceModeChanged` handler in frontend audioSlice
- [x] Create DM audio routing UI: selector for TARGET_GROUP / BROADCAST + volume slider
- [x] Persist `dmVoiceMode` and `dmBackgroundVolume` to DB (user-level setting, cross-device)
- [x] **⚠️ REQUIRES PRISMA MIGRATION** — `npx prisma migrate dev --name add-dm-voice-mode` (Phase 3 complete, pending migration)

---

### 2.2 Mute Enforcement (Defense-in-Depth)

**Contract:** `mutedBySelf || mutedByDM` enforced client-side + server-side

**Current Codebase:**

| Component              | Location                                         | Current                          | Contract Required                              |
| ---------------------- | ------------------------------------------------ | -------------------------------- | ---------------------------------------------- | --- | ----------------------------------------- |
| **Frontend Mute**      | `frontend/src/state/audioSlice.ts`               | `mutedBySelf`, `mutedByDM` flags | Already exists ✓                               |
| **Frontend UI**        | `frontend/src/components/session/AudioPanel.tsx` | Shows mute state                 | Already renders ✓                              |
| **Backend Validation** | `backend/src/services/audio.service.ts`          | Missing server-side mute check   | Add mute validation before audio packet accept |
| **LiveKit Token**      | `backend/src/services/livekit.service.ts`        | Token claims                     | Add `mutedBySelf                               |     | mutedByDM` to token (optional info field) |

**Action Items:**

- [ ] Verify frontend mute UI is correct (already seems done)
- [x] Add server-side mute validation in LiveKit webhook handler or audio pipeline — implemented at LiveKit token issuance path (`/api/livekit/token`) via backend mute enforcement state
- [x] If mute detected in backend, reject/ignore audio packet (silent no-op) — implemented as server-issued `canPublish=false` grant for muted users (`userMuted || dmMuted`)
- [ ] (Optional) Add mute info to LiveKit token for reference

---

## 3. Group & Room Management

### 3.1 Group Deletion with Member Migration

**Contract:** Close group first (move all members to MAIN), then delete only after room is empty; broadcast ROOM:USER_LEFT/JOINED before ROOM:DELETED.

**Current Codebase:**

| Component        | Location                               | Current                        | Contract Required                                               |
| ---------------- | -------------------------------------- | ------------------------------ | --------------------------------------------------------------- |
| **Room Service** | `backend/src/services/room.service.ts` | `closeRoom()` + `deleteRoom()` | `closeRoom()` moves members; `deleteRoom()` requires empty room |
| **Room API**     | `backend/src/api/rooms.routes.ts`      | DELETE endpoint                | Executes Close -> Delete flow                                   |
| **WS Events**    | `shared/events/room.ts`                | Room events defined            | Already broadcasts ROOM:USER_LEFT/JOINED ✓                      |

**Action Items:**

- [x] Keep explicit Close -> Delete flow in backend (`closeRoom()` then `deleteRoom()`)
- [x] Enforce guard: `deleteRoom()` fails if room still has members
- [x] Broadcast ROOM:USER_LEFT for each player leaving closed group
- [x] Broadcast ROOM:USER_JOINED for each player joining MAIN
- [x] Broadcast ROOM:DELETED only after successful close + empty-room delete

---

### 3.2 Environment Sync on Group Change

**Contract:** On group change, apply new group environment + conditions

**Current Codebase:**

| Component         | Location                               | Current                       | Contract Required                  |
| ----------------- | -------------------------------------- | ----------------------------- | ---------------------------------- |
| **Audio Presets** | `frontend/src/state/audioSlice.ts`     | `roomEnvironmentNames` cache  | Already syncs via WS ✓             |
| **Room Join**     | `backend/src/services/room.service.ts` | `joinRoom()`                  | Ensure environment applied on join |
| **WS Events**     | `shared/events/audio.ts`               | `AUDIO:ENVIRONMENT_SET` event | Already broadcasts ✓               |

**Action Items:**

- [ ] Verify environment is included in room join response
- [ ] Ensure `SessionInit.tsx` applies environment on group change (already does?)
- [ ] Test: join room → environment applies immediately (no refresh)

---

## 4. Session Boundaries & Off-the-Record

### 4.1 Boundary Markers (Backend-Authoritative)

**Contract:** Backend creates [Session Started], [Session Paused], etc. as SYSTEM chat

**Current Codebase:**

| Component             | Location                                          | Current                                | Contract Required                                  |
| --------------------- | ------------------------------------------------- | -------------------------------------- | -------------------------------------------------- |
| **Backend Chat**      | `backend/src/services/chat.service.ts`            | Message creation exists                | Ensure SYSTEM messages created on state transition |
| **Session State**     | `backend/src/services/session.service.ts`         | On updateSessionState()                | Call `createSystemMessage()` for each transition   |
| **Frontend Chat**     | `frontend/src/state/chatSlice.ts`                 | Chat timeline                          | Renders SYSTEM messages (if already implemented)   |
| **Frontend Bookends** | `frontend/src/components/session/SessionInit.tsx` | Calls `appendSessionBookendMessages()` | Remove client-side creation; rely on WS event      |

**Action Items:**

- [x] Ensure backend persists boundary marker to DB immediately
- [x] Broadcast `CHAT:MESSAGE_SENT` WS event with marker
- [x] Emit start/end boundaries for main + greenroom rooms via backend-authoritative roomIds
- [x] Remove client-side `appendSessionBookendMessages()` synthesis from frontend
- [x] Keep de-duplication logic in chat slice to collapse near-duplicate markers
- [x] Test: page refresh → boundary markers restored from chat history API

---

### 4.2 Whisper & Pause Off-the-Record Content

**Contract:** Whisper + Pause runtime chat/voice never persisted or logged

**Current Codebase:**

| Component              | Location                               | Current              | Contract Required                                                          |
| ---------------------- | -------------------------------------- | -------------------- | -------------------------------------------------------------------------- |
| **PRIVATE Room Chat**  | `backend/src/services/chat.service.ts` | Chat saving logic    | Add flag: `isOffTheRecord: boolean` for PRIVATE rooms                      |
| **Chat Persistence**   | `backend/src/db/schema.prisma`         | Message table        | Add `isOffTheRecord` column (or use room type + timing)                    |
| **Pause Runtime Chat** | `backend/src/services/chat.service.ts` | No special handling  | Add time-window check: if created during PAUSED state, mark isOffTheRecord |
| **History API**        | `backend/src/api/chat.routes.ts`       | GET history endpoint | Filter out isOffTheRecord=true messages (except for DM audit logs)         |

**Action Items:**

- [x] Add `isOffTheRecord` column to chat Message table (Prisma schema)
- [x] On chat save in PRIVATE room: set `isOffTheRecord = true` (infrastructure ready; PRIVATE room chat blocked by validation)
- [x] On chat save during PAUSED state: set `isOffTheRecord = true` (infrastructure ready; PAUSED state chat blocked by validation)
- [x] Update history API to exclude isOffTheRecord messages (with exception for DM-only audit logs)
- [x] Update chat service `getMessages()` to filter out isOffTheRecord messages for non-DM users
- [x] Update WS event `CHAT:MESSAGE_SENT` to include isOffTheRecord payload field
- [ ] Test: Pause session → chat during pause (after validation lifted) → refresh → marker shows [Session Paused] but runtime chat gone

---

### 4.3 Post-Session Chat & Processing Window

**Contract:** ENDED is the post-stop processing phase. DM may enable a spectator chat window with a configurable duration (default 5 minutes / 300000 ms); on ENDED, the backend immediately triggers recording shutdown and summary/close-out work, then returns without waiting for that work to finish. When all users disconnect from cooldown window (or on expiry), background job transitions ENDED → CLEANUP.

**Current Codebase:**

| Component                | Location                                                  | Current                     | Contract Required                                                                        |
| ------------------------ | --------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------- |
| **Campaign Settings**    | `backend/src/db/schema.prisma`                            | Campaign model              | Add `postSessionChatEnabled: Boolean`, `postSessionChatDurationMs: Int` (default 300000) |
| **Session End**          | `backend/src/services/session.service.ts`                 | On ENDED transition         | Trigger recording shutdown + summary/close-out work immediately, then continue           |
| **Spectator Disconnect** | `backend/src/services/presence.service.ts`                | No spectator-specific logic | Add post-session chat timer: disconnect specs when window expires                        |
| **Frontend Wait Screen** | `frontend/src/components/session/SpectatorWaitScreen.tsx` | Exists (?)                  | Add duration slider + disable toggle + countdown display                                 |

**Action Items:**

- [x] Add `postSessionChatEnabled` and `postSessionChatDurationMs` to Campaign Prisma model (default enabled, 300000 ms) — schema added, **migration pending**
- [x] Restrict duration slider to 1-60 minutes, with 1 minute decrement steps and 5 minute increment steps
- [ ] On session transition to ENDED: enqueue or dispatch recording shutdown + summary/close-out work immediately, then return without waiting for completion
- [x] Add DM actions to extend the window and end it early — `POST /:id/cooldown/extend` (existing) + `POST /:id/cooldown/end` (new) — both use `resolveCooldownControlAuthorization`; broadcasts `SESSION:COOLDOWN_EXTENDED` / `SESSION:COOLDOWN_ENDED`
- [x] `endSessionCooldown()` service function in `session.service.ts` — sets `endedAt` to 4 min in past; cleanup job picks up on next poll
- [x] `handleSessionCooldownEnded` handler in `sessionSlice.ts` — sets `endedAt = 0` so countdown reads as expired
- [x] `SESSION:COOLDOWN_ENDED` registered in `useWebSocket.ts` dispatcher
- [x] `handleCancelCooldown` in `SessionInit.tsx` now calls `POST /api/session/:id/cooldown/end` (was incorrectly calling IDLE transition)
- [x] `SpectatorWaitScreen.tsx` created — shows intermission holding screen (PAUSED) or cooldown countdown (ENDED with active window) or session-ended message
- [ ] Update spectator UI to show duration slider, disable toggle, and countdown timer — partially done via SpectatorWaitScreen countdown; slider/toggle in SessionInit campaign settings
- [ ] Test: ENDED with chat enabled → spectators can chat during window → after expiry → all users disconnected → scheduled job transitions ENDED → CLEANUP

---

## 5. Session Lifecycle & Cleanup

### 5.1 Session State Transitions (Scheduled Job Model)

**Contract:**

Sessions move through a deterministic lifecycle managed by backend state transitions and a background scheduled cleanup job:

1. **IDLE → ACTIVE**: DM explicit action (start session)
2. **ACTIVE → PAUSED**: DM explicit action OR automatic on DM disconnect
3. **ACTIVE → ENDED**: DM explicit action (stop session); triggers recording shutdown + summary work (async, non-blocking)
4. **PAUSED → ACTIVE**: DM explicit action (resume session)
5. **PAUSED → ENDED**: DM explicit action (stop session); triggers recording shutdown + summary work
6. **ENDED → CLEANUP**: Automatic via scheduled job when all users disconnect and cooldown window expires (if enabled)
7. **CLEANUP → IDLE**: Automatic via scheduled job after greenroom purge completes (session ready for fresh start)

**Multi-session campaigns:**

- Session A ends (`ENDED`); Session B starts (new `ACTIVE`)
- GREENROOM persists from Session A into Session B
- When Session B ends (`ENDED`) and all users disconnect: scheduled job detects "final session" and transitions **all ENDED sessions** (A, B, etc.) to `CLEANUP` simultaneously
- Single cleanup run purges greenroom for all transitioned sessions

**Cooldown timing:**

- When session reaches `ENDED`: if `postSessionChatEnabled` (default true), hold spectators connected for `postSessionChatDurationMs` (default 300000 ms / 5 min)
- During cooldown: players/DM/spectators can chat/speak; never recorded
- On cooldown expiry or DM early-end: all users disconnected; scheduled job sees all users gone → transitions `ENDED` → `CLEANUP`

**Current Codebase:**

| Component        | Location                                              | Current                                | Contract Required                               |
| ---------------- | ----------------------------------------------------- | -------------------------------------- | ----------------------------------------------- |
| **Backend Job**  | `backend/src/services/session-cleanup-job.service.ts` | ✅ `phaseEndedToCleanup()` implemented | Complete                                        |
| **Backend WS**   | `backend/src/ws/handlers/`                            | No WS event emitted by job             | N/A — all users disconnected when CLEANUP fires |
| **Redis Timers** | `backend/src/infra/redis/`                            | No Redis timers — job polls DB         | Job-based polling is the mechanism              |
| **Cleanup Task** | `backend/src/services/session-cleanup-job.service.ts` | ✅ `phaseCleanupToIdle()` implemented  | Complete                                        |

**Action Items:**

- [x] Create/enhance scheduled job: periodically query all `ENDED` sessions
- [x] For each `ENDED` session: check if all users (players, DM, spectators) have disconnected for cooldown duration
- [x] If cooldown expired: detect if this is the final session for its campaign; if yes, transition all ENDED sessions to CLEANUP; if no, transition only this session
- [x] On CLEANUP transition: run greenroom purge for each transitioned session
- [x] Test multi-session: Session A ENDED → Session B ACTIVE → Session B ENDED + all users disconnect → job transitions both A and B to CLEANUP → greenroom purged

---

### 5.2 Cleanup Job Implementation

**Contract:** Background scheduled job runs on a configurable interval (default: every 5 minutes) and handles all post-session cleanup.

**Job responsibilities:**

1. **Scan ENDED sessions** — Find all sessions with state = `ENDED` and no active cooldown window
2. **Check presence** — For each ENDED session, verify all users have been disconnected for > cooldown duration (or 0 if cooldown disabled)
3. **Detect final session** — Determine if this is the last session in the campaign: query campaign for any `ACTIVE` or `PAUSED` sessions; if none, this is final
4. **Batch transition** — If final session: transition ALL ENDED sessions for that campaign to `CLEANUP`; otherwise transition only this session
5. **Run cleanup** — For each transitioned session, purge greenroom chat (soft-delete or move to archive table)
6. **Emit events** — Broadcast `SESSION:STATE_CHANGED` with new state = `CLEANUP` to all connected clients for that session/campaign
7. **Mark ready** — After cleanup, session is ready for fresh start (can later transition back to IDLE for new session)

**Current Codebase:**

| Component           | Location                                              | Current                                                                                                      | Contract Required                                               |
| ------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| **Cleanup Job**     | `backend/src/services/session-cleanup-job.service.ts` | ✅ Both phases implemented                                                                                   | Complete                                                        |
| **Greenroom Chat**  | `backend/src/services/chat.service.ts`                | `clearRoomMessages()` exists                                                                                 | ✅ Called in `phaseEndedToCleanup()` via `purgeGreenroomChat()` |
| **Session Service** | `backend/src/services/session.service.ts`             | `updateSessionState()` exists                                                                                | ✅ Used by job to perform ENDED→CLEANUP and CLEANUP→IDLE        |
| **Presence**        | `backend/src/repositories/session.repository.ts`      | ✅ `listEndedSessionsWithCampaign()`, `campaignHasActiveSessions()`, `listEndedSessionIdsByCampaign()` added | Complete                                                        |

**Action Items:**

- [x] Create cleanup job entry point that runs on schedule (every 5 minutes by default via `config.sessionCleanup.jobIntervalMinutes`)
- [x] Implement `phaseEndedToCleanup()` — scans ENDED sessions, checks cooldown expiry, checks all users disconnected, detects final campaign session, batch transitions
- [x] Implement `getAllUsersDisconnected` equivalent — via `hasConnectedTableMembers()` (checks DM + PLAYER roles only; spectators don't block transition)
- [x] Implement `isFinalSessionForCampaign` equivalent — via `campaignHasActiveSessions()` returning false
- [x] Implement batch transition — via `listEndedSessionIdsByCampaign()` + loop through `transitionToCleanup()`
- [x] Implement greenroom purge — via `purgeGreenroomChat()` helper called in `transitionToCleanup()`
- [x] Add error handling + logging; one session failure does not block others (try/catch per session)
- [ ] Write integration test: schedule job every 5s (test config) → ENDED session after cooldown → job runs → detects, transitions, purges → verify state change in DB

---

## 6. Testing Checklist

### Unit Tests (Per Service)

- [ ] `session.service.test.ts` — All state transitions, timer logic
- [x] `room.service` integration coverage — previousGroupId tracking
- [x] `session-disconnect-cascade.service.test.ts` — Ghost-mode timers, disconnect cascade
- [ ] `audio.service.test.ts` — Voice modes, mute enforcement
- [ ] `chat.service.test.ts` — Boundary markers, off-the-record flagging

### Integration Tests (End-to-End)

- [x] Disconnect cascade: player/DM intentional → network → reconnect scenarios (focused backend coverage)
- [ ] Session boundary markers: [Session Started] → [Session Paused] → [Session Resumed] → [Session Ended] persisted and appear in history
- [ ] Whisper content not persisted: create private room → chat → refresh → no whisper chat in history
- [ ] Pause content not persisted: pause → chat during pause → resume → no pause chat in history
- [x] Group deletion: delete group with members → members auto-move to MAIN → no orphaned members (covered by rooms-failback integration, including ROOM:USER_LEFT/JOINED ordering before ROOM:DELETED)
- [ ] Spectator cooldown: end session → spectators in cooldown window → can chat/speak → after TTL → spectators forced disconnect

### Frontend Tests

- [x] Ghost-mode store hydration and player-card rendering inputs
- [ ] Boundary markers rendered in chat timeline
- [ ] Reconnect: local Zustand cache replaced with backend snapshot (no merge)
- [ ] DM voice mode selector (TARGET_GROUP / BROADCAST) + background volume slider

---

## 7. Implementation Phasing

### Phase 1: Session Lifecycle & Cleanup Job (W0 planning → S1)

- Ensure IDLE, ACTIVE, PAUSED, ENDED, CLEANUP states in Prisma (canonical is IDLE, not INACTIVE)
- Implement scheduled cleanup job: periodic scan + ENDED→CLEANUP detection
- Implement multi-session campaign batch transition logic
- Implement greenroom chat archival on CLEANUP

### Phase 2: Presence & Ghost-mode (S1 → S2)

- Implement 5s ghost-mode entry timer
- Implement 60s TTL for player removal
- Add `PRESENCE:USER_GHOST_MODE_CHANGED` event
- Update frontend presenceSlice to sync ghost-mode

### Phase 3: Audio Routing (S2 → S3)

- Implement DM voiceMode (TARGET_GROUP + BROADCAST)
- Implement backgroundVolume persistence
- Update LiveKit token generation for voice modes
- Create DM audio routing UI

### Phase 4: Group Management & Off-the-Record (S3 → S4)

- Add previousGroupId tracking
- Implement group deletion with member migration
- Implement boundary marker creation (backend-authoritative)
- Implement off-the-record flagging for Whisper + Pause

### Phase 5: Spectator Cooldown & Finalization (S4 → S5)

- [x] Post-session cooldown window backend (`endSessionCooldown`, `extendSessionCooldown`, `POST cooldown/end`, `POST cooldown/extend`)
- [x] `SESSION:COOLDOWN_ENDED` shared event type + frontend handler + WS dispatcher registration
- [x] `SpectatorWaitScreen.tsx` — intermission + cooldown countdown + ended fallback
- [x] `handleCancelCooldown` fixed to call `cooldown/end` endpoint (was calling IDLE state transition directly)
- [ ] Comprehensive integration testing (see § 6)
- [ ] Recording shutdown dispatch on ENDED transition

---

## 8. Codebase Entry Points

### Quick Reference for Developers

| Feature                   | Key Files                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Session state transitions | `backend/src/api/session.routes.ts`, `backend/src/services/session.service.ts`, `frontend/src/state/sessionSlice.ts`            |
| Presence & ghost-mode     | `backend/src/infra/redis/presence.ts`, `backend/src/ws/handlers/presence.ts`, `frontend/src/state/presenceSlice.ts`             |
| Room management           | `backend/src/services/room.service.ts`, `backend/src/api/room.routes.ts`, `frontend/src/state/roomSlice.ts`                     |
| Audio routing             | `backend/src/services/livekit.service.ts`, `frontend/src/state/audioSlice.ts`, `frontend/src/components/session/AudioPanel.tsx` |
| Chat & boundaries         | `backend/src/services/chat.service.ts`, `backend/src/api/chat.routes.ts`, `frontend/src/state/chatSlice.ts`                     |
| Timers & cleanup          | `backend/src/jobs/`, `backend/src/infra/redis/`, `backend/src/services/session.service.ts`                                      |

---

## 9. Risk & Mitigation

| Risk                                                     | Mitigation                                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| State inconsistency across layers (Zustand, Redis, DB)   | Follow strict rule: backend authoritative, frontend snapshot replaces on reconnect, WS events drive updates  |
| ENDED→CLEANUP transition misses some ENDED sessions      | Scheduled job queries DB directly; ensures comprehensive scan; test with seeded DB records                   |
| Multi-session batch transition triggers on wrong session | Implement `isFinalSessionForCampaign()` logic; query for ACTIVE/PAUSED siblings; test multi-session scenario |
| Losing greenroom chat during archival                    | Soft-delete (add `archivedAt` column) rather than hard delete; allow DM audit recovery if needed             |
| Cleanup job and manual state change race                 | Implement row-level DB locking or transaction for state update; idempotent checks                            |
| Cooldown timer expires mid-job execution                 | Cooldown duration stored in `session.cooldownEndsAt`; job reads this, not local timer state                  |

---

## 10. References

- [STATE-MACHINE.md](STATE-MACHINE.md) — Canonical contract
- [CONTRACTS.md](../CONTRACTS.md) — Event & permission contracts
- [SESSION-LIFECYCLE.md](../architecture/SESSION-LIFECYCLE.md) — Session state semantics
- [PRESENCE-STATE-MACHINE.md](../subsystems/PRESENCE-STATE-MACHINE.md) — Presence model (legacy; see STATE-MACHINE.md § 3 for updates)

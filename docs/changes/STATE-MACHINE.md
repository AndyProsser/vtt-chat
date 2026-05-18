# VTT-chat state machine contract (for Copilot)

This document defines **where state lives**, **who is authoritative**, and **which transitions are allowed**. Code must not invent new states or bypass these rules.

**Status:** Design & Lock phase (W0 sub-stage). This contract freezes before Stage 1 implementation.

---

## 0. State Naming Clarification

**Canonical contract names:** `IDLE`, `ACTIVE`, `PAUSED`, `COOLDOWN`, `ENDED`, `CLEANUP`

**Codebase current names:** `IDLE`, `ACTIVE`, `PAUSED`, `COOLDOWN`, `ENDED`, `CLEANUP`

**Mapping:**

| Contract   | Codebase   | Meaning                                                                                 |
| ---------- | ---------- | --------------------------------------------------------------------------------------- |
| `IDLE`     | `IDLE`     | Session exists but not running; green room mode.                                        |
| `ACTIVE`   | `ACTIVE`   | Session running; players/DM in `MAIN` with effects active.                              |
| `PAUSED`   | `PAUSED`   | Session suspended; players in `MAIN`, no session effects, off-the-record runtime.       |
| `COOLDOWN` | `COOLDOWN` | Post-session spectator window / cooldown period before the session becomes fully ended. |
| `ENDED`    | `ENDED`    | Session has stopped; cooldown is complete and close-out work is triggered.              |
| `CLEANUP`  | `CLEANUP`  | Post-session: no users connected, 20min greenroom purge timer running.                  |

**Implementation rule:** Keep `IDLE` as the canonical greenroom state, keep `ENDED` as the explicit stop/processing phase, and transition to `IDLE` only after the backend has triggered recording shutdown and summary/close-out work. The backend must not block on those jobs completing. If the DM disables post-session spectator chat, `ENDED` may be a very short-lived trigger state that only dispatches the required work before moving on.

---

## 1. State layers and sources of truth

### 1.1 Realtime state (backend authoritative)

**Scope:** Shared, multi-user, session-scoped.
**Source of truth:** Backend (Redis + DB snapshots).
**Frontend access:** WebSocket → Zustand store (single source of truth).
**On reconnect:** Frontend replaces local cached state with backend snapshot (optimistic frontend means frontend holds _intent_ during session, but trusts backend on reconnect).

**Examples:**

- **Session:**
  - `session.state ∈ { IDLE, ACTIVE, PAUSED, ENDED, CLEANUP }`
  - `session.hasEnded: boolean` (optional helper)
  - `session.inactiveAnchorAt: ISO8601 | null` (first DM/player greenroom join for next-session readiness timer)
  - `session.startedAt: ISO8601 | null` (active timer anchor)
  - `session.endedAt: ISO8601 | null` (end/cooldown anchor)
  - `session.pauseCount: number`
  - `session.totalPausedMs: number`
  - `session.currentPauseStartedAt: ISO8601 | null`
  - `session.cooldownDurationMs: number` (default 60000, configurable 1-60 minutes)
  - `session.cooldownEndsAt: ISO8601 | null`
  - On session `ACTIVE` → `PAUSED` or `ENDED`: per-session audio effects/conditions persisted in backend snapshot for restore on resume or cleanup.
- **Users (players, DM, spectators):**
  - `user.role ∈ { DM, PLAYER, SPECTATOR }`
  - `user.presence ∈ { CONNECTED, DISCONNECTED }`
  - `user.ghost: boolean` (ghost-mode = `CONNECTED && ghost === true`)
  - `user.groupId: GroupId | "GREEN_ROOM" | "MAIN" | other`
  - `user.previousGroupId: GroupId | null` (never counts GREEN_ROOM)
- **Groups:**
  - `group.id`
  - `group.type ∈ { GREEN_ROOM, MAIN, PRIVATE, OTHER }`
  - `group.environment: EnvironmentId`
  - `group.conditions: ConditionId[]` (group-level effects)
- **Per-user conditions & audio:**
  - `user.conditions: ConditionId[]` (player-specific)
  - `user.distanceProfile` (for positional audio)
- **DM audio routing:**
  - `dm.voiceMode ∈ { TARGET_GROUP, BROADCAST }`
  - `dm.voiceTargetGroupId: GroupId | null` (ignored in BROADCAST)
  - `dm.backgroundVolume: number` (0–1, default 0.2; persisted per DM)
- **Mute state:**
  - `user.mutedBySelf: boolean`
  - `user.mutedByDM: boolean`
  - **Effective mute:** `mutedBySelf || mutedByDM`

**Rules:**

- All shared state changes must go:
  **component → action → Zustand → WS → backend → broadcast → Zustand**.
- Backend resolves conflicts and enforces timers.

---

### 1.2 Local component state

**Scope:** UI-only, per-component, per-tab.
**Examples:** popper open, panel visibility, selected tab, hover, local filters.
**Rules:** Never persisted, never sent over WS, never stored in Redis/DB.

---

### 1.3 Device state (localStorage)

**Scope:** Per-browser, per-device UX preferences.
**Examples:** audio panel settings (auto input, mic sensitivity, noise filtering, etc.).
**Rules:**

- Persisted in `localStorage`.
- Not synced across devices.
- Re-applied on load before joining audio.

---

### 1.4 User-level persistent settings (backend)

**Scope:** Account-level, cross-device.
**Examples:** theme, profile, character details, DM background volume preference.
**Rules:**

- Stored in DB.
- **Theme:**
  - If user has never set a theme → follow system.
  - Once set, use stored theme across devices.

---

## 2. Session state machine

### 2.1 Canonical session states

- `IDLE`
- `ACTIVE`
- `PAUSED`
- `COOLDOWN`
- `ENDED`
- `CLEANUP`

**Green room:**

- Green room is **not** a separate session state.
- Green room is a calculated runtime state: `session.state !== ACTIVE && session.state !== PAUSED && session.state !== COOLDOWN`.
- In practice, green room mode applies to `IDLE`, `ENDED`, and `CLEANUP` while users are in `GREEN_ROOM` group.

### 2.2 Allowed transitions

- `IDLE → ACTIVE`
  - Trigger: DM starts session.
  - Effects:
    - All players + DM move to `MAIN` group.
    - Audio presets reset to default.
- `ACTIVE → PAUSED`
  - Trigger: DM disconnects (intentional or network) or DM explicitly pauses.
- `PAUSED → ACTIVE`
  - Trigger: DM resumes session (only DM).
- `ACTIVE → COOLDOWN`
  - Trigger: DM stops session from a live session.
  - Semantics:
    - Session enters spectator cooldown / cooldown chat window if enabled.
- `PAUSED → COOLDOWN`
  - Trigger: DM stops session while paused.
- `COOLDOWN → ENDED`
  - Trigger: Cooldown expires or DM ends cooldown early.
  - Semantics:
    - Session runtime ends; close-out work begins.
- `ENDED → CLEANUP`
  - Trigger: All players & DM disconnected and remain disconnected for 20min.
  - Backend action: Start 20min TTL timer in Redis.
  - Visibility: Backend-only state (clients never see or care about `CLEANUP` state).
  - Effects: Green room chat and per-session ephemeral state queued for purge after TTL.
- `CLEANUP → IDLE`
  - Trigger: Any player/DM reconnects before cleanup TTL expires.
  - Backend action: Cancel TTL; restore session to `IDLE`; DM can start new session.
- `CLEANUP → (terminal cleanup)`
  - Trigger: Cleanup TTL expires (20min after last disconnect).
  - Backend action: Purge green room chat; reset session for fresh start.
  - Visibility: No WS event needed; cleanup is silent.

### 2.3 Invalid transition behavior

- Invalid transitions are rejected at the API layer.
- Current shipped backend behavior returns HTTP `409 Conflict` for `INVALID_STATE_TRANSITION` errors.
- Error payloads must remain descriptive and include the current and requested states.
- Frontend controls should still be disabled ahead of time when the current session state makes the action invalid.

---

## 3. Presence, disconnects, and ghost-mode

### 3.1 Presence model

Per user (PLAYER/DM/SPECTATOR):

- `presence ∈ { CONNECTED, DISCONNECTED }`
- `ghost: boolean` (derived ghost-mode flag)

**Ghost-mode definition:**

- Ghost-mode is **visual**: `presence === CONNECTED && ghost === true`.
- **Storage:** `ghost` flag is authoritative in Redis presence hash; frontend Zustand caches it via WS event `PRESENCE:USER_GHOST_MODE_CHANGED`.
- **Frontend local behavior:** When frontend detects own connection loss, optimistically set local ghost-mode; on reconnect, accept backend's ghost-mode truth.
- **Backend enforcement:** Ghost-mode entry and exit are managed by backend timers (5s entry, 60s TTL, etc.). Timers are not frontend-observable; frontend reacts to state changes via WS events only.

### 3.2 Spectator rules

- `presence: CONNECTED | DISCONNECTED` only.
- Intentional or network disconnect:
  - Session membership dropped.
  - They can rejoin (spectator limits apply).
- Spectators do not count toward player/DM cleanup timers.
- Spectators may join only after at least one DM/player has established the campaign as active for a playable cycle (not cold-empty `IDLE`).
- On session `IDLE`, `PAUSED`, or `CLEANUP`:
  - Spectators see a **wait screen**.
- During `ENDED` cooldown:
  - Spectators can participate only while cooldown is running.
  - On cooldown expiry/cancel, spectators are disconnected and returned to waiting flow.
- Audio steering and device settings:
  - Local-only, reset on refresh or disconnect.

### 3.3 Player rules

**Intentional disconnect:**

- Immediately mark `presence = DISCONNECTED`.
- Player card:
  - Enter ghost-mode for **5 seconds** (backend timer).
  - After 5s, remove player from session.
- If their group closes during 5s or session ends:
  - Apply normal group rules (move to `MAIN` or `GREEN_ROOM` as appropriate).

**Network disconnect:**

- On WS health failure:
  - Start 5s timer:
    - After 5s, set `ghost = true` (ghost-mode).
  - Start 60s TTL timer:
    - If player does **not** reconnect within 60s:
      - Remove player from session.
- Rejoin behavior:
  - If reconnect **before 60s**:
    - Restore previous session state (group, conditions, distance profile, etc.).
  - If reconnect **after 60s**:
    - Treat as late join; normal join flow.
- Group movement rules remain the same.

### 3.4 DM rules

**Intentional disconnect:**

- Immediately:
  - `presence = DISCONNECTED`
  - `session.state = PAUSED`
- Grant all connected players the ability to **STOP** session.
  - Players **cannot UNPAUSE**.

**Network disconnect:**

- On WS health failure:
  - After 5s:
    - `ghost = true`
    - `session.state = PAUSED`
  - After 60s:
    - If DM not reconnected:
      - Grant players ability to **STOP** session.
- Rejoin:
  - If DM rejoins before players stop session:
    - DM can **RESUME** session (even after 60s).

### 3.5 Everyone leaves

**All players & DM leave by intent, session not stopped:**

- Start 60s timer:
  - During 60s:
    - Everyone is effectively in ghost-mode (for quick reconnect).
    - `session.state = ACTIVE` (or `PAUSED`) — unchanged.
  - After 60s:
    - If **still no one connected**:
      - `session.state = ENDED` (session auto-stopped and close-out triggered).
      - Initiate session end-of-session processes (recording finalization, etc.).
    - If **anyone reconnected during 60s**:
      - Resume normal session behavior (no state change).
- From green room-calculated states (`IDLE`, `ENDED`, `CLEANUP`):
  - If everyone disconnected:
    - Start 20min timer.
    - During 20min:
      - Transition to `CLEANUP` state.
      - Green room chat and ephemeral state queued for purge.
    - If anyone reconnects before 20min:
      - Cancel `CLEANUP` timer; revert to `IDLE`.
      - DM can now start a new session or resume.
    - After 20min:
      - Terminal cleanup: green room chat purged, session state reset (client sees join as new session).

**Network / browser-close for everyone:**

- Same timers and behavior as intentional disconnect.

---

## 4. Group, environment, and audio rules

### 4.1 Group semantics

- **Group types:**
  - `GREEN_ROOM`
  - `MAIN`
  - `PRIVATE`
  - `OTHER`
- **Green room mode:**
  - When `session.state !== ACTIVE && session.state !== PAUSED`:
    - All players + DM **must** be in `GREEN_ROOM`.
    - No effects, no conditions.
- **Session active:**
  - On `IDLE → ACTIVE`:
    - Everyone moves to `MAIN`.
    - Audio presets reset to default.

### 4.2 Group movement

- DM can move players between groups.
- **Private group:**
  - DM's `voiceMode = TARGET_GROUP` and `voiceTargetGroupId = PRIVATE_GROUP_ID`.
  - While DM is in private group:
    - DM's voice is targeted to that group.
  - On DM exit from private group:
    - Player returns to `previousGroupId` with all player-specific conditions reapplied.
    - If `previousGroupId` no longer exists:
      - Player **must** return to `MAIN`.
- **Group closure:**
  - If a group (type `OTHER`) is deleted with players in it:
    - Backend moves all members to `MAIN` as a coordinated batch.
    - Broadcast `ROOM:USER_LEFT` + `ROOM:USER_JOINED` events for each player.
    - Deleted group's environment/conditions are dropped; players inherit `MAIN` environment and any remaining player-specific conditions.
    - **Silent backend reconciliation** (not announced as "you were moved").
- **Previous group tracking:**
  - `previousGroupId` is **one level only** (last non-green-room group).
  - When in `GREEN_ROOM`, `previousGroupId = null`.
  - Storage: Authoritative in Redis user presence hash; frontend caches via WS event `PRESENCE:USER_GROUP_CHANGED`.

### 4.3 Environment and conditions

- **Environment:** defined per group.
  - `group.environment` applies to all members.
- **Conditions:**
  - Group-level conditions: `group.conditions`.
  - Player-specific conditions: `user.conditions`.
- On group change:
  - Apply new group environment + group conditions.
  - Reapply player-specific conditions as needed.

### 4.4 DM audio routing

- **Modes:**
  - `voiceMode ∈ { TARGET_GROUP, BROADCAST }`
- **TARGET_GROUP mode:**
  - DM speaks at **100%** to `voiceTargetGroupId`.
  - All other groups are heard at `backgroundVolume` (default 20%, configurable, persisted).
- **BROADCAST mode:**
  - DM speaks at **100%** to **all groups**.
  - Background from all groups is also at **100%** for DM.
  - Players remain isolated by group (they do not hear other groups).
- **Spectators:**
  - Their listening group selection is local-only and reset on refresh/disconnect.

### 4.5 Mute rules

- `mutedBySelf` and `mutedByDM` are independent flags.
- **Effective mute:** `mutedBySelf || mutedByDM`.
- **Enforcement (defense-in-depth):**
  - **Client-side:** UI disables local send; audio device muted; Zustand reflects effective mute state.
  - **Server-side:** Backend validates effective mute before accepting audio packets from LiveKit token claims or presence checks. If effective mute detected, packet rejected with no-op (player hears nothing from self).
- **DM capabilities:**
  - DM can set/unset `mutedByDM` for any player.
  - DM **cannot** clear `mutedBySelf`.
- **Player capabilities:**
  - Player can toggle `mutedBySelf`.
  - Player can clear `mutedByDM` (unmute themselves from DM mute).
  - If player uses PTT:
    - Mute flags still apply; PTT does nothing while effectively muted.

---

## 5. Session boundary markers and off-the-record rules

### 5.1 Boundary marker authority

**Canonical boundary markers** (system chat messages):

- `[Session Started]`
- `[Session Paused]`
- `[Session Resumed]`
- `[Session Ended]`

**Authority:** Backend (alone).

- Backend creates markers as `SYSTEM` chat messages when session state transitions occur.
- Backend persists markers to DB immediately.
- Backend broadcasts marker via WS event `CHAT:MESSAGE_SENT`.
- Frontend receives broadcast and renders marker in chat timeline.
- **Frontend must not create its own markers** (eliminates duplicate-on-refresh risk).
- On page refresh/reconnect, markers are hydrated from chat history API; no client-side re-creation.

### 5.2 Off-the-record (non-persisted) content

**Scope:** Whisper (`PRIVATE` room) and Pause (`PAUSED` state) runtime content.

**Rules:**

- **Whisper content:**
  - Chat/voice during whisper: never persisted, never logged, never included in session transcript.
  - Whisper room membership (who was in whisper) may be logged for audit; content is not.
- **Pause/Resume runtime content:**
  - Chat/voice during pause: never persisted, never logged, never included in session transcript.
  - Runtime content during pause is considered off-the-record (administrative intermission).
  - Boundary markers (`[Session Paused]`, `[Session Resumed]`) **are** persisted and visible in transcripts as control points.
- **Recording contract (if runtime recording added):**
  - Whisper: never capture audio/video.
  - Pause: never capture audio/video during pause window.
  - Only capture active (`ACTIVE` state) session content.
  - Boundary markers inserted as session-level events in transcript pipeline (not dropped).

### 5.3 Post-Session Chat & Processing Window

**Trigger:** Session transitions to `ENDED`.

**Behavior:**

- `ENDED` is the post-stop processing phase.
  - Recording stops.
  - Summary and close-out processing begins.
  - A new session cannot be started until the session leaves `ENDED` and becomes `IDLE`.
- **Post-session spectator chat:** DM-controlled and optional.
  - Default: enabled with a 1 minute window.
  - Minimum: 1 minute.
  - Maximum: 60 minutes.
  - UI control: duration selector + disable toggle.
  - DM can extend the timer while the window is active.
  - Extension semantics: add one additional block equal to configured cooldown duration.
  - DM can end it early.
  - If DM disconnects during cooldown, connected players gain extend/cancel controls.
- **When disabled:**
  - `ENDED` still triggers stop-recording and summary-processing work.
  - No wait-for-chat behavior is required; the phase may advance to `IDLE` as soon as the required tasks are triggered.
  - This is a processing trigger, not a blocking wait state.
- **During enabled window:**
  - Spectators can interact with players and DM according to campaign policy.
  - The interaction is off-the-record and is not persisted in session history.
  - Once the window ends or is canceled, spectators are disconnected and the session transitions to `IDLE`.
- **Storage:** Per-campaign setting in Prisma, for example `Campaign.postSessionChatEnabled` and `Campaign.postSessionChatDurationMs` (default `60000` ms).

### 5.4 Topbar timer and timer-popper contract

The topbar timer always represents elapsed/remaining time for the current lifecycle state.

- `IDLE`: show elapsed time since first DM/player joined greenroom membership for next-session readiness; no popper.
- `ACTIVE`: reset to `00:00` at start and show active elapsed time.
- `PAUSED`: topbar primary timer shows paused elapsed duration in paused color; active elapsed continues in background.
- `ENDED`: topbar timer shows cooldown countdown to zero.

Timer popper behavior:

- Available in `ACTIVE`, `PAUSED`, and `ENDED` only.
- Live-updating values while open.
- Shows: state, start timestamp, cumulative paused duration, pause count, expected end timestamp, time left, and (in `ENDED`) end timestamp plus cooldown remaining.
- Expected end timestamp is computed from session duration source (`session override` else campaign default) and then rounded to nearest 15 minutes.

Consistency and recovery:

- Timer anchors and timestamps are backend-authoritative.
- All clients derive display from shared anchors, so timers are synchronized across users.
- On refresh/reconnect, client must rehydrate timer anchors from backend snapshot before rendering local timer state.

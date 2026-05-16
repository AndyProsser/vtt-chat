# Session Lifecycle

The Session Lifecycle defines how a tabletop session moves through its various states, how transitions occur, and which actors have authority over those transitions.
It is the authoritative reference for:

- Session state management
- DM controls
- Player visibility
- Event sequencing
- State recovery
- UI behaviour

The lifecycle is intentionally simple, predictable, and resilient to reconnection or transport failures.

---

## 1. Core Principles

### **1.1 Sessions are state machines**

A session always exists in exactly one state.

### **1.2 Only the DM can change session state**

Players and spectators cannot start, pause, resume, or end sessions.

### **1.3 State transitions are event‑driven**

All transitions occur through events such as:

- `session.start`
- `session.pause`
- `session.resume`
- `session.end`

### **1.4 State is recoverable**

Clients can reconnect at any time and reconstruct the current session state.

### **1.5 State is visible to all**

All participants can see the current session state, regardless of role.

---

## 2. Session States

The session state machine consists of four primary states.

```mermaid
stateDiagram-v2
    [*] --> idle

    idle --> active: session.start
    active --> paused: session.pause
    paused --> active: session.resume
    active --> ended: session.end
    paused --> ended: session.end

  ended --> cleanup: cooldown expired + cleanup
  cleanup --> [*]
```

### **2.1 inactive (idle in current codebase)**

The table is in greenroom mode and no live session is running.

- `IDLE` is reusable only for a never-started draft session.
- If a session has previously reached `ENDED`, it is no longer eligible to return to active use.

- The INACTIVE timer starts at `00:00` when the first DM/player joins greenroom membership.
- This timer represents readiness time for the next session, not time since the previous session ended.
- No timer popper is shown in this state.
- Players may chat.
- Notes may be created.
- Audio may be triggered.

---

### **2.2 active**

A session is currently running.

- On `INACTIVE -> ACTIVE`, the active session timer resets to `00:00`.
- On `INACTIVE -> ACTIVE` for a new session, chat starts clean: no prior session chat and no prior Greenroom chat are carried into the new live session timeline.
- Active elapsed time is backend-authoritative and shared across all clients.
- Active elapsed time must survive disconnects and page refreshes.
- Presence indicators are active.
- Audio effects may be synchronized.
- Session‑specific UI is enabled.
- DM tools are fully available.

---

### **2.3 paused**

The session is temporarily halted.

- The topbar primary timer switches to paused elapsed duration and uses a paused-specific color.
- Active elapsed timer continues in the background and remains visible in the timer popper.
- Pause totals are cumulative (`totalPausedDuration` + `pauseCount`).
- Presence indicators remain active.
- UI displays a paused banner.
- Players cannot trigger session‑critical actions.
- Pause runtime content defaults to off-the-record (no persisted pause chat/voice transcript).
- DM can toggle pause-runtime chat persistence at campaign level.
  - Default: ephemeral-only runtime content during `PAUSED`.
  - Optional override: persist pause-runtime chat to session history.
  - Voice/transcript recording rules remain governed by recording policy.

The pause reason is **DM‑private**.

---

### **2.4 ended**

The live session has concluded and cooldown is active.

- Topbar timer becomes a cooldown countdown (`remainingCooldown -> 00:00`).
- Default cooldown is 1 minute; configurable range is 1 to 60 minutes.
- Timer popper remains available and shows details from the just-closed session.
- DM can extend cooldown (adds one more configured cooldown block) or cancel it early.
- Cooldown extension limits:
  - maximum of 3 extensions per ended session.
  - each extension adds exactly one configured cooldown block.
  - no absolute max cooldown duration cap beyond the extension-count limit.
- If DM disconnects during cooldown, connected players gain extend/cancel control.
- While cooldown is active, connected spectators are temporarily elevated into post-session interaction mode:
  - they can speak/chat with the table,
  - they are rendered in the greenroom participant list with a `SPECTATOR` pill,
  - DM mute/unmute controls apply to them in that window.
- When cooldown reaches zero, spectator post-session interaction mode ends:
  - spectators are hidden from the greenroom participant list,
  - spectator voice input is disabled for post-session interaction,
  - the timer state label remains `ENDED` and the ended-state timer continues counting from cooldown expiry.
- DM cannot start a new session while cooldown is active.
- New session start is unblocked only after cooldown reaches zero or is explicitly ended early.
- Once a session reaches `ENDED`, it is archive-locked and can never be restarted.
- The next start after an ended session must create a new session.

---

### **2.5 cleanup**

The session is archived and no longer reusable.

- Cleanup purges remaining session-scoped runtime context such as Greenroom chat.
- Cleanup is terminal for that session record.
- Starting again after cleanup always creates a new session record.

---

## 3. Session Events

All session transitions are triggered by events.

| Event            | Description                                                   | Actor |
| ---------------- | ------------------------------------------------------------- | ----- |
| `session.start`  | Begin a new session or activate a never-started draft session | DM    |
| `session.pause`  | Pause the running session                                     | DM    |
| `session.resume` | Resume a paused session                                       | DM    |
| `session.end`    | End the session                                               | DM    |

Events are validated by:

- Role permissions
- Current session state
- Payload schema

Invalid transitions are rejected.

---

## 4. Event Flow

```mermaid
sequenceDiagram
    participant DM
    participant UI
    participant Reducer
    participant Store
    participant Server
    participant Broadcast

    DM->>UI: Click "Start Session"
    UI->>Reducer: Dispatch session.start
    Reducer->>Store: Update local state
    Reducer->>Server: Send event
    Server->>Broadcast: Broadcast to all clients
    Broadcast->>Reducer: Apply event to all clients
    Reducer->>Store: Update state
    Store->>UI: UI updates
```

Key points:

- Local state updates immediately for responsiveness
- Server broadcast ensures global consistency
- Reducers guarantee deterministic transitions

---

## 5. UI Behaviour by State

### **inactive**

- “Start Session” button visible to DM.
- Topbar timer visible and counting elapsed time since first DM/player joined greenroom membership.
- Timer popper is hidden/disabled in this state.
- Session controls are otherwise idle.

### **active**

- Topbar timer shows active elapsed session time.
- Timer popper is available and live-updating while open.
- DM tools enabled.
- Player UI fully interactive.

### **paused**

- Paused banner visible.
- Topbar primary timer switches to paused elapsed time (distinct paused color).
- Active elapsed timer continues and is visible in popper details.
- Player actions restricted.

### **ended**

- Topbar timer shows cooldown countdown, then transitions into elapsed-ended timing while remaining in `ENDED`.
- Timer popper remains available and shows final session timing summary (start, end, pause totals).
- DM can extend/cancel cooldown; players can extend/cancel only if DM disconnects.
- Starting a new session is disabled while cooldown is active.
- Cooldown completion ends spectator post-session interaction visibility; cancellation transitions to `INACTIVE`.

---

## 5.3 Lifecycle Notifications

- Do not show success popups for session lifecycle transitions (`start`, `pause`, `resume`, `end`).
- Lifecycle state changes are communicated via chat bookends and persistent in-surface visual state.
- Error and warning toasts remain enabled for failed actions, degraded sync, and recovery prompts.

---

## 5.2 Cleanup Scheduling

`CLEANUP` is now a deferred maintenance state and is no longer driven by an in-memory per-session server timeout.

- Trigger condition:
  - when the last table participant (DM/player) disconnects, the session is marked `CLEANUP`.
- Cleanup executor:
  - a scheduled cleanup job runs every configurable interval (default: 5 minutes).
- Eligibility rule:
  - only sessions that have remained in `CLEANUP` for at least a configurable minimum age are processed (default: 20 minutes).
- Processing result:
  - cleanup job purges greenroom runtime context and transitions the session to `INACTIVE` (`IDLE` in persisted state).

Configuration:

- `SESSION_CLEANUP_JOB_INTERVAL_MINUTES` (default `5`)
- `SESSION_CLEANUP_MIN_AGE_MINUTES` (default `20`)

### **5.1 Timer popper contract**

The timer popper is available in `ACTIVE`, `PAUSED`, and `ENDED`, and disabled in `INACTIVE`.

When open, values update live and include:

- Session state (`ACTIVE | PAUSED | ENDED | INACTIVE`).
- Session start timestamp.
- Cumulative paused duration (if greater than zero).
- Pause count.
- Expected end time, computed from session duration source (`session override` if present, else campaign default) and then rounded to nearest 15 minutes.
- Time left in session relative to expected end.
- For `ENDED`, include session end timestamp and cooldown remaining.

Authority rules:

- Backend is authoritative for timer anchors and state timestamps.
- Clients render synchronized timers from server-provided anchors so all users see the same values.
- Refresh/reconnect must restore timer state from backend snapshot before trusting local cache.

---

## 6. Presence & Session Interaction

Presence is independent of session state.

Examples:

- A player can be “typing” while the session is paused
- A player can disconnect during an active session
- The DM can override presence regardless of session state

Session state does not override presence; they coexist.

---

## 7. State Recovery

When a client reconnects:

1. The server sends the current session state
2. The client hydrates its Zustand stores
3. Reducers apply any missed events
4. UI renders the correct session state

### **7.1 Recovery trigger points**

Recovery runs when either of these conditions occurs:

- The user launches/enters an active campaign session
- WebSocket connection transitions back to `connected` after reconnecting

### **7.2 Client recovery request set**

The client recovery loader requests three snapshots in parallel:

1. `GET /api/rooms/session/:sessionId`
2. `GET /api/presence/:sessionId`
3. `GET /api/audio/sessions/:sessionId/state`

Then it triggers a non-blocking snapshot reconciliation request:

4. `POST /api/presence/:sessionId/recover` (fire-and-forget)

### **7.3 Hydration mapping**

Recovery updates stores with a strict ownership split:

- Rooms + presence hydrate atomically via a single topology replace operation
- Audio environment preset hydrates from `audio.state.environment`
- DM overrides hydrate via bulk replacement from `audio.state.dmOverrides`
- Broadcast/voice-of-god state hydrates from `audio.state.broadcast` (or fallback `voiceOfGod`)

### **7.4 Recovery consistency model**

- Snapshot APIs provide initial recovery baseline
- WebSocket events remain authoritative for ongoing state evolution
- Presence recover endpoint is best-effort and must not block UI rendering
- Failed recovery requests degrade gracefully; realtime updates continue

### **7.5 Sequence reference**

```mermaid
sequenceDiagram
    participant Client as SessionInit
    participant API as REST API
    participant Store as Zustand Store
    participant WS as WebSocket Stream

    Client->>API: GET rooms/session/:sessionId
    Client->>API: GET presence/:sessionId
    Client->>API: GET audio/sessions/:sessionId/state
    API-->>Client: rooms + presence + audio snapshots

    Client->>Store: replaceSessionTopology(rooms, presence)
    Client->>Store: setEnvironment(environment)
    Client->>Store: replaceDMOverrides(dmOverrides)
    Client->>Store: setBroadcastState(broadcast)

    Client-->>API: POST presence/:sessionId/recover (non-blocking)
    WS-->>Client: authoritative realtime events
    Client->>Store: apply incremental updates
```

This ensures:

- No desynchronization
- No stale UI
- No lost session context

### **7.6 Boundary marker persistence contract**

Boundary markers are server-authoritative and must survive refresh/reconnect.

- Persist and broadcast these system markers on transition:
  - `[Session Started]`
  - `[Session Paused]`
  - `[Session Resumed]`
  - `[Session Ended]`
- Clients must rehydrate these markers from chat history APIs.
- Clients must de-duplicate markers when local fallback and WS/server markers overlap.
- For paused-session refresh, client must rehydrate paused state + paused boundary markers from backend before trusting local cache.
- Boundary markers are `SYSTEM` chat messages and may surface in both active and greenroom chat views.

### **7.7 Recording/privacy contract for paused + whisper**

- Whisper (`PRIVATE`) is off-the-record by definition (no persisted chat/voice recording artifacts).
- Paused intermission is also off-the-record for runtime content.
- The only persistent pause-related artifacts are boundary markers listed above.

Transcript/summary processing contract:

- Keep persisted boundary markers in transcript and summary pre-processing.
- Treat markers as timeline guides for include/exclude windowing (for example, excluding off-the-record ranges while preserving timing context).

---

## 8. Error Handling

Invalid transitions produce:

- A system error event
- A non‑blocking UI notification (DM only)
- No state change

Examples:

- Attempting to pause an idle session
- Attempting to resume an active session
- Attempting to start a session when one is already active

---

## 9. Extension Behaviour

The extension respects session state:

- Overlays may change behaviour when paused
- VTT actions may be disabled during pause
- Session start/end may trigger overlay animations

The extension **cannot** change session state.

---

## 10. Planned Extensions

Planned enhancements:

- Session timeline
- Session playback
- Session metadata (title, theme, tags)
- Multi‑session campaigns
- Session analytics

---

## 11. Summary

The Session Lifecycle ensures:

- Predictable state transitions
- Clear DM authority
- Consistent UI behaviour
- Reliable reconnection
- Deterministic event flow

It is a core architectural pillar of the platform.

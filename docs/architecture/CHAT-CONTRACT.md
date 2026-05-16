# Chat Contract

Status:

- This is the canonical implementation contract for live-session chat.
- When older chat docs disagree, this document wins.
- Scope for this pass: live session chat, live typing indicators, boundary markers, and room-memory visibility.

---

## 1. Product Model

VTT-Chat live chat must feel spatial in the moment and persistent in memory.

- A user may speak and send room-scoped chat only in their current room.
- A player keeps seeing messages they were allowed to see at the time of send, even after moving rooms.
- The DM sees all live-session chat.
- Spectators are session-scoped only and have no campaign-history access.
- Whisper Bubble runtime content is off-the-record by default.
- Greenroom chat is always ephemeral.

This is the governing rule for the live timeline:

> The live chat stream is a unified chronological timeline of everything the current user has experienced in the active session.

That means players do not lose earlier Group A messages when they move to Group B. The user remembers what they witnessed.

Session reset rule:

- A newly started session always begins with a clean live chat timeline.
- No prior session chat messages are carried into the new session timeline.
- No prior-session Greenroom chat is carried into the new session timeline.

---

## 2. Message Classes

Live-session chat uses the canonical message types from shared types:

- `IC`
- `OOC`
- `WHISPER`
- `SYSTEM`

Context is not encoded as a separate message type. Context is carried by room metadata and delivery metadata.

### 2.1 Context rules

- `IC`: room-scoped, durable, remembered by everyone who could see it when sent.
- `OOC`: room-scoped by default, durable, remembered by everyone who could see it when sent.
- `WHISPER`: sender + single recipient + DM only, durable unless explicitly off-the-record by context.
- DM-private messages are modeled as whisper semantics (no separate durable message type).
- `SYSTEM`: durable by default; may be room-scoped or global depending on payload.

### 2.2 Special contexts

- Greenroom:
  - OOC only.
  - Always ephemeral.
  - Greenroom views render Greenroom-room chat plus `[Session Started]` and `[Session Ended]` bookends for timeline anchoring.
  - Greenroom views suppress `[Session Paused]` and `[Session Resumed]` markers.
  - Never promoted to campaign history automatically.
  - On new-session start, Greenroom chat context is reset and starts empty.
- PAUSED runtime:
  - Default: ephemeral-only runtime chat while paused.
  - Campaign setting may enable persisted paused-chat runtime behavior.
- Whisper Bubble:
  - Off-the-record by default.
  - Visibility restricted to bubble occupants and DM.
  - Persistence policy is campaign-configurable, but the default contract is non-persistent.
  - Composer mode inside Whisper Bubble is whisper-only:
    - IC/OOC/DM-mode toggles are disabled.
    - all sent messages are treated as whisper-context messages.
    - targets are auto-resolved to current bubble participant set.
- ENDED cooldown:
  - Still live-session runtime.
  - Spectators may chat only during the cooldown window.
  - Cooldown runtime content is not part of this implementation pass's archive contract.

---

## 3. Live Visibility Contract

Visibility is decided at send time and captured in message delivery metadata.

### 3.1 Required invariant

For every room-scoped message, the backend must record the exact audience that could see it when it was created.

This is required to support the remembered timeline.

Without send-time audience capture, the system cannot distinguish:

- people who were in the room then and should keep remembering the message
- people who entered later and should not retroactively gain visibility

### 3.2 Send-time audience rules

- `IC` and local `OOC`:
  - visible to current room occupants at send time
  - plus DM
- `WHISPER`:
  - visible to sender, a single explicit target user, and DM
- room-scoped `SYSTEM`:
  - visible to room occupants at send time
  - plus DM if not already included
- global `SYSTEM`:
  - visible to all session members
- Greenroom OOC:
  - visible to Greenroom occupants at send time
- Whisper Bubble messages:
  - visible to bubble occupants at send time (auto-targeted multi-recipient whisper semantics)
  - plus DM

### 3.3 Frontend rendering rule

The frontend must render from backend-authoritative message visibility.

- Do not compute remembered visibility from current room alone.
- Do not discard older visible messages just because the user moved.
- Do not synthesize local-only chat state that bypasses backend visibility.

---

## 4. Typing Indicator Contract

Typing indicators are live-presence affordances, not durable chat records.

### 4.1 Typing rules

- `CHAT:TYPING_STARTED` and `CHAT:TYPING_STOPPED` are transient only.
- They are never persisted to Postgres as chat history.
- They must include the sender's current `roomId` in the payload.
- The UI must render typing indicators only for the currently viewed room/context.
- Typing indicators must auto-expire on the client if a stop event is missed.

### 4.2 UX requirements

- Typing indicators should be small and unobtrusive.
- They should appear near the composer / bottom of the live stream.
- They should never shift the message timeline aggressively.
- They should disappear within a short timeout if no stop event arrives.

### 4.3 Current implementation boundary

For this pass:

- Incoming typing WS events must update the UI.
- Typing state is room-scoped in payload and room-filtered in transport.
- Clients may emit typing events, but the server must broadcast them only to the sender's room audience plus DM.

---

## 5. Boundary Marker Contract

Session boundary markers are durable system messages.

- `[Session Started]`
- `[Session Paused]`
- `[Session Resumed]`
- `[Session Ended]`

Rules:

- Backend persists them as `SYSTEM` chat messages.
- Backend broadcasts them via `CHAT:MESSAGE_SENT`.
- Frontend renders them as bookends, not as ordinary bubbles.
- They remain visible in the unified session timeline.
- `[Session Paused]` and `[Session Resumed]` stay durable in session history but are suppressed in Greenroom views.
- `[Session Started]` and `[Session Ended]` are always shown in Greenroom views.
- Frontend must never invent or locally synthesize canonical boundary markers.

---

## 6. Shared Payload Contract

### 6.1 `CHAT:MESSAGE_SENT`

Required payload fields:

- `messageId`
- `roomId` when room-scoped
- `authorId`
- `authorUsername`
- `content`
- `type`
- `isDmOnly`
- `isOffTheRecord`
- `visibleTo` when visibility is restricted
- `targetIds` for whisper delivery metadata

Whisper target cardinality rules:

- Standard whisper send path: exactly one explicit recipient must be present.
- Whisper Bubble send path: backend may include multiple auto-resolved recipients based on active bubble participants.

### 6.2 `CHAT:TYPING_STARTED`

Required payload fields:

- `userId`
- `username`
- `roomId`
- `startedAt`

### 6.3 `CHAT:TYPING_STOPPED`

Required payload fields:

- `userId`
- `username` when available
- `roomId`
- `stoppedAt`

---

## 7. Backend Contract

Live-session chat write path:

1. Validate actor, session, room, and message type.
2. Validate the actor is allowed to chat in that room.
3. Resolve the send-time audience.
4. Persist the message with delivery metadata.
5. Broadcast `CHAT:MESSAGE_SENT`.
6. Return the stored message.

Typing write path:

1. Accept transient typing event.
2. Resolve the sender's room-scoped audience.
3. Broadcast the event only to that audience plus DM.
4. Do not persist it as chat history.

---

## 8. Frontend Contract

The live chat slice must:

- store the full visible session timeline for the current user
- render messages chronologically
- keep room tags visible so the user understands where each message came from
- keep typing indicators transient and filtered to the active room
- keep outbound message failures visible and retryable

This pass does not need to finish the final visual design. It must finish the runtime plumbing.

---

## 9. First-Pass Definition of Done

- Shared chat event/type model matches the payload contract above.
- Backend message creation captures send-time audience for room-scoped messages.
- Backend live message fetch returns the user's visible session timeline.
- Frontend chat store renders the unified visible session timeline.
- Frontend chat UI renders typing indicators from incoming WS events.
- Existing bookend behavior uses backend-authored `CHAT:MESSAGE_SENT` markers.

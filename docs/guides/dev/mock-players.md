# Mock Players Guide

This guide defines how DEV mock players are used to test multi-user behavior without spinning up many real clients.

## Core Contract

1. Frontend treats simulated players as real players.
2. Only backend services know an actor is mock-generated.
3. Mock-generated runtime activity follows normal persistence rules for that activity type.
4. Any real connected user can temporarily assume a mock persona for end-to-end pathway testing.

## Why This Exists

Mock players let teams validate:

- group movement and room membership behavior
- role-based panel and action visibility
- chat and session timeline behavior under load
- reconnect and presence behavior across many actors

without requiring many human participants.

## Identity Model

### Backend

- Mock actors are real records in DEV environments.
- Backend may keep internal metadata for orchestration and seeding.
- Internal mock metadata must not be required by frontend runtime logic.

### Frontend

- Actor cards, chat rows, speaking indicators, and role gates behave as if all actors are real users.
- Frontend does not need mock-only branching for core behavior.
- Frontend reacts to canonical signals only:
  - LiveKit active-speaker channel (real audio participants)
  - WS presence/chat channel (`PRESENCE:STATE_CHANGED`, `CHAT:TYPING_*`) for simulated actors

## Persistence Parity

Mock-generated data is persisted via the same contracts used by real players for equivalent actions.

Examples:

- chat messages follow standard message persistence and hydration behavior
- room joins/leaves follow standard presence and membership updates
- session timeline/system transitions are handled by normal lifecycle contracts

If a pathway is normally persisted for a real user, it is persisted the same way for mock-generated activity.

## Takeover Mode

Takeover mode allows a real connected user to assume a mock persona temporarily.

### Entry

- Use player context menu action: Take Over Player.
- Any real user can initiate takeover (DM or player).

### Active State

- Requests/actions are executed as the assumed persona identity.
- UI and permission behavior should reflect that assumed persona.
- Selected player pill uses a distinct color while takeover is active.

### Exit

- Use Mock Testing panel action: Return to My User.
- Identity returns to the original authenticated real user.

## Mock Testing Panel (Control Surface)

The Groups header DEV control opens the Mock Testing panel. This is the canonical control surface for simulation runtime.

Supported controls:

- Mock Players slider + reroll button: rerolls session mock roster to requested count (backend clamped to supported bounds).
- Speaking ON/OFF: toggles backend speaking simulator.
- Chat ON/OFF: toggles backend typing plus persisted mock message simulator.
- Disconnect ON/OFF: toggles backend transient disconnect simulator with room leave/rejoin.
- Remove All: disconnects and removes all mock players from the active session.
- Return to My User: exits active takeover and restores real identity.

All control actions are backend-authoritative and immediately fan out through canonical WS events.

## Speaking & Typing Simulation Transport

Because mock players do not create real LiveKit audio streams, runtime simulation uses the app WS channel:

- Speaking simulation emits canonical `PRESENCE:STATE_CHANGED` transitions (`SPEAKING` then `ONLINE`).
- Typing simulation emits canonical `CHAT:TYPING_STARTED` / `CHAT:TYPING_STOPPED`.

## Persisted Chat Simulation

When chat simulation is enabled, mock actors send persisted messages through the normal backend chat service (`sendMessage`) and canonical WS broadcast (`CHAT:MESSAGE_SENT`).

Behavior:

- Message types include IC, OOC, and whisper.
- Greenroom messages are constrained to OOC to match normal runtime policy.
- Whisper messages use normal visibility filtering and recipient semantics.
- Messages hydrate from history like real player output.

Content source:

- The simulator uses a constants dataset at `backend/src/constants/dev-mock-chat-messages.constants.ts`.
- The dataset includes 50 templates with mixed lengths (single-word through multi-line markdown with basic formatting and bullets).

## Disconnect Membership Simulation

Disconnect simulation now mirrors room membership behavior:

- On simulated disconnect, mock users emit `ROOM:USER_LEFT` and leave their current room membership.
- Presence transitions to `OFFLINE`.
- On simulated reconnect, users rejoin their previous room and emit `ROOM:USER_JOINED`.
- Presence transitions back to `ONLINE`.

This keeps users persistent as actors while still testing real room membership transitions and restoration.

Frontend speaking highlights intentionally combine both channels:

- LiveKit active speaker snapshots
- Presence speaking state from WS

This preserves realistic UI behavior for mixed sessions (real + simulated actors).

## Non-Negotiables

1. No authorization bypass through takeover.
2. No frontend-only mock event types required for normal runtime behavior.
3. Reconnect/refresh must recover authoritative current identity (real or assumed) from backend state.
4. Mock controls remain DEV-only.

## Recommended Manual Checks

1. Start DEV session with seeded mock roster.
2. Verify simulated player activity appears through normal UI pathways.
3. Take over one mock player and verify PLAYER pill color change.
4. Validate chat, notes, and role-gated panels from assumed persona.
5. Return to real user via Mock Testing panel.
6. Refresh page and verify identity state rehydrates correctly.

## Related Docs

- mock-simulation-engine.md
- mock-control-panel.md
- IMPLEMENTATION_STATUS.md

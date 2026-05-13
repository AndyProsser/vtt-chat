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

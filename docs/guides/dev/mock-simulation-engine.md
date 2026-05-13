# Mock Simulation Engine

The mock simulation engine is backend-driven and emits canonical runtime events so frontend behavior remains identical to real-player behavior.

## Scope

- DEV-only orchestration of simulated actors
- session-scoped simulation controls
- optional real-user takeover of simulated actors

## Architecture Principle

The backend may track internal actor origin (mock vs real), but runtime event payloads consumed by frontend should not require mock-only handling.

## Event Strategy

Use existing canonical channels where possible:

- chat uses normal message send/broadcast pathways
- room movement uses normal join/leave pathways
- speaking/presence uses normal speaking presence pathways

Avoid introducing frontend-only mock event types when canonical events can represent behavior.

## Internal State (Backend)

Per session state may include:

- active simulator config (speaking/chat/disconnect enabled)
- active simulated actor ids
- optional takeover mapping: realUserId -> assumedActorId
- simulator scheduler cursors/timestamps

This state is backend-authoritative and rehydratable.

## API Surface (Target)

Existing DEV mock roster endpoints continue to manage roster/reset operations.

Recommended additions for takeover mode:

1. Start takeover
   - Endpoint: POST /api/dev/mock-players/takeover/start
   - Payload: sessionId, targetActorId
2. Stop takeover
   - Endpoint: POST /api/dev/mock-players/takeover/stop
   - Payload: sessionId
3. Get current takeover status
   - Endpoint: GET /api/dev/mock-players/takeover/status/:sessionId

## Authorization Rules

1. Caller must be a real authenticated participant in the session.
2. Target actor must be an eligible simulated actor for that session.
3. Only one active assumed persona per real user at a time.
4. Takeover must not grant capabilities beyond the assumed persona's role constraints.

## Request Identity Resolution

For runtime write actions during takeover:

1. Resolve caller to effective actor id via backend takeover map.
2. Process command through normal service pipeline using effective actor id.
3. Persist and broadcast results through canonical pathways.

Result: frontend sees standard behavior with no mock-specific branch needed.

## Persistence Rules

Simulated activity should persist according to normal rules of each feature.

- if real user action in that pathway is persisted, simulated action is also persisted
- if real user action is ephemeral in that pathway/state, simulated action is also ephemeral

## Reconnect and Recovery

On reconnect/refresh:

1. Backend returns authoritative identity context (real or assumed)
2. Frontend hydrates effective identity state
3. Runtime stores continue from canonical snapshots/events

No client-local takeover cache should override backend authority.

## Testing Matrix

1. Canonical events parity
   - Simulated actor chat/room/presence updates render identically to real actors.
2. Takeover permissions
   - Assumed persona cannot execute actions forbidden to that persona.
3. Persistence parity
   - Simulated actor persisted artifacts are present after refresh/history hydration.
4. Recovery correctness
   - Reconnect preserves or clears takeover state according to backend snapshot.

## Implementation Notes

- Keep simulator scheduling isolated from business services.
- Keep takeover map in a backend-authoritative store suitable for reconnect recovery.
- Add integration tests before enabling takeover outside local DEV flows.

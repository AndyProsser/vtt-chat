# Stage 6 Closure: Presence and Rooms

**Completed**: 2026-04-19

## Overview

Stage 6 implements the **presence and room membership** subsystem, providing Redis-first realtime state with Prisma-backed persistence recovery. Session members are automatically routed between main and green rooms based on session state, with atomic UI recovery semantics and session-member access controls.

## What Was Completed

### Backend Implementation

- **Presence & Room APIs**:
  - `/api/presence/:sessionId` — read presence state (GET), update user presence state (PUT), recover from DB snapshots (POST)
  - `/api/rooms/:sessionId` — list rooms (GET), create room (POST as DM-only), join/leave room (POST), list room members (GET)
  - Session-member authorization enforced on all endpoints

- **Redis-First Realtime State**:
  - Room membership and presence state authoritative in Redis with expiring keys
  - Immediate fanout via WebSocket for room joins/leaves and presence state changes
  - Multi-client safe concurrent writes with Redis atomic operations

- **DB-Backed Recovery**:
  - `PresenceSnapshot` table persists periodic presence state snapshots
  - On Redis empty or timeout, recovery restores session presence from latest snapshots
  - Snapshot lifecycle: automatic periodic snapshots on state changes, manual snapshot trigger via recovery endpoint

- **Session-State Room Transitions**:
  - `ACTIVE` session members automatically routed to **Main Room**
  - `PAUSED` and `ENDED` session members automatically routed to **Green Room**
  - Bulk transition orchestrated on session state change via `PUT /api/session/:id/state`
  - Explicit `ROOM:SESSION_TRANSITION_APPLIED` event broadcast to all session members

### Frontend Implementation

- **Room/Presence Store**:
  - Session-scoped room and presence maps in Zustand store
  - `replaceSessionTopology()` action for atomic reconnect hydration
  - Event-driven updates for room/presence changes and transitions

- **Live Indicators**:
  - Session init component displays live room list and member presence states
  - Presence visual indicators (online, idle, etc.) with real-time updates
  - Transition notification banner with subtle enter/exit animation and stable layout slot

- **Reconnect Recovery**:
  - On reconnect, hydrate rooms and presence from `/api/rooms/:sessionId` and `/api/presence/:sessionId`
  - Apply atomic topology hydration to ensure room+presence consistency
  - Continue receiving event-driven updates during and after hydration

### Testing & Validation

- **Integration Tests**:
  - `tests/integration/room-service-recovery.integration.test.ts`: Redis-empty recovery from snapshots, repeated transition sequencing under load-like state flips
  - `tests/integration/session-room-transition.integration.test.ts`: transition orchestration invocation and WS broadcast validation
  - `tests/api/presence-rooms-authz.test.ts`: session-member access control enforcement

- **Build & Schema Validation**:
  - Backend build: ✅ passed
  - Backend tests: ✅ 23 passed (7 test files)
  - Frontend build: ✅ passed
  - Monorepo build: ✅ all components passed
  - Prisma migration status: ✅ database schema up to date (no new migration required)

## Design Alignment

All Stage 6 implementation aligns with design doc requirements:

- **PRESENCE-STATE-MACHINE.md**: Redis-authoritative presence model, session-boundary state transitions
- **SESSION-LIFECYCLE.md**: session state changes trigger room orchestration and WS fanout
- **UI-STATE-RECOVERY.md**: atomic topology hydration on reconnect, event-driven continuous sync

## Operational Notes

### Redis Considerations

- Room membership and presence keys use session-scoped namespaces with short TTL (configurable)
- Snapshot recovery is transparent — no operator intervention required on Redis restart
- For production deployments, ensure Redis persistence is enabled (RDB/AOF) to reduce snapshot gap

### Database Considerations

- `PresenceSnapshot` records are created on state changes and during periodic maintenance
- Snapshots are automatically pruned (retention window configurable, default 7 days)
- No manual backfill required for existing sessions — recovery starts from first snapshot

### Access Control

- All presence/room APIs check session membership before returning data
- DMs have implicit access to all session room/presence data
- Session members can only access their own session's data
- Non-members receive 403 Forbidden responses

## Post-Stage Hardening Scope

The following items are intentionally deferred to post-Stage-6 hardening:

- Multi-client e2e/load testing for concurrent transitions and reconnects
- Operational rollout strategy and backfill considerations for existing session data
- Advanced recovery scenarios (e.g., clock skew, partial Redis recovery)

## Files Modified

**Backend**:

- `src/api/presence.routes.ts` — session-member authz, recovery endpoint
- `src/api/rooms.routes.ts` — session-member authz on list/join/leave/members
- `src/core/rooms/room.service.ts` — Redis-first state, snapshots, transition orchestration
- `tests/api/presence-rooms-authz.test.ts` — new authz validation tests

**Frontend**:

- `src/state/roomSlice.ts` — added `replaceSessionTopology()` for atomic hydration
- `src/components/session/SessionInit.tsx` — reconnect hydration, transition banner
- `src/hooks/useWebSocket.ts` — transition event dispatch registration

**Shared**:

- `shared/events/room.ts` — added `RoomSessionTransitionApplied` event type

**Documentation**:

- `ROADMAP.md` — Stage 6 status updated to Complete
- This file (`STAGE-6-CLOSURE.md`) — operational closure notes

## Exit Criteria Met

✅ Reliable session/room scoped state synchronization and reconnection behavior
✅ Session-member authorization enforced on presence/room APIs
✅ Atomic UI recovery behavior on reconnect
✅ Integration tests cover recovery and transition sequencing
✅ All builds passing, database schema in sync

---

**Next Stage**: Stage 7 (Audio and LiveKit Integration) — scaffolded, awaiting implementation.

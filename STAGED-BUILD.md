# Staged Build Plan

Staged build plan for VTT Chat

0. Stage 0: Contract Lock
   Define and freeze event names, payload schemas, and permission checks for the first vertical slice.
   Output: shared schema/types package and event naming rules.

1. Stage 1: Backend Foundation
   Implement only health, auth skeleton, and session bootstrap endpoints with deterministic error model.
   Output: minimal REST and ws handshake contracts.

2. Stage 2: Frontend Transport Spine
   Implement ws client, event dispatcher, and Zustand root store with empty reducers.
   Output: UI to Event to Reducer to Store to UI pipeline running end-to-end.

3. Stage 3: Session Lifecycle Vertical Slice
   Implement idle to active to paused to ended transitions with DM-only controls.
   Output: first complete role-aware flow.

4. Stage 4: Chat Vertical Slice
   Implement IC/OOC/public chat first, then whispers with strict visibility filtering.
   Output: privacy-safe messaging baseline.

5. Stage 5: Notes Vertical Slice
   Implement private notes first, then shared/DM notes and role-filtered selectors.
   Output: privacy model validated in store and transport.

6. Stage 6: Presence and Rooms
   Implement presence state machine and room membership transitions.
   Output: session/room scoped state sync and recovery behavior.

7. Stage 7: Audio and LiveKit Integration
   Add token flow, room connect/disconnect, then controlled audio states and DM overrides.
   Output: stable audio baseline without advanced effects.

8. Stage 8: Admin and Ops Layer
   Add admin auth, readonly telemetry first, then controlled moderation actions.
   Output: safe operator workflows and auditability.

---

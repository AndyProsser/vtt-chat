# VTT Chat Roadmap and Progress Record

This document is the active roadmap and delivery log for VTT Chat.
It tracks:

- What has been completed
- What is currently in progress
- What remains for each stage
- Exit criteria for stage completion
- Immediate next milestones

Last updated: 2026-04-19

---

## 1) Executive Status

Current overall status: **Stages 0-5 complete, Stage 8 partially complete, Stages 6-7 scaffolded (implementation incomplete)**.

- Contract and architecture baseline are in place.
- Core backend/frontend spine is operational.
- Session lifecycle and chat vertical slices are implemented and building.
- Admin shell and readonly telemetry baseline are now implemented.
- Notes vertical slice is now operational with persisted CRUD + visibility controls.
- Presence/rooms and audio/livekit vertical slices have contract/store/handler scaffolding in place, but core services, mounted APIs, and production UX remain incomplete.

Latest verification:

- Monorepo build passes (`backend`, `frontend`, `admin`).
- Backend tests pass for chat system-message protections, notes visibility transitions, notes websocket propagation, and campaign/users API coverage.

---

## 2) Stage-by-Stage Progress

### Stage 0: Contract Lock

Status: **Complete**

Goal:

- Define and freeze event names, payload schemas, and permission checks.

Completed:

- Shared package contracts established under `shared/`.
- Core event envelope, validators, permission matrix, and error model implemented.
- Documentation alignment pass completed, with compatibility notes added where conceptual docs differ from runtime contracts.

Exit criteria:

- Shared contract package is canonical and consumed by backend/frontend.

---

### Stage 1: Backend Foundation

Status: **Complete**

Goal:

- Minimal REST and WebSocket handshake contracts.

Completed:

- Backend bootstrap and middleware stack active.
- Health/auth/session baseline endpoints in place.
- WebSocket manager with auth handshake and dispatcher pipeline.
- Baseline hardening applied (security headers, CORS, rate limits, request IDs).

Exit criteria:

- Deterministic error model and baseline transport contracts operational.

---

### Stage 2: Frontend Transport Spine

Status: **Complete**

Goal:

- UI -> Event -> Reducer -> Store -> UI pipeline running end-to-end.

Completed:

- WebSocket client and dispatcher flow operational.
- Zustand root store and domain slices wired.
- App-level auth/session bootstrap path connected.

Exit criteria:

- Frontend transport and state flow proven with live event handling.

---

### Stage 3: Session Lifecycle Vertical Slice

Status: **Complete**

Goal:

- Role-aware session transitions: `IDLE -> ACTIVE -> PAUSED -> ENDED`.

Completed:

- DM-only session mutation enforcement on backend routes.
- Session list hydration and lifecycle controls on frontend.
- Session state transitions with role-gated controls.

Exit criteria:

- End-to-end session lifecycle flow validated for DM/player/spectator views.

---

### Stage 4: Chat Vertical Slice

Status: **Complete**

Goal:

- IC/OOC/public messaging and whispers with strict visibility filtering.

Completed:

- Chat REST endpoints for send/edit/delete/history.
- Prisma-backed chat service with whisper visibility filtering and soft-delete/edit support.
- Session boundary system messages (started/paused/resumed/ended) are persisted and broadcast.
- System messages are immutable (not editable/deletable).
- WS broadcast support with optional recipient filtering.
- Frontend chat window/input/list wired to backend telemetry and event flow.
- Frontend WS client now supports backend wrapper messages (`WS:EVENT`, `WS:CONNECTED`, `WS:ACK`, `WS:ERROR`).
- Frontend whisper flow supports recipient targeting via `recipientId`.

Notes:

- Current implementation is complete for privacy-safe chat behavior and transport compatibility.
- Advanced UX and moderation enhancements may be added in later polish passes.

Exit criteria:

- Room-safe public chat + whisper privacy behavior operational.

---

### Stage 5: Notes Vertical Slice

Status: **Complete**

Goal:

- Private notes, then shared/DM notes with role-filtered selectors.

Completed:

- Notes CRUD routes are implemented and mounted.
- Notes visibility model is enforced (DM_ONLY, PLAYERS_VISIBLE, CUSTOM).
- Notes publish-to-chat flow is implemented.
- Frontend notes panel/card UX is implemented and connected to APIs/store.
- Notes custom-share UX now supports session-user selection with username labels (manual ID fallback retained).
- Notes persistence is backed by Prisma repository/service layers.
- Notes visibility transition tests are in place.
- Notes route-level websocket propagation tests are in place for create/publish flows.
- Notes publish actions are logged for admin telemetry/audit workflows.

Exit criteria:

- Privacy model validated for note ownership and visibility transitions.
- Persisted notes flow is productionized with websocket propagation coverage and publish audit hooks.

---

### Stage 6: Presence and Rooms

Status: **Scaffolded (not implemented)**

Goal:

- Presence state machine and room membership transitions.

Completed so far:

- Room/presence event handler registration exists in backend and frontend WS dispatch paths.
- WS heartbeat and reconnection scaffolding is present.
- Placeholder room service modules are present.

Remaining scope:

- Room lifecycle APIs and membership transitions.
- Presence state updates, heartbeat/recovery semantics.
- Frontend presence indicators and room-scoped state sync.
- Replace placeholder room/presence service layers with authoritative state transitions.

Exit criteria:

- Reliable session/room scoped state synchronization and reconnection behavior.

---

### Stage 7: Audio and LiveKit Integration

Status: **Scaffolded (not implemented)**

Goal:

- Token flow, room connect/disconnect, controlled audio states and DM overrides.

Completed so far:

- Audio event types are registered in backend/frontend WS dispatcher flows.
- Audio and LiveKit hook/service files exist as staged placeholders.
- Environment configuration keys exist for LiveKit integration.

Remaining scope:

- LiveKit token issuance and client lifecycle integration.
- Room-scoped audio controls and DM override behaviors.
- Frontend audio engine alignment with role constraints.
- Replace placeholder audio/livekit modules with functional token, transport, and control flows.

Exit criteria:

- Stable audio baseline without advanced effects dependency.

---

### Stage 8: Admin and Ops Layer

Status: **In progress (partial completion)**

Goal:

- Admin auth, readonly telemetry first, then controlled moderation actions.

Completed so far:

- Admin SPA redesigned to a full-window, two-column, theme-aware shell.
- Admin sections scaffolded: Dashboard, Users, Rooms & Campaigns, System Health, Logs & Activity, Settings.
- Backend telemetry endpoints implemented:
  - `/api/admin/telemetry/dashboard`
  - `/api/admin/telemetry/status`
  - `/api/admin/telemetry/logs`
- Logs endpoint now supports server-side filtering, pagination, and sorting.
- Admin logs table wired to server-side pagination and sorting.

Remaining scope:

- Production-grade admin authentication and authorization guardrails.
- Moderation actions with audit trail (suspend/force logout/etc).
- Persistent telemetry sources (currently in-memory/baseline metrics in parts).
- Detail panels replacing placeholder actions (for example log entry expand UX).

Exit criteria:

- Authenticated admin workflows with readonly telemetry and controlled actions, fully auditable.

---

## 3) Current Priority Queue

Priority 1:

- Complete Stage 8 security closure: admin auth + role-gated ops actions + audit logging UX.

Priority 2:

- Stage 6 presence/rooms state machine and room membership semantics.

Priority 3:

- Stage 7 audio/livekit token + control lifecycle integration.

---

## 4) Risks and Dependencies

Key risks:

- Admin telemetry currently mixes real signals with baseline placeholders in some metrics.
- In-memory admin log history and WS recovery state are not durable across process restarts.
- Contract-vs-concept terminology drift in docs must continue to be managed carefully.
- Custom-share recipient UX depends on session membership hydration (users appear after joining session).
- Prisma schema is updated, but migration history is not yet committed; DB rollout consistency risk remains.

Dependencies before later stages:

- Stage 6 depends on authoritative presence state model and reconnection strategy.
- Stage 7 depends on stable room/presence semantics and token lifecycle reliability.

## 4.1) Validation Notes

The following references support the corrected stage labels and current model terminology.

| Claim                                       | Status                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stage 5 (Notes) vertical slice              | Complete                    | Notes routes mounted: [backend/src/api/index.ts](backend/src/api/index.ts), [backend/src/api/notes.routes.ts](backend/src/api/notes.routes.ts). Persisted service/repository flow: [backend/src/core/notes/notes.service.ts](backend/src/core/notes/notes.service.ts), [backend/src/repositories/notes.repository.ts](backend/src/repositories/notes.repository.ts). Frontend panel/card wiring and custom-share selector UX: [frontend/src/components/notes/NotesPanel.tsx](frontend/src/components/notes/NotesPanel.tsx), [frontend/src/components/notes/NoteCard.tsx](frontend/src/components/notes/NoteCard.tsx), [frontend/src/state/notesSlice.ts](frontend/src/state/notesSlice.ts). Tests: [backend/tests/notes-visibility.test.ts](backend/tests/notes-visibility.test.ts), [backend/tests/notes-routes-ws.test.ts](backend/tests/notes-routes-ws.test.ts). Publish audit hook: [backend/src/api/notes.routes.ts](backend/src/api/notes.routes.ts). |
| Stage 6 (Presence and Rooms) vertical slice | Scaffolded, not implemented | WS room/presence wiring: [backend/src/ws/index.ts](backend/src/ws/index.ts), [frontend/src/hooks/useWebSocket.ts](frontend/src/hooks/useWebSocket.ts). Recovery/heartbeat scaffolding: [backend/src/ws/state-recovery.ts](backend/src/ws/state-recovery.ts), [backend/src/ws/index.ts](backend/src/ws/index.ts). Incomplete REST/service layers: [backend/src/api/index.ts](backend/src/api/index.ts), [backend/src/core/rooms/room.service.ts](backend/src/core/rooms/room.service.ts).                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Stage 7 (Audio and LiveKit) vertical slice  | Scaffolded, not implemented | Audio WS wiring: [backend/src/ws/index.ts](backend/src/ws/index.ts), [frontend/src/hooks/useWebSocket.ts](frontend/src/hooks/useWebSocket.ts). Placeholder LiveKit/audio modules: [backend/src/infra/livekit/token.service.ts](backend/src/infra/livekit/token.service.ts), [frontend/src/hooks/useLiveKit.ts](frontend/src/hooks/useLiveKit.ts), [frontend/src/hooks/useAudioEngine.ts](frontend/src/hooks/useAudioEngine.ts), [backend/src/ws/handlers/audio.handler.ts](backend/src/ws/handlers/audio.handler.ts).                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Stage 4 chat boundary/system behavior       | Complete                    | Session boundary/system message emission: [backend/src/core/chat/session-boundaries.ts](backend/src/core/chat/session-boundaries.ts), [backend/src/core/chat/system-messages.ts](backend/src/core/chat/system-messages.ts), [backend/src/api/session.routes.ts](backend/src/api/session.routes.ts). System-message immutability: [backend/src/core/chat/chat.service.ts](backend/src/core/chat/chat.service.ts). Frontend WS wrapper compatibility: [frontend/src/ws/client.ts](frontend/src/ws/client.ts). Tests: [backend/tests/chat-system-messages.test.ts](backend/tests/chat-system-messages.test.ts).                                                                                                                                                                                                                                                                                                                                                 |
| Character status field terminology          | Aligned                     | Data-model terminology: [docs/architecture/DATA-MODEL.md](docs/architecture/DATA-MODEL.md) ("status" values: alive, dead, left, unknown). Persisted schema enum: [backend/prisma/schema.prisma](backend/prisma/schema.prisma) (`CharacterStatus`: `ALIVE`, `DEAD`, `LEFT`, `UNKNOWN`). API validation and persistence path: [backend/src/api/campaign.routes.ts](backend/src/api/campaign.routes.ts), [backend/src/repositories/campaign.repository.ts](backend/src/repositories/campaign.repository.ts), [backend/tests/campaign-users-api.test.ts](backend/tests/campaign-users-api.test.ts).                                                                                                                                                                                                                                                                                                                                                              |

---

## 5) Progress Log (Condensed)

- 2026-04: Stage 3 session lifecycle implemented and validated.
- 2026-04: Stage 4 chat baseline implemented (privacy-safe whisper filtering).
- 2026-04: Chat/session/notes services moved to Prisma-backed persistence.
- 2026-04: User/campaign/character persistence and campaign-scoped session APIs implemented.
- 2026-04: Character model expanded with persisted status field (data-model terms: alive/dead/left/unknown; persisted via `CharacterStatus` enum in schema).
- 2026-04: Stage 4 completed for session-boundary system messages, system-message immutability, frontend WS wrapper compatibility, and whisper recipient targeting.
- 2026-04: Stage 5 notes vertical slice closed with visibility controls, custom-share selector UX, websocket propagation tests, and publish audit logging hooks.
- 2026-04: UI and architecture docs consolidated, expanded, and cross-linked.
- 2026-04: Admin UI design integrated into documentation set.
- 2026-04: Stage 8 readonly telemetry endpoints + admin telemetry table pagination/sorting implemented.

---

## 6) Definition of Done for This Roadmap

Roadmap complete when:

- Stages 0-8 all meet their exit criteria.
- Security and auditability requirements are met for internet-facing operation.
- Monorepo builds cleanly and stage-critical user journeys are test-covered.

# VTT Chat Roadmap and Progress Record

This document is the active roadmap and delivery log for VTT Chat.
It tracks:

- What has been completed
- What is currently in progress
- What remains for each stage
- Exit criteria for stage completion
- Immediate next milestones

Last updated: 2026-04-17

---

## 1) Executive Status

Current overall status: **Stages 0-4 complete, Stage 8 partially complete, Stages 5-7 pending**.

- Contract and architecture baseline are in place.
- Core backend/frontend spine is operational.
- Session lifecycle and chat vertical slices are implemented and building.
- Admin shell and readonly telemetry baseline are now implemented.
- Notes, presence/rooms, and audio/livekit vertical slices remain the primary product gaps.

Latest verification:

- Monorepo build passes (`backend`, `frontend`, `admin`).

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

Status: **Complete (baseline)**

Goal:

- IC/OOC/public messaging and whispers with strict visibility filtering.

Completed:

- Chat REST endpoints for send/edit/delete/history.
- In-memory chat service with whisper visibility filtering.
- WS broadcast support with optional recipient filtering.
- Frontend chat window/input/list wired to backend telemetry and event flow.

Notes:

- Current implementation is baseline-complete for privacy-safe chat behavior.
- Advanced UX and moderation enhancements may be added in later polish passes.

Exit criteria:

- Room-safe public chat + whisper privacy behavior operational.

---

### Stage 5: Notes Vertical Slice

Status: **Not started**

Goal:

- Private notes, then shared/DM notes with role-filtered selectors.

Remaining scope:

- Notes CRUD routes and role visibility enforcement.
- Notes publish-to-chat path consistent with contracts.
- Frontend notes panels and selectors by visibility mode.
- Store/reducer handlers for notes events.

Exit criteria:

- Privacy model validated for note ownership and visibility transitions.

---

### Stage 6: Presence and Rooms

Status: **Not started**

Goal:

- Presence state machine and room membership transitions.

Remaining scope:

- Room lifecycle APIs and membership transitions.
- Presence state updates, heartbeat/recovery semantics.
- Frontend presence indicators and room-scoped state sync.

Exit criteria:

- Reliable session/room scoped state synchronization and reconnection behavior.

---

### Stage 7: Audio and LiveKit Integration

Status: **Not started**

Goal:

- Token flow, room connect/disconnect, controlled audio states and DM overrides.

Remaining scope:

- LiveKit token issuance and client lifecycle integration.
- Room-scoped audio controls and DM override behaviors.
- Frontend audio engine alignment with role constraints.

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

- Begin Stage 5 notes vertical slice (backend visibility model first, then UI/store).

Priority 3:

- Stage 6 presence/rooms state machine and room membership semantics.

---

## 4) Risks and Dependencies

Key risks:

- Admin telemetry currently mixes real signals with baseline placeholders in some metrics.
- In-memory components (chat telemetry/log buffer) are not durable across process restarts.
- Contract-vs-concept terminology drift in docs must continue to be managed carefully.

Dependencies before later stages:

- Stage 5 depends on finalized notes visibility semantics and event payload decisions.
- Stage 6 depends on authoritative presence state model and reconnection strategy.
- Stage 7 depends on stable room/presence semantics and token lifecycle reliability.

---

## 5) Progress Log (Condensed)

- 2026-04: Stage 3 session lifecycle implemented and validated.
- 2026-04: Stage 4 chat baseline implemented (privacy-safe whisper filtering).
- 2026-04: UI and architecture docs consolidated, expanded, and cross-linked.
- 2026-04: Admin UI design integrated into documentation set.
- 2026-04: Stage 8 readonly telemetry endpoints + admin telemetry table pagination/sorting implemented.

---

## 6) Definition of Done for This Roadmap

Roadmap complete when:

- Stages 0-8 all meet their exit criteria.
- Security and auditability requirements are met for internet-facing operation.
- Monorepo builds cleanly and stage-critical user journeys are test-covered.

---

## 7) Naming Note

This file remains `STAGED-BUILD.md` for continuity with existing references.
If desired, it can be renamed to `ROADMAP.md` in a future cleanup once all links are updated.

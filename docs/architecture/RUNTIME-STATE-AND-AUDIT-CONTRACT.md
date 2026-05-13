# Runtime State and Audit Contract

Status:

- This document defines the backend runtime-state contract for Redis-first realtime behavior.
- Treat this as an implementation target and architecture contract for new and refactored flows.
- Where current runtime differs, this document should drive convergence work rather than be interpreted as already fully shipped.

---

## 1. Purpose

VTT-Chat uses Redis as the runtime authority for active session interaction state and websocket fan-out.
Postgres remains the durable source for long-term campaign/session history.

Contract goals:

1. Keep websocket-facing reads/writes low-latency via Redis.
2. Reduce database write pressure during bursty session activity.
3. Preserve required long-term records in Postgres.
4. Record all meaningful session actions in an auditable session trail.

---

## 2. Core Policy

### 2.1 Redis-first runtime authority

For all interactive session mutations that transit websocket channels:

1. Validate authz + input.
2. Write/update Redis runtime state.
3. Append session audit event.
4. Publish websocket event.
5. Persist to Postgres immediately or via controlled flush depending on data class.

### 2.2 Postgres durability authority

For data that must survive session boundaries, Postgres is required.
Redis is still used as hot cache and write buffer for active interaction windows.

### 2.3 Auditability mandate

Every meaningful session action must emit a session audit record, including:

- player joined/left
- room/group moved
- mute/unmute
- audio effect apply/remove
- message sent/edited/deleted
- note/journal/history mutations
- session lifecycle transitions

---

## 3. Data Classification and Storage Contract

### 3.1 Class A: Realtime transient (Redis authoritative, optional DB)

Examples:

- presence online/offline/speaking/typing
- room membership snapshots
- mute status and temporary audio overrides
- push-to-talk state, live audio effect projection

Rules:

- Must be in Redis.
- Must be websocket-driven.
- TTL-based cleanup is allowed.
- DB persistence is optional unless needed for analytics or replay.

### 3.2 Class B: Session durable (Redis + Postgres)

Examples:

- chat messages and session timeline
- session history material
- journal entries
- session-scoped notes/handouts

Rules:

- Write to Redis first for low-latency fan-out.
- Persist to Postgres using immediate write or bounded flush queue.
- On reconnect/read, serve from Redis when present, then reconcile/fallback to Postgres.

### 3.3 Class C: Campaign durable (Redis cache + Postgres source)

Examples:

- campaign notes and handouts
- long-term journal/history artifacts
- campaign room/environment baselines

Rules:

- Postgres is canonical source of record.
- Redis stores hot working-set cache for active campaign sessions.
- Cache invalidation must happen on every successful durable mutation.

---

## 4. Session Audit Trail Contract

### 4.1 Mandatory record shape

Each audited action must include at minimum:

- `eventId`
- `timestamp`
- `sessionId`
- `campaignId` (when applicable)
- `actorUserId`
- `actorRole`
- `actionType`
- `targetType` and `targetId` (if applicable)
- `roomId` (if applicable)
- `visibilityClass` (`PUBLIC`, `ROLE_SCOPED`, `PRIVATE`, `SYSTEM`)
- `metadata` (sanitized, non-secret)

### 4.2 Content safety and privacy

- Off-the-record content (Whisper/private and intermission runtime content) must not be persisted as normal transcript/history.
- Audit trail may record control-plane facts (who moved, who muted, who joined), but must avoid private content payloads unless policy explicitly allows.
- Session boundary markers (`[Session Started]`, `[Session Paused]`, `[Session Resumed]`, `[Session Ended]`) are required durable artifacts.

### 4.3 Delivery guarantees

- Audit append must occur in the same mutation flow as Redis + websocket publish.
- Failures to persist Class B/C domain records must be observable and retriable.
- Audit sink failures must produce operational alerts.

---

## 5. Redis Keyspace Contract

Canonical keyspace families (illustrative):

- `presence:session:{sessionId}`
- `room:session:{sessionId}:{roomId}:members`
- `audio:session:{sessionId}:overrides`
- `chat:session:{sessionId}:stream`
- `notes:campaign:{campaignId}:cache`
- `journal:session:{sessionId}:cache`
- `audit:session:{sessionId}:stream`

Rules:

- Keys must be namespaced by session or campaign.
- TTL must be explicit for transient keys.
- Durable-cache keys must have invalidation/version strategy.
- Background jobs must clean orphan keys for ended sessions.

---

## 6. Write Path Contract

For all websocket-visible mutations:

1. API/WS handler validates actor and payload.
2. Mutation service updates Redis runtime state.
3. Mutation service appends audit event.
4. Event broadcaster emits websocket event.
5. Durability worker or inline path writes required records to Postgres.
6. Acknowledgement and telemetry emitted.

Do not perform local-only client mutations as source-of-truth replacements for this flow.

---

## 7. Read and Recovery Contract

### 7.1 Live read preference

- Prefer Redis for active-session reads.
- Fallback to Postgres for cache misses.
- Rehydrate Redis cache from Postgres where appropriate.

### 7.2 Reconnect behavior

On reconnect/refresh:

1. Treat client local state as stale cache.
2. Recover topology/runtime snapshots from backend Redis-backed views.
3. Reconcile durable history from Postgres-backed APIs.
4. Resume websocket-driven updates.

---

## 8. Durability and Performance Guidance

- Use write-behind batching only for data classes that permit bounded delay.
- Keep critical user-facing records (chat messages, session boundaries) strongly durable with low-latency commit paths.
- Use idempotent event IDs to avoid duplicate persistence on retries.
- Add backpressure and dead-letter handling for failed durability flushes.

---

## 9. Testing Mandates

Required test coverage for each new mutation path:

1. Redis state update assertions.
2. Websocket event emission assertions.
3. Postgres durability assertions when required by data class.
4. Session audit trail append assertions.
5. Reconnect hydration assertions.

---

## 10. Non-negotiable Invariants

1. Anything transiting websocket interaction channels must be represented in Redis runtime state.
2. Anything marked durable must be persisted to Postgres.
3. Every meaningful session action must leave an audit trace.
4. Privacy policy (Whisper/intermission off-the-record constraints) must never be broken by caching or audit implementations.

---

## 11. Implementation Checklist Matrix

This matrix maps currently mounted backend route families and current shared websocket event families to storage class targets.

Legend:

- `A` = Class A realtime transient
- `B` = Class B session durable
- `C` = Class C campaign durable
- `N/A` = Not part of session runtime state contract

### 11.1 Backend route families

Source of mounted families: `backend/src/api/index.ts`.

| Route family                     | Mounted path family                 | Class target | Redis runtime required | Postgres durable required | Session audit required | Notes                                                                                        |
| -------------------------------- | ----------------------------------- | ------------ | ---------------------- | ------------------------- | ---------------------- | -------------------------------------------------------------------------------------------- |
| Session lifecycle and membership | `/v1/session/*`                     | A+B          | [ ]                    | [ ]                       | [ ]                    | Includes state transitions, join/leave, session logs/cooldown flows.                         |
| Presence                         | `/v1/presence/*`                    | A            | [ ]                    | [ ]                       | [ ]                    | Redis-authoritative presence projection with optional snapshot persistence.                  |
| Rooms and moves                  | `/v1/rooms/*`                       | A+B          | [ ]                    | [ ]                       | [ ]                    | Room topology is realtime; room definitions/history can require durability.                  |
| Audio state and DM overrides     | `/v1/audio/*`                       | A+B          | [ ]                    | [ ]                       | [ ]                    | Runtime overrides/env/broadcast are hot state; selected artifacts survive reconnect/session. |
| Chat                             | `/chat/*`                           | A+B          | [ ]                    | [ ]                       | [ ]                    | Redis stream/cache for fan-out + durable timeline persistence.                               |
| Notes                            | `/notes/*`                          | B+C          | [ ]                    | [ ]                       | [ ]                    | Session-working notes are hot; campaign notes are long-term durable.                         |
| Metadata/timeline                | `/metadata/*`                       | B+C          | [ ]                    | [ ]                       | [ ]                    | Timeline and metadata feeds need cache + durable record alignment.                           |
| Campaign management              | `/campaigns/*`                      | C            | [ ]                    | [ ]                       | [ ]                    | Campaign entities/settings are durable; hot cache recommended for active campaigns.          |
| Integrations sync                | `/v1/integrations/*`                | B+C          | [ ]                    | [ ]                       | [ ]                    | Sync events should land in audit and relevant durable stores.                                |
| Telemetry ingest                 | `/telemetry/*`                      | N/A          | [ ]                    | [ ]                       | [ ]                    | Operational telemetry stream; keep separate from domain session history.                     |
| LiveKit token/health             | `/v1/livekit/*`                     | N/A          | [ ]                    | [ ]                       | [ ]                    | Control-plane endpoint family, not a domain state store.                                     |
| Auth and identity                | `/auth/*`, `/v1/auth/*`, `/users/*` | N/A          | [ ]                    | [ ]                       | [ ]                    | Identity/session token flows; audit security-relevant actions.                               |
| Platform status                  | `/platform/*`                       | N/A          | [ ]                    | [ ]                       | [ ]                    | Health/status route family.                                                                  |
| Admin operations                 | `/admin/*`                          | N/A          | [ ]                    | [ ]                       | [ ]                    | Admin audit exists; separate from session-domain runtime contract.                           |
| DEV mock players                 | `/dev/mock-players/*`               | A+B          | [ ]                    | [ ]                       | [ ]                    | Development only; should still respect runtime + audit semantics when enabled.               |

### 11.2 Websocket event families

Source of shared families: `shared/events/*` and runtime dispatcher registrations in `backend/src/ws/index.ts`.

| Event family          | Shared types                                     | Class target | Redis runtime required | Postgres durable required | Session audit required | Notes                                                                        |
| --------------------- | ------------------------------------------------ | ------------ | ---------------------- | ------------------------- | ---------------------- | ---------------------------------------------------------------------------- |
| Session               | `SESSION:*`                                      | A+B          | [ ]                    | [ ]                       | [ ]                    | Lifecycle controls + session stats projections.                              |
| Room                  | `ROOM:*`                                         | A+B          | [ ]                    | [ ]                       | [ ]                    | Membership/topology transitions should be replayable and auditable.          |
| Presence              | `PRESENCE:*`                                     | A            | [ ]                    | [ ]                       | [ ]                    | Redis-authoritative live state; snapshot policy defined by ops needs.        |
| Chat                  | `CHAT:*`                                         | A+B          | [ ]                    | [ ]                       | [ ]                    | Typing is transient; messages/bookends are durable.                          |
| Notes                 | `NOTES:*`                                        | B+C          | [ ]                    | [ ]                       | [ ]                    | Visibility-safe durability and campaign continuity required.                 |
| Audio                 | `AUDIO:*`                                        | A+B          | [ ]                    | [ ]                       | [ ]                    | Realtime projection + persisted overrides/environment where policy requires. |
| WS transport wrappers | `WS:CONNECTED`, `WS:EVENT`, `WS:ACK`, `WS:ERROR` | N/A          | [ ]                    | [ ]                       | [ ]                    | Transport protocol layer, not domain state family.                           |

### 11.3 Required follow-through per family

For every row above that is not `N/A`:

1. Add an explicit Redis keyspace contract entry.
2. Define exact durable write timing (`inline` or `bounded flush`).
3. Define audit action taxonomy (`actionType` catalog).
4. Add integration tests asserting Redis + WS + durable + audit behavior.

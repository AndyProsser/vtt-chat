# VTT-Chat — Claude Instructions

VTT-Chat is a real-time, multi-user voice and chat platform for tabletop RPGs (TTRPGs). Sessions run for months/years. The DM must complete every primary control within **2 clicks or 1 drag**, with a visible response within **200ms**, and no manual recovery steps ever required.

**This file is the primary AI context for Claude Code.** It distills the rules you must never violate. Supporting references:

| Source | Purpose |
| ------ | ------- |
| `.github/copilot-instructions.md` | Full product spec and detailed subsystem rules |
| `docs/CONTRACTS.md` | Locked API and WS event contracts |
| `docs/architecture/` | Per-subsystem architecture docs |
| `shared/events/*.ts` | Authoritative WS event type definitions |
| `backend/src/ws/index.ts` | WS event registry (runtime source of truth) |

---

## Tech Stack

| Layer    | Technology                                        |
| -------- | ------------------------------------------------- |
| Frontend | React 19, Zustand, Radix UI, TypeScript           |
| Admin    | Separate React app, shares design tokens          |
| Backend  | Node.js (Express), Prisma ORM, WebSocket server   |
| Database | PostgreSQL (authoritative), Redis (presence)      |
| Shared   | `shared/` monorepo package — types, events, utils |
| Infra    | Docker Compose; Caddy for TLS/reverse proxy       |

---

## Non-Negotiable: 4-Layer State

**Every state change must touch all four layers — in order. Never update only one.**

| Layer        | Responsibility                         | Scope                              |
| ------------ | -------------------------------------- | ---------------------------------- |
| PostgreSQL   | Authoritative persistence              | Campaign-scoped; survives sessions |
| Redis        | Presence, room membership, audio state | Session-scoped; survives reconnect |
| WS broadcast | Sync all connected clients             | Fires after persistence only       |
| Zustand      | Local UI cache                         | Hydrated from server; WS-updated   |

### Required order for every state change:

1. **Validate** — reject invalid input before touching any layer.
2. **Persist** — write to PostgreSQL/Redis. If PostgreSQL fails: stop, surface error, retry up to 3×.
3. **Broadcast** — emit WS event after persistence succeeds — never before.
4. **Update Zustand** — all clients update from WS payload, not from local action.
5. **Confirm UI** — if round-trip > 500ms, show loading indicator; retry 3× then show explicit error + retry button.

```ts
// WRONG — only updates local store
setRoomEnvironmentName(roomId, environmentName)

// RIGHT — API → WS broadcast → all clients update via handler
await fetch('/api/audio/environments/apply', { method: 'POST', body: ... })
```

---

## Session State Machine

Import `SessionState` from `shared/types/index.ts`. Never use raw strings.

```
IDLE ──► ACTIVE ──► PAUSED ──► ACTIVE (resume)
                │          └──► COOLDOWN ──► ENDED ──► CLEANUP
                └──────────────► COOLDOWN
```

| From       | To         | Trigger                           |
| ---------- | ---------- | --------------------------------- |
| `IDLE`     | `ACTIVE`   | DM starts session                 |
| `ACTIVE`   | `PAUSED`   | DM pauses                         |
| `ACTIVE`   | `COOLDOWN` | DM ends session (post-game window)|
| `PAUSED`   | `ACTIVE`   | DM resumes                        |
| `PAUSED`   | `COOLDOWN` | DM ends from paused state         |
| `COOLDOWN` | `ENDED`    | Cooldown window expires           |
| `ENDED`    | `CLEANUP`  | System cleanup completes          |
| `CLEANUP`  | `IDLE`     | New session provisioned           |

**`COOLDOWN`** is the post-session spectator window. OOC chat is enabled; DM effects are frozen; no group changes. Clients display a countdown timer (`cooldownExpiresAt` is backend-authoritative). Use `SESSION:COOLDOWN_STARTED` and `SESSION:COOLDOWN_EXTENDED` events — never infer from timer drift.

**`RESET`** (DM action on an `ENDED` session): calls `POST /api/session/:id/reset`, which handles `ENDED → CLEANUP` server-side, then provisions a fresh `IDLE` session. Frontend must not send `state=CLEANUP` directly to `PUT /api/session/:id/state`.

**Rules (apply in order for every DM action):** enum usage → API validation → UI gating → Zustand/effects.

- Always use helpers from `shared/utils/session-state.ts` (`isGreenroomSessionState`, `deriveCampaignDisplayState`, `normalizeSessionState`).
- API must read current state from DB before acting. Return `403` with descriptive message on invalid transitions.
- No state may be skipped — `IDLE → ENDED` is invalid; reject at API layer.
- Compute a single `isValidForState` at the feature level — do not scatter `if (state === ...)` blocks.
- Invalid transition UI response: disable the control preemptively; if API rejects anyway, toast: `"That action isn't available while the session is {currentState}."` — never a generic error.

### State Machine Regression — CRITICAL RECURRING BUG

**Pattern:** "Chats and speaking stopped reacting" after `ENDED → ACTIVE` (new session). Root cause: WS client doesn't rebind to new session.

Multi-session flow: `IDLE → ACTIVE → ENDED → IDLE → (new session) → ACTIVE`

When this occurs, these must happen in order:

1. `currentSessionId` updates in Zustand via `setCurrentSession()`
2. `useWebSocket` dependency array includes `sessionId` → old WS client disconnects
3. New WS client connects with new `sessionId` in auth payload
4. WS event handlers fire properly

**Dependency array must be:** `[enabled, onAuthFailure, sessionId, token, url]`

**Auto-rebind:** `handleSessionStateChanged` must call `setCurrentSession(event.sessionId)` when `state === 'ACTIVE'` and `currentSessionId !== event.sessionId`.

**Deduplication:** Check if user already in room before appending in `ROOM:SESSION_TRANSITION_APPLIED` handler.

---

## WS Events

Every new WS event must satisfy ALL before shipping:

- [ ] Shared type defined in `shared/events/`
- [ ] Backend emits after persisting (never before)
- [ ] Handler registered for ALL affected clients (not just acting user)
- [ ] All affected Zustand slices update
- [ ] Redis updated if state must survive reconnect
- [ ] Unit test in `frontend/tests/state/` and/or `backend/tests/`
- [ ] Event name listed in WS registry in `backend/src/ws/index.ts`

**Canonical WS events (high-risk subset — not exhaustive):**

The authoritative list is `backend/src/ws/index.ts`. Type definitions live in `shared/events/*.ts`. The events below are the ones most likely to cause bugs if missed or mishandled.

- Audio: `AUDIO:ENVIRONMENT_SET`, `AUDIO:DM_OVERRIDE_APPLIED`, `AUDIO:DM_OVERRIDE_REMOVED`, `AUDIO:BROADCAST_STATE_CHANGED`, `AUDIO:DM_VOICE_MODE_CHANGED`
- Rooms: `ROOM:CREATED`, `ROOM:DELETED`, `ROOM:USER_JOINED`, `ROOM:USER_LEFT`, `ROOM:SESSION_TRANSITION_APPLIED`
- Session: `SESSION:STARTED`, `SESSION:PAUSED`, `SESSION:RESUMED`, `SESSION:COOLDOWN_STARTED`, `SESSION:COOLDOWN_EXTENDED`, `SESSION:COOLDOWN_ENDED`, `SESSION:ENDED`
- Presence: `PRESENCE:STATE_CHANGED`, `PRESENCE:USER_GHOST_MODE_CHANGED`, `PRESENCE:PROFILE_UPDATED`
- Campaign: `CAMPAIGN:PARTY_PRESENCE_UPDATED`, `CAMPAIGN:JOIN_REQUEST_RECEIVED`, `CAMPAIGN:JOIN_REQUEST_RESOLVED`
- Chat: `CHAT:MESSAGE_SENT`, `CHAT:MESSAGE_EDITED`, `CHAT:MESSAGE_DELETED`, `CHAT:TYPING_STARTED`, `CHAT:TYPING_STOPPED`
- Notes: `NOTES:CREATED`, `NOTES:UPDATED`, `NOTES:DELETED`, `NOTES:SHARED`

**Invalid/malformed events:** log at `warn` and discard — do not throw or crash the WS connection.

**Reconnect:** On disconnect, retry within 5-second window. Treat Zustand as stale until rehydrated from backend. If unrecovered, notify user with explicit retry option.

---

## Architectural Mandates

### Zustand is cache — server is truth

On reconnect/refresh, treat local Zustand as stale until backend snapshots and WS events rehydrate it. Never trust client-only state over backend after reconnect.

### Leaf-Isolation for High-Frequency Per-User State

Per-user transient state (speaking, presence, ghost, mic mute, typing) **must not** be threaded through participant projections or `members[]` arrays. Doing so rebuilds every Radix Tooltip/Popover/Dropdown subtree on every user flip — verified root cause of long-session memory growth and freeze regressions.

**Pattern (mandatory for any new transient per-user bit):**

1. Define a `React.memo` leaf component for that one bit.
2. Leaf takes only `{sessionId, userId, isSelf?}` props.
3. Inside leaf, subscribe to a single primitive selector via `useStore`.
4. Mount the leaf inside the avatar/row component — do not pass the value down as a prop.
5. For cascading visual changes, use CSS `:has(.leaf-class)` — never parent className threading.

**Canonical leaves in `frontend/src/components/workspaces/session/rooms/`:**

- `SpeakingIndicator`, `PresenceIndicator`, `GhostIndicator`, `MicMutedIndicator`

**`AvatarOverlay` contract:** takes `presence?: {sessionId, userId, isSelf?, roomType?}` and mounts the four leaves itself. Callers must not pass `presenceState`, `ghost`, `isMuted`, or `speaking`.

**Combined mute:** Use `frontend/src/hooks/useIsUserMuted.ts` — never re-derive inline.

### Scroll Containment

Any scrollable panel needs a definite height somewhere in its ancestor chain (`height: <px>` or `calc(100dvh - offset)`). Use `min-height: 0` + `overflow: hidden` on flex/grid wrappers; `overflow-y: auto` only on the intended scroll container. Document/html must remain non-scrolling.

### Audio Follows Connected Voice Room

Audio environment/effects are driven by the user's actual connected voice room (`primaryRoomId`), not the selected UI room. If the connected room is `PRIVATE` or greenroom, clear projection to neutral/default.

### handleEnvironmentSet Always Updates roomEnvironmentNames

Even when `parameters` is absent — `roomEnvironmentNames` drives the environment sync in `SessionInit.tsx`.

### UI Errors via Toast

User-facing errors use `useToast` / `SystemToasts`. Do not use persistent inline error rows for transient failures in workspace panels.

### Session Bookends Survive Refresh

On session transitions, backend must persist a system message and broadcast via `CHAT:MESSAGE_SENT`. Frontend must render `[Session Started]`, `[Session Ended]`, `[Session Paused]`, `[Session Resumed]` bookends. These must survive refresh — restored from chat history API. Avoid duplicate bookends when local fallback and server/WS events arrive close together.

---

## Whisper Bubble

- Exactly one `PRIVATE` room per started session; auto-created on start, always at the bottom.
- DM cannot create extra private groups.
- Whisper voice/chat is never recorded, never logged, never persisted.
- When DM drags player into Whisper: DM voice auto-targets Whisper, broadcast disabled/locked, per-session effects suspended, speaking indicators hidden.
- Ending Whisper restores everyone's exact previous state (room, conditions, DM voice target) within **200ms** of DM action (server ack to all-client Zustand update).

---

## Session Lifecycle Cleanup

| Situation                                                    | Required action                                           |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| Session hydration/initial load                               | `resetSessionAudioState()` before rehydrating             |
| `SESSION:ENDED` fires                                        | `resetSessionAudioState()` + `clearActiveEffects()`       |
| `ROOM:SESSION_TRANSITION_APPLIED` with `nextState === IDLE`  | `resetSessionAudioState()` + `clearActiveEffects()`       |
| `ROOM:SESSION_TRANSITION_APPLIED` with `nextState === ENDED` | `resetSessionAudioState()` + `clearActiveEffects()`       |
| Any cleanup path                                             | Do NOT clear `roomEnvironmentNames` (campaign-persistent) |

---

## State Persistence Scope

**Persists across sessions (campaign-scoped):**

- `GROUP` type rooms and their environments
- Player notes, shared handouts
- Session logs and chat history (except Whisper and intermission runtime content)

**Per-session only (cleared on ENDED/IDLE):**

- `PRIVATE` rooms (deleted on session ENDED)
- Player conditions / DM overrides
- Audio effects, distance modifiers, voice presets, IC presets
- Broadcast/voice-of-god state

---

## Code Quality

### File Size: 400 Lines Max

No source file > 400 lines (excluding blank lines and imports). Split by logical domain:

| Domain          | Pattern                    |
| --------------- | -------------------------- |
| Sub-component   | `ComponentName.Part.tsx`   |
| Hook            | `useFeatureName.ts`        |
| Event handlers  | `featureName.handlers.ts`  |
| Types           | `featureName.types.ts`     |
| Constants       | `featureName.constants.ts` |
| Backend route   | `resource.routes.ts`       |
| Backend service | `resource.service.ts`      |

`SessionInit.tsx` at 3,500+ lines is what must never be repeated — it is a priority refactor target.

### Componentisation

- JSX blocks > ~50 lines → extract to named sub-component in its own file.
- Max 5 props before considering context, composed component, or hook.
- Do not put the full Zustand store object in effect dependency arrays.
- `state.slice[id] || {}` / `|| []` selector fallbacks cause infinite snapshot loops in Zustand + React 19. Use stable empty constants defined outside the component.

### Shared Package Boundary

`shared/` is the canonical source for anything used by 2+ of: `backend`, `frontend`, `admin`.

**Always in `shared/`:**

- WS event names and payload types → `shared/events/`
- Session, room, role, message, presence enums → `shared/types/`
- Session state utilities → `shared/utils/session-state.ts`
- Permission helpers → `shared/permissions/`
- Input validators used by API and frontend → `shared/validators/`

**Never duplicate in a sub-app what exists in `shared/`.** If you find yourself mirroring a type or utility, stop and import from `shared/` instead.

### Frontend Placement

- Types → `frontend/src/types`
- Constants → `frontend/src/constants`
- Hooks → `frontend/src/hooks` or nearest domain hook folder
- Do not declare these inline in component trees.

### UI Controls

- Use Radix UI primitives for interactive controls (Tooltip, Popover, Dialog, Tabs, Dropdown).
- Button baseline: visible border, `cursor: pointer`, consistent hover feedback.
- Icon buttons: subtle icon glow on hover via shared CSS — not one-off per component.

### Comments

- Every non-trivial function, hook, and WS handler needs a brief JSDoc: what it does, when it runs, why.
- Complex state flows need an inline comment block at the entry point describing the full sequence.
- No magic numbers or strings — extract to named constants.
- `// TODO` must include a linked issue or named owner.
- Delete dead code. Never comment-out code as backup — use git.

---

## Testing

- Every new WS event handler → unit test in `src/tests/state/`
- Every session lifecycle transition → integration test
- New audio effect type → add to `effectItems` in `AudioPanel.tsx`
- State cleanup (clear on session end) → test required

---

## Document Maintenance (update alongside code)

| Document                                 | Update trigger                                          |
| ---------------------------------------- | ------------------------------------------------------- |
| `CHANGELOG.md`                           | Every meaningful change — feature, fix, contract update |
| `ROADMAP.md`                             | Feature completed, added, or re-scoped                  |
| `docs/CONTRACTS.md`                      | Any API endpoint or WS event contract changes           |
| `docs/architecture/SESSION-LIFECYCLE.md` | Session state machine changes or new lifecycle rules    |
| `docs/architecture/WEBSOCKETS.md`        | New WS event families or transport behavior changes     |
| `shared/events/*.ts`                     | Source of truth — update before implementing handlers   |

`ROADMAP.md` is tracking-only. Detailed design decisions and acceptance criteria belong in `docs/` files, not inline in the roadmap.

`docs/ARCHITECTURE-MAP.txt` is a high-level ASCII overview — it is **not** a maintenance obligation. Prefer `docs/README.md` and `docs/architecture/` as the living architecture reference.

---

## Campaign Persistence

Groups and environments survive session boundaries. `restoreCampaignRoomsForSession` carries forward `GROUP` type rooms on new session start. **Never delete campaign-scoped groups except via explicit DM action.** Deleting a `GROUP` room during an active session requires an explicit confirmation warning that deletion is permanent.

---

## The Fun Principle

If a feature isn't fun, it isn't done. The DM should be able to silently move a player to whisper mid-combat, scramble their voice, set the environment to "Underwater" — all within 2 clicks, all while keeping the narrative flow unbroken. Players feel the world, not the machinery.

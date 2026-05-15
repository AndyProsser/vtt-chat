# VTT-Chat Copilot Instructions

You are working on **VTT-Chat** — a real-time, multi-user voice and chat platform for tabletop roleplaying games (TTRPGs). Sessions run across months and years. The following core DM actions must each be completable within 2 clicks or 1 drag, with a visible response within 200ms and no manual recovery steps required:

- Moving players between groups
- Applying conditions to players
- Setting group environments
- Creating or deleting groups
- Starting, pausing, resuming, or ending a session

Every design decision must reduce the number of steps required for common DM actions, ensure audio transitions complete within 100ms, and guarantee that no DM action leaves the UI in a state requiring manual intervention to recover.

---

## Vision

This app goes beyond Discord by providing DM-specific control over voice groups, audio conditions, environments, and persistent campaign state that standard chat tools do not provide. It gives the DM **superpowers**:

- Move players between voice groups with a drag
- Apply audio conditions (silenced, drunk, confused) that affect how other players hear them
- Set environmental ambiance (forest, cave, tavern) per group that players feel but can't control
- Persist campaigns across sessions — players remember what happened last month because the app does too
- Private notes, whispers, shared lore — all role-aware and privacy-respecting

The goal: make Wizards of the Coast ask to collaborate.

---

## Non-Negotiables

### State Management

**Every state change must converge across all four required layers. Never update only one.**

| Layer | Responsibility | Scope |
| ----- | -------------- | ----- |
| **PostgreSQL** (via Prisma) | Authoritative persistence | Campaign-scoped; survives session boundaries |
| **Redis** | Presence, room membership, audio state | Session-scoped; survives reconnects |
| **WS broadcast** | Sync all connected clients | Session-scoped; fires after persistence |
| **Zustand** | Local UI cache | Per-user; hydrated from server, updated via WS |

Use the table above as a quick reference. Implement every state change using the numbered steps below — in order, without skipping.

**Apply changes in this order — always:**

#### Step 1 — Validate
- Validate the request and all target entities.
- Reject invalid input before touching any layer; return a descriptive error to the acting user.

#### Step 2 — Persist
- Write to PostgreSQL and/or Redis as required by the feature.
- If PostgreSQL write fails: do not proceed to Step 3. Surface an error to the acting user and retry up to 3 times before reporting failure.
- If Redis write fails: log the failure. The WS event may still broadcast, but warn that reconnecting users may see stale state until Redis recovers.
- If both PostgreSQL and Redis fail: log at `error` level, surface a persistent error banner to the acting user, and do not proceed to Step 3. Do not attempt automatic retry for a dual-layer failure — require explicit user-initiated retry.

#### Step 3 — Broadcast
- Emit the WS event to all affected clients after persistence succeeds — never before.
- If WS broadcast fails: log the failure. Affected clients must rehydrate on the next API poll or reconnect — do not silently drop the change.
- If a WS event is delayed beyond 1 second or lost entirely: affected clients must rehydrate their full local state from the server snapshot API on reconnect. Reconnect is always treated as a full rehydration point — never assume partial state is current.
- If a session transition event (`SESSION:STATE_CHANGED` or `ROOM:SESSION_TRANSITION_APPLIED`) is not received within the expected window, clients must poll the session state API directly to confirm the current state before rendering any session-gated UI — never infer session state from the absence of an event.

#### Step 4 — Update Zustand
- All clients update their local Zustand slice from the WS payload — not from the local action.
- This ensures all clients converge on the same state, including the acting user.

#### Step 5 — Confirm UI
- Verify the UI reflects the final state for both the acting user and all affected users.
- If the round-trip from DM action to visible UI update exceeds **500ms**, display a loading indicator and retry automatically up to 3 times.
- After 3 failed retries, surface a clear error with an explicit retry button — never fail silently.
- If persistent network issues prevent retries from succeeding, display a degraded-connectivity warning and preserve the attempted action state for manual retry when connectivity is restored — do not queue background retries indefinitely.
- If an action was partially applied (e.g., persisted to PostgreSQL but WS broadcast failed), treat the server state as authoritative on reconnection. Never resolve the inconsistency by trusting stale local Zustand — rehydrate fully from the server API after reconnect.

**Example — DM applies a condition to a player:**
- PostgreSQL/Redis: condition persisted and keyed to session
- WS: `AUDIO:DM_OVERRIDE_APPLIED` broadcast to all members
- DM's Zustand: `dmOverrides` updated
- Player's Zustand: `currentCondition` updated
- AudioPanel: condition shown with icon and explanation

**State that persists across sessions:**

- Campaign `GROUP` type rooms and their environments
- Player notes and shared handouts
- Session logs and chat history

**State that is per-session only:**

- `PRIVATE` type rooms (deleted on session `ENDED`)
- Player conditions (DM overrides — cleared on session transition to IDLE/ENDED)
- Audio effects, distance modifiers, voice presets, IC presets
- Broadcast/voice-of-god state

### Whisper Bubble (Single Private Group)

Whisper is a single, system-managed private bubble for off-the-record side chats.

- Exactly one `PRIVATE` room exists per started session.
- The room is created automatically when the session starts and is always rendered at the bottom of the group list.
- DMs cannot create extra private groups.
- Private room chat and voice are never recorded, never logged, and never persisted to history.
- Spectators can only see who is currently in Whisper; they cannot hear or read Whisper content.

Whisper behavior:

- When the DM drags a player into Whisper:
  - DM voice target auto-focuses to Whisper.
  - Broadcast mode is disabled and locked while Whisper is active.
  - All per-session audio effects are suspended/cleared inside Whisper.
  - Speaking indicators are hidden for Whisper participants.
- DM can drag additional players into Whisper under the same rules.
- DM cannot retarget DM voice/broadcast until Whisper ends.
- Ending Whisper returns everyone to their exact previous state:
  - previous room membership
  - prior active conditions and effects
  - prior DM voice target

This transition must complete within **200ms** of the DM action (measured from server acknowledgement to all-client Zustand update). If it exceeds 500ms, display a loading indicator on the Whisper card and retry the API call up to 3 times before surfacing an error. Quick private huddle, then back to play — no delays or interruptions in transitioning back to the main session.

### Session Lifecycle Rules

Use the following transition rules so cleanup and rehydration stay predictable:

| Situation                                                      | Required action                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Session enters hydration/initial load                          | Call `resetSessionAudioState()` before rehydrating any session-scoped audio state from the server |
| Session enters hydration/initial load                          | Re-apply environment, conditions, and overrides from the server audio state API after reset       |
| `SESSION:ENDED` fires                                          | Call `resetSessionAudioState()` and `clearActiveEffects()`                                        |
| `ROOM:SESSION_TRANSITION_APPLIED` with `nextState === 'IDLE'`  | Call `resetSessionAudioState()` and `clearActiveEffects()`                                        |
| `ROOM:SESSION_TRANSITION_APPLIED` with `nextState === 'ENDED'` | Call `resetSessionAudioState()` and `clearActiveEffects()`                                        |
| Any of the above cleanup paths                                 | Do **not** clear `roomEnvironmentNames` because it is campaign-persistent                         |

### Session State Machine

The session state machine is the single source of truth for what is and is not permitted at any point in time. All UI rendering, API validation, and Zustand logic must gate on the canonical `SessionState` enum from `shared/types/index.ts` — never on hardcoded strings.

**Valid transitions — quick reference:**

```
IDLE ──► ACTIVE ──► PAUSED ──► ACTIVE (resume)
                 └──► ENDED ──► CLEANUP
```

| From     | To        | Trigger                      |
| -------- | --------- | ---------------------------- |
| `IDLE`   | `ACTIVE`  | DM starts session            |
| `ACTIVE` | `PAUSED`  | DM pauses session            |
| `ACTIVE` | `ENDED`   | DM ends session              |
| `PAUSED` | `ACTIVE`  | DM resumes session           |
| `PAUSED` | `ENDED`   | DM ends from paused state    |
| `ENDED`  | `CLEANUP` | System cleanup completes     |

**Rules — apply in this order for every DM action:** enum usage → API validation → UI gating → Zustand/effects.

_Enum usage (never use raw strings):_
- Always import `SessionState` from `shared/types/index.ts`.
- Always use `shared/utils/session-state.ts` helpers (`isGreenroomSessionState`, `deriveCampaignDisplayState`, `normalizeSessionState`) — never re-implement them.

_API validation:_
- Read the current session state from the database before acting. Return `403` with a descriptive message if the action is invalid for that state.
- No transition may skip states — `IDLE → ENDED` is invalid; reject it at the API layer.

_UI gating:_
- Compute a single `isValidForState` value at the feature level and thread it down. Do not scatter ad-hoc `if (state === ...)` blocks across components.
- Disable or hide controls when the session state makes them invalid — do not rely on the API to catch it first.

_Zustand / effects:_
- Derive all session-gated effects from the authoritative state received via WS or API, not from stale local flags.
- Before implementing any DM action, confirm which session states permit it. Add that guard before writing any other code.

```ts
// WRONG — hardcoded string, no state guard
if (session.state === 'ACTIVE') { ... }

// RIGHT — enum from shared, using shared utility
import { SessionState } from '@vtt-chat/shared/types'
import { isGreenroomSessionState } from '@vtt-chat/shared/utils/session-state'
if (session.state === SessionState.ACTIVE) { ... }
```

**Invalid transition handling:**

If the DM or API attempts a transition not listed in the valid transitions table above:
- **API layer:** return `403` with a message of the form `"Invalid transition: {currentState} → {requestedState}. Allowed transitions from {currentState}: {list}"`.
- **UI layer:** disable the triggering control before the request is made. If the API rejects it anyway, display a toast: `"That action isn't available while the session is {currentState}."` — never a generic error.
- Never silently ignore an invalid transition. Always surface the reason and the allowed alternatives.

---

### Recording Policy (Contract)

Recording behavior is privacy-critical and must follow these rules:

- Whisper (`PRIVATE`) is always off-the-record:
  - Whisper voice/chat is never recorded, never logged, never persisted.
- Intermission (`PAUSED`) is also off-the-record for runtime content:
  - Runtime voice/chat during pause must not be recorded or persisted.
  - The only persistent artifacts allowed during pause/resume are session boundary markers.
- Boundary-only persistence:
  - Persist exactly these system markers when they occur: `[Session Started]`, `[Session Paused]`, `[Session Resumed]`, `[Session Ended]`.
  - No other pause/whisper runtime transcript content should survive history hydration.

Note: if runtime recording controls are not wired yet, this remains a required contract and must be implemented before enabling recording capture in-session.

### Chat Message Persistence Model

**Experience Persistence Principle:** Players retain all messages they have witnessed in a session, regardless of group movement. Messages are never "trapped" as players move between contexts.

**Message Type Persistence:**

- **IC, OOC, System messages:** Always persisted to campaign history. Players always retain these.
- **Whisper messages (player-to-player):** Always persisted to campaign history for sender and all targets.
- **DM Whisper messages:** Always visible to target player regardless of group movement (except in Whisper Group context).
- **Greenroom messages:** Ephemeral by default (purged at cleanup); marked for staging/privacy.
- **Whisper Group messages:** Off-the-record by default (deleted on exit). DM can toggle persistence per campaign.

**Key Rule:** No message is "lost" or "trapped" as players move groups. The session group history (`sessionGroupHistory` in Zustand) tracks all contexts a player visits; all messages from those contexts remain visible.

**Spectator Message Model:** Spectators are ephemeral-only. They see current session messages only (IC, OOC, global system) and do NOT have campaign history access. Spectator messages are never persisted to campaign archive.

### Audio Effects Are Contextual and Visible

Players must ALWAYS know WHY their audio sounds different. The AudioPanel (`<AudioPanel />`) shows a live list of active effects with icons:

- Environment (e.g., "Tavern" — low reverb, warm)
- Condition (e.g., "Drunk" — pitch wobble, slur)
- Distance (e.g., "Distant" — muffled, lowpass)
- Voice preset (DM-applied character voice)
- PTT (push-to-talk active/inactive)

When the DM changes a group's environment, **all players in that group receive the `AUDIO:ENVIRONMENT_SET` WS event** and their AudioPanel updates immediately. No page refresh required.

### Condition: SILENCED

A silenced player's audio output is **routed only to the DM & spectators**. All other players hear nothing from them. This is intentional DM mischief. The silenced player sees `SILENCED` in their AudioPanel with an explanation.

### DM Simplicity

The DM must be able to complete every primary control in 2 clicks or 1 drag, with visible confirmation within 200ms (optimistic UI update or loading indicator) and no hidden recovery steps. If an interaction requires more than that, redesign it.

DM actions that must remain simple:

- Drag a player to a new group: 1 drag
- Apply a condition: right-click → select condition
- Set a group environment: click environment icon → pick from list
- Create a group: during session (`ACTIVE`/`PAUSED`), click the `group_add` icon in the Voice Groups panel → name it → confirm
- Delete a group: click X (inline on the group card)
- Send notes to party: click send
- Start/stop session: 1 click

### Greenroom Purity (Staging Before Show)

- The greenroom is a staging area, not the performance space.
- In greenroom state, the DM must manage groups from the rightbar Groups panel.
- The main central greenroom experience should remain visually pure and uncluttered.
- Spectators never see the greenroom.

### Group Visibility Rules

- During ACTIVE session state, DM sees all groups.
- During greenroom state, group management is done in the rightbar Groups panel to preserve greenroom purity.
- Group creation icon is shown in the Voice Groups panel during session (`ACTIVE`/`PAUSED`) and hidden in greenroom (`IDLE`/`ENDED`).
- In greenroom, creation exists only in the dedicated Groups rightbar panel (not in the Voice Groups panel).
- Players see a group only when ≥1 player is a member
- Empty groups collapse to single-line for DM, with inline X delete button
- Empty groups are excluded from broadcast (no one to hear it)
- When a DM deletes a `GROUP` room (in-session or greenroom), it is permanently removed.
- Deleting a `GROUP` room during an active session must require an explicit confirmation step that warns the DM the deletion is permanent.

### Spectator Theatre Mode

When spectators are enabled, the session behaves like a theater production.

- Spectators can watch/hear only the active show.
- Spectators cannot access whispers or private DM-player chats.
- Spectators cannot see the greenroom.

Session state semantics:

- `ACTIVE` = show is live (curtain up): spectators can observe public stage activity only.
- `PAUSED` = intermission (curtain down): spectators cannot see/hear session content.
  - Players and DM are moved to `MAIN` (stage prep), not to greenroom.
  - Per-session effects are not active during intermission view.
- Resume from pause = curtain up: audience visibility returns and pre-pause effects are restored.
- `ENDED` with spectators enabled = finale cooldown window before greenroom exit:
  - Players and DM are brought to `MAIN` with no effects for post-show thanks.
  - Cooldown default is 60 seconds and must be configurable in campaign settings.
  - DM can extend cooldown before expiry.
  - Only during cooldown may spectators interact via voice/chat with players and DM.
  - Cooldown interaction is never recorded in session history.
  - Cooldown chat is purged from session logs; it may remain temporarily visible until greenroom chat cleanup runs.

### Environment Changes Propagate

When the DM sets a group's environment:

1. Validate the requested environment name and room target before applying changes.
2. If the API receives invalid input, return `400` with a descriptive error message and log the validation failure for debugging.
3. POST to `/api/audio/environments/apply`
4. Backend broadcasts `AUDIO:ENVIRONMENT_SET` to all session members
5. Frontend `handleEnvironmentSet` updates `roomEnvironmentNames` in Zustand for ALL clients
6. `SessionInit` env-sync effect applies the new environment for players currently in that room
7. AudioPanel shows updated environment immediately — no refresh required

---

## Architectural Mandates

### Never Update Only One State Layer

```ts
// WRONG — only updates local store
setRoomEnvironmentName(roomId, environmentName)

// RIGHT — API call → WS broadcast → all clients update via handleEnvironmentSet
await fetch('/api/audio/environments/apply', { method: 'POST', body: ... })
// Then handleEnvironmentSet in audioPresetsSlice.ts handles the WS event for all clients
```

### Zustand Is Not the Source of Truth — The Server Is

Zustand is a local cache of server state. When in doubt:

- The server (PostgreSQL + Redis) is authoritative
- Zustand is hydrated from the server on session enter
- WS events keep Zustand in sync during the session

Chat send queue rule:

- Zustand may hold a local outgoing message queue (`queued`/`sending`/`failed`) for UX resilience.
- Persisted chat timeline (including `SYSTEM` bookends) remains backend + WS authoritative.

Reconnect/refresh authority rule:

- On frontend reconnect or browser refresh, treat local Zustand as stale cache until backend snapshots/events rehydrate it.
- Do not trust client-only state over backend state after reconnect.
- Recovery must replace stale local topology/audio/session projections with backend-derived values.

### WS Events Are the Sync Bus

Every state change that affects multiple users must travel via a WS event:

- Audio: `AUDIO:ENVIRONMENT_SET`, `AUDIO:DM_OVERRIDE_APPLIED`, `AUDIO:DM_OVERRIDE_REMOVED`, `AUDIO:BROADCAST_STATE_CHANGED`
- Rooms: `ROOM:CREATED`, `ROOM:DELETED`, `ROOM:USER_JOINED`, `ROOM:USER_LEFT`, `ROOM:SESSION_TRANSITION_APPLIED`
- Session: `SESSION:STATE_CHANGED`, `SESSION:ENDED`

If a WebSocket disconnects during an active or paused session:

- Attempt reconnection immediately and continue retrying within a 5-second recovery window.
- Treat local Zustand as stale until backend snapshots and WS events rehydrate it.
- If reconnection does not recover within that window, notify the user that live sync is degraded and present an explicit retry path.
- After reconnection succeeds, rehydrate session topology, audio state, and boundary markers from backend-authoritative sources.

**WS Event Completeness Checklist**

Every new WS event must satisfy ALL of the following before it is considered done. An event that fails any item is incomplete and must not be shipped:

- [ ] **Shared type** — event name constant and payload type defined in `shared/events/`
- [ ] **Backend emits** — backend emits the event after persisting the relevant state change (never before)
- [ ] **All affected clients have a handler** — not just the acting user; every client that needs to react has a registered handler
- [ ] **All affected Zustand slices update** — the handler updates state for every user who is affected, not only the sender
- [ ] **Redis updated** — if the event carries presence, room membership, or audio state that must survive reconnect
- [ ] **Unit test** — a test exists in `frontend/tests/state/` and/or `backend/tests/` covering the handler and emission
- [ ] **Event registered** — the event name is listed in the WS event registry comment block in `backend/src/ws/index.ts`

**Invalid or malformed WS events:**

- If an incoming event has an unrecognised name or a payload that fails type validation, log the raw event at `warn` level and discard it — do not throw.
- If a handler throws during processing, catch the error, log it with the event name and session ID, and do not let it crash the WS connection.
- Surface persistent handler errors as a degraded-sync warning to the affected user if the failure prevents their local state from updating.
- If more than 5 invalid or unrecognised events are received from the same connection within 1 minute, escalate to `error` level logging and display a persistent degraded-sync warning to the user with an explicit reconnect option. On reconnect, treat local Zustand as fully stale and rehydrate all session state from the server — do not attempt to merge or patch from the corrupted event stream.

### Session Bookends Must Survive Refresh

Session boundary markers are authoritative server data, not ephemeral UI-only markers.

- On session transitions (`ACTIVE`, `PAUSED`, resume-to-`ACTIVE`, `ENDED`), backend must persist a system message for the boundary.
- Backend must broadcast the persisted boundary via `CHAT:MESSAGE_SENT` so all connected clients update immediately.
- Frontend must render both canonical server boundary formats (`[Session Started]`, `[Session Ended]`, `[Session Paused]`, `[Session Resumed]`) as chat bookends.
- On page refresh/reconnect, the frontend must restore boundary markers from chat history API hydration; markers must not disappear after reload.
- Frontend must avoid duplicate boundary markers when local fallback and server/WS boundary events arrive close together.
- If boundary persistence fails, retry the persistence operation up to 3 times and log the failure for manual review.

Boundary sync and authority rules:

- Pause/resume/start/end boundary markers must sync from backend via WS (`CHAT:MESSAGE_SENT`) and history APIs.
- On refresh/reconnect (including paused sessions), backend state is authoritative; client cache must rehydrate from backend snapshots/history.
- Bookends are `SYSTEM` chat messages with special status and may appear in both greenroom and active-session chats.

Transcript/summary processing rule:

- Do not drop boundary bookends from transcript/summary pipelines.
- Include them as control/timestamp guides for downstream AI processing so pause/resume/start/end boundaries are explicit.
- Downstream processors may use these markers to decide which content windows to include/exclude.

### Audio Must Follow Connected Voice Room

- Audio environment/effects must be driven by the user's actual connected voice room (`primaryRoomId` / voice connection target), not selected UI room.
- If connected room changes, environment/effect projection must update immediately.
- If connected room is `PRIVATE` or greenroom (or no connected room exists), clear room-environment projection to neutral/default.

### handleEnvironmentSet Must Always Update roomEnvironmentNames

The `handleEnvironmentSet` WS handler in `audioPresetsSlice.ts` must update `roomEnvironmentNames` even when `parameters` is absent. `roomEnvironmentNames` drives the environment sync effect in `SessionInit.tsx`.

---

## Code Quality Standards

### File Size Limit: 400 Lines

No source file may exceed **400 lines** (excluding blank lines and import blocks). When a file grows beyond this, it must be split.

How to split:
1. Identify logical domains within the file (data fetching, UI rendering, event handling, type definitions, constants).
2. Extract each domain into its own co-located file.
3. Leave the parent as a thin orchestrator that imports from the domain files.

Naming conventions for split files:

| Domain                  | Pattern                                  |
| ----------------------- | ---------------------------------------- |
| Sub-component           | `ComponentName.Part.tsx`                 |
| Hook                    | `useFeatureName.ts`                      |
| Event handlers / logic  | `featureName.handlers.ts`                |
| Local types             | `featureName.types.ts`                   |
| Local constants         | `featureName.constants.ts`               |
| Backend route           | `resource.routes.ts` (one per resource)  |
| Backend service         | `resource.service.ts`                    |

`SessionInit.tsx` at 3,500+ lines is the canonical example of what must not happen and is a priority refactor target.

### Componentisation Rules

- Extract any JSX block longer than ~50 lines into a named sub-component in its own file.
- A component's job is rendering and event wiring. Data fetching, transformation, and business logic belong in hooks or services — not inline in JSX.
- Never pass more than 5 props without considering a context, a composed component, or a dedicated hook.
- Do not put the full Zustand store object into React effect dependency arrays. Depend on stable selectors or action refs to prevent re-render loops.
- Selector fallbacks like `state.slice[id] || {}` or `|| []` can cause infinite snapshot loops in Zustand + React 19. Use stable empty constants defined outside the component instead.

### Shared Package Boundary

The `shared/` package is the canonical source for anything used by two or more of: `backend`, `frontend`, `admin`.

**Always lives in `shared/`:**
- WS event names and payload types → `shared/events/`
- Session, room, role, message type, and presence enums → `shared/types/`
- Session state utility functions → `shared/utils/session-state.ts`
- Permission helpers → `shared/permissions/`
- Input validators used by API and frontend → `shared/validators/`

**Must be moved to `shared/` if needed by ≥ 2 sub-apps:**
- Any formatting utility
- Any hook or utility needed by both `frontend/` and `admin/`
- Any constant or enum that mirrors an existing `shared/` value

**Never duplicate in a sub-app what already exists in `shared/`.** If you find yourself defining a type, enum, or utility that mirrors something in `shared/`, stop and import from `shared/` instead.

### Frontend + Admin Style Consolidation

`frontend/` and `admin/` are separate React apps but must feel visually consistent:

- Design tokens (colours, spacing, typography) must be defined once and consumed by both apps.
- If a UI component (modal, badge, button variant, toast, confirmation dialog) is needed in both apps, it belongs in a shared component library — not copy-pasted between them.
- Loading, error, and empty states must follow a single pattern across both apps.
- Confirmation dialogs and destructive-action warnings must use consistent copy and visual treatment everywhere in the product.

### Code Comments and Maintainability

- Every non-trivial function, hook, and WS handler must have a brief JSDoc comment explaining **what it does, when it runs, and why** — not a restatement of what the code already says.
- Complex state flows (multi-layer updates, lifecycle transitions) must have an inline comment block at the entry point describing the full sequence.
- No magic numbers or magic strings — extract to named constants in the appropriate constants file.
- `// TODO` comments must include a linked issue or named owner. A `// TODO` that outlives one session is a defect.
- Delete dead code on sight. Never comment out code as a form of backup — version control exists for that.

---

## Testing Mandates

- Every new WS event handler must have a unit test in `src/tests/state/`
- Every session lifecycle transition must be covered by integration tests
- When adding a new audio effect type, add it to `effectItems` in `AudioPanel.tsx`
- State cleanup (clear on session end) must be tested

---

## Campaign Persistence Reminder

Groups and their environments survive session boundaries. When a new session starts for the same campaign, `restoreCampaignRoomsForSession` carries forward `GROUP` type rooms from the previous session. Never delete campaign-scoped groups except via explicit DM action.

---

## The Fun Principle

If a feature isn't fun, it isn't done. The DM should be able to silently:

- Move a player to a whisper group mid-combat
- Apply "Confused" to make their voice scrambled
- Set the environment to "Underwater" for dramatic effect
- All within 2 clicks, all while keeping the narrative flow unbroken

Players should feel the magic of the world, not the machinery of the app.

---

## Document Maintenance

The following documents must be kept current as standing discipline — not as an afterthought. A change without a matching doc update is incomplete.

| Document                    | Update trigger                                                           |
| --------------------------- | ------------------------------------------------------------------------ |
| `CHANGELOG.md`              | Every meaningful change — feature, fix, or contract update               |
| `ROADMAP.md`                | When a feature is completed, added, or re-scoped                         |
| `docs/CONTRACTS.md`         | When any API endpoint or WS event contract changes                       |
| `docs/ARCHITECTURE-MAP.txt` | When new files, modules, or subsystems are added                         |

---

## Living Instructions (This File)

This file (`copilot-instructions.md`) is itself a living document.

**Propose an update to this file whenever:**
- A new recurring pattern or cross-cutting contract is established during development.
- A non-negotiable rule is changed, expanded, or found to be incomplete or incorrect.
- A new feature area introduces concepts or constraints not yet covered here.
- A pattern that has caused repeated rework is identified.

Before implementing any significant feature, check whether it fits the existing contracts here. If it requires a new rule or changes an existing one, surface that as part of the work — propose the instruction update alongside the code change, not after it.


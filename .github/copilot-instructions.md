# VTT-Chat Copilot Instructions

You are working on **VTT-Chat** — a real-time, multi-user voice and chat platform for tabletop roleplaying games (TTRPGs). Sessions run across months and years. The DM must be able to manage core actions within 2 clicks or 1 drag, without confusing state or delayed feedback. The experience must be fun, magical, and so good players tell everyone they know.

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

**Every state change must converge across all required state layers:**

1. **Zustand** — local store for the current user's session state
2. **WebSocket broadcast** — other connected users must receive the change via WS event
3. **Redis** — presence, room membership, and audio state persisted for reconnects
4. **Database (PostgreSQL via Prisma)** — campaign-scoped data survives session boundaries

**Never update only one layer.** Apply cross-layer changes in this order unless a stricter server contract already exists:

1. Validate the request and target entities.
2. Persist the authoritative server state in PostgreSQL and/or Redis as required by the feature.
3. Broadcast the resulting WS event to all affected clients.
4. Update Zustand from the server result or WS payload so local state matches the authoritative state.
5. Confirm the UI surface reflects the final state for both the acting user and affected users.

If the DM changes a player's condition, the completed flow must result in all of the following:

- The DM's Zustand store updates `dmOverrides`
- The target player's Zustand store updates `currentCondition`
- The WS event `AUDIO:DM_OVERRIDE_APPLIED` broadcasts to all session members
- Redis records the override so reconnecting players see the correct state
- The AudioPanel shows the condition with an icon and explanation

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

This must feel instant: quick private huddle, then back to play.

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

The DM must be able to complete every primary control in 2 clicks or 1 drag, with immediate visible feedback and no hidden recovery steps. If an interaction requires more than that, redesign it.

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

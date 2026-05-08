# VTT-Chat Copilot Instructions

You are working on **VTT-Chat** — a real-time, multi-user voice and chat platform for tabletop roleplaying games (TTRPGs). Sessions run across months and years. The DM must never be overwhelmed. The experience must be fun, magical, and so good players tell everyone they know.

---

## Vision

This app is what Discord will never be. It gives the DM **superpowers**:

- Move players between voice groups with a drag
- Apply audio conditions (silenced, drunk, confused) that affect how other players hear them
- Set environmental ambiance (forest, cave, tavern) per group that players feel but can't control
- Persist campaigns across sessions — players remember what happened last month because the app does too
- Private notes, whispers, shared lore — all role-aware and privacy-respecting

The goal: make Wizards of the Coast ask to collaborate.

---

## Non-Negotiables

### State Management

**Every state change must be consistent across ALL of these simultaneously:**

1. **Zustand** — local store for the current user's session state
2. **WebSocket broadcast** — other connected users must receive the change via WS event
3. **Redis** — presence, room membership, and audio state persisted for reconnects
4. **Database (PostgreSQL via Prisma)** — campaign-scoped data survives session boundaries

**Never update only one layer.** If the DM changes a player's condition:

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

### Session Lifecycle Rules

- On `SESSION:ENDED` or `ROOM:SESSION_TRANSITION_APPLIED` with `nextState === 'IDLE'` or `'ENDED'`:
  - Call `resetSessionAudioState()` and `clearActiveEffects()` on the Zustand store
  - Do NOT clear `roomEnvironmentNames` (campaign-persistent)
- On session enter/hydration:
  - Call `resetSessionAudioState()` BEFORE re-hydrating from server state
  - Re-apply environment, conditions, and overrides from the server audio state API

### Audio Effects Are Contextual and Visible

Players must ALWAYS know WHY their audio sounds different. The AudioPanel (`<AudioPanel />`) shows a live list of active effects with icons:

- Environment (e.g., "Tavern" — low reverb, warm)
- Condition (e.g., "Drunk" — pitch wobble, slur)
- Distance (e.g., "Distant" — muffled, lowpass)
- Voice preset (DM-applied character voice)
- PTT (push-to-talk active/inactive)

When the DM changes a group's environment, **all players in that group receive the `AUDIO:ENVIRONMENT_SET` WS event** and their AudioPanel updates immediately. No page refresh required.

### Condition: SILENCED

A silenced player's audio output is **routed only to the DM**. All other players hear nothing from them. This is intentional DM mischief. The silenced player sees `SILENCED` in their AudioPanel with an explanation.

### DM Simplicity

The DM cannot be overwhelmed. Every action must be ≤ 2 clicks or 1 drag. If an interaction requires more than that, redesign it.

DM actions that must remain simple:

- Drag a player to a new group: 1 drag
- Apply a condition: right-click → select condition
- Set a group environment: click environment icon → pick from list
- Create a group: click "+ Create Group" → name it → confirm
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
- Players see a group only when ≥1 player is a member
- Empty groups collapse to single-line for DM, with inline X delete button
- Empty groups are excluded from broadcast (no one to hear it)
- DMs can create, configure, and delete `GROUP` type rooms from greenroom ahead of time

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

1. POST to `/api/v1/audio/environments/apply`
2. Backend broadcasts `AUDIO:ENVIRONMENT_SET` to all session members
3. Frontend `handleEnvironmentSet` updates `roomEnvironmentNames` in Zustand for ALL clients
4. `SessionInit` env-sync effect applies the new environment for players currently in that room
5. AudioPanel shows updated environment immediately — no refresh required

---

## Architectural Mandates

### Never Update Only One State Layer

```ts
// WRONG — only updates local store
setRoomEnvironmentName(roomId, environmentName)

// RIGHT — API call → WS broadcast → all clients update via handleEnvironmentSet
await fetch('/api/v1/audio/environments/apply', { method: 'POST', body: ... })
// Then handleEnvironmentSet in audioPresetsSlice.ts handles the WS event for all clients
```

### Zustand Is Not the Source of Truth — The Server Is

Zustand is a local cache of server state. When in doubt:

- The server (PostgreSQL + Redis) is authoritative
- Zustand is hydrated from the server on session enter
- WS events keep Zustand in sync during the session

### WS Events Are the Sync Bus

Every state change that affects multiple users must travel via a WS event:

- Audio: `AUDIO:ENVIRONMENT_SET`, `AUDIO:DM_OVERRIDE_APPLIED`, `AUDIO:DM_OVERRIDE_REMOVED`, `AUDIO:BROADCAST_STATE_CHANGED`
- Rooms: `ROOM:CREATED`, `ROOM:DELETED`, `ROOM:USER_JOINED`, `ROOM:USER_LEFT`, `ROOM:SESSION_TRANSITION_APPLIED`
- Session: `SESSION:STATE_CHANGED`, `SESSION:ENDED`

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

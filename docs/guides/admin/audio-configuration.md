# Audio Configuration & Mute System (Admin Guide)

This guide explains how to configure and troubleshoot the audio system for campaign admins and DMs.

## Audio System Architecture

VTT-Chat's audio layer has two main components:

1. **LiveKit Transport** — Peer-to-peer audio codec and voice routing
2. **VTT-Chat Audio State** — Environments, conditions, DM effects, and mute states

### Mute System Overview

The mute system provides two independent control layers:

| Layer                | Source                   | Purpose                                           | Persistence            |
| -------------------- | ------------------------ | ------------------------------------------------- | ---------------------- |
| **User Mute**        | Player's own mute button | Privacy control; player chooses not to speak      | Redis (session-scoped) |
| **DM Override Mute** | DM's audio controls      | Gameplay effects; silenced spell, dramatic pauses | Redis (session-scoped) |

Both layers are **immediately visible** to all players as badges on avatars.

## Session Lifecycle & Audio State

### Session Start (`ACTIVE`)

When a session transitions to `ACTIVE`:

1. Backend creates audio state snapshot in Redis
2. Frontend hydrates Zustand store from snapshot
3. Room environments are restored (e.g., "Tavern", "Forest")
4. User mute states are restored from previous session (if resuming)
5. DM override mutes are cleared (per-session only)

### Session Pause (`PAUSED`)

During pause:

- Per-session audio effects are **suspended** (environments, conditions)
- User mute states remain active (if player mutes, stay muted through pause)
- Room-environment names persist (campaign-scoped)
- No runtime audio is recorded

### Session Resume

When resuming from pause:

- Audio effects are **reapplied** from session state
- Mute states are restored to pre-pause values
- Speaking indicators refresh
- All avatars restore their visual state

### Session End (`ENDED`)

When ending a session:

1. Session boundary marker persists to history: `[Session Ended]`
2. Per-session mute states are **cleared** (ephemeral)
3. Per-session effects are **cleared** (conditions, DM overrides)
4. Campaign-scoped group definitions persist for next session
5. Chat history retains all messages (ephemeral audio state does not)

## Mute State Persistence Model

### Redis Presence Hash

Each user's mute state is stored in Redis during a session:

```
HSET presence:session:{sessionId} user:{userId}:muted 1
HSET presence:session:{sessionId} user:{userId}:dm_muted 1
```

**Scope:** Session-specific. Cleared on session end.

**Recovery:** On browser refresh or reconnect, `GET /api/audio/state/:sessionId` restores full mute map.

### User Mute Persistence

User mute persists across **pause/resume** within the same session:

1. Player mutes → `POST /api/audio/mute` → stored in Redis
2. Session pauses
3. Session resumes → `GET /api/audio/state/:sessionId` → mute state restored
4. Player sees their mute badge; others see it too

### DM Override Persistence

DM override mute persists across **pause/resume** within the same session:

1. DM applies mute effect → `AUDIO:DM_OVERRIDE_APPLIED` WS event
2. Frontend store updates `dmOverrides[userId]`
3. Session pauses
4. Session resumes → effects reapplied from stored DM overrides
5. Players see mute badges; mute condition is restored

### Cross-Session Cleanup

**User mute states are NOT persisted across sessions:**

- If Player A mutes during Session 1 and session ends
- Session 2 starts (next week, same campaign)
- Player A is NOT muted (fresh session)
- Rationale: Mute is a per-session tactical choice, not a campaign preference

## DM Muting Use Cases

### Silenced Spell

1. DM applies mute override to target player
2. Target player's avatar shows mute badge
3. Target player hears themselves but others don't
4. Spell duration ends → DM removes mute
5. Avatar badge disappears; player re-enters groups

### Off-the-Record Whisper

1. DM drags player(s) to `PRIVATE` (Whisper) group
2. DM voice auto-targets Whisper
3. Whisper group content is **not recorded**
4. Side conversation happens (OOC coordination, rules questions, etc.)
5. DM drags players back to main group
6. Everyone returns with prior state restored

### Muffled/Environmental Effect

1. DM sets group environment to "Underwater"
2. Backend applies audio filter (lowpass, reverb)
3. Players hear the effect; avatars show no change
4. Mute is optional here (unless combined with other effects)

## Configuring Session Audio State

### Setting Room Environments

```http
POST /api/audio/environments/apply
Content-Type: application/json

{
  "sessionId": "session:active:123",
  "roomId": "room:main:456",
  "environmentName": "tavern"
}
```

**Available Environments:** tavern, forest, cave, underwater, void, laboratory, crypt, temple, arena, throne-room

**Effect:**

- All players in that room immediately receive `AUDIO:ENVIRONMENT_SET` event
- Avatars show environment name in tooltip
- Audio DSP filters apply (reverb, EQ) in real-time

### Applying DM Override Conditions

**Backend Action:**

```typescript
store.setDMOverride(userId, {
  muted: true,
  condition: 'silenced', // Optional: UI hint
  durationSeconds: 30, // Optional: UI countdown
})
```

**Frontend WS Event:**

```json
{
  "type": "AUDIO:DM_OVERRIDE_APPLIED",
  "payload": {
    "userId": "user:123",
    "override": { "muted": true, "condition": "silenced" }
  }
}
```

**Result:**

- Target player sees mute badge
- Target player cannot be heard by others (except DM + spectators)
- Other players see the badge; they know target is muted

## Troubleshooting Audio Issues

### Players Report No Audio from Specific Group

1. **Check group membership:**

   ```http
   GET /api/sessions/:sessionId/rooms
   ```

   Verify players are joined to the correct room.

2. **Check environment state:**

   ```http
   GET /api/audio/state/:sessionId
   ```

   Look for `roomEnvironmentNames[roomId]`. If "muffled" or "underwater", audio may be intentionally filtered.

3. **Restart LiveKit connection:**
   - Ask players to mute/unmute (triggers reconnect)
   - Or refresh the page (forces re-join)

### Player Claims They're Muted But Didn't Click Mute

1. **Check user mute state:**

   ```
   redis-cli hget presence:session:{sessionId} user:{userId}:muted
   ```

   Should be empty or `0` if not muted.

2. **Check DM override:**

   ```
   redis-cli hget presence:session:{sessionId} user:{userId}:dm_muted
   ```

   If `1`, DM has applied a mute. Ask DM to remove it.

3. **Check browser settings:**
   - Verify microphone is enabled in browser permissions
   - Check OS audio settings (not muted in system)

### Mute State Doesn't Persist After Refresh

1. **Verify Redis is running:**

   ```bash
   redis-cli ping
   ```

   Should return `PONG`.

2. **Check audio state API response:**

   ```http
   GET /api/audio/state/:sessionId
   ```

   Should include `userMuteState` object with session users.

3. **Verify backend logs for errors:**
   ```bash
   docker logs vtt-backend
   ```
   Look for: `ERROR`, `audio/mute`, `Redis connection failed`

### Mute Badge Appears Without Mute Being Applied

1. **Check both mute sources:**
   - User mute: `redis-cli hget presence:session:{sessionId} user:{userId}:muted`
   - DM override: `redis-cli hget presence:session:{sessionId} user:{userId}:dm_muted`
   - One should be `1` (true).

2. **Frontend store sync issue:**
   - Open browser DevTools Console
   - Run: `localStorage.debug = 'vtt:*'` for debug logs
   - Reload page
   - Look for `AUDIO:USER_MUTED` or `AUDIO:DM_OVERRIDE_APPLIED` events

3. **Force refresh store:**
   - Disconnect player (F5 refresh)
   - Should re-hydrate from backend state
   - If badge persists, it's correct state; if disappears, was UI glitch

## Performance & Scalability

### Per-Session Mute State Limits

- Up to **500 players per session** supported
- Mute state stored as Redis hash (efficient O(1) lookup)
- WS broadcast scales linearly with session size (< 50ms for 100 players)

### Cleanup on Session End

```typescript
// Backend automatically runs on SESSION:ENDED
clearSessionAudioState(sessionId) // Clears Redis presence hash
// Mute map deleted; next session starts fresh
```

## Compliance & Privacy

### Recording Policy

- **Muted players (any source):** Their audio is **not recorded** (excluded from runtime capture)
- **Whisper group:** All audio/chat **not recorded** (off-the-record)
- **DM override mute:** Same privacy as user mute; target audio not persisted
- **Pause state:** Runtime audio during pause **not recorded** (can resume without history)

### Data Retention

- **Session mute state:** Deleted when session ends (not persisted to permanent storage)
- **Chat history:** Includes system bookends (`[Session Started]`, `[Session Ended]`) but not mute state
- **Audit log:** DM actions (mute application, environment changes) logged but not user mute toggles

## Related Documentation

- [Mock Players Guide](../dev/mock-players.md) — For testing mute flow with developers
- [Groups Panel User Guide](../user/groups-panel.md) — For explaining mute badges to players

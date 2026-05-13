# Mock Players Guide

Mock players are automatically seeded into every development session to enable testing of multi-player scenarios without spinning up multiple browser instances or actual LiveKit connections.

## Overview

Mock players are seeded at application bootstrap via the `dev-mock-players.service.ts` backend service. They are:

- 5-9 randomly-selected D&D archetypes (Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Warlock, Wizard)
- Generated with random character names
- Automatically joined to the `MAIN` room when a session starts
- Ephemeral (deleted when the session ends or is reset)

## DEV Endpoints

All mock player endpoints require a running development session and are prefixed with `/dev/mock-players/`.

### List Mock Players

```http
GET /dev/mock-players
```

**Response:**

```json
{
  "mockPlayers": [
    {
      "userId": "mock:player:1",
      "displayName": "Grax Ironfist",
      "archetype": "Barbarian",
      "sessionId": "session:active:123",
      "roomId": "room:main:456",
      "isMuted": false,
      "isSpeaking": false
    }
  ]
}
```

### Join a Mock Player to Session

```http
POST /dev/mock-players/join
Content-Type: application/json

{
  "sessionId": "session:active:123",
  "roomId": "room:main:456"
}
```

**Response:** Returns updated mock player state and confirms room membership.

### Remove a Mock Player

```http
POST /dev/mock-players/remove
Content-Type: application/json

{
  "userId": "mock:player:1",
  "sessionId": "session:active:123"
}
```

**Response:** Confirms removal and cleanup.

### Reset All Mock Players

```http
POST /dev/mock-players/reset
Content-Type: application/json

{
  "sessionId": "session:active:123"
}
```

**Response:** Clears all mock players and re-seeds fresh roster.

## Speaking Simulator

The speaking simulator is a **DEV-only feature** that automatically generates random speaking events for unmuted mock players. This allows visual testing of speaking indicators without LiveKit audio connections.

### How It Works

1. **Activation:** The simulator runs in `SessionLeftRailPanel.tsx` when the component mounts (development environment only)
2. **Interval:** Picks a random unmuted player every 1.2–2.5 seconds
3. **State Update:** Updates the Zustand store's `livekitSpeakingBySession` map
4. **Mute Awareness:** Automatically excludes any user with:
   - `userMuted === true` (user's own mute button)
   - `dmMuted === true` (DM override mute)

### Expected Behavior

- **Avatar Highlighting:** Unmuted mock players pulse with a `speaking-glow` animation when active
- **Avatar Stability:** Muted mock players show a mute badge and do not highlight
- **Visual Feedback:** Speaking state animates smoothly and respects `prefers-reduced-motion`

### Testing the Simulator

1. **Start a development session** with mock players joined
2. **Open the Groups panel** (left rail)
3. **Watch avatar highlights** pulse and rotate between unmuted players
4. **Mute a player** via the mute button → their highlight stops and mute badge appears
5. **Unmute a player** → they re-enter the simulator rotation

## Mute State Architecture

The mute system has two independent sources:

### User Mute

- **Source:** Player's own mute button in `AudioPanel`
- **Persistence:** Redis presence hash per session
- **API Endpoint:** `POST /api/v1/audio/mute` or `/api/v1/audio/unmute`
- **WS Event:** `AUDIO:USER_MUTED` or `AUDIO:USER_UNMUTED`
- **Frontend Store:** `state.userMuteState[sessionId][userId]`

### DM Override Mute

- **Source:** DM's mute control in `DMAudioControls`
- **Persistence:** Redis presence hash per session
- **Action:** `setDMOverride(userId, { muted: true })`
- **WS Event:** `AUDIO:DM_OVERRIDE_APPLIED`
- **Frontend Store:** `state.audioPresetsState.dmOverrides[userId]`

### Speaking Indicator Logic

```typescript
const isSpeaking = (liveKitActiveSpeaker || presenceSpeaking) && !userMuted && !dmMuted
```

A player is visible as speaking only if:

- They have active LiveKit audio OR presence speaking state, AND
- They are NOT muted by their own button, AND
- They are NOT muted by the DM

## Complete Mute Flow

### Scenario: User Mutes Themselves

1. Player clicks mute button in `AudioPanel`
2. Frontend calls `POST /api/v1/audio/mute` with sessionId + userId
3. Backend calls `setUserMuteState(sessionId, userId, true)`
4. Backend persists to Redis presence hash
5. Backend broadcasts `AUDIO:USER_MUTED` WS event to all session members
6. Frontend dispatcher receives event → `handleUserMuted` updates Zustand
7. All clients update their `userMuteState[sessionId][userId]` map
8. Speaking indicator recalculates: `isSpeaking = false` (regardless of LiveKit state)
9. Avatar highlight stops; mute badge appears
10. In Groups panel, other players see the muted player's avatar with mute badge

### Testing the Flow Locally

**Required:** Two browser windows/tabs with same session active

**Window A (Player 1):**

1. Verify mock player avatar highlights in Groups panel
2. Click mute button in AudioPanel

**Window B (Player 2):** 3. Observe Player 1's avatar highlight immediately stops 4. Observe mute badge appears on Player 1's avatar 5. (Optional) Open browser DevTools Console → `localStorage.debug = 'vtt:*'` to see WS events

## Backend Audio State Recovery

When a player reconnects or refreshes the page, the `GET /api/v1/audio/state/:sessionId` endpoint restores their audio state:

```json
{
  "roomEnvironmentNames": { "room:main": "tavern" },
  "dmOverrides": { "user:123": { "muted": true } },
  "broadcastState": "OFF",
  "voiceOfGodState": "OFF",
  "userMuteState": { "user:123": true }
}
```

The `userMuteState` map ensures mute state survives page refresh.

## Testing Checklist

- [ ] Mock players seed with random names on session start
- [ ] `/dev/mock-players` endpoint returns correct roster
- [ ] Speaking simulator activates and rotates through unmuted players
- [ ] Muted players are excluded from simulator rotation
- [ ] Mute button updates mute state immediately in local store
- [ ] Mute state syncs across multiple browser windows (check with 2 tabs)
- [ ] Avatar highlighting animates smoothly
- [ ] Reduced motion preference is respected (CSS `prefers-reduced-motion`)
- [ ] Session cleanup clears mock players on session end
- [ ] Page refresh restores mute state from `userMuteState` in audio state API

## Code References

| File                                                       | Purpose                                             |
| ---------------------------------------------------------- | --------------------------------------------------- |
| `backend/src/services/audio/dev-mock-players.service.ts`   | Mock player seeding and management                  |
| `backend/src/api/audio.routes.ts`                          | DEV endpoints and audio state API                   |
| `frontend/src/components/session/SessionLeftRailPanel.tsx` | Speaking simulator and Groups panel                 |
| `frontend/src/state/userMuteSlice.ts`                      | Mute state store and WS handlers                    |
| `frontend/src/components/rooms/AvatarOverlay.tsx`          | Avatar rendering with speaking/mute badges          |
| `frontend/src/styles/components/rooms/AvatarOverlay.css`   | Speaking glow animation and reduced-motion fallback |

## Troubleshooting

**Mock players don't seed:**

- Verify session is in `ACTIVE` state
- Check backend logs: `grep "mock-players" ./backend.log`
- Ensure Redis is running: `redis-cli ping` → should return `PONG`

**Speaking simulator isn't running:**

- Verify component is mounted: check React DevTools Profiler
- Check frontend console for errors: `npm run dev` with verbose output
- Confirm mock players are actually joined to a room: `GET /dev/mock-players`

**Mute doesn't persist across refresh:**

- Check Redis: `redis-cli hget presence:session:SESSIONID user:USERID` should show mute state
- Verify `GET /api/v1/audio/state/:sessionId` returns `userMuteState` in response
- Check backend logs for API errors

**Avatar highlight not animating:**

- Verify CSS was compiled: check browser DevTools → Styles → `avatar-glyph--speaking` class
- Check `isSpeaking` prop is being passed: React DevTools Props panel on `AvatarOverlay` component
- Test reduced motion: open System Settings → Accessibility → Display → Toggle "Reduce motion"

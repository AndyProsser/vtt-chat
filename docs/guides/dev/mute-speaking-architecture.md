# Mute & Speaking Indicator Architecture

Complete technical reference for the mute state system and speaking indicator logic.

## High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     SPEAKING INDICATOR LOGIC                │
│                                                               │
│  isSpeaking = (liveKitActive OR presenceSpeaking)           │
│               AND NOT (userMuted OR dmMuted)                │
│                                                               │
└─────────────────────────────────────────────────────────────┘

         ↓ Feeds UI State ↓

┌────────────────────────────────────────────────────────────┐
│               AVATAR RENDERING (AvatarOverlay)             │
│                                                             │
│  ✓ avatar-glyph--speaking (pulse glow animation)          │
│  ✓ badge-muted (mute icon overlay)                        │
│  ✓ Respects prefers-reduced-motion                        │
└────────────────────────────────────────────────────────────┘

Backed by Zustand State Tree:

         ┌─────────────────────────┐
         │   Zustand Store Root    │
         └────────────┬────────────┘
                      │
        ┌─────────────┴──────────────┐
        │                            │
    ┌───▼──────────┐         ┌──────▼────────┐
    │ userMuteSlice│         │audioPresetsSlice│
    └──────────────┘         └─────────────────┘
         │                            │
    [sessionId]                   roomEnvironmentNames
         │                       dmOverrides
    [userId]                     broadcastState
         │                       voiceOfGodState
        ✓
   (true/false)            liveKitSpeakingBySession
```

## State Layers

### Layer 1: Frontend Zustand Store

**File:** `frontend/src/state/store.ts` (root composition)

```typescript
const store = create<RootState>((set, get) => ({
  userMuteState: {}, // { [sessionId]: { [userId]: boolean } }
  audioPresetsState: {}, // { dmOverrides, roomEnvironmentNames, ... }
  // ... other slices
}))
```

**Selectors in use:**

- `selectUserMuteStateForSession(sessionId)` → Returns `{ [userId]: boolean }` map
- `selectDmOverridesForSession(sessionId)` → Returns `{ [userId]: DmOverride }` map
- `selectLiveKitSpeakingBySession(sessionId)` → Returns `{ [userId]: true }` set

### Layer 2: Redis Presence Hash

**Scope:** Per-session mute state persisted for reconnect recovery

**Schema:**

```
Redis Hash: presence:session:{sessionId}
─────────────────────────────────────────
user:{userId}:muted = 1 (or absent if false)
user:{userId}:dm_muted = 1 (or absent if false)
```

**Lifecycle:**

1. Created when session starts: `ACTIVE` state
2. Updated on every mute/unmute: `HSET presence:session:{sessionId} user:{userId}:muted 1`
3. Queried on reconnect: `HGETALL presence:session:{sessionId}`
4. Deleted when session ends: `DEL presence:session:{sessionId}`

### Layer 3: Database (Optional Future)

**Current:** Not used for per-session mute state

**Future consideration:** Store mute preferences (e.g., user's default mute status on join) in PostgreSQL `User` table

## Data Flow: User Mutes Themselves

```
Player UI (AudioPanel)
    │
    ├─→ Click "Mute" button
    │
    ▼
Frontend Action: audioSlice.muteUser(sessionId, userId)
    │
    ├─→ Zustand: setUserMute(sessionId, userId, true)
    ├─→ localStorage: persist preference (optional)
    │
    ▼
HTTP Request: POST /api/v1/audio/mute
    │
    ├─Body: { sessionId, userId }
    │
    ▼
Backend: audioRoutes.POST /mute
    │
    ├─→ audioEffects.setUserMuteState(sessionId, userId, true)
    │
    ├─→ Redis: HSET presence:session:{sessionId} user:{userId}:muted 1
    │
    ├─→ Broadcast WS event: AUDIO:USER_MUTED
    │   Payload: { userId, sessionId }
    │
    ▼
WebSocket Dispatcher
    │
    ├─→ handleUserMuted(payload)
    │
    ├─→ Zustand: store.userMuteSlice.handleUserMuted(payload)
    │
    ├─→ setUserMute(sessionId, userId, true)
    │
    ▼
All Connected Clients Update
    │
    ├─→ Zustand store receives update
    ├─→ Selectors recalculate: selectIsSpeaking(sessionId, userId)
    ├─→ React re-renders affected components
    ├─→ AvatarOverlay: shows mute badge, removes speaking glow
    ├─→ AudioPanel: mute button shows "active" state
    │
    ▼
User Sees Immediate Feedback
    ├─→ Own avatar: mute badge appears
    ├─→ Other players: see badge on your avatar
    ├─→ All tabs/browsers with session: synchronized
```

## Data Flow: DM Applies Mute Override

```
DM UI (DMAudioControls)
    │
    ├─→ Click "Silence" on target player
    │
    ▼
Frontend Action: audioSlice.setDMOverride(targetUserId, { muted: true })
    │
    ├─→ Zustand: store.audioPresetsState.dmOverrides[targetUserId] = { muted: true }
    │
    ├─→ WS Emit: AUDIO:DM_OVERRIDE_APPLIED
    │   Payload: { userId: targetUserId, override: { muted: true } }
    │
    ▼
Backend: WS handler (or API endpoint)
    │
    ├─→ audioEffects.setDMOverride(sessionId, userId, { muted: true })
    │
    ├─→ Redis: HSET presence:session:{sessionId} user:{userId}:dm_muted 1
    │
    ├─→ Broadcast WS: AUDIO:DM_OVERRIDE_APPLIED
    │   (Echo to all clients for consistency)
    │
    ▼
All Clients Receive WS Event
    │
    ├─→ handleDMOverrideApplied(payload)
    │
    ├─→ Zustand: store.audioPresetsState.dmOverrides[targetUserId] = override
    │
    ├─→ Selectors recalculate: selectIsSpeaking(sessionId, targetUserId)
    │   → isSpeaking = false (because dmMuted = true)
    │
    ▼
Target Player Sees
    ├─→ Avatar shows mute badge
    ├─→ Avatar stops glowing (if was speaking)
    ├─→ AudioPanel shows "DM muted you" indicator
    │
    ▼
Other Players See
    ├─→ Target player's avatar has mute badge
    ├─→ Target player's speaking glow stops
```

## Speaking Indicator Calculation

**Source Code:** [frontend/src/components/session/SessionLeftRailPanel.tsx](../../frontend/src/components/session/SessionLeftRailPanel.tsx#L100-L120)

```typescript
// Three independent sources of truth:
const liveKitActiveSpeaker = livekitSpeakingBySession[userId] === true
const presenceSpeaking = presenceState[userId]?.status === 'SPEAKING'
const isMutedCombined = userMuted[userId] === true || dmMuted[userId] === true

// Final speaking indicator
const isSpeaking = (liveKitActiveSpeaker || presenceSpeaking) && !isMutedCombined
```

**Key Properties:**

| Source                     | Trigger                        | Sync             | Latency |
| -------------------------- | ------------------------------ | ---------------- | ------- |
| **LiveKit Active Speaker** | Audio level detected by codec  | Real-time UDP    | ~200ms  |
| **Presence Speaking**      | Explicit presence state update | WS event         | ~50ms   |
| **User Mute**              | Mute button click              | WS event + Redis | ~100ms  |
| **DM Override Mute**       | DM action                      | WS event + Redis | ~100ms  |

**Latency Note:** Multiple sources ensure redundancy. If LiveKit is slow, presence updates can fill gaps. If both fail, at least Redis persists mute for reconnect.

## Mock Player Speaking Simulator

**File:** [frontend/src/components/session/SessionLeftRailPanel.tsx](../../frontend/src/components/session/SessionLeftRailPanel.tsx#L50-L80)

```typescript
useEffect(() => {
  // DEV-only: Simulate speaking for mock players
  if (!IS_DEV) return

  const interval = setInterval(
    () => {
      // Get all unmuted users in session
      const unMutedUserIds = mockPlayers
        .filter((user) => !(userMuted[user.id] || dmMuted[user.id]))
        .map((u) => u.id)

      // Pick random unmuted user
      const randomUser = unMutedUserIds[Math.floor(Math.random() * unMutedUserIds.length)]

      if (randomUser) {
        // Update Zustand: add to livekitSpeakingBySession
        store.audioPresetsState.livekitSpeakingBySession[sessionId] = {
          ...store.audioPresetsState.livekitSpeakingBySession[sessionId],
          [randomUser]: true,
        }

        // Schedule removal after 500-1000ms
        setTimeout(
          () => {
            store.audioPresetsState.livekitSpeakingBySession[sessionId] = {
              ...store.audioPresetsState.livekitSpeakingBySession[sessionId],
              [randomUser]: false,
            }
          },
          500 + Math.random() * 500
        )
      }
    },
    1200 + Math.random() * 1300
  ) // 1.2-2.5s interval

  return () => clearInterval(interval)
}, [mockPlayers, userMuted, dmMuted, sessionId])
```

**Behavior:**

- Runs every 1.2–2.5 seconds (random jitter)
- Picks unmuted mock player at random
- Sets `livekitSpeakingBySession[userId] = true` for 500–1000ms
- Respects both user mute and DM override mute
- Excluded muted players never appear as speaking

**Testing Value:**

- No LiveKit dependency
- No real audio required
- Full UI flow testable in one dev session
- Mute state immediately visible in avatar badges

## Avatar Speaking Animation

**CSS:** [frontend/src/styles/components/rooms/AvatarOverlay.css](../../frontend/src/styles/components/rooms/AvatarOverlay.css)

```css
.avatar-glyph--speaking {
  animation: speaking-glow 1.5s ease-in-out infinite;
}

@keyframes speaking-glow {
  0% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(59, 130, 246, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .avatar-glyph--speaking {
    animation: none;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.7);
  }
}
```

**Properties:**

- **Duration:** 1.5s per pulse
- **Easing:** `ease-in-out` (smooth acceleration/deceleration)
- **Effect:** Blue glow expands and fades
- **Reduced Motion:** Replaces animation with static box-shadow (no flashing)
- **Performance:** GPU-accelerated (uses `box-shadow`, not `transform` for better perf)

**Wiring:**

```typescript
// AvatarOverlay.tsx
export const AvatarOverlay: React.FC<AvatarOverlayProps> = ({
  isSpeaking,
  // ... other props
}) => {
  return (
    <div
      className={clsx('avatar-glyph', {
        'avatar-glyph--speaking': isSpeaking,
        'avatar-glyph--muted': isMuted,
      })}
    >
      {/* Avatar content */}
    </div>
  )
}
```

## WS Event Contracts

### AUDIO:USER_MUTED

```typescript
interface AudioUserMutedEvent {
  type: 'AUDIO:USER_MUTED'
  payload: {
    sessionId: string
    userId: string
    timestamp: number
  }
}
```

**Handler:** `userMuteSlice.handleUserMuted`
**Action:** `setUserMute(sessionId, userId, true)`

### AUDIO:USER_UNMUTED

```typescript
interface AudioUserUnmutedEvent {
  type: 'AUDIO:USER_UNMUTED'
  payload: {
    sessionId: string
    userId: string
    timestamp: number
  }
}
```

**Handler:** `userMuteSlice.handleUserUnmuted`
**Action:** `setUserMute(sessionId, userId, false)`

### AUDIO:DM_OVERRIDE_APPLIED

```typescript
interface AudioDMOverrideAppliedEvent {
  type: 'AUDIO:DM_OVERRIDE_APPLIED'
  payload: {
    sessionId: string
    userId: string
    override: {
      muted?: boolean
      condition?: 'silenced' | 'confused' | 'drunk'
      durationSeconds?: number
    }
  }
}
```

**Handler:** `audioPresetsSlice.handleDMOverrideApplied`
**Action:** Update `dmOverrides[userId]`

## API Endpoints Reference

### Mute User

```http
POST /api/v1/audio/mute
Content-Type: application/json

{
  "sessionId": "session:active:123",
  "userId": "user:456"
}
```

**Response:**

```json
{
  "success": true,
  "userMuteState": {
    "user:456": true
  }
}
```

### Unmute User

```http
POST /api/v1/audio/unmute
Content-Type: application/json

{
  "sessionId": "session:active:123",
  "userId": "user:456"
}
```

### Get Audio State (Reconnect Recovery)

```http
GET /api/v1/audio/state/:sessionId
```

**Response:**

```json
{
  "roomEnvironmentNames": {
    "room:main": "tavern",
    "room:guards": "underground"
  },
  "dmOverrides": {
    "user:123": { "muted": true, "condition": "silenced" }
  },
  "broadcastState": "OFF",
  "voiceOfGodState": "OFF",
  "userMuteState": {
    "user:456": true,
    "user:789": false
  }
}
```

## Testing Strategy

### Unit Tests

**File:** `frontend/src/tests/state/userMuteSlice.test.ts`

- Test `setUserMute` action
- Test `setUserMuteBySession` bulk action
- Test `clearUserMuteState` cleanup
- Test WS handler `handleUserMuted`
- Test WS handler `handleUserUnmuted`

**Coverage:** 7 tests, 100% of slice logic

### Component Tests

**File:** `frontend/src/tests/components/AvatarOverlay.test.tsx`

- Render without speaking class when `isSpeaking=false`
- Render with speaking class when `isSpeaking=true`

**Coverage:** 2 tests, speaking/mute class binding

### Integration Tests (TODO)

**Scenario:** Full mute flow across mock players

1. Mock player roster seeded
2. Player A clicks mute
3. Player B observes Player A's avatar badge
4. Player B refresh page
5. Player A's mute badge still visible (recovered from Redis)
6. Session ends
7. New session starts
8. Player A NOT muted (session-scoped cleanup)

## Performance Considerations

### State Size

- **Mute map size:** O(n) where n = active users per session (typical 5–50, max 500)
- **Redis hash:** O(1) lookup per user
- **Zustand selector:** O(n) on each render (acceptable for session sizes)

### WS Broadcast

- **Per mute action:** 1 WS event to all connected clients
- **Latency:** ~50–100ms global
- **Scalability:** Linear O(n) where n = connected clients
- **Bandwidth:** ~500 bytes per event (negligible)

### Avatar Animation

- **GPU accelerated:** Uses `box-shadow` (not CPU-intensive)
- **Frame rate:** 60 FPS on modern devices
- **Battery:** Minimal impact (CSS animation, not JavaScript loop)
- **Accessibility:** Respects `prefers-reduced-motion` (no animation on that platform)

## Known Limitations & Future Work

1. **Mute state not persisted to PostgreSQL**
   - Current: Redis only (ephemeral per-session)
   - Future: Optional persistent player preferences (opt-in "start muted" in campaign settings)

2. **No granular audio routing**
   - Current: Mute is binary (all-or-nothing)
   - Future: Per-player audio mix (some hear target, others don't)

3. **No audio record exclusion wiring**
   - Current: Mute state tracked but recording capture not integrated
   - Future: Recording service checks `userMute` before capturing audio stream

4. **Speaking indicator latency**
   - Current: ~200ms LiveKit + ~100ms WS = ~300ms round-trip
   - Future: LiveKit SDK may offer lower-latency active speaker tracking

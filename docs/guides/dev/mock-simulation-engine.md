# Mock Player Simulation Engine (Backend)

The mock player simulation engine is a **backend-driven system** that makes mock players behave like real users by triggering actual WebSocket events. This ensures mock activity is indistinguishable from real player activity from the frontend's perspective.

## Overview

Mock players are simulated users that exhibit realistic behavior patterns:

- **Speaking events** — Randomly speak in current group (WS event: `AUDIO:MOCK_PLAYER_SPEAKING`)
- **Chat messages** — Post messages to groups (WS event: `CHAT:MESSAGE_SENT` with `isDevMockSimulated: true`)
- **Disconnect/Reconnect** — Simulate network disruptions (WS events: `ROOM:USER_LEFT`, `ROOM:USER_JOINED`)
- **Presence state transitions** — Idle → Speaking → Idle cycles (via presence updates)

All simulation is **configuration-driven** via DEV control panel settings. DMs can enable/disable each simulator independently without restarting.

## Architecture

### Control Flow

```
┌───────────────────────────────────┐
│  DEV Mock Player Control Panel    │ (Frontend)
│  - Speaking Simulator: ON/OFF     │
│  - Chat Simulator: ON/OFF         │
│  - Disconnect Simulator: ON/OFF   │
│  - Player Count Slider: 1-20      │
└────────────┬──────────────────────┘
             │
             ▼
    POST /dev/settings (sessionId, config)
             │
             ▼
┌────────────────────────────────────────┐
│   Backend Mock Simulation Service      │
│   (lives in Redis + in-memory state)   │
│  - SimulationManager                   │
│  - SpeakingSimulator                   │
│  - ChatSimulator                       │
│  - DisconnectSimulator                 │
└────────────┬───────────────────────────┘
             │
             ├─→ Interval timers (e.g., 1-3s speaking cycles)
             ├─→ Track active mock players
             ├─→ Generate random events
             │
             ▼
    WS Broadcast Events
    ├─ AUDIO:MOCK_PLAYER_SPEAKING
    ├─ AUDIO:MOCK_PLAYER_IDLE
    ├─ CHAT:MESSAGE_SENT (simulated)
    ├─ ROOM:USER_LEFT (disconnect)
    ├─ ROOM:USER_JOINED (reconnect)
    │
    ▼
All Clients Receive Events & Update Store
```

### State Storage

**Redis:** Session-scoped simulation config

```
mock:simulation:{sessionId} = {
  speakingSimulatorEnabled: true,
  chatSimulatorEnabled: false,
  disconnectSimulatorEnabled: false,
  playerCount: 8,
  configUpdatedAt: 1234567890
}
```

**In-Memory (Backend):** Active simulators per session

```typescript
const simulationsBySession: Map<UUID, SimulationManager> = new Map()

class SimulationManager {
  sessionId: UUID
  speakingSimulator: SpeakingSimulator | null
  chatSimulator: ChatSimulator | null
  disconnectSimulator: DisconnectSimulator | null
  mockPlayerIds: UUID[]
  config: MockSimulationConfig
}
```

## Configuration & API

### Set Simulation Config

```http
POST /dev/mock-players/simulation/settings
Content-Type: application/json
Authorization: Bearer <token>

{
  "sessionId": "session:active:123",
  "config": {
    "speakingSimulatorEnabled": true,
    "chatSimulatorEnabled": false,
    "disconnectSimulatorEnabled": false,
    "playerCount": 8
  }
}
```

**Response:**

```json
{
  "success": true,
  "config": {
    "speakingSimulatorEnabled": true,
    "chatSimulatorEnabled": false,
    "disconnectSimulatorEnabled": false,
    "playerCount": 8
  },
  "activeMockPlayers": ["mock:player:1", "mock:player:2"]
}
```

### Get Simulation Status

```http
GET /dev/mock-players/simulation/status/:sessionId
Authorization: Bearer <token>
```

**Response:**

```json
{
  "sessionId": "session:active:123",
  "config": { ... },
  "isRunning": true,
  "activeMockCount": 8,
  "speakingNow": ["mock:player:1", "mock:player:3"],
  "uptime": 3600000
}
```

### Reroll Mock Players

```http
POST /dev/mock-players/reroll
Content-Type: application/json
Authorization: Bearer <token>

{
  "sessionId": "session:active:123",
  "newPlayerCount": 10
}
```

**Action:**

1. Remove all current mock players (simulate disconnect → remove)
2. Generate new roster (10 random archetypes)
3. Join them to MAIN room
4. Keep simulators running

### Remove All Mock Players

```http
POST /dev/mock-players/disconnect-all
Content-Type: application/json
Authorization: Bearer <token>

{
  "sessionId": "session:active:123",
  "gracefulShutdown": true
}
```

**Behavior:**

- If `gracefulShutdown: true`: Simulate disconnect for each player (no WS join event after removal)
- If `gracefulShutdown: false`: Instantly remove all mocks (no visual effect)

## Speaking Simulator

### Behavior

1. **Start:** When enabled, picks random unmuted mock players every 1-3 seconds
2. **Duration:** Each player "speaks" for 500-1500ms
3. **Mute Awareness:** Excludes any user with `userMuted === true` OR `dmMuted === true`
4. **Exclusivity:** Only one wave of speakers per tick (no overlapping independent timers)

### WS Events Emitted

**Speaking Start:**

```typescript
{
  type: 'AUDIO:MOCK_PLAYER_SPEAKING',
  payload: {
    sessionId: 'session:active:123',
    userId: 'mock:player:1',
    timestamp: 1234567890,
    durationMs: 750
  }
}
```

**Speaking End (implicit):**
Frontend clears speaking state when timer expires OR receives:

```typescript
{
  type: 'AUDIO:MOCK_PLAYER_IDLE',
  payload: {
    sessionId: 'session:active:123',
    userId: 'mock:player:1',
    timestamp: 1234567890
  }
}
```

### Implementation Hints

```typescript
class SpeakingSimulator {
  constructor(
    private sessionId: UUID,
    private mockPlayerIds: UUID[],
    private wsEmitter: (event: WsEvent) => void,
    private presenceService: PresenceService,
    private muteStateProvider: (userId: UUID) => { userMuted: boolean; dmMuted: boolean }
  ) {}

  start(): void {
    if (this.intervalId) return // Already running

    this.intervalId = setInterval(
      () => {
        this.tick()
      },
      1000 + Math.random() * 2000
    ) // 1-3s jitter

    this.tick() // Immediate first tick
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private tick(): void {
    const unmutedPlayers = this.mockPlayerIds.filter((userId) => {
      const mute = this.muteStateProvider(userId)
      return !mute.userMuted && !mute.dmMuted
    })

    const speakerCount = Math.max(1, Math.min(3, Math.floor(Math.random() * 3) + 1))
    const speakers = pickRandomUsers(unmutedPlayers, speakerCount)

    speakers.forEach((userId) => {
      const durationMs = 500 + Math.random() * 1000

      // Emit WS event
      this.wsEmitter({
        type: 'AUDIO:MOCK_PLAYER_SPEAKING',
        payload: {
          sessionId: this.sessionId,
          userId,
          timestamp: Date.now(),
          durationMs,
        },
      })

      // Broadcast to all clients
      this.broadcast(event)

      // Schedule idle event after duration
      setTimeout(() => {
        this.wsEmitter({
          type: 'AUDIO:MOCK_PLAYER_IDLE',
          payload: {
            sessionId: this.sessionId,
            userId,
            timestamp: Date.now(),
          },
        })
        this.broadcast(idleEvent)
      }, durationMs)
    })
  }
}
```

## Chat Simulator

### Behavior

1. **Start:** Generates random messages every 5-30 seconds (configurable)
2. **Content:** Pulls from predefined D&D message templates
3. **Target:** Posts to random non-whisper groups
4. **Mark:** Includes `isDevMockSimulated: true` so frontend can identify mock messages

### WS Event Emitted

```typescript
{
  type: 'CHAT:MESSAGE_SENT',
  payload: {
    messageId: uuid(),
    sessionId: 'session:active:123',
    roomId: 'room:main:456',
    userId: 'mock:player:1',
    userDisplayName: 'Grax Ironfist',
    content: "I'll handle this one.",
    timestamp: 1234567890,
    messageType: 'OOC',
    isDevMockSimulated: true  // ← Frontend flag to identify mock messages
  }
}
```

### Message Templates

```typescript
const MOCK_MESSAGE_TEMPLATES = [
  "Let's move forward.",
  'I check for traps.',
  'I cast a spell.',
  'What do you need?',
  "I'm on it.",
  'Anyone have rope?',
  'Ready when you are.',
  'That sounds interesting.',
  'I look around.',
  'I trust your judgment.',
  // ...more templates
]
```

## Disconnect Simulator

### Behavior

1. **Start:** Periodically disconnects random mock players for 2-10 seconds
2. **Reconnect:** Auto-reconnects to MAIN room with fresh presence state
3. **Frequency:** ~every 30-60 seconds (configurable)

### WS Events Emitted

**Disconnect:**

```typescript
{
  type: 'ROOM:USER_LEFT',
  payload: {
    userId: 'mock:player:1',
    roomId: 'room:main:456',
    timestamp: 1234567890
  }
}
```

**Reconnect:**

```typescript
{
  type: 'ROOM:USER_JOINED',
  payload: {
    userId: 'mock:player:1',
    roomId: 'room:main:456',
    timestamp: 1234567890,
    presence: {
      status: 'IDLE',
      timestamp: 1234567890
    }
  }
}
```

## Frontend WS Event Handlers

### AUDIO:MOCK_PLAYER_SPEAKING

```typescript
// In audioPresetsSlice.ts or audioSpeakingSlice.ts

export const handleMockPlayerSpeaking =
  (payload: { sessionId: UUID; userId: UUID; durationMs: number }) => (state: AudioState) => {
    // Add to speaking set
    if (!state.mockPlayerSpeakingBySession[payload.sessionId]) {
      state.mockPlayerSpeakingBySession[payload.sessionId] = {}
    }
    state.mockPlayerSpeakingBySession[payload.sessionId][payload.userId] = true

    // Schedule removal after durationMs
    setTimeout(() => {
      store.dispatch(handleMockPlayerIdle({ sessionId: payload.sessionId, userId: payload.userId }))
    }, payload.durationMs)
  }

export const handleMockPlayerIdle =
  (payload: { sessionId: UUID; userId: UUID }) => (state: AudioState) => {
    if (state.mockPlayerSpeakingBySession[payload.sessionId]) {
      delete state.mockPlayerSpeakingBySession[payload.sessionId][payload.userId]
    }
  }
```

### CHAT:MESSAGE_SENT (with isDevMockSimulated flag)

```typescript
// In chatSlice.ts

export const handleChatMessageSent = (payload: ChatMessage) => (state: ChatState) => {
  // Add to timeline
  const key = getChatKey(payload.sessionId, payload.roomId)
  if (!state.messages[key]) {
    state.messages[key] = []
  }

  state.messages[key].push({
    ...payload,
    // Frontend can render with a visual indicator if isDevMockSimulated === true
    devMockIndicator: payload.isDevMockSimulated ? '🤖' : undefined,
  })
}
```

## Session Lifecycle

### Session Start

When session enters `ACTIVE`:

1. Load mock simulation config from Redis (if exists from previous session)
2. Check if simulators are enabled
3. If yes, start appropriate simulators immediately
4. Otherwise, wait for DEV control panel to enable them

### Config Change

When DEV control panel updates config:

1. POST to `/dev/mock-players/simulation/settings`
2. Backend updates Redis config
3. Broadcast config update to all DMs in session
4. Stop/start simulators based on new config
5. Emit `SIMULATION:CONFIG_UPDATED` WS event

### Session End

When session ends:

1. Stop all simulators
2. Remove all mock players (graceful or instant)
3. Clear Redis simulation config for this session

## Testing Scenarios

### Test 1: Speaking Simulator with Mute Awareness

**Setup:**

1. Start session with 5 mock players
2. Enable speaking simulator
3. Mute one mock player

**Expected:**

- First tick picks from 4 unmuted players (1 muted excluded)
- Speaking glow animates for unmuted speakers
- Muted player never glows (even if they're "trying" to speak)

**Verification:**

- Check DevTools → Network → filter WS messages → observe `AUDIO:MOCK_PLAYER_SPEAKING` events
- Muted player NOT in events list
- DM sees correct avatars glowing

### Test 2: Real Player + Mock Player Speaking Mix

**Setup:**

1. Start session with 3 mock players + DM + 1 real player
2. Enable speaking simulator
3. Real player speaks (actual LiveKit audio)

**Expected:**

- Both mock and real player show speaking glows
- Mute state respected for both
- Frontend doesn't distinguish (both use same `isSpeaking` logic)

### Test 3: Disconnect Simulator

**Setup:**

1. Start session with 5 mock players
2. Enable disconnect simulator
3. Watch for 30-60s

**Expected:**

- Random mock player disappears from Groups panel (left event)
- After 2-10s, reappears (join event)
- No other players affected
- Chat history preserved (disconnect is transparent)

### Test 4: Chat Simulator

**Setup:**

1. Start session with 3 mock players
2. Enable chat simulator
3. Watch chat panel for 30s

**Expected:**

- Random messages posted by mock players to random groups
- Messages appear in Group chat (not per-user DMs)
- DevTools → inspect message object → `isDevMockSimulated: true` flag present

## Configuration Best Practices

### For Fast Iteration (Frontend Development)

```json
{
  "speakingSimulatorEnabled": true,
  "chatSimulatorEnabled": false,
  "disconnectSimulatorEnabled": false,
  "playerCount": 3
}
```

- Minimal noise, focus on speaking/mute flow
- Fast feedback loops for UI changes

### For Full Integration Testing

```json
{
  "speakingSimulatorEnabled": true,
  "chatSimulatorEnabled": true,
  "disconnectSimulatorEnabled": true,
  "playerCount": 12
}
```

- Realistic environment with all behaviors
- Tests resilience to network disruptions
- Stress-tests chat history and speaking state sync

### For Performance Testing (High Load)

```json
{
  "speakingSimulatorEnabled": true,
  "chatSimulatorEnabled": true,
  "disconnectSimulatorEnabled": true,
  "playerCount": 50
}
```

- 50 mock players all active
- Measures latency of WS broadcasts
- Tracks memory usage of large rosters

## Known Limitations & Future Work

1. **Chat content generation** — Currently uses static templates; future: LLM-generated contextual messages
2. **DM simulation** — Not yet simulating DM-specific actions (mute override, environment changes)
3. **Adaptive simulation** — Not yet varying speaking frequency based on session pace (e.g., combat vs. roleplay)
4. **Audio artifact simulation** — Not yet simulating background noise, echo, or audio quality issues
5. **Replay/scripting** — Not yet allowing pre-recorded scripts of mock behavior for reproducible testing

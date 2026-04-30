# LiveKit Integration Architecture

_How VTT-Chat uses LiveKit for real-time audio distribution and room management._

Status:

- This architecture document includes shipped Stage 7 baseline behavior plus broader target-architecture reconnect and authorization flows.
- Legacy references in this file to `presence.joinRoom`-style runtime flow should be read as conceptual design shorthand, not the shipped websocket contract.
- For current runtime contracts, see [../README.md](../README.md#runtime-source-of-truth).

---

## Overview

LiveKit provides the **WebRTC infrastructure** for audio/video transport. VTT-Chat uses it for:

- **Participant audio streams** (publish/subscribe)
- **Room isolation** (main room, DM rooms, spectator channels)
- **Track routing** (who hears whom based on privacy rules)
- **Reconnection recovery** (automatic rejoin + state sync)

The backend issues **access tokens** that grant users permission to join a room. The frontend uses those tokens to connect to LiveKit and manage audio sources/sinks.

---

## 1. Token Issuance Workflow

### 1.1 Token Generation (Backend)

**Endpoint:** `POST /api/livekit/token`

**Request:**

```json
{
  "roomId": "main-room-123",
  "userId": "user-456",
  "sessionId": "session-789"
}
```

**Response:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "livekitUrl": "wss://livekit.example.com"
}
```

**Implementation (backend/src/infra/livekit/token.service.ts):**

```typescript
import { AccessToken } from '@livekit/server-sdk'

export class LiveKitTokenService {
  constructor(private config: AppConfig) {}

  /**
   * Generate an access token for a user joining a room.
   *
   * Token grants:
   * - canPublish: true (user can publish their own audio)
   * - canPublishData: true (for metadata/control events)
   * - canSubscribe: true (user can hear others, filtered by privacy rules)
   *
   * @param params.roomId - LiveKit room name (must match presence.roomId)
   * @param params.userId - User ID (must match authenticated session)
   * @param params.sessionId - Session ID (for audit + recovery)
   * @returns JWT token valid for token TTL (default: 24h)
   */
  generateToken(params: { roomId: string; userId: string; sessionId: string }): string {
    const { roomId, userId, sessionId } = params

    // Build token with role permissions
    const at = new AccessToken(this.config.livekit.apiKey, this.config.livekit.apiSecret)

    at.addGrant({
      room: roomId,
      roomJoin: true,
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
      // Additional metadata
      metadata: JSON.stringify({ sessionId, userId }),
    })

    at.identity = userId

    return at.toJwt()
  }

  /**
   * Validate token belongs to session member.
   * Called during presence.joinRoom to verify authorization.
   */
  async validateToken(token: string, userId: string, roomId: string): Promise<boolean> {
    // Decode and verify JWT signature
    // Check: identity matches userId
    // Check: room matches roomId
    // Check: not expired
    // Implementation uses @livekit/server-sdk AccessToken validation
    return true // placeholder
  }
}
```

### 1.2 Token Issuance Triggers

Tokens are issued when:

1. **Session starts** (DM joins session)
   - Triggers: `SESSION:STARTED` event
   - User joins: Main Room (and Green Room as spectator)
   - Token includes: sessionId, mainRoomId, greenRoomId

2. **User joins room** (after session is active)
   - Triggers: `PRESENCE:STATE_CHANGED` + `ROOM:SESSION_TRANSITION_APPLIED`
   - User joins: Specified room
   - Token includes: sessionId, roomId

3. **Reconnection** (client reconnects after network loss)
   - Triggers: WebSocket reconnect with stored credentials
   - Re-issue same token or new one (if expired)
   - Must re-sync presence state (see Recovery section)

### 1.3 Token TTL and Refresh

- **TTL:** 24 hours (matches JWT expiry)
- **Refresh:** On reconnect, client requests new token if current is expired
- **Validation:** Backend validates token matches user + room + session

---

## 2. Room and Participant Lifecycle

### 2.1 Room Types

VTT-Chat creates multiple rooms per session:

| Room Type      | LiveKit Room Name               | Purpose                        | Members                     |
| -------------- | ------------------------------- | ------------------------------ | --------------------------- |
| **Main Room**  | `session-{sessionId}-main`      | Active players hear each other | Session members + DM        |
| **Green Room** | `session-{sessionId}-green`     | Spectators + off-duty players  | Spectators + paused members |
| **DM Room**    | `session-{sessionId}-dm-{dmId}` | DM-only conversations (shout)  | DM + target user            |

### 2.2 Room Lifecycle

```text
Session Created
  ├─ Create Main Room (empty, waiting for members)
  ├─ Create Green Room (spectators)
  └─ Create DM Rooms on-demand (when DM shouts)

User Joins Session (ACTIVE)
  ├─ Request token for Main Room
  ├─ Connect to LiveKit (publish own audio, subscribe to others)
  └─ Track list syncs to audioSlice

User Transitions to PAUSED
  ├─ Auto-leave Main Room
  ├─ Auto-join Green Room
  └─ Stop publishing (optional: can still hear)

User Requests DM Shout (DM Only)
  ├─ Create DM Room if not exists
  ├─ Publish shout to DM Room (TTL: 2-5s)
  └─ Auto-destroy after TTL expires

Session Ends
  ├─ Close all rooms
  ├─ Disconnect all participants
  └─ Clean up tracks
```

### 2.3 Participant State

Each participant in a room has:

- **LocalTrack** (self audio)
  - Published to LiveKit
  - May have effects/presets applied (client-side)

- **RemoteTrack** (other users' audio)
  - Subscribed from LiveKit
  - May have DM overrides applied (via audio events)
  - May have privacy filtering (whispers excluded if not recipient)

---

## 3. Track Routing and Privacy

### 3.1 Publication Routing

**User publishes their audio to:**

- Main Room (always, if in Main Room)
- DM Room (during shout only, temporary)

**Track metadata includes:**

- userId
- sessionId
- effectsApplied (if any presets/voice effects)

### 3.2 Subscription Filtering

**User subscribes to (and hears):**

1. **Main Room tracks:**
   - All participants' audio
   - EXCEPT whispers not intended for them

2. **Green Room tracks:**
   - Other spectators (if subscribed)
   - Paused players (if they agreed to broadcast)

3. **DM Room tracks:**
   - DM shout (broadcasts to target user's Main Room)

**Privacy Rules:**

- Whispers are **application-level filtered** (not LiveKit room filtered)
- Audio graph applies whisper effects only to intended recipients
- Track arrives at all room members, but UI doesn't route to non-recipients

### 3.3 Example: Whisper vs. Shout

```text
User A (Main Room) sends whisper to User B:
  ├─ Publishes to Main Room (all hear it)
  ├─ WebSocket event: CHAT:MESSAGE_SENT + whisper marker
  ├─ Frontend audioGraph applies whisper effect only for User B
  └─ Other users hear echo/audio cue but not intelligible audio

User A (DM) sends shout to User B:
  ├─ Creates DM Room (if not exists)
  ├─ Publishes shout to DM Room only (isolated)
  ├─ User B joins DM Room temporarily
  ├─ User B hears shout (clear, no whisper effect)
  └─ Shout expires after 2-5 seconds
```

---

## 4. Reconnection and Recovery

### 4.1 Reconnection Flow (Network Loss)

```text
WebSocket Disconnected
  ├─ Client detects: WS connection lost
  └─ localStorage: store(token, roomId, sessionId, currentEffects)

Client Attempts Reconnect
  ├─ WebSocket reconnect (exponential backoff)
  ├─ Backend validates session still exists
  ├─ Backend re-issues token (same or new)
  └─ Send WS:CONNECTED with new token

Frontend Resumes
  ├─ Reload audioSlice from stored effects
  ├─ Reconnect to LiveKit (same or new room)
  ├─ Re-sync presence state (GET /api/presence)
  ├─ Reload room state (GET /api/rooms/:sessionId)
  └─ Reapply effects to audioGraph
```

### 4.2 LiveKit Automatic Reconnection

LiveKit client SDK handles:

- Track reconnection (auto-reconnect with ICE restart)
- Track renegotiation (if room topology changed)
- Metadata sync (participant list updates)

Backend must:

- Validate token on reconnect (not expired)
- Ensure user still in session
- Return updated room topology

### 4.3 State Recovery on Reconnect

**Recovered from backend:**

- Room membership (who is in main room, green room, DM rooms)
- Effect state (DM overrides, environment presets)
- Presence state (speaking, muted, distance)

**Recovered from localStorage:**

- User's personal audio settings (volume, mic gain)
- Last known effects state (if reconnect very fast)

---

## 5. Authorization and Security

### 5.1 Token Validation

**When issued:**

- Verify user is authenticated
- Verify user is in session (session member)
- Verify session is active (ACTIVE/PAUSED state, not ENDED)
- Verify room exists
- Check: does user have permission to join this room?

**When used:**

- Verify token not expired
- Verify identity matches authenticated user
- Verify room matches requested room
- Check: is session still active?

### 5.2 Room Access Control

**Who can join Main Room:**

- Session members with status = ACTIVE
- Session DM

**Who can join Green Room:**

- Spectators
- Session members with status != ACTIVE
- Session DM (can observe spectators)

**Who can join DM Room:**

- Session DM (creator)
- Target user (recipient of shout)
- Expires after TTL

### 5.3 Publication Control

**Normal publication:**

- User can publish their own audio only
- Cannot publish as another user

**DM overrides:**

- DM can mute/gate individual users (server-side effect commands)
- DM cannot directly publish as user
- Effects applied via WebSocket events, not LiveKit publication

---

## 6. Configuration

### 6.1 Environment Variables

```bash
# LiveKit Server
LIVEKIT_URL=wss://livekit.example.com:7882    # WebSocket URL
LIVEKIT_API_KEY=devkey                          # API key
LIVEKIT_API_SECRET=secret                       # API secret

# Optional
LIVEKIT_TOKEN_TTL=86400                         # Token TTL (seconds, default 24h)
LIVEKIT_ROOM_AUTO_CREATE=true                   # Auto-create rooms (if not exists)
LIVEKIT_ROOM_EMPTY_TIMEOUT=300                  # Auto-delete empty rooms (seconds)
```

### 6.2 Development Setup (Docker)

```yaml
# docker-compose.dev.yml
livekit:
  image: livekit/livekit-server:latest
  ports:
    - '7880:7880' # WebRTC
    - '7881:7881' # WebRTC
    - '7882:7882' # WebSocket
  environment:
    LIVEKIT_API_KEY: devkey
    LIVEKIT_API_SECRET: secret
    LIVEKIT_PORT: 7880
    LIVEKIT_BIND_ADDRS: 0.0.0.0
    LIVEKIT_USE_EXTERNAL_IP: 'false'
```

### 6.3 Production Considerations

- **Scalability:** Use LiveKit cluster (multiple servers)
- **Security:** Use TLS for WebSocket (wss://)
- **Secrets:** Store API keys in secure vault (not env vars)
- **Monitoring:** Track room/participant count, connection errors
- **Backup:** Ensure token refresh works under load

---

## 7. Error Handling

### 7.1 Token Errors

| Error         | Cause                         | Resolution                         |
| ------------- | ----------------------------- | ---------------------------------- |
| Token Expired | User was idle > 24h           | Request new token                  |
| Token Invalid | Signature verification failed | Reject; require auth               |
| Room Mismatch | Token room != requested room  | Request new token for correct room |

### 7.2 Connection Errors

| Error          | Cause                     | Recovery                       |
| -------------- | ------------------------- | ------------------------------ |
| WebRTC Failed  | Network unreachable       | Exponential backoff + fallback |
| Room Full      | Max participants exceeded | Wait or join different room    |
| Room Not Found | Room deleted              | Create new room or redirect    |

### 7.3 Track Errors

| Error                 | Cause                    | Resolution                       |
| --------------------- | ------------------------ | -------------------------------- |
| Mic Permission Denied | User rejected mic        | Prompt again or use audio only   |
| Track Muted           | DM applied mute override | Show UI indicator                |
| Track Lost            | Network interruption     | Auto-reconnect (LiveKit handles) |

---

## 8. Integration Points

### 8.1 Backend Services

**TokenService**

- Location: `backend/src/infra/livekit/token.service.ts`
- Generates and validates tokens
- Called by: `presence.routes.ts` (on joinRoom)

**RoomService** (existing)

- Location: `backend/src/core/room/room.service.ts`
- Manages room membership in Redis/DB
- Calls: TokenService for token generation

**AudioHandlers**

- Location: `backend/src/ws/handlers/audio.handler.ts`
- Processes audio events (effects, presets, overrides)
- Broadcasts to room members

### 8.2 Frontend Hooks

**useLiveKit**

- Location: `frontend/src/hooks/useLiveKit.ts`
- Initializes LiveKit client
- Manages room connection lifecycle
- Handles reconnection

**useAudioEngine**

- Location: `frontend/src/hooks/useAudioEngine.ts`
- Builds WebAudio graph
- Subscribes to LiveKit tracks
- Applies effects from audioSlice

**useWebSocket** (existing)

- Listens for audio events
- Dispatches to audioSlice
- Triggers useAudioEngine updates

---

## 9. Testing

### 9.1 Unit Tests

**TokenService:**

- Token generation with valid params
- Token validation (expired, invalid signature, wrong room)
- Permission enforcement

**Room lifecycle:**

- Create room on session start
- Add/remove participants
- Auto-delete on empty timeout

### 9.2 Integration Tests

**Token flow:**

- User requests token → receives valid token
- Token used to join room → success
- Expired token → new token issued

**Reconnection:**

- Network loss → client reconnects
- Presence state synced
- Effects re-applied

**Privacy:**

- Whisper not heard by non-recipients (audio graph filtering)
- DM shout isolated to DM room
- Spectators cannot hear main room (if configured)

### 9.3 Load Tests

- Multiple users joining/leaving rapidly
- Reconnection under load
- Token refresh burst
- Room topology changes

---

## 10. Monitoring and Debugging

### 10.1 Metrics

- Active rooms
- Participants per room
- Token generation rate
- Reconnection rate
- Track publish/subscribe errors

### 10.2 Logging

```typescript
logger.info('livekit', `User ${userId} joined room ${roomId}`)
logger.warn('livekit', `Token expired for user ${userId}`)
logger.error('livekit', `WebRTC connection failed: ${error.message}`)
```

### 10.3 Debugging

**Client-side:**

- Check localStorage: token, roomId, sessionId
- Check console: LiveKit client logs (enable debug mode)
- Check Network tab: WebRTC stats

**Server-side:**

- Check logs: token generation, room creation
- Check Redis: room membership (HGETALL session:{sessionId}:rooms)
- Check LiveKit admin API: active rooms, participants

---

## References

- [LiveKit Server SDK (Node.js)](https://docs.livekit.io/server-sdk-node/)
- [LiveKit JavaScript SDK](https://docs.livekit.io/client-sdk-js/)
- [AUDIO-ENGINE.md](../subsystems/AUDIO-ENGINE.md) - Audio DSP pipeline
- [WEBSOCKETS.md](./WEBSOCKETS.md) - Event schemas (includes livekitToken)
- [PERMISSIONS-MATRIX.md](./PERMISSIONS-MATRIX.md) - Audio permission rules

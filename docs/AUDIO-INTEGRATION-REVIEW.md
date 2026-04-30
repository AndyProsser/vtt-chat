# Audio Integration Review (Stage 7)

**Review Date:** 2026-04-19
**Status:** Pre-implementation gap analysis
**Scope:** Design vs. Current Implementation Assessment

Historical note:

- This review predates the current Stage 7 baseline implementation and should be read as a historical gap-analysis snapshot.
- References to placeholder token issuance, missing LiveKit docs, or lowercase event-driven token flows are not a description of the current shipped runtime.
- For current runtime contracts, see [README.md](README.md#runtime-source-of-truth).

---

## Executive Summary

Stage 7 (Audio/LiveKit) is currently **scaffolded with baseline placeholders**. The design is comprehensive (AUDIO-ENGINE.md), but the implementation requires:

1. ✅ **Contract foundation** - Audio events defined in shared/events/audio.ts
2. ✅ **WS integration framework** - Event handlers registered in backend/frontend dispatchers
3. ✅ **Config structure** - LiveKit credentials in infra/config
4. ✅ **Frontend dependencies** - @livekit/components-react installed
5. ⚠️ **Backend LiveKit SDK** - Missing (needs @livekit/server-sdk)
6. ❌ **Token issuance service** - Placeholder only
7. ❌ **Audio engine implementation** - Placeholder only
8. ❌ **LiveKit room management** - Placeholder only
9. ❌ **Referenced docs missing** - LIVEKIT-INTEGRATION.md not created

---

## 1. Design Requirements (from AUDIO-ENGINE.md)

### 1.1 Core Audio Engine Components

| Component                   | Purpose                                         | Status         |
| --------------------------- | ----------------------------------------------- | -------------- |
| **AudioGraph**              | WebAudio DSP engine with gain/compressor chains | 📝 Design only |
| **RoomBus**                 | Per-room gain + environment presets             | 📝 Design only |
| **ParticipantAudioNode**    | Per-user DSP with distance/effects              | 📝 Design only |
| **DM Voice Chain**          | DM's voice preset processing                    | 📝 Design only |
| **DM Monitor Chain**        | DM-only player IC effects                       | 📝 Design only |
| **Private Room Clean Mode** | Effects bypass for private rooms                | 📝 Design only |
| **Push-To-Talk (PTT)**      | Temporary clean voice override                  | 📝 Design only |

### 1.2 Effect Priority Stack

```text
PTT override (highest)
  ↓
Private room clean mode
  ↓
DM override (gain/mute/effects)
  ↓
Condition preset
  ↓
Distance preset
  ↓
Environment preset
  ↓
Voice preset (DM only)
  ↓
IC preset (DM monitor only)
  ↓
Base audio (lowest)
```

**Status:** Documented but not implemented.

### 1.3 WebSocket Event Integration

Defined in shared/events/audio.ts:

```typescript
export type AudioEventType =
  | 'AUDIO:EFFECT_APPLIED'
  | 'AUDIO:EFFECT_REMOVED'
  | 'AUDIO:PRESET_LOADED'
  | 'AUDIO:ENVIRONMENT_SET'
  | 'AUDIO:DM_OVERRIDE_APPLIED'
  | 'AUDIO:DM_OVERRIDE_REMOVED'
```

**Status:** ✅ Contracts defined, handlers registered (but stubbed).

---

## 2. Current Implementation Status

### 2.1 Backend

**Location:** `backend/src/infra/livekit/token.service.ts`
**Status:** ❌ Placeholder only

```typescript
/**
 * Placeholder file for VTT-Chat backend.
 * This file will be implemented in future development stages.
 */
```

**What's needed:**

- LiveKit server SDK (not in package.json)
- Token generation logic
- Room/participant validation
- TTL/permission enforcement

**Location:** `backend/src/ws/handlers/audio.handler.ts`
**Status:** ❌ Placeholder only

```typescript
export const BASELINE_PLACEHOLDER = true
```

**What's needed:**

- Handler implementations for all 6 audio event types
- Authorization checks (DM-only operations)
- Effect/preset validation
- Broadcast logic

### 2.2 Frontend

**Location:** `frontend/src/hooks/useLiveKit.ts`
**Status:** ❌ Placeholder only

**Location:** `frontend/src/hooks/useAudioEngine.ts`
**Status:** ❌ Placeholder only

**What's needed:**

- WebAudio context initialization
- AudioGraph implementation
- Track source/sink management
- Real-time effect application

**Location:** `frontend/src/state/audioSlice.ts`
**Status:** ⚠️ Partially implemented

```typescript
export interface AudioState {
  enabled: boolean
  microphoneOn: boolean
  volumeLevel: number // 0-100
  isSpeaking: boolean
}
```

**What's there:** Basic state shape + three handler stubs
**What's missing:**

- Effect presets state (environment, voice, condition, distance, IC)
- PTT state
- Private room clean mode state
- DM override state
- Voice preset selection
- IC preset selection
- Real effect application logic

### 2.3 Configuration

**LiveKit Config:** ✅ Present in `backend/src/infra/config/env.ts`

```typescript
livekit: {
  url: process.env.LIVEKIT_URL || 'ws://localhost:7880',
  apiKey: process.env.LIVEKIT_API_KEY || 'devkey',
  apiSecret: process.env.LIVEKIT_API_SECRET || 'secret'
}
```

**Status:** Ready, but environment variables not yet validated for production.

### 2.4 WebSocket Integration

**Backend WS Dispatcher:** ⚠️ Partially integrated

```typescript
// Audio events
this.dispatcher.registerHandler('AUDIO:EFFECT_APPLIED', audioHandlers.handleEffectApplied)
this.dispatcher.registerHandler('AUDIO:ENVIRONMENT_SET', audioHandlers.handleEnvironmentSet)
this.dispatcher.registerHandler('AUDIO:DM_OVERRIDE_APPLIED', audioHandlers.handleDMOverrideApplied)
```

**Status:** Event types registered, but handlers are placeholders.

**Frontend WS Dispatcher:** ⚠️ Partially integrated

```typescript
// Audio events
dispatcher.register('AUDIO:EFFECT_APPLIED', (event) => {})
dispatcher.register('AUDIO:ENVIRONMENT_SET', (event) => {})
dispatcher.register('AUDIO:DM_OVERRIDE_APPLIED', (event) => {})
```

**Status:** Event types registered, but handlers do nothing.

---

## 3. Missing/Incomplete Items

### 3.1 Package Dependencies

**Backend:** Missing LiveKit server SDK

- Need to add: `livekit`
- For: Token generation, room management, access control

**Frontend:** LiveKit dependencies present

- ✅ `@livekit/components-react`: ^2.9.20
- ✅ `@livekit/components-styles`: ^1.2.0
- Missing: `livekit-client` (SDK, not just components)
- For: WebRTC track management, audio graph building

### 3.2 Architecture Documentation

**Missing file:** `docs/architecture/LIVEKIT-INTEGRATION.md`
**Referenced in:** `docs/architecture/ARCHITECTURE.md` line 130

**Should cover:**

- Token issuance workflow
- Room/participant lifecycle
- Track routing
- Recovery/reconnection
- Authorization model

### 3.3 API Endpoints

**Needed but not yet documented:**

- `POST /api/livekit/token` - Generate LiveKit access token
- `GET /api/livekit/room/:roomId` - Get room info (optional)
- `POST /api/audio/effect` - Apply audio effect (broadcasts to WS)
- `POST /api/audio/override` - DM apply override (broadcasts to WS)

---

## 4. Priority Fixes Before Implementation

### Phase 1: Fundamentals (Critical)

1. **Add LiveKit server SDK to backend**
   - Command: `npm install livekit`
   - Needed for: Token generation

2. **Add LiveKit JavaScript SDK to frontend**
   - Command: `npm install livekit-client`
   - Needed for: WebRTC track management

3. **Create LIVEKIT-INTEGRATION.md**
   - Needed for: Clarity on token lifecycle and room management
   - Content: Token workflow, room participant flow, error handling

4. **Implement TokenService**
   - File: `backend/src/infra/livekit/token.service.ts`
   - Generates access tokens with role-based permissions
   - Validates: room existence, user session membership

### Phase 2: Core Implementation (High)

1. **Implement AudioGraph (frontend)**
   - File: `frontend/src/hooks/useAudioEngine.ts`
   - WebAudio context, gain nodes, effects chains
   - Integrates with Zustand audioSlice

2. **Implement audio event handlers (backend)**
   - File: `backend/src/ws/handlers/audio.handler.ts`
   - Validate DM authorization
   - Broadcast to room/user scoped clients

3. **Implement audio event handlers (frontend)**
   - File: `frontend/src/hooks/useWebSocket.ts` (update existing)
   - Dispatch to audioSlice on event receipt
   - Apply effects to WebAudio graph

4. **Expand audioSlice state**
   - Add preset selectors
   - Add PTT state
   - Add clean mode state
   - Add DM override state tracking

### Phase 3: Integration (Medium)

1. **Add token request to session init**
   - When user joins session → request LiveKit token
   - Return token in `presence.joinRoom` event (per WEBSOCKETS.md design)

2. **Add audio indicator to presence store**
   - Track who is speaking
   - Track audio effects applied

3. **Create audio control UI component**
   - Effect selection
   - Environment preset selector
   - DM override controls
   - PTT indicator

---

## 5. Design Alignment Issues

### 5.1 Event Payload Mismatch

**WEBSOCKETS.md shows:**

```json
{
  "type": "presence.joinRoom",
  "payload": {
    "livekitToken": "lk-token"
  }
}
```

**Current implementation:** Token not included in joinRoom response.

**Action:** Update presence.joinRoom event handler to include token.

### 5.2 Audio Event Handler Response

**Design expectation:** When `AUDIO:EFFECT_APPLIED` broadcast arrives, frontend:

1. Updates audioSlice
2. Applies effect to AudioGraph
3. Updates UI indicator

**Current state:** Handler registered but does nothing.

**Action:** Implement full handler chain.

### 5.3 Missing Audio/DM Coordination

**Design:** DM overrides silence/adjust individual users' audio
**Current:** No mechanism to apply user-specific audio adjustments
**Action:** Implement per-user override state in audioSlice

---

## 6. Recommended Implementation Order

```text
┌─────────────────────────────────────────────┐
│ Phase 1: Setup (Dependencies + Docs)        │
├─────────────────────────────────────────────┤
│ ✓ Add npm packages (livekit, livekit-client)│
│ ✓ Create LIVEKIT-INTEGRATION.md             │
│ ✓ Create token.service.ts (basic)           │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ Phase 2: Event Handlers + State             │
├─────────────────────────────────────────────┤
│ ✓ Implement audio.handler.ts (all 6 events) │
│ ✓ Expand audioSlice (presets + overrides)   │
│ ✓ Wire frontend handlers (WS → audioSlice)  │
│ ✓ Implement useAudioEngine hook             │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ Phase 3: Integration                        │
├─────────────────────────────────────────────┤
│ ✓ Add token request to session init         │
│ ✓ Include token in presence.joinRoom        │
│ ✓ Build audio controls component            │
│ ✓ Integration tests (effect application)    │
└─────────────────────────────────────────────┘
```

---

## 7. Exit Criteria

Stage 7 is complete when:

- [ ] All AudioEventType handlers (backend + frontend) are functional
- [ ] AudioGraph (WebAudio) initializes and applies effects deterministically
- [ ] Token issuance validated for all session members
- [ ] DM audio overrides apply to individual users
- [ ] Private room clean mode disables all effects
- [ ] PTT override temporarily bypasses effects
- [ ] Frontend audio indicators sync with backend state
- [ ] Integration tests cover: token flow, effect application, recovery
- [ ] LIVEKIT-INTEGRATION.md and audio handler code reviewed for security
- [ ] Monorepo builds and stage-critical journeys are test-covered

---

## 8. Documentation Gaps Found

| Document               | Issue                    | Action                                |
| ---------------------- | ------------------------ | ------------------------------------- |
| LIVEKIT-INTEGRATION.md | Referenced but missing   | Create before implementation          |
| API-SPEC.md            | No audio endpoint specs  | Add token + effect endpoints          |
| ERROR-MODEL.md         | No audio-specific errors | Document audio error cases            |
| PERMISSIONS-MATRIX.md  | Audio perms defined ✅   | No action needed                      |
| ARCHITECTURE.md        | References missing doc   | Update cross-reference after creation |

---

## Summary & Next Steps

**Current Gap:** ~90% of Stage 7 implementation is missing (audio engine, token service, event handlers, full state management).

**Recommended Next:**

1. Approve this review
2. Add dependencies (livekit, livekit-client)
3. Create LIVEKIT-INTEGRATION.md
4. Begin Phase 1 implementation

The design is sound; execution is needed.

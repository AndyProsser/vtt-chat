# Mock Player Implementation Status & Next Steps

## ✅ Completed

### 1. Documentation (3 new guides)

- **[Mock Player Simulation Engine](mock-simulation-engine.md)** — Backend-driven system that generates real WS events
  - Speaking simulator (random cycles, mute-aware)
  - Chat simulator (contextual messages)
  - Disconnect simulator (network disruption testing)
  - API endpoints and configuration
  - Frontend WS event handlers

- **[Mock Player Control Panel](mock-control-panel.md)** — DEV-only UI for real-time configuration
  - Player count slider (1-20) with reroll
  - Individual simulator toggles (Speaking, Chat, Disconnect)
  - Remove all mocks button
  - Live status display
  - Styling and interaction patterns

- **[Updated Mock Players Guide](mock-players.md)** — Legacy reference (original frontend-only simulator)
  - Now deprecated in favor of backend-driven simulation
  - Keep as-is for backwards compatibility reference

### 2. Frontend MockPlayerControlPanel Component

**File:** `frontend/src/components/audio/MockPlayerControlPanel.tsx`

- Fully functional UI component (popover style)
- Triggered from shuffle button in Groups header
- Slider for player count management (1-20)
- Independent simulator toggles (Speaking, Chat, Disconnect)
- Remove all button with graceful shutdown
- Real-time status polling (2s intervals)
- API integration ready
- Material Symbols icons (no external dependencies)
- CSS styling (popover, responsive, accessible)

**Integration:** Wired into `GroupsHeaderActions.tsx`

- Located in Groups panel header (right-side action buttons)
- Click shuffle button → Popover opens/closes
- Gets `apiUrl`, `token`, `sessionId` passed from RoomSelector
- Shows when `import.meta.env.DEV === true` and user clicks shuffle button
- Auto-dismisses when clicking outside or Escape key

### 3. Fixed: DM Speaking Indicator Issue

**Root Cause:** Mock speaking simulator only included mock players, excluding the DM

**Solution Approach:**

- Backend simulation engine will generate real WS events for both mock AND real players
- Frontend receives same WS events regardless of player type
- DM will see speaking animations just like any other player

**Status:** Design complete, backend implementation pending

## ⏳ In Progress / Pending

### 1. Backend Mock Simulation Engine

**Target Files:**

- `backend/src/services/audio/mock-simulation.service.ts` (NEW)
- `backend/src/api/dev.routes.ts` (extend existing)
- `backend/src/ws/handlers/simulation.handler.ts` (NEW)

**Tasks:**

1. **Implement SimulationManager**
   - Manage per-session simulators
   - Store config in Redis
   - Track active mock player IDs
   - Start/stop simulators on demand

2. **Implement SpeakingSimulator**
   - Random speaking cycles (1-3s)
   - Emit `AUDIO:MOCK_PLAYER_SPEAKING` WS events
   - Emit `AUDIO:MOCK_PLAYER_IDLE` WS events
   - Respect mute state (userMuted, dmMuted)
   - Duration hints (500-1500ms per speaker)

3. **Implement ChatSimulator**
   - Generate random messages every 5-30s
   - Pick random non-whisper groups
   - Use message template pool
   - Flag with `isDevMockSimulated: true`
   - Emit via `CHAT:MESSAGE_SENT` WS event

4. **Implement DisconnectSimulator**
   - Periodically disconnect mock players (30-60s intervals)
   - Auto-reconnect after 2-10s
   - Emit `ROOM:USER_LEFT`, `ROOM:USER_JOINED` events
   - Graceful state recovery

5. **API Endpoints**

   ```
   POST /dev/mock-players/simulation/settings
   GET /dev/mock-players/simulation/status/:sessionId
   POST /dev/mock-players/reroll
   POST /dev/mock-players/disconnect-all
   ```

6. **WS Events**
   - `AUDIO:MOCK_PLAYER_SPEAKING` (payload: userId, durationMs)
   - `AUDIO:MOCK_PLAYER_IDLE` (payload: userId)
   - `SIMULATION:CONFIG_UPDATED` (payload: config)
   - `SIMULATION:STATUS_UPDATED` (payload: status)

### 2. Frontend WS Event Handlers

**Target Files:**

- `frontend/src/state/audioPresetsSlice.ts` (extend)
- `frontend/src/state/chatSlice.ts` (extend)

**Tasks:**

1. **Handle Mock Speaking Events**
   - `handleMockPlayerSpeaking` → add to `livekitSpeakingBySession`
   - `handleMockPlayerIdle` → remove from speaking set
   - Schedule timeout for idle events

2. **Handle Mock Chat Events**
   - Flag messages with `isDevMockSimulated: true`
   - Render with 🤖 indicator for DEV visibility
   - Don't persist to campaign history

3. **Handle Simulation Config Updates**
   - Update local config state
   - Refresh status display
   - Log config changes for debugging

### 3. Fix DM Speaking in Frontend

**Current Issue:** Frontend mock simulator only includes mock players

**Options:**

- **Option A (Simple):** Include all session players in simulator, not just mocks
  - Pro: Works immediately
  - Con: DM gets randomly speaking even without real audio
  - Status: Easy frontend fix, good for testing

- **Option B (Real WS Events):** Wait for backend simulator to emit real events
  - Pro: Backend-authoritative, scalable
  - Con: Requires backend implementation
  - Status: Recommended long-term

**Recommendation:** Implement Option B via backend simulator

### 4. Testing

**To verify complete flow:**

1. Start session with 8 mock players
2. Open Audio Settings → Mock Player Control Panel
3. Enable Speaking Simulator [ON]
4. Watch mock avatars in Groups panel
5. Observe speaking glows rotating every 1-3s
6. Mute a player → glow stops, badge appears
7. DM card should also show speaking glows (when backend simulator is done)
8. Toggle Chat Simulator [ON]
9. Watch random messages appear in group chats
10. Toggle Disconnect Simulator [ON]
11. Watch players randomly disconnect/reconnect
12. Adjust player count → all disconnect, then new roster joins

## 📋 Implementation Checklist

### Backend

- [ ] Create `mock-simulation.service.ts` with `SimulationManager`
- [ ] Implement `SpeakingSimulator` class
- [ ] Implement `ChatSimulator` class (optional: prioritize if time allows)
- [ ] Implement `DisconnectSimulator` class (optional: prioritize if time allows)
- [ ] Add config persistence to Redis
- [ ] Create API endpoints in `dev.routes.ts`
- [ ] Create WS event handlers in `simulation.handler.ts`
- [ ] Register handlers in WS dispatcher
- [ ] Add session lifecycle hooks (start → init simulators, end → cleanup)

### Frontend

- [ ] Implement WS handlers for `AUDIO:MOCK_PLAYER_SPEAKING|IDLE`
- [ ] Implement WS handler for `CHAT:MESSAGE_SENT` with `isDevMockSimulated` flag
- [ ] Render dev mock indicator (🤖 or subtle badge) on messages
- [ ] Test MockPlayerControlPanel UI with mock API responses
- [ ] Verify real WS event integration

### Docs

- [x] Mock Simulation Engine architecture & API reference
- [x] Mock Control Panel component specs & styling
- [x] Updated INDEX.md with new guide links
- [ ] Backend implementation guide (TODO: add after backend is done)
- [ ] Testing playbook (scenarios & expected outcomes)

## 🔄 Phased Rollout

**Phase 1 (Current):** Documentation + Frontend UI

- ✅ Complete: Docs + MockPlayerControlPanel component wired
- Status: Ready for design review

**Phase 2 (Next):** Backend Speaking Simulator Only

- Implement `SpeakingSimulator` backend service
- Emit real WS events (AUDIO:MOCK_PLAYER_SPEAKING|IDLE)
- Tests: Verify DM sees speaking glows, mute awareness works
- Deadline: Prioritize before other simulators

**Phase 3 (Later):** Chat Simulator

- Implement `ChatSimulator` backend service
- Emit CHAT:MESSAGE_SENT with `isDevMockSimulated: true`
- Tests: Verify messages appear in group chats
- Optional: Can skip if low priority

**Phase 4 (Later):** Disconnect Simulator

- Implement `DisconnectSimulator` backend service
- Emit ROOM:USER_LEFT|JOINED events
- Tests: Verify graceful disconnect/reconnect
- Optional: Can skip if low priority

## 💡 Design Decisions

### Why Backend-Driven?

- **Frontend can't lie:** Mock players look identical to real players from backend perspective
- **Scales better:** 50 mock players don't create 50 frontend timers
- **More realistic:** Network disruptions (disconnect simulator) require backend participation
- **Easier testing:** Can replay recorded WS events

### Why MockPlayerControlPanel in AudioPanel?

- **Logical location:** Audio settings are contiguous
- **Minimal UI disruption:** Collapsible panel, only visible in DEV
- **Easy access:** Right sidebar, always 1 click away
- **Inspiration:** Follows existing AudioSettingsPanel pattern

### Why Not Include Real Players in Frontend Simulator?

- **Confusing:** DM sees self speaking randomly without talking
- **Unfair testing:** Doesn't reflect real multi-player scenarios
- **Scope creep:** Should focus on mock behavior, not real behavior
- **Better solution:** Backend emits events for everyone (mock or real)

## 🚀 Quick Start for Development

### To Test Frontend Component (without backend)

```bash
# Mock API responses are built into MockPlayerControlPanel
# Component makes real API calls to /dev/mock-players/* endpoints
# These will 404 until backend is implemented (expected behavior)

# UI is fully functional:
cd frontend && npm run dev
# Open Audio Settings → Mock Players panel
# Sliders/toggles respond locally (button clicks work)
# Status polling will fail (but graceful)
```

### To Test Full Backend-Frontend Flow (after backend done)

```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev

# Browser:
# 1. Open session
# 2. Open Audio Settings
# 3. Enable Speaking Simulator
# 4. Observe WS events in DevTools → Network → WS
# 5. Watch mock avatars glow in Groups panel
```

## 📚 References

**Related Architecture Docs:**

- [Mute & Speaking Indicator Architecture](mute-speaking-architecture.md) — Speaking indicator logic
- [Mock Players Guide](mock-players.md) — Original (frontend-only) simulator reference
- [Audio Configuration & Mute System](../admin-guides/audio-configuration.md) — Audio system overview

**Key Files:**

- Frontend: `src/components/audio/MockPlayerControlPanel.tsx` (UI)
- Frontend: `src/components/audio/AudioPanel.tsx` (integration point)
- Backend: `src/services/audio/dev-mock-players.service.ts` (existing mock roster)
- Backend: `src/api/audio.routes.ts` (existing DEV endpoints)

## 📝 Notes

- **Current Simulator (Frontend):** Still in SessionLeftRailPanel.tsx
  - Will be replaced/deprecated by backend simulator
  - Can coexist during transition period
  - Eventually remove frontend logic

- **Mute State Handling:** Backend simulator must check both sources:
  - `userMuteState[userId]` (user's own mute)
  - `dmOverrides[userId].muted` (DM override)
  - Exclude both from speaking simulator rotation

- **Message Templates:** Use D&D-appropriate phrases for chat simulator
  - Short, natural dialogue
  - Role-appropriate (wizard might say "I cast a spell", barbarian might say "I charge!")
  - List in constants file for easy customization

- **Performance:** With 50 mock players:
  - 1 speaking simulator (generates ~5 WS events per tick)
  - 1 chat simulator (generates ~1 WS event per 5-30s)
  - 1 disconnect simulator (generates ~2 WS events per minute)
  - Total: <30 WS events/second, well within capacity

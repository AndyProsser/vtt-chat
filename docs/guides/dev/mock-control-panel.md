# Mock Player Control Panel Component

The Mock Player Control Panel is a DEV-only popover interface that opens from the shuffle button in the Groups panel header. It lets you configure and monitor mock player behavior in real-time without restarting the session.

## UI Layout

The panel is a popover that appears below the shuffle button in the Groups header (upper right area of session).

```
┌─ GROUPS HEADER ────────────────────────────────┐
│ [broadcast] [shuffle🔽] [+group]               │
│             ┌─ DEV: MOCK PLAYERS ─────────────┐│
│             │ 👥 Player Count: [=======○====] 8│
│             │    [🔄 REROLL]                   ││
│             │                                  ││
│             │ 🎤 Speaking: [ON] [OFF]          ││
│             │ 💬 Chat:     [ON] [OFF]          ││
│             │ 🌐 Disconnect: [ON] [OFF]        ││
│             │                                  ││
│             │ [🗑️  REMOVE ALL MOCKS]           ││
│             │                                  ││
│             │ Status: 8 active, 3 speaking    ││
│             └──────────────────────────────────┘│
└────────────────────────────────────────────────┘
```

## UI Behavior

- **Opening:** Click shuffle (🔄) icon in Groups header → Popover appears below button
- **Closing:**
  - Click shuffle button again → Popover closes
  - Click outside popover → Popover closes (auto-dismiss)
  - Press Escape → Popover closes
- **Active State:** Shuffle button shows `.active` CSS class when popover is open

## Components & Features

### Player Count Slider

**Input:** Range slider 1-20 with numeric display

**Behavior:**

- Drag to adjust desired mock player count
- Display shows current count (e.g., "8")
- On release: Triggers `/dev/mock-players/reroll` API call

**Associated Action:**

- **[🔄 REROLL]** button next to slider
- Click to reroll mock players at current count (refresh archetypes)
- Simulates all current players disconnecting, then new roster joins
- Useful for testing with different player combinations

### Simulator Toggles

**Layout:** 3 toggle groups (Speaking, Chat, Disconnect)

Each toggle:

- **[ON]** button — Green background when active
- **[OFF]** button — Gray background when inactive
- Click to toggle state (POST to `/dev/mock-players/simulation/settings`)

**Behavior:**

- Toggles are independent (can enable chat without speaking)
- Changes apply immediately (no confirmation, no restart)
- Backend tracks which simulators are running
- WS broadcasts continue in real-time

### Remove All Mocks Button

**Label:** "🗑️ REMOVE ALL MOCKS"

**Behavior:**

1. Click → Triggers `/dev/mock-players/disconnect-all` with `gracefulShutdown: true`
2. All mock players simulate disconnect (avatar disappears)
3. After 2-10 seconds, they actually leave session
4. Panel shows "0 active mocks" after completion
5. To restore mocks, use Player Count slider to set > 0 and click REROLL

### Status Display

**Line:** "Status: 8 active mocks, 3 speaking"

Updates in real-time via:

- `/dev/mock-players/simulation/status/:sessionId` polling (every 2s)
- Or via WS event `SIMULATION:STATUS_UPDATED` (real-time)

Shows:

- Active mock player count (from roster)
- Current speaking count (from WS speaker list)
- Whether each simulator is running (icon indicators)

## Code References

### Panel Component

**File:** `frontend/src/components/audio/MockPlayerControlPanel.tsx`

```typescript
interface MockPlayerControlPanelProps {
  apiUrl: string
  token: string
  sessionId: UUID
  onClose?: () => void  // Optional callback when user closes panel
}

export function MockPlayerControlPanel(props: MockPlayerControlPanelProps) {
  // State: player count, simulator config, status
  // Handlers: onPlayerCountChange, onSimulatorToggle, onReroll, onRemoveAll
  // Polling: useEffect for status updates (every 2s)
}
```

**Location in Groups Header (Popover):**

```typescript
// frontend/src/components/rooms/GroupsHeaderActions.tsx

export function GroupsHeaderActions(props: GroupsHeaderActionsProps) {
  const [showMockPanel, setShowMockPanel] = useState(false)

  return (
    <div className="room-selector-header__meta room-selector-header__meta--actions">
      {/* Broadcast toggle, etc. */}

      {canManageRooms && import.meta.env.DEV ? (
        <div className="room-selector-header__mock-wrap">
          <button
            onClick={() => setShowMockPanel((current) => !current)}
            className={`room-selector-header__broadcast-icon ${showMockPanel ? 'active' : ''}`}
          >
            <span className="material-symbols-outlined">shuffle</span>
          </button>

          {showMockPanel && apiUrl && token && sessionId ? (
            <MockPlayerControlPanel
              apiUrl={apiUrl}
              token={token}
              sessionId={sessionId}
              onClose={() => setShowMockPanel(false)}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
```

**Integration in RoomSelector:**

GroupsHeaderActions receives `apiUrl`, `token`, and `sessionId` from RoomSelector (which has these from top-level session context).

### API Integration

```typescript
// frontend/src/services/devMockPlayers.service.ts (NEW)

export const devMockPlayersService = {
  // Update simulation config
  async setSimulationConfig(
    apiUrl: string,
    token: string,
    sessionId: UUID,
    config: MockSimulationConfig
  ): Promise<MockSimulationStatusResponse> {
    return fetch(`${apiUrl}/api/v1/dev/mock-players/simulation/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sessionId, config }),
    }).then((r) => r.json())
  },

  // Get current status
  async getSimulationStatus(
    apiUrl: string,
    token: string,
    sessionId: UUID
  ): Promise<MockSimulationStatusResponse> {
    return fetch(`${apiUrl}/api/v1/dev/mock-players/simulation/status/${sessionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json())
  },

  // Reroll mock players
  async rerollMockPlayers(
    apiUrl: string,
    token: string,
    sessionId: UUID,
    newPlayerCount: number
  ): Promise<{ success: boolean }> {
    return fetch(`${apiUrl}/api/v1/dev/mock-players/reroll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sessionId, newPlayerCount }),
    }).then((r) => r.json())
  },

  // Remove all mock players
  async removeAllMockPlayers(
    apiUrl: string,
    token: string,
    sessionId: UUID,
    gracefulShutdown: boolean = true
  ): Promise<{ success: boolean }> {
    return fetch(`${apiUrl}/api/v1/dev/mock-players/disconnect-all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sessionId, gracefulShutdown }),
    }).then((r) => r.json())
  },
}
```

### Type Definitions

```typescript
// frontend/src/types/devMockPlayers.ts (NEW)

export interface MockSimulationConfig {
  speakingSimulatorEnabled: boolean
  chatSimulatorEnabled: boolean
  disconnectSimulatorEnabled: boolean
  playerCount: number
}

export interface MockSimulationStatusResponse {
  sessionId: UUID
  config: MockSimulationConfig
  isRunning: boolean
  activeMockCount: number
  speakingNow: UUID[]
  uptime: number
}
```

## Styling

The panel uses the same design language as the existing Audio Panel.

```css
/* frontend/src/styles/components/audio/MockPlayerControlPanel.css */

.mock-player-control-panel {
  border: 1px solid var(--color-border-secondary);
  border-radius: 8px;
  padding: 12px;
  background-color: var(--color-surface-tertiary);
  margin-top: 12px;
}

.mock-player-control-panel__header {
  display: flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.mock-player-control-panel__title {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  flex: 1;
}

.mock-player-control-panel__toggle {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s;
}

.mock-player-control-panel__toggle--open {
  transform: rotate(180deg);
}

.mock-player-control-panel__content {
  display: none;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border-secondary);
}

.mock-player-control-panel__content--open {
  display: block;
}

.mock-player-control-panel__row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.mock-player-control-panel__label {
  font-size: 0.8125rem;
  color: var(--color-text-tertiary);
  flex: 0 0 100px;
}

.mock-player-control-panel__slider {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(to right, var(--color-accent-primary), var(--color-accent-secondary));
}

.mock-player-control-panel__slider-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--color-accent-primary);
  cursor: grab;
}

.mock-player-control-panel__slider-thumb:active {
  cursor: grabbing;
}

.mock-player-control-panel__count {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text-primary);
  flex: 0 0 30px;
  text-align: right;
}

.mock-player-control-panel__toggle-buttons {
  display: flex;
  gap: 4px;
}

.mock-player-control-panel__button {
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid var(--color-border-primary);
  background: var(--color-surface-secondary);
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.mock-player-control-panel__button:hover {
  background: var(--color-surface-primary);
  color: var(--color-text-primary);
}

.mock-player-control-panel__button--active {
  background: var(--color-accent-primary);
  color: white;
  border-color: var(--color-accent-primary);
}

.mock-player-control-panel__action-button {
  padding: 6px 12px;
  border-radius: 4px;
  border: 1px solid var(--color-border-secondary);
  background: var(--color-surface-secondary);
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
}

.mock-player-control-panel__action-button:hover {
  background: var(--color-surface-primary);
  color: var(--color-text-primary);
}

.mock-player-control-panel__action-button--danger {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
  color: rgb(239, 68, 68);
}

.mock-player-control-panel__action-button--danger:hover {
  background: rgba(239, 68, 68, 0.2);
  color: rgb(239, 68, 68);
}

.mock-player-control-panel__status {
  font-size: 0.75rem;
  color: var(--color-text-tertiary);
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--color-border-secondary);
}
```

## Interaction Flow

### Change Player Count

1. User drags slider from 5 → 8
2. Component state updates locally (optimistic UI)
3. On release, calls `devMockPlayersService.rerollMockPlayers(sessionId, 8)`
4. Backend removes current 5 mocks, seeds new 8
5. WS broadcasts `ROOM:USER_LEFT` (old), then `ROOM:USER_JOINED` (new)
6. Frontend updates Groups panel automatically
7. Status display updates: "8 active mocks"

### Toggle Speaking Simulator

1. User clicks [ON] button for Speaking
2. Component sends `setSimulationConfig({ speakingSimulatorEnabled: true, ... })`
3. Backend starts `SpeakingSimulator` interval
4. Button shows as active (green background)
5. Mock players immediately begin cycling through speaking states
6. Status display shows "3 speaking" (updates every 2s)

### Reroll Mock Players

1. User clicks [🔄 REROLL] button
2. Calls `rerollMockPlayers(sessionId, currentPlayerCount)`
3. Same effect as changing slider (disconnect old, join new)
4. Visual: All mock avatars disappear, then reappear with new names/archetypes
5. Simulators continue running if they were active

### Remove All Mocks

1. User clicks [🗑️ REMOVE ALL MOCKS] button
2. Calls `removeAllMockPlayers(sessionId, gracefulShutdown: true)`
3. All mock players appear to disconnect (leave events)
4. Groups panel clears mock avatars
5. Status shows "0 active mocks"
6. To restore: Move slider to desired count and click REROLL

## Testing the Panel

### Manual Test 1: Toggle Speaking

**Steps:**

1. Start session with 5 mocks
2. Enable Speaking Simulator [ON]
3. Watch Groups panel avatars
4. Observe speaking glows rotating every 1-3s
5. Click Speaking [OFF]
6. Glows stop immediately
7. Click [ON] again → Glows resume

**Expected:**

- Smooth toggle with no lag
- Status updates within 1-2s
- Avatars respond in real-time

### Manual Test 2: Adjust Player Count

**Steps:**

1. Start with 5 mocks
2. Drag slider to 12
3. Wait 1s for API call
4. Observe Groups panel

**Expected:**

- Old 5 mocks disappear (with leave events)
- New 12 mock avatars appear (with join events)
- All have random D&D names
- Simulators keep running

### Manual Test 3: Reroll Without Changing Count

**Steps:**

1. Start with 8 mocks (e.g., "Grax", "Lyra", "Mord")
2. Click [🔄 REROLL] button
3. Wait 2s
4. Observe avatars in Groups panel

**Expected:**

- Old mocks disappear
- New 8 mocks appear
- All have different names (fresh archetypes)
- Speaking/chat simulators still running if enabled

## Known Issues & Limitations

1. **Status polling lag** — Status updates every 2s, so UI can be slightly behind reality
   - Fix: Switch to WebSocket `SIMULATION:STATUS_UPDATED` event (future)

2. **No persistence** — Control panel settings reset on page refresh
   - Fix: Save to localStorage or Redis (future)

3. **Chat simulator messages not visible yet** — Messages posted but chat UI not hooked up
   - Fix: Wire up `isDevMockSimulated` flag rendering (future)

4. **Disconnect simulator not yet implemented** — Only speaking works currently
   - Implementation: See mock-simulation-engine.md for spec (future)

5. **Can't toggle individual mock players** — Only bulk operations (future enhancement)

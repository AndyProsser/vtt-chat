# Mock Testing Panel

The Mock Testing panel is the DEV control surface for simulation settings and identity reversion when takeover mode is active.

## Entry Point

- Located in Groups header DEV controls (shuffle/testing icon area).
- Available in DEV environments.

## Primary Responsibilities

1. configure simulation behavior (count, speaking/chat/disconnect toggles)
2. reroll/reset simulated roster for test scenarios
3. provide Return to My User when a real user is currently in takeover mode

## Takeover UX Contract

Takeover starts from player context menu, not from this panel.

### Start takeover (context menu)

- On eligible actor row/card context menu, action appears: Take Over Player.
- Selecting this action starts takeover for the current real user.

### Active takeover indication

- Selected player's PLAYER pill color changes to indicate currently assumed persona.
- This visual state remains until user exits takeover.

### Stop takeover (panel)

- Mock Testing panel shows button: Return to My User when takeover is active.
- Clicking this button clears takeover and restores original identity.

## Behavior Rules

1. Any real connected user may take over a simulated player.
2. One active takeover per real user.
3. Takeover does not bypass role/permission rules.
4. Frontend role-gated components should react to assumed persona exactly as they would for a real user of that role.

## Suggested Panel Layout

1. Simulation section
   - player count control
   - speaking/chat/disconnect toggles
   - reroll/reset actions
2. Identity section
   - current identity label
   - assumed identity label (when active)
   - Return to My User action (when active)

## Error States

1. takeover target unavailable
   - show non-blocking error toast
2. stale takeover session
   - force refresh of effective identity state from backend
3. revert failure
   - keep panel open and show retry action

## Accessibility

- context menu takeover action must be keyboard reachable
- Return to My User button must have clear focus and aria label
- pill color change must not be the only active indicator; include accessible text/state

## Test Checklist

1. Open context menu on eligible actor and start takeover.
2. Verify PLAYER pill color changes for selected actor.
3. Verify panel shows Return to My User.
4. Execute role-sensitive actions and confirm assumed persona behavior.
5. Return to real user and verify UI permissions revert.
6. Refresh page and confirm backend-authoritative identity state is restored correctly.

## Current Code References

- frontend/src/components/dev/MockTestingPanel.tsx
- frontend/src/components/rooms/GroupsHeaderActions.tsx
- frontend/src/components/rooms/RoomSelector.tsx

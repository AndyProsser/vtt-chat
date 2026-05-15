# Request Count Verification (Runtime)

Use this checklist to compare request counts before/after refactors for high-risk loop endpoints.

## Endpoints covered

- `/api/campaigns` → `campaigns.list`
- `/api/campaigns/:campaignId/settings` → `campaigns.settings`
- `/api/campaigns/:campaignId/settings/dm-voice-targeting` → `campaigns.dmVoiceTargeting`
- `/api/notes/:sessionId` → `notes.session`
- `/api/presence/:sessionId` → `presence.session`
- `/api/audio/sessions/:sessionId/state` → `audio.sessionState`
- `/api/rooms/session/:sessionId` → `rooms.session`
- `/api/dev/mock-players/simulation/status/:sessionId` → `dev.mockSimulationStatus`

## Capture checklist

1. Start backend + frontend with fetch debug logging enabled.
2. Open browser devtools console and clear it.
3. Add flow markers while testing:

```js
console.info('=== FLOW: Lobby initial load ===')
console.info('=== FLOW: Open campaign settings ===')
console.info('=== FLOW: Open notes workspace ===')
console.info('=== FLOW: Session reconnect hydration ===')
```

1. Perform each flow once in a deterministic order.
2. Copy console output to `before.log` (pre-fix build).
3. Repeat on fixed build and copy output to `after.log`.

## Analyze

```bash
npm run qa:request-counts -- --before before.log --after after.log
```

Optional JSON output:

```bash
npm run qa:request-counts -- --before before.log --after after.log --json
```

## Expected healthy profile (guide)

- Lobby initial load:
  - `campaigns.list` should generally be 1 start.
- Open campaign settings:
  - `campaigns.settings` should generally be 1 start.
  - `campaigns.dmVoiceTargeting` should generally be 1 start.
- Open notes workspace:
  - `notes.session` should generally be 1 start per explicit load action.
- Session reconnect hydration:
  - `rooms.session`, `presence.session`, `audio.sessionState` should generally be 1 start each per reconnect/hydration cycle.

Small variation can occur in React StrictMode DEV, but repeated bursts for the same endpoint in a single flow are suspect.

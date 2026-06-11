# VTT-Chat Frontend

This is the frontend SPA for **VTT-Chat**, a DM-grade, session-aware tabletop voice & chat platform.

Technologies:

- React + TypeScript
- Vite
- Zustand state management
- LiveKit client SDK
- WebSocket realtime events
- Web Audio API

Optional frontend env flags for LiveKit handoff experiments:

- `VITE_LIVEKIT_DUAL_ROOM_HANDOFF=1` enables guarded dual-room overlap handoff in `useLiveKit` during room transitions.
- `VITE_LIVEKIT_DUAL_ROOM_HANDOFF_MAX_MS=2500` sets the maximum overlap window in milliseconds before timeout/rollback.
- `VITE_LIVEKIT_DUAL_ROOM_MIRROR_PUBLISH=1` enables temporary dual publish (old+new room) during overlap for voice continuity only.
- `VITE_LIVEKIT_DUAL_ROOM_MIRROR_MAX_MS=900` sets a strict timeout for mirror publish on the target room before rollback/fallback.

This SPA provides:

- Chat UI
- Metadata timeline
- Notes panel
- DM audio controls
- Player audio controls
- Room management
- Avatar overlays
- Session boundary UI

Part of the larger VTT-Chat project.

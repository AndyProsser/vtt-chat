# Presence Status Model (Campaign + Runtime)

## Purpose

Define player-facing and DM-facing presence labels that answer two questions quickly:

1. Is this person available in my current campaign context?
2. Are they likely to respond right now?

This model applies to PARTY panel rows and campaign lobby indicators.

## Canonical Player-Facing Labels

- `HERE`: Online and connected to the same campaign runtime session.
- `AWAY`: In this campaign runtime session, but likely not attending right now.
- `LOBBY`: Online in this campaign, but not connected to runtime session.
- `NOT HERE`: Online, but currently in a different campaign context.
- `OFFLINE`: Not logged in or not reachable.

## What Each Label Means

| Label      | Meaning                                                    | DM Actionability                       |
| ---------- | ---------------------------------------------------------- | -------------------------------------- |
| `HERE`     | In the same campaign and connected to runtime              | High (can speak/move/apply conditions) |
| `AWAY`     | In the same campaign runtime but inactive beyond threshold | High (prompt, ping, pause, move)       |
| `LOBBY`    | Logged in and in this campaign, not yet joined runtime     | Medium (prompt to launch/join)         |
| `NOT HERE` | Logged in but active in another campaign context           | Medium (availability uncertain)        |
| `OFFLINE`  | Not connected to platform presence heartbeat               | Low                                    |

## Composition Rules (Source-of-Truth)

Derive labels from three state dimensions, in this order:

1. Campaign context
2. Runtime session connection
3. Activity signal (for runtime-connected users)

### Derivation Priority

1. If platform heartbeat missing: `OFFLINE`
2. Else if user campaign context is another campaign: `NOT HERE`
3. Else if user is in this campaign but not runtime-connected: `LOBBY`
4. Else if user is runtime-connected in this campaign:
   - If activity indicates inactive beyond threshold: `AWAY`
   - Otherwise: `HERE`

## AFK/AWAY Detection (Avoid False Positives)

Do not mark `AWAY` from a single signal. Combine multiple signals:

- Interaction signal: keydown/click/drag/chat input/panel interaction
- Voice signal: speaking activity packets
- Runtime signal: websocket heartbeat continuity
- Visibility signal: tab hidden/backgrounded (weak signal only)
- Manual signal: user-set away toggle (strong override)

### Recommended Thresholds

- `HERE`: interaction or voice in last 90 seconds
- `AWAY`: no interaction and no voice for >= 8 minutes while runtime-connected
- Manual away toggle: immediate `AWAY` until interaction resumes or user clears it

### Tab Background Rule

Tab hidden alone must NOT set `AWAY`.

- Hidden + recent voice or interaction: keep `HERE`
- Hidden + no activity over threshold: transition to `AWAY`

## Mute Is Not Presence

Mute is an audio preference, not an availability signal.

- Muted users can still be fully present and responsive.
- Away users can be unmuted accidentally.

Therefore:

- Keep mute as a separate icon/channel state.
- Do not substitute mute for `AWAY`/`HERE`.

## Suggested PARTY Row Rendering

Example chips:

- Aria Stone — `HERE` • Unmuted
- Bren Tal — `AWAY` • Muted
- Keth Rook — `LOBBY`
- Mira Vale — `NOT HERE` (Other campaign)
- Dren Holt — `OFFLINE` (Last seen 14m ago)

## DM Runtime Prompting Guidance

When a player is `AWAY` during `ACTIVE` session:

1. Show subtle countdown hint after 2 minutes away
2. Show explicit "No response" hint after 5 minutes away
3. Offer one-click "Ping player" from PARTY row

This preserves flow and reduces dead time during live play.

## Contract Notes

- Store campaign context and runtime connection in Redis presence projection.
- Broadcast presence changes over WS after persistence.
- Frontend Zustand updates presence from WS payloads only.
- On reconnect, rehydrate from backend-authoritative presence snapshot.

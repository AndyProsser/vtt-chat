# Voice Chat UI First Pass Spec

Date: 2026-05-03
Status: First implementation pass
Scope: frontend session shell and voice-related panels

## Goals

- Make the session shell feel like a focused voice-chat workspace.
- Prioritize group switching, participant status, and current speaking context.
- Reduce placeholder language and improve visual hierarchy.

## Experience Direction

- Left rail behaves as the primary voice group rail.
- Center pane remains content-first (chat/notes) with quick switching.
- Right rail holds utility surfaces and optional controls.
- Visual style: compact cards, dense status chips, icon-forward labels.

## Layout Model

- Header row:
  - Session controls (chat/notes and tools toggle)
  - Campaign/session status card
- Main row:
  - Left: Voice panel summary + group selector + group member roster
  - Center: Active conversation surface
  - Right: Role-based utility tabs

## Icon and Image Plan

- Icons:
  - Voice, groups, users, mic, panel, chat, notes
  - Use inline SVG icon primitives in ui layer for consistency
- Participant visuals:
  - Use avatar glyph cards for each participant
  - Presence dot + speaking/muted chips remain always visible
- Decorative images:
  - No decorative hero images in this pass
  - Focus on functional visual cues and contrast

## First Pass Changes

- Left rail summary redesigned as "Voice Panel" with state badge and stat chips.
- Group selector reframed as "Voice Groups" with icon-led rows.
- Member list reframed as "Connected Members" using compact avatar cards.
- Command center shell adjusted with better panel proportions and surface depth.
- Toolbar labels now icon-led for clearer center-pane and utility controls.

## Acceptance Criteria

- A user can identify active session state from the left rail at a glance.
- Group switching controls are visually dominant over secondary metadata.
- Speaking and muted states are visible per member without interaction.
- Center chat/notes switch is discoverable in under one second.
- Placeholder wording is removed from active session shell copy.

## Next Iteration

- Add explicit group categories (main, breakout, private) with section grouping.
- Add persistent self controls (mute/deafen/input meter) at left rail footer.
- Add richer participant avatars or uploaded profile image support.
- Add compact mobile voice rail mode for narrow widths.

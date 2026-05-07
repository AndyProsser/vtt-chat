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

## Responsive Mode Expansion (Approved 2026-05-07)

The first pass remains centered on the `~900px` Balanced Player zone, but now defines two additional operating modes:

1. Minimalist Mobile (`<=767px`)
2. Balanced Player (`768px-1279px`, target `~900px`)
3. DM Desktop Command (`>=1280px`)

DM Desktop Command behavior:

- Keep left rail and center-pane baseline widths intact.
- Keep exactly one right-side panel open at all times.
- Keep right-edge icon rail; clicking icons switches the pinned panel.
- Default pinned panel is last used.

Minimalist Mobile behavior:

- Chat is the primary visual.
- Left panel collapses into compact stacked controls (group icons, avatars, mute/unmute, meter).
- Left panel can expand to full-width overlay and collapse again.
- Right-panel icons move to a bottom dock and open popovers.
- Show one-time dismissible warning for DM users that mobile is not command-optimal.

## Popout Panel Expansion (Approved 2026-05-07)

Two panel families are now part of the W0 shell expansion:

1. Settings (topbar icon)
2. Information (topbar icon)

Settings details:

- Sections: `System | Campaign | Profile`
- `System` applies defaults for newly created campaigns only.
- `Campaign` controls per-campaign feature flags and limits.
- Campaign edit permissions: DM only.
- Player/spectator can view campaign settings read-only by default.
- DM may hide campaign settings from non-DM users.

Session settings:

- Opened from session header cog as a compact popover.
- Fields: session name, markdown description, timer override.
- DM edits; player/spectator read-only.
- Timer override may exceed campaign default with warning-only UX.

Information details:

- Canonical tab order: `Campaign | Search | Notes | Journal | History`.
- `Journal` is FUTURE and feature-flagged off by default.
- `Search` spans session/chat data, summaries, and visible notes.
- `Notes` is read-focused with text filter and DM handout permissions.
- Notes handout model: `PRIVATE | PARTY | SELECTED`.

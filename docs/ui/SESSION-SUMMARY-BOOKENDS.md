# Session Summary and Chat Bookends

## Overview

This document defines the Journal summary workflow and session lifecycle bookend messages in chat.

These bookends are the visible record of session start, stop, pause, and resume transitions in the chat stream, not manual composer-authored messages.

## Journal Summary Data

Each session summary stores three key fields:

- Session ID: the session scope key used by the notes API route (`/api/notes/:sessionId`)
- Excerpt: short one-line recap used for quick context
- Summary: full recap body text

Implementation detail:

- Summary records are stored as notes with the `session-summary` tag.
- Summary records should include the `session:<sessionId>` tag for deterministic lookup.

## DM and Auto-Population Workflow

- If transcript/summary automation is enabled, the transcript service may populate the summary note automatically.
- If automation is disabled or unavailable, the DM manually edits and saves the summary from Journal.
- DM editing is the fallback source of truth.

## Missing Previous Summary Reminder

When a session starts and no summary exists for the previous session, the UI shows a subtle system note in chat:

- `Session Note: No previous session summary available.`

This reminder is informational only and does not block session start.

## Session Bookend Messages

On session state transitions, chat receives lightweight bookend markers:

- `[Session Started] <session name>` when transitioning to `ACTIVE`
- `[Session Ended] <session name>` when transitioning to `ENDED`
- `[Session Paused] <session name>` when transitioning to `PAUSED`
- `[Session Resumed] <session name>` when transitioning from `PAUSED` to `ACTIVE`

Server/WS authority requirements (must-have):

- Boundary markers are persisted by backend as chat system messages.
- The persisted message is broadcast via WS (`CHAT:MESSAGE_SENT`) to all session members.
- Frontend must render these server-emitted markers as bookends and must not suppress them as legacy content.
- After refresh/reconnect, bookends are restored from chat history API hydration and remain visible.

Rendering requirements:

- Marker style is a light horizontal line with centered text.
- The line should not be visible behind the text.
- `[Session Started]` and `[Session Ended]` are visible in both Greenroom and active session chat streams.
- `[Session Paused]` and `[Session Resumed]` are shown in active session chat streams and suppressed in Greenroom.
- No success popup notifications are shown for start/pause/resume/end; bookends and in-surface state are the canonical UX.

Lifecycle requirements:

- Every transition to `ACTIVE` must create a new `[Session Started]` marker for that session immediately.
- Every transition to `ENDED` must create a new `[Session Ended]` marker for that session immediately.
- Every transition to `PAUSED` must create a `Session Paused` marker immediately.
- Every resume transition back to `ACTIVE` must create a `Session Resumed` marker immediately.
- Every new session starts with a clean live chat context.
- On session restart, do not carry prior session chat or prior-session Greenroom chat into the new session timeline.

Implementation note (2026-05-08 runtime fix):

- Frontend state may know that a new session exists before its room topology has hydrated.
- Bookend writes therefore must target the new session's actual `MAIN` and Greenroom room IDs only after that topology is available.
- If topology is not ready yet, the frontend queues pending bookend writes and flushes them once the session rooms have been loaded into state.
- This ensures restarted sessions get their own immediate boundary markers in a clean timeline.

Regression coverage:

- Integration tests verify each restarted session gets its own immediate `Session Start` marker.
- Integration tests verify session boundary markers are correctly scoped to the current session timeline only.

## Future Placement in Campaign Settings

A future UX extension may expose Notes and Journal outside live campaign context as a dedicated tab on the campaign settings home screen so DMs can prepare summaries before session start.

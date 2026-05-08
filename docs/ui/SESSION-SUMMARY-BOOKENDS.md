# Session Summary and Chat Bookends

## Overview

This document defines the Journal summary workflow and session lifecycle bookend messages in chat.

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

- `Session Start: <local date/time>` when transitioning to `ACTIVE`
- `Session End: <local date/time>` when transitioning to `ENDED`

Rendering requirements:

- Marker style is a light horizontal line with centered text.
- The line should not be visible behind the text.
- Markers are visible in both Greenroom and active session chat streams.

## Future Placement in Campaign Settings

A future UX extension may expose Notes and Journal outside live campaign context as a dedicated tab on the campaign settings home screen so DMs can prepare summaries before session start.

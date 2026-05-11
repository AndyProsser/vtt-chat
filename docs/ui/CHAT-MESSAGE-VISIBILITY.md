# Chat Message Visibility Rules

**Status**: W0 Frontend Surface Completion
**Related**: [UI-COMPONENTS.md](UI-COMPONENTS.md), [SESSION-SUMMARY-BOOKENDS.md](SESSION-SUMMARY-BOOKENDS.md)

---

## Overview

Chat message visibility in VTT-Chat is scoped by **room** (group/greenroom), **session state**, and **persona role**. This document defines which messages each persona can see in each context.

---

## Message Visibility Matrix

| Context                    | DM  | Players in Group | Players NOT in Group      | Spectators                       | Whisper Access |
| -------------------------- | --- | ---------------- | ------------------------- | -------------------------------- | -------------- |
| **ACTIVE MAIN group**      | ✔   | ✔                | ✖ (can see empty bubbles) | ✔                                | DM only        |
| **ACTIVE secondary group** | ✔   | ✔ (if member)    | ✖ (cannot see)            | ✔                                | DM only        |
| **PAUSED (stage prep)**    | ✔   | ✔ (if in MAIN)   | ✖                         | ✖ (see timer, not chat)          | DM only        |
| **Greenroom**              | ✔   | ✔                | ✔                         | ✖                                | DM only        |
| **Whisper (PRIVATE)**      | ✔   | ✔ (if member)    | ✖                         | ✖ (see who's in it, not content) | DM controls    |
| **ENDED (cooldown)**       | ✔   | ✔ (if in MAIN)   | ✖                         | ✔\*                              | N/A            |

---

## Detailed Rules

### ACTIVE Session — MAIN Group

**Visibility**:

- **DM**: Sees all MAIN group messages.
- **Players in MAIN**: See all MAIN group messages.
- **Players NOT in MAIN**: Cannot see MAIN messages, but see empty message bubbles (placeholders) to indicate activity without content.
- **Spectators**: See all MAIN group messages (full audience view).

**Rationale**: MAIN is the public stage; spectators see the main action; non-members see activity indicators but not content (narrative control).

### ACTIVE Session — Secondary Groups

**Visibility**:

- **DM**: Sees all secondary group messages.
- **Players in Secondary Group**: See only messages from their group.
- **Players NOT in Secondary Group**: Cannot see messages or activity indicators.
- **Spectators**: See all secondary group messages (full stage coverage).

**Rationale**: Secondary groups are breakout rooms; non-members have no visibility; spectators see full stage production.

### PAUSED Session — Stage Prep

**Visibility**:

- **DM**: Sees chat in MAIN (stage prep only, no secondary groups).
- **Players**: See chat only if currently in MAIN group; cannot see secondary group chat.
- **Non-MAIN Players**: See timer and session info, but no chat content.
- **Spectators**: Do NOT see chat or stage prep; see only timer and "curtain down" indicator.

**Rationale**: Intermission hides audience view (spectators); DM/stage prepare in MAIN; breakout groups are not visible during pause.

### ENDED Session — Cooldown Phase

**Visibility**:

- **DM**: Sees all MAIN group messages in cooldown chat stream.
- **Players**: See chat in MAIN only during cooldown (finalized state).
- **Spectators**: See MAIN cooldown chat if still connected\*; cooldown chat is not recorded.

**Rationale**: Finale cooldown allows post-show thanks; spectator chat is ephemeral (not persisted).

**Notes**:

- Cooldown chat is in a separate ephemeral stream (not persisted to session history).
- After cooldown expires or is cancelled, players/spectators disconnect; all ephemeral chat is purged from local state.

### Greenroom (INACTIVE/Between Sessions)

**Visibility**:

- **DM**: Sees all Greenroom messages.
- **Players**: See all Greenroom messages (open hangout).
- **Other Players**: See all Greenroom messages (same room).
- **Spectators**: DO NOT see Greenroom (spectators cannot enter greenroom).

**Rationale**: Greenroom is a private player/DM warm-up space; spectators see only live sessions.

### Whisper Group (PRIVATE)

**Visibility**:

- **DM**: Sees all Whisper content (can read/hear all Whisper group activity).
- **Players in Whisper**: See/hear only Whisper group content.
- **Players NOT in Whisper**: Cannot see or hear Whisper content.
- **Spectators**: See Whisper exists (member list icon at bottom), cannot read/hear content.
- **Recording**: Whisper is always off-the-record; never recorded or logged.

**Rationale**: Whisper is a single, system-managed private huddle; DM controls membership and content; completely off-the-record.

---

## Message Types & Visibility Exceptions

### System Messages

System messages (bookends, state transitions, etc.) appear in **all visible chat streams** for the persona:

- Bookends (`[Session Started]`, `[Session Paused]`, etc.) appear in Greenroom and active chat.
- Session state transitions appear only in the stream the persona currently inhabits.

### Empty Message Bubbles (Non-Member Indicators)

**When shown**:

- Players NOT in a secondary group during ACTIVE session see light gray placeholder bubbles in the timeline.
- No content is visible; only bubble count/timing indicates activity.

**Purpose**: Narrative tension — indicates off-stage action without spoiling content.

**Implementation note**: May be feature-flagged off in future if it adds too much UI clutter.

---

## Cross-Group Message Isolation

**Strict isolation during ACTIVE**:

- MAIN and secondary group messages are completely isolated.
- No cross-group message visibility, even for DM, except in administrative debug views.
- DM voice can address specific groups, but DM chat must target a single group.

**Notes on DM Chat**:

- DM chat target is determined by last-selected/current group (UI state).
- Multi-group broadcast chat is not available in Phase W0; DM uses announcement/broadcast voice instead.

---

## Refresh/Reconnect Behavior

On refresh or reconnect:

1. Chat history is re-hydrated from backend per session and room.
2. Visibility rules apply to re-hydrated messages same as live messages.
3. If persona's room membership changed since disconnect, they see only messages from their new room(s).
4. Bookends persist in history and remain visible after reconnect.

---

## Access Control Summary

| Action                  | DM  | Player (in group) | Player (not in group) | Spectator     |
| ----------------------- | --- | ----------------- | --------------------- | ------------- |
| **Read MAIN**           | ✔   | ✔                 | ✖                     | ✔             |
| **Read Secondary**      | ✔   | ✔ (if member)     | ✖                     | ✔             |
| **Read Greenroom**      | ✔   | ✔                 | ✔                     | ✖             |
| **Read Whisper**        | ✔   | ✔ (if member)     | ✖                     | ✖             |
| **See Whisper members** | ✔   | ✔                 | ✔                     | ✔ (icon only) |
| **Compose MAIN**        | ✔   | ✔ (in session)    | ✖                     | ✖             |
| **Compose Greenroom**   | ✔   | ✔                 | ✔                     | ✖             |
| **Compose Whisper**     | ✔   | ✔ (if member)     | ✖                     | ✖             |

---

## Implementation Checklist

- [ ] Chat message filtering applies correct visibility rules on hydration.
- [ ] Empty bubble placeholders render for ACTIVE secondary groups (feature-flag toggleable).
- [ ] Greenroom chat is never shown to spectators.
- [ ] Whisper content is never shown to non-members or spectators.
- [ ] Bookend messages respect visibility rules (appear in all visible streams).
- [ ] Cooldown chat is isolated to ephemeral stream and purged after cooldown ends.
- [ ] Refresh/reconnect re-applies visibility filters to re-hydrated history.
- [ ] Access control is enforced on backend (no leaking via API).

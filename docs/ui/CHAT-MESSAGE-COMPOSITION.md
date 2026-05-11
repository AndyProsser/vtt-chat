# Chat Message Composition & Creation Rules

**Status**: W0 Frontend Surface Completion
**Related**: [UI-COMPONENTS.md](UI-COMPONENTS.md), [CHAT-MESSAGE-VISIBILITY.md](CHAT-MESSAGE-VISIBILITY.md)

---

## Overview

Chat message composition in VTT-Chat is context-aware: the composer availability, target group selection, and send permissions depend on **session state**, **persona role**, and **current room membership**. This document defines who can compose and send messages in each context.

---

## Composer Availability Matrix

| Context                    | DM                       | Players                    | Spectators        | Notes                                        |
| -------------------------- | ------------------------ | -------------------------- | ----------------- | -------------------------------------------- |
| **ACTIVE MAIN**            | ✔ (always target MAIN)   | ✔ (target current group)   | ✖                 | Composer visible and enabled                 |
| **ACTIVE Secondary**       | ✔ (target current group) | ✔ (target current group)   | ✖                 | Composer visible and enabled                 |
| **Greenroom**              | ✔                        | ✔                          | ✖                 | Open hangout; everyone composes to Greenroom |
| **PAUSED**                 | ✔ (MAIN only)            | ✖\* (MAIN only if present) | ✖                 | Stage prep; no secondary group compose       |
| **Whisper**                | ✔                        | ✔ (if member)              | ✖                 | Private huddle; ephemeral/off-record         |
| **ENDED (cooldown)**       | ✔ (MAIN)                 | ✔ (MAIN only)              | ✔ (MAIN only)\*\* | Post-show thanks; ephemeral only             |
| **ENDED (after cooldown)** | ✖                        | ✖                          | ✖                 | Composer disabled; session closed            |

---

## Detailed Rules

### ACTIVE Session — MAIN Group Compose

**Who can compose**:

- **DM**: Always able to compose and send to MAIN.
- **Players in MAIN**: Can compose and send to MAIN.
- **Players in Secondary Groups**: Cannot compose to MAIN; composition target is locked to their current group.
- **Spectators**: Cannot compose.

**Composer state**:

- Visible and enabled for DM and players in MAIN.
- Disabled/hidden for players in secondary groups (they compose to their group instead).
- Hidden entirely for spectators.

**Message target**:

- All messages go to MAIN room.
- No cross-group composition in Phase W0.

---

### ACTIVE Session — Secondary Group Compose

**Who can compose**:

- **DM**: Can compose to any secondary group they have selected/open.
- **Players in Secondary Group**: Can compose and send only to their own secondary group.
- **Players in Other Secondary Groups**: Cannot compose to a group they're not in.
- **Players in MAIN**: Cannot compose to secondary groups; if they join a secondary group, composer target updates to that group.
- **Spectators**: Cannot compose.

**Composer state**:

- Visible and enabled for DM and players in the secondary group.
- Disabled/hidden for non-members.

**Message target**:

- All messages go to the specific secondary room.
- Changing rooms updates the composer target automatically.

---

### Greenroom (INACTIVE/Between Sessions)

**Who can compose**:

- **DM**: Can compose and send to Greenroom.
- **Players**: Can compose and send to Greenroom.
- **Spectators**: Cannot enter Greenroom; no composer access.

**Composer state**:

- Visible and enabled for DM and players.
- Disabled/hidden for spectators.

**Message target**:

- All messages go to Greenroom room.
- Single composition target; no group selection needed.

**Notes**:

- Greenroom is a warm-up hangout; all composition is open and shared.

---

### PAUSED Session — Stage Prep

**Who can compose**:

- **DM**: Can compose and send to MAIN only (stage prep).
- **Players in MAIN**: Can compose and send to MAIN.
- **Players NOT in MAIN**: Cannot compose during pause.
- **Spectators**: Cannot compose (curtain down).

**Composer state**:

- Visible and enabled for DM and players in MAIN.
- Disabled/hidden for everyone else.
- Composition target is locked to MAIN; no secondary group composition during pause.

**Message target**:

- All messages go to MAIN only.
- No secondary group chat during pause.

**Notes**:

- Pause is an intermission (curtain down); chat is limited to stage prep in MAIN.
- Runtime chat during pause must NOT be recorded or persisted (off-the-record per contract).

---

### Whisper Group (PRIVATE)

**Who can compose**:

- **DM**: Can compose and send to Whisper.
- **Players in Whisper**: Can compose and send to Whisper.
- **Players NOT in Whisper**: Cannot compose to Whisper.
- **Spectators**: Cannot compose or see Whisper content.

**Composer state**:

- Visible and enabled for DM and Whisper members.
- Whisper has a separate composer interface (may be inline or popout).
- Hidden for non-members.

**Message target**:

- All messages go to Whisper room (PRIVATE).

**Persistence & Recording**:

- **Whisper chat is NEVER recorded or persisted** to session history (off-the-record contract).
- After Whisper ends, message state is cleared locally.
- No history API includes Whisper chat.
- Message timestamps and content remain in memory only while Whisper is active.

**Notes**:

- Whisper is a single, system-managed private bubble created when session starts.
- DM controls entry/exit; players cannot initiate private groups in Phase W0.

---

### ENDED Session — Cooldown Phase

**Who can compose**:

- **DM**: Can compose and send to MAIN.
- **Players in MAIN**: Can compose and send to MAIN.
- **Spectators**: Can compose and send to MAIN\* (post-show finale window).
- **Players NOT in MAIN**: Cannot compose.

**Composer state**:

- Visible and enabled for DM, players in MAIN, and connected spectators.
- Disabled/hidden for others.
- Composition target is locked to MAIN; no secondary groups.

**Message target**:

- All messages go to MAIN only.

**Persistence & Recording**:

- **Cooldown chat is ephemeral and NOT persisted** to session history (off-the-record per contract).
- Cooldown messages remain in local chat stream during cooldown window only.
- After cooldown expires or is cancelled, all cooldown messages are purged from local state.
- No history API includes cooldown messages; they never survive refresh/reconnect.
- Backend may log cooldown interactions for audit, but does not persist them in session history.

**Notes**:

- Cooldown is a post-show thanks/goodbye phase; spectators can participate.
- After cooldown ends (via expiry or cancel), session disconnects all users.

---

### ENDED Session — After Cooldown

**Who can compose**:

- **Everyone**: No one. Session is closed; composer disabled.

**Composer state**:

- Disabled and hidden for all personas.
- Session chat is read-only (history-only).

---

## Composer UI Behavior

### Auto-Target Switching

When a player joins a new room:

1. Composer target auto-updates to the new room.
2. Placeholder text updates to indicate target: "Message MAIN", "Message Tavern", "Message Whisper", etc.
3. No manual room-selection dropdown required (auto-tracking per Copilot instructions: "simplicity").

### Multi-Message Queuing

If network is unstable:

- Messages may be queued locally in `queued` state.
- Zustand store tracks: `sending`, `queued`, `failed`, `sent` per message.
- Failed messages show resend option; user can retry or delete.
- Queue persists only for the current session (not across refresh).

### Mention & Link Parsing (Future)

Phase W0 does not include mentions or rich links; plain text only.

---

## Message Composition Access Control

| Action                        | DM          | Player (in group) | Player (not in group) | Spectator         |
| ----------------------------- | ----------- | ----------------- | --------------------- | ----------------- |
| **Compose to MAIN**           | ✔           | ✔                 | ✖                     | ✖ (✔ in cooldown) |
| **Compose to Secondary**      | ✔ (current) | ✔ (current)       | ✖                     | ✖                 |
| **Compose to Greenroom**      | ✔           | ✔                 | ✔                     | ✖                 |
| **Compose to Whisper**        | ✔           | ✔ (if member)     | ✖                     | ✖                 |
| **Compose in PAUSED**         | ✔ (MAIN)    | ✔ (if in MAIN)    | ✖                     | ✖                 |
| **Compose in ENDED cooldown** | ✔           | ✔ (if in MAIN)    | ✔                     | ✖                 |

---

## Recording & Persistence Summary

| Context                 | Persisted? | Recorded? | Recoverable on Refresh? | Notes                             |
| ----------------------- | ---------- | --------- | ----------------------- | --------------------------------- |
| **ACTIVE chat**         | ✔          | ✔         | ✔                       | Standard session content          |
| **Greenroom chat**      | ✔          | ✔         | ✔                       | Open to all players/DM            |
| **Whisper chat**        | ✖          | ✖         | ✖                       | **OFF-THE-RECORD** (contract)     |
| **PAUSED runtime chat** | ✖          | ✖         | ✖                       | **OFF-THE-RECORD** (contract)     |
| **ENDED cooldown chat** | ✖          | ✖         | ✖                       | **EPHEMERAL** (post-show only)    |
| **Bookends**            | ✔          | ✔         | ✔                       | System messages; always persisted |

---

## Implementation Checklist

- [ ] Composer hidden/disabled for spectators in ACTIVE and PAUSED.
- [ ] Composer auto-targets secondary group when player joins group.
- [ ] DM composer target follows DM's current selected group.
- [ ] Whisper composer has separate interface or clear affordance.
- [ ] Whisper messages are purged on session end (not persisted).
- [ ] PAUSED runtime chat is not persisted (off-the-record enforcement).
- [ ] Cooldown chat is ephemeral (purged after cooldown ends).
- [ ] Multi-message queue tracks state per message (queued, sending, failed, sent).
- [ ] Failed messages show resend/delete options.
- [ ] Composer state gates are enforced on backend (no sending to unauthorized rooms).
- [ ] Message access control is verified on backend (no leaking via API).

---

## Notes on DM Simplicity

Per VTT-Chat design principles, composer behavior must be intuitive for the DM:

- ✔ Auto-target handles group changes automatically (no manual selection).
- ✔ Composer is always available and obvious (no hidden panels).
- ✔ Message send is a single action (no confirmation dialogs).
- ✖ No multi-group broadcast composition (use broadcast voice instead).
- ✖ No message editing or deletion (one-shot posts only in Phase W0).

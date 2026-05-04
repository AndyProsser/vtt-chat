# Permissions Matrix

The Permissions Matrix defines **who can do what** within the VTT‑Chat platform.
It is the authoritative reference for all capability checks across the system, including:

- UI visibility
- Event dispatch permissions
- State mutation rights
- Extension‑level overrides
- DM‑only controls
- Player‑only interactions
- Spectator‑only restrictions

This matrix is intentionally **role‑centric**, not feature‑centric.
Roles define capabilities; capabilities unlock features.

---

## 1. Roles Overview

| Role          | Description                                                                                                                                                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **DM**        | Full control of the table, players, audio, and session state. DM role is assigned automatically from external system campaign ownership data — no separate DM invite required. Guest DMs can manage sessions via the extension. A full account is required to generate spectator invite links and to access the admin console. |
| **Player**    | Active participant with character‑level interactions.                                                                                                                                                                                                                                                                          |
| **Spectator** | Read‑only observer. Cannot access the green room. Subject to DM-controlled access policy, slot limits, and waitlist rules.                                                                                                                                                                                                     |
| **System**    | Internal actor used for automated events and system messages.                                                                                                                                                                                                                                                                  |

### Account Type vs Table Role

**Account type** (FULL / GUEST) is an authentication property on the User record. **Table role** (DM / Player / Spectator) is a campaign membership property. These are independent axes:

|                   | DM  | Player | Spectator |
| ----------------- | --- | ------ | --------- |
| **Full account**  | ✔   | ✔      | ✔         |
| **Guest account** | ✔   | ✔      | ✔         |

Guest accounts can hold DM/Player/Spectator table roles. Capabilities are still determined by **table role**, while account type gates onboarding and account-management behavior.

- Guest users **cannot** change their own password (they have none).
- Guest users **can** initiate an account upgrade to set a password.
- Guest JWTs have a shorter lifetime and are renewed silently by the extension.
- **DM/Player guest access is granted only via extension POST invite flow** (`POST /api/auth/extension/guest-login`).
- **Guest DM/Player accounts are campaign-scoped** — they can access only the campaign they were invited/launched into.
- **Outside extension launch, DM/Player guest access is not granted**.
- **Direct watch-link spectator onboarding can create a guest spectator account**.
- **Guest spectators are temporary** and scoped to the active watch session duration.

See [../extension/GUEST-AUTH.md](../extension/GUEST-AUTH.md) for the guest auth flow.

---

## 2. Capability Categories

Capabilities are grouped into functional domains:

- **Chat** — sending messages, whispers, system prompts
- **Notes** — creating, editing, sharing notes
- **Audio** — controlling effects, presets, routing
- **Presence** — updating status, avatar, readiness
- **Session** — starting, ending, pausing sessions
- **Moderation** — muting, kicking, overriding states
- **Extension** — interacting with the VTT overlay
- **Admin** — developer‑level or system‑level actions

---

## 3. Permissions Matrix

### 3.1 Chat Capabilities

| Capability              | DM  | Player | Spectator | System |
| ----------------------- | --- | ------ | --------- | ------ |
| Send IC message         | ✔   | ✔      | ✖         | ✔      |
| Send OOC message        | ✔   | ✔      | ✖         | ✔      |
| Whisper to player       | ✔   | ✔      | ✖         | ✔      |
| Whisper to DM           | ✔   | ✔      | ✖         | ✔      |
| Send system message     | ✔   | ✖      | ✖         | ✔      |
| Delete own message      | ✔   | ✔      | ✖         | ✖      |
| Delete others' messages | ✔   | ✖      | ✖         | ✖      |

---

### 3.2 Notes Capabilities

| Capability          | DM  | Player | Spectator | System |
| ------------------- | --- | ------ | --------- | ------ |
| Create private note | ✔   | ✔      | ✖         | ✖      |
| Create shared note  | ✔   | ✔      | ✖         | ✖      |
| Edit shared note    | ✔   | ✔      | ✖         | ✖      |
| Delete shared note  | ✔   | ✖      | ✖         | ✖      |
| View all notes      | ✔   | ✖      | ✖         | ✖      |

---

### 3.3 Audio Capabilities

| Capability           | DM  | Player | Spectator | System |
| -------------------- | --- | ------ | --------- | ------ |
| Trigger sound effect | ✔   | ✔      | ✖         | ✔      |
| Apply preset         | ✔   | ✖      | ✖         | ✔      |
| Modify audio graph   | ✔   | ✖      | ✖         | ✖      |
| Mute player          | ✔   | ✖      | ✖         | ✖      |
| Mute all             | ✔   | ✖      | ✖         | ✖      |

---

### 3.4 Presence Capabilities

| Capability               | DM  | Player | Spectator | System |
| ------------------------ | --- | ------ | --------- | ------ |
| Update presence          | ✔   | ✔      | ✖         | ✔      |
| Change avatar            | ✔   | ✔      | ✖         | ✖      |
| Override player presence | ✔   | ✖      | ✖         | ✖      |
| Force disconnect         | ✔   | ✖      | ✖         | ✖      |

---

### 3.5 Session Capabilities

| Capability     | DM  | Player | Spectator | System |
| -------------- | --- | ------ | --------- | ------ |
| Start session  | ✔   | ✖      | ✖         | ✖      |
| End session    | ✔   | ✖      | ✖         | ✖      |
| Pause session  | ✔   | ✖      | ✖         | ✖      |
| Resume session | ✔   | ✖      | ✖         | ✖      |
| Lock table     | ✔   | ✖      | ✖         | ✖      |

---

### 3.6 Moderation Capabilities

| Capability     | DM  | Player | Spectator | System |
| -------------- | --- | ------ | --------- | ------ |
| Kick player    | ✔   | ✖      | ✖         | ✖      |
| Ban player     | ✔   | ✖      | ✖         | ✖      |
| Clear chat     | ✔   | ✖      | ✖         | ✖      |
| Override state | ✔   | ✖      | ✖         | ✖      |

---

### 3.7 Extension Capabilities

| Capability                                  | DM                    | Player | Spectator     | System |
| ------------------------------------------- | --------------------- | ------ | ------------- | ------ |
| Inject overlay                              | ✔                     | ✔      | ✔ (read-only) | ✖      |
| Read VTT state                              | ✔                     | ✔      | ✖             | ✖      |
| Write VTT state                             | ✔                     | ✖      | ✖             | ✖      |
| Trigger VTT actions                         | ✔                     | ✖      | ✖             | ✖      |
| Submit guest login (player, extension)      | ✔                     | ✔      | ✖             | ✖      |
| Submit guest join (spectator, web)          | ✖                     | ✖      | ✔             | ✖      |
| Join waitlist                               | ✖                     | ✖      | ✔             | ✖      |
| Browse active campaigns (full account only) | ✔                     | ✔      | ✔             | ✖      |
| Push sync update (per policy)               | ✔                     | ✔      | ✖             | ✖      |
| Update campaign data via sync               | ✔                     | ✖      | ✖             | ✖      |
| Generate player invite link (initial)       | ✔ (full account only) | ✖      | ✖             | ✖      |
| Revoke / reissue player invite link         | ✔                     | ✖      | ✖             | ✖      |
| Generate / manage spectator invite          | ✔ (full account only) | ✖      | ✖             | ✖      |
| Set spectatorPolicy                         | ✔                     | ✖      | ✖             | ✖      |
| Set spectatorMax                            | ✔                     | ✖      | ✖             | ✖      |
| Enable / disable waitlist                   | ✔                     | ✖      | ✖             | ✖      |
| Set discoverable flag                       | ✔                     | ✖      | ✖             | ✖      |
| Change extensionSyncPolicy                  | ✔                     | ✖      | ✖             | ✖      |
| Upgrade own account (guest → full)          | ✔                     | ✔      | ✔             | ✖      |

---

### 3.8 Spectator Access Rules

These are **not** role-based capabilities — they are structural constraints that apply to all spectators regardless of account type:

| Constraint       | Rule                                                                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Green room       | Never. Spectators cannot enter the green room under any circumstances.                                                                                                            |
| Session view     | Read-only. Spectators see the session view only while a session is active.                                                                                                        |
| Chat             | Read-only. Spectators see public room chat but cannot send messages.                                                                                                              |
| Whispers         | Not visible to spectators.                                                                                                                                                        |
| Notes            | Not visible to spectators.                                                                                                                                                        |
| Audio controls   | Spectators can adjust local mix only (client-local). They cannot change room/global audio state.                                                                                  |
| Presence         | Spectators appear in a separate spectator list, not in the player presence bar.                                                                                                   |
| Slot retention   | A disconnected spectator retains their slot for the reconnect grace period (sysadmin-controlled). After expiry the slot is released and the next waitlist entry is auto-promoted. |
| Session end      | Spectator view shows "Session ended" state; slot released immediately.                                                                                                            |
| Spectator toggle | If spectators are disabled mid-session, already-connected spectators are grandfathered through that session. New sessions block spectator entry until re-enabled.                 |
| Guest lifetime   | Guest spectator identity is temporary and scoped to watch-session participation.                                                                                                  |
| Campaign browse  | Campaign visibility is controlled by campaign privacy/access rules (not session lifecycle). Guest players cannot browse campaigns. Guest spectators join via direct watch links.  |

### 3.8.1 Relationship Lock

- Campaign participation uses `User -> CampaignMembership(role) -> Character`.
- One active character per player per campaign; character replacement is allowed.
- Chat/history should keep send-time character snapshot identity.

---

### 3.9 Admin Roles

The **Admin system** is orthogonal to game roles (DM, Player, Spectator). Any user can become an admin by being promoted. All DMs automatically have `adminRole: CAMPAIGN_DM`. Admins authenticate separately with their password, and guest users must upgrade to full accounts before admin login is allowed.

#### Admin Role Hierarchy

| Admin Role      | Description                                                                                         | Automatic Assignment |
| --------------- | --------------------------------------------------------------------------------------------------- | -------------------- |
| **SUPER_ADMIN** | Full system access: create/delete/suspend users, manage admins, view all campaigns/telemetry        | No (promoted only)   |
| **ADMIN**       | Moderate users, manage campaigns, view telemetry, manage settings. No destructive ops.              | No (promoted only)   |
| **CAMPAIGN_DM** | Campaign-level ops (backup, export, import, members, campaign telemetry). System view is read-only. | Yes (all DMs)        |
| **READ_ONLY**   | View-only access to all data. Cannot modify anything.                                               | No (promoted only)   |

#### Admin Permissions

See [./ADMIN-ARCHITECTURE.md](./ADMIN-ARCHITECTURE.md#3-admin-permissions-matrix) for the complete admin permissions matrix covering:

- User Management (view, suspend, promote, create, delete)
- Campaign Management (create, view, edit, backup, export, import, delete)
- Session Management (view, force-end, view recordings)
- Telemetry & Reporting (dashboard, health, logs, analytics)
- System Administration (settings, API keys, feature flags, audit logs)

---

## 4. System Role

The **System** role is not a user.
It is used for:

- Automated events
- Presence pings
- System messages
- Internal state transitions
- Server‑side enforcement

System actions **never bypass** the permissions model unless explicitly defined.

---

## 5. Extensibility

The Permissions Matrix is designed to be:

- **Declarative** — stored as JSON
- **Composable** — capabilities can be grouped
- **Override‑friendly** — DMs can grant temporary capabilities
- **Future‑proof** — new subsystems can add new capability groups

---

## 6. Source of Truth

The matrix is enforced in:

- The reducer layer
- The server event validator
- The extension bridge
- The UI (visibility + disabled states)

All four layers must agree for a capability to be allowed.

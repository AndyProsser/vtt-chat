# **GUEST-AUTH.md**

# Guest Mode & Extension Authentication

_How the browser extension enables low-friction, invite-link-based onboarding by delegating identity and character validation to third-party VTT systems._

**Related docs:**

- [EXTENSION-INTEGRATION.md](EXTENSION-INTEGRATION.md) — extension architecture and communication
- [THIRD-PARTY-INTEGRATIONS.md](THIRD-PARTY-INTEGRATIONS.md) — supported systems and admin authorization
- [EXTENSION-UX.md](EXTENSION-UX.md) — overlay UX and role-aware UI
- [../architecture/DATA-MODEL.md](../architecture/DATA-MODEL.md) — data schema for external identities

**Extension repository:** https://github.com/AndyProsser/vtt-chat-extension (D&D Beyond front-end and scraping layer — integration with vtt-chat backend is defined by this document)

---

## Overview

VTT-Chat supports two distinct guest access paths. Both allow users to participate without a full registered account, but they differ in how identity is established and what they can do.

### Player Guest Path (extension-required)

The DM generates a per-campaign **player invite link**. Players visit that link while running the browser extension on a supported VTT (e.g. D&D Beyond). The third-party system has already authenticated the user and validated their character. The extension scrapes that validated data and hands it to the vtt-chat backend, which matches or creates a guest account and issues a session token.

This is a deliberate trust delegation model:

> "D&D Beyond has already verified that this email address owns this character in this campaign. vtt-chat trusts that assertion to skip its own registration flow."

For DMs, the same extension-based flow applies — the extension identifies the DM from the third-party campaign owner field and grants DM-level access automatically. **No separate DM invite is required.** The same player invite code is used for both players and DMs; the DM role is assigned by the backend based on the campaign owner field in the external data packet, not the invite type.

**The first user to connect — whether the DM or a player — bootstraps the campaign data structures** from the external campaign data packet, which includes the DM's external ID, all player external IDs, character IDs, and basic character information (name, class, level). Subsequent users who connect extend the existing data as normal. Once the DM connects, they automatically gain full campaign control: starting and stopping sessions, managing players, and setting campaign state.

To generate **spectator invite links**, the DM must hold a full vtt-chat account. Guest DMs operating via the extension can launch and manage sessions but cannot create spectator invites until they upgrade.

**Guest players are campaign-scoped.** A guest player account cannot browse or join other campaigns independently. Each additional campaign requires a separate extension-based authentication.

### Spectator Guest Path (no extension required)

The DM generates a separate **spectator invite link**. Spectators open this link in a browser — no extension required. The invite page shows campaign details, active character roster with connection status, and current session status. The user enters their name and email to create a lightweight guest spectator account. No password is required; the invite itself validates their session.

Full-account users can also find and join campaigns that advertise themselves as open to spectators via the campaign browse page — no invite link required for that path.

The DM has ultimate authority over spectator access: whether spectators are permitted at all, what account types are allowed, how many can be present simultaneously, and whether a waitlist is maintained.

---

## 1. Trust Model

### 1.1 Why External Auth Is Trusted

Third-party platforms (D&D Beyond, Roll20, Foundry VTT) enforce their own account validation. Specifically:

- A D&D Beyond user must own or be invited to a campaign to appear on its character roster.
- Character-to-campaign membership is validated by the external platform.
- The scraped email address is the same address the user registered with on the external platform.

vtt-chat treats the combination of `(externalSystem, externalUserId, email)` as sufficient to issue a guest token, subject to the invite link being valid.

### 1.2 Scope of Trust

| What is trusted                                   | What is NOT trusted                                       |
| ------------------------------------------------- | --------------------------------------------------------- |
| Email from external profile                       | Email supplied manually by the user                       |
| Character membership in campaign (by externalId)  | Campaign data that doesn't match the invite code          |
| DM status from external campaign owner field      | Role escalation beyond what the external system indicates |
| Avatar URL and display name from external profile | Arbitrary metadata injected by the extension              |

---

## 2. Invite Links and Spectator Access

There are two distinct invite link types. They are generated separately, have different flows, and serve different roles.

### 2.1 Player Invite Links (Extension Required)

Player invite links require the browser extension (or equivalent VTT integration) to authenticate.

- Player invite links can be generated by a **full-account DM or a sysadmin**. The invite is **campaign-scoped** and applies to all extension-joining users — both players and the DM.
- One active player invite code per campaign.
- Codes are opaque random strings (minimum 24 characters, URL-safe).
- The invite carries **no role information**. The DM role is inferred from the external system's campaign ownership data supplied in the extension data packet at join time.
- Invite codes can be **revoked and reissued** by a DM (any account type, once joined) or a sysadmin. Revoking prevents new connections; existing sessions continue until their token expires naturally.

```
https://<platform>/join/<inviteCode>
https://<platform>/join/<inviteCode>?source=dndbeyond
```

The extension pre-flight validates this code before attempting guest login (see Section 3).

---

### 2.2 Spectator Invite Links (No Extension Required)

Spectator invite links open a browser page — no extension installation required.

- Only full-account DMs can generate spectator invite links.
- One active spectator invite code per campaign (separate from the player invite code).
- The spectator invite page shows: campaign name, DM display name, active character roster with connection status, and current session status (in session / between sessions).
- The user enters their name and email to create a guest spectator account. No password is set; the invite validates their session.
- Spectators **cannot access the green room**. Spectator sessions are only active during a live session. Spectators who connect between sessions see the status page only.

```
https://<platform>/watch/<spectatorInviteCode>
```

Response from the invite validation endpoint:

```json
{
  "valid": true,
  "type": "spectator",
  "campaign": {
    "name": "The Lost Mines",
    "dmDisplayName": "Gandalf",
    "sessionActive": true,
    "spectatorSlotsFilled": 2,
    "spectatorSlotsMax": 5,
    "spectatorWaitlistEnabled": true,
    "waitlistPosition": null
  },
  "characters": [
    {
      "name": "Aragorn",
      "class": "Ranger",
      "level": 5,
      "avatarUrl": "https://ddb.ac/avatars/char.png",
      "online": true
    },
    {
      "name": "Gandalf",
      "class": "Wizard",
      "level": 20,
      "avatarUrl": "https://ddb.ac/avatars/char2.png",
      "online": false
    }
  ]
}
```

If capacity is reached, the response indicates the waitlist position. The user can opt into the waitlist and will be auto-promoted (first-come-first-served) when a slot opens due to a spectator disconnecting (after the reconnect grace period expires).

---

### 2.3 Spectator Access Controls (DM-Controlled)

The DM sets spectator policy per campaign from Campaign Settings:

| Setting  | Label                  | Who can spectate                                                                |
| -------- | ---------------------- | ------------------------------------------------------------------------------- |
| `NONE`   | No spectators          | Spectators are disabled. Campaign still appears in browse (marked as private).  |
| `GUESTS` | Guests & full accounts | Anyone with a spectator invite or a full account (if campaign is discoverable). |
| `USERS`  | Full accounts only     | Only users with full vtt-chat accounts can spectate.                            |

Additional controls:

- **Max spectators**: integer (null = platform default). Sysadmins set the platform default and a hard maximum that DMs cannot exceed.
- **Waitlist**: enabled/disabled per campaign. When enabled and at capacity, new spectators join a waitlist and are auto-promoted when a slot opens.
- **Reconnect grace period**: a disconnected spectator retains their slot for a configurable grace period (sysadmin-controlled default) before being removed and triggering a waitlist promotion.
- **Discoverable**: boolean. When true and `spectatorPolicy != NONE`, the campaign appears in the public campaign browse list for full-account users.

---

### 2.4 Campaign Browse (Full Account Users)

Full-account users can browse active campaigns that have spectators enabled and `discoverable = true`. This does not require an invite link.

Campaigns with `spectatorPolicy = NONE` or `discoverable = false` appear in browse results as **private** (name shown, no join option).

```
GET /api/campaigns/browse
```

Response includes:

- Campaign name, DM display name
- Session status (active / between sessions)
- Spectator slot count and availability
- Whether the campaign is private (join button disabled)

Guest player accounts cannot access the campaign browse page — they are scoped to their campaign and can only join via extension.

---

### 2.5 Player Invite Code Validation (Pre-flight)

Before attempting a player guest login, the extension validates the invite:

```
GET /api/campaigns/invite/:code/validate
```

Response:

```json
{
  "valid": true,
  "type": "player",
  "campaign": {
    "name": "The Lost Mines",
    "dmDisplayName": "Gandalf"
  },
  "platformStatus": {
    "online": true,
    "activeUsers": 12,
    "activeCampaigns": 3
  }
}
```

If the code is expired or not found:

```json
{
  "valid": false,
  "reason": "INVITE_EXPIRED"
}
```

---

## 3. Pre-flight Validation (Player / Extension Path)

The pre-flight sequence below applies to the **player invite path** (extension-required). The spectator path has its own simpler flow — see Section 4.6 and 4.7.

Before presenting a join UI or requesting a token, the extension performs a pre-flight check sequence. This runs in the background script immediately after the user activates the extension on a supported page.

### 3.1 Pre-flight Steps

```
1. GET /api/platform/status          — Is the platform online?
2. GET /api/campaigns/invite/:code/validate  — Is the invite valid?
3. POST /api/auth/extension/preflight        — Does a vtt-chat account exist for this email?
```

Steps 1 and 2 are unauthenticated. Step 3 submits the scraped email address (and external system identifier) to check account status without issuing a token.

### 3.2 Platform Status Endpoint

```
GET /api/platform/status
```

Returns a public status snapshot used by the extension popup for display to users before they join.

Response:

```json
{
  "online": true,
  "version": "1.4.0",
  "activeUsers": 24,
  "activeCampaigns": 5,
  "activeSessions": 2,
  "maintenanceMode": false
}
```

### 3.3 Account Pre-check Endpoint

```
POST /api/auth/extension/preflight
```

Body:

```json
{
  "email": "player@example.com",
  "externalSystem": "dndbeyond",
  "externalUserId": "ddb-user-12345",
  "inviteCode": "abc123..."
}
```

Response variants:

```json
// No vtt-chat account — guest flow proceeds automatically
{
  "accountStatus": "none",
  "suggestedFlow": "guest"
}

// Existing guest account — auto-login will occur
{
  "accountStatus": "guest",
  "suggestedFlow": "auto-login"
}

// Full account exists — user must authenticate
{
  "accountStatus": "full",
  "suggestedFlow": "authenticate",
  "loginHint": "player@example.com"
}

// Full account, already logged in (token in extension memory)
{
  "accountStatus": "full",
  "suggestedFlow": "already-authenticated"
}
```

The pre-check does not expose whether or not the email is registered beyond these four cases. It does not return user IDs or tokens.

### 3.4 Pre-flight UI Outcome

Based on the pre-flight results, the extension popup presents one of:

| Outcome                      | UI presented                                                |
| ---------------------------- | ----------------------------------------------------------- |
| Platform offline             | "VTT-Chat is currently unreachable."                        |
| Invite invalid               | "This invite link is no longer valid."                      |
| Platform online, no account  | "Welcome! You'll join as a guest using your [DDB] account." |
| Existing guest account       | "Welcome back! Joining as [display name]."                  |
| Full account (not logged in) | "You have a VTT-Chat account. Please log in to continue."   |
| Full account (logged in)     | "Joining as [display name]."                                |

---

## 4. Authentication Flows

### 4.1 New Guest (No Existing Account)

```
Extension scrapes identity from DDB
  → pre-flight: accountStatus = "none"
  → POST /api/auth/extension/guest-login
  → backend creates guest User record (authType = GUEST)
  → backend creates ExternalIdentity linked to user
  → backend matches or creates Character + CampaignMembership
  → JWT issued (guest token, short expiry, renewable)
  → extension stores token in memory
  → SPA opens, token injected via query param or postMessage
```

### 4.2 Returning Guest (Existing Guest Account)

```
Extension scrapes identity from DDB
  → pre-flight: accountStatus = "guest"
  → POST /api/auth/extension/guest-login (same endpoint)
  → backend finds existing user by (email + externalSystem)
  → backend updates user profile fields from scraped data (if sync policy allows)
  → backend updates character fields from scraped data (if sync policy allows)
  → JWT issued
```

### 4.3 Existing Full Account (Not Logged In)

```
Extension scrapes identity from DDB
  → pre-flight: accountStatus = "full"
  → extension popup shows login form (email pre-filled)
  → user enters password
  → POST /api/auth/login (standard auth endpoint)
  → on success: campaign membership created if not already present
  → JWT issued
```

### 4.4 Existing Full Account (Already Logged In)

```
Extension has valid JWT in memory
  → pre-flight: accountStatus = "full", suggestedFlow = "already-authenticated"
  → POST /api/campaigns/invite/:code/join (authenticated)
  → campaign membership created if not already present
  → existing session resumes or new session context set
```

### 4.5 Campaign Bootstrap (First User Connects)

The first user to join a campaign via the player invite — whether a player or the DM — bootstraps the campaign's data structures. The extension sends a **campaign data packet** alongside the individual's identity data.

The campaign data packet contains:

- External DM ID (used to determine who holds the DM role)
- List of all campaign members: external user IDs, display names, and basic character info (name, class, level, external character ID) as known to the external system at that moment
- External campaign ID and campaign name

On receiving the first connection for a campaign:

1. Backend creates the Campaign record (linked to the external campaign via `CampaignExternalLink`).
2. Backend creates stub records for all members listed in the packet (User stubs, Character stubs, CampaignMembership records).
3. The connecting user's stub is promoted to a full session participant — their token is issued.
4. **Role is assigned**: if the connecting user's external ID matches the DM ID in the packet, they receive the DM table role; otherwise they receive the Player role.

When subsequent users connect:

- Their stub record already exists; the backend updates it with the live extension data.
- Their role is assigned by the same rule (external user ID vs DM ID in the packet).
- Character and campaign data is updated per the campaign's `extensionSyncPolicy`.

When the DM connects (if not the first user):

- They receive the DM table role automatically.
- Session controls (start/stop/pause) become available immediately.
- No manual handoff or re-join is required.

---

### 4.6 Guest Spectator (Via Spectator Invite Link)

No extension required.

```
User opens https://<platform>/watch/<spectatorInviteCode>
  → browser loads the spectator invite page
  → page shows: campaign info, character roster + connection status, session status, slot availability
  → if spectatorPolicy = USERS: redirect to standard login
  → if spectatorPolicy = NONE: show "Spectators not enabled" message
  → if at capacity and waitlist disabled: show "Session full" message
  → if at capacity and waitlist enabled: offer waitlist opt-in
  → user enters displayName + email
  → POST /api/auth/spectator/guest-join
  → backend creates guest User record (authType = GUEST, role = SPECTATOR)
  → if slot available: JWT issued immediately, user enters session view
  → if on waitlist: polling/push notification; promoted automatically when slot opens
  → on promotion: JWT issued, user enters session view
```

Spectator guest endpoint:

```
POST /api/auth/spectator/guest-join
```

Body:

```json
{
  "spectatorInviteCode": "xyz789...",
  "displayName": "DragonFan42",
  "email": "fan@example.com"
}
```

Response (slot available):

```json
{
  "token": "jwt-spectator-token",
  "user": { "id": "uuid", "displayName": "DragonFan42", "authType": "GUEST" },
  "campaignId": "uuid",
  "status": "active"
}
```

Response (waitlisted):

```json
{
  "token": null,
  "campaignId": "uuid",
  "status": "waitlisted",
  "waitlistPosition": 3,
  "waitlistToken": "opaque-poll-token"
}
```

The `waitlistToken` is used to poll `GET /api/campaigns/:id/spectator/waitlist-status` until promoted.

---

### 4.7 Full Account Spectator

Full-account users may spectate via invite link or via the campaign browse page.

**Via invite link:**

```
User opens https://<platform>/watch/<spectatorInviteCode>
  → if already logged in: proceed to slot check → enter session view
  → if not logged in: login prompt → on success: slot check → enter session view
```

**Via campaign browse:**

```
Full-account user navigates to /browse
  → lists active discoverable campaigns with spectator slots
  → user clicks a campaign
  → slot check: if available → enter session view
  → if at capacity + waitlist enabled → offer waitlist
  → if spectatorPolicy = USERS: proceed
  → if spectatorPolicy = GUESTS: proceed
  → if spectatorPolicy = NONE: campaign shown as private, no join option
```

Full account spectators are subject to the same max-slot and waitlist rules as guest spectators.

---

### 4.8 Spectator Session Constraints

Regardless of account type:

- Spectators **cannot access the green room**.
- Spectators cannot send chat messages, whispers, or notes.
- Spectators cannot interact with audio controls.
- Spectators can see the character roster, presence indicators, and in-session chat (read-only).
- If the session ends, the spectator view shows a "Session ended" state and the spectator's slot is released.
- A disconnected spectator retains their slot for the reconnect grace period (sysadmin-controlled, default recommended: 60 seconds). After expiry the slot is released and the next waitlist entry is promoted.

---

### 4.9 Guest Login Endpoint (Player / DM)

```
POST /api/auth/extension/guest-login
```

Used by both players and DMs. Role is determined server-side from the `campaignPacket.dmExternalUserId` field.

Body:

```json
{
  "inviteCode": "abc123...",
  "externalSystem": "dndbeyond",
  "externalUserId": "ddb-user-12345",
  "email": "player@example.com",
  "displayName": "Aragorn's Player",
  "avatarUrl": "https://ddb.ac/avatars/player.png",
  "character": {
    "name": "Aragorn",
    "race": "Human",
    "class": "Ranger",
    "subclass": "Hunter",
    "level": 5,
    "externalCharacterId": "ddb-char-67890",
    "characterUrl": "https://www.dndbeyond.com/characters/67890",
    "avatarUrl": "https://ddb.ac/avatars/char.png"
  },
  "campaignPacket": {
    "externalCampaignId": "ddb-campaign-11111",
    "campaignName": "The Lost Mines of Phandelver",
    "dmExternalUserId": "ddb-user-99999",
    "members": [
      {
        "externalUserId": "ddb-user-12345",
        "displayName": "Aragorn's Player",
        "avatarUrl": "https://ddb.ac/avatars/player.png",
        "character": {
          "externalCharacterId": "ddb-char-67890",
          "name": "Aragorn",
          "class": "Ranger",
          "level": 5,
          "avatarUrl": "https://ddb.ac/avatars/char.png"
        }
      },
      {
        "externalUserId": "ddb-user-22222",
        "displayName": "Legolas's Player",
        "avatarUrl": "https://ddb.ac/avatars/player2.png",
        "character": {
          "externalCharacterId": "ddb-char-33333",
          "name": "Legolas",
          "class": "Fighter",
          "level": 5,
          "avatarUrl": "https://ddb.ac/avatars/char2.png"
        }
      }
    ]
  }
}
```

The `campaignPacket` field is required on the **first connection** for a campaign (when no `CampaignExternalLink` exists for the invite code's campaign). On subsequent connections it is optional; if provided, it is used to update stubs per the `extensionSyncPolicy`.

Response:

```json
{
  "token": "jwt-guest-token",
  "user": {
    "id": "uuid",
    "displayName": "Aragorn's Player",
    "avatarUrl": "https://ddb.ac/avatars/player.png",
    "authType": "GUEST",
    "campaignId": "uuid",
    "role": "Player"
  },
  "character": {
    "id": "uuid",
    "name": "Aragorn",
    "avatarUrl": "https://ddb.ac/avatars/char.png"
  },
  "campaignBootstrapped": false
}
```

`role` is `"DM"` or `"Player"` as determined by the server. `campaignBootstrapped` is `true` only when this connection created the campaign data structures for the first time.

---

## 5. External Identity Tracking

### 5.1 ExternalIdentity Record

Every user authenticated via an external system has an `ExternalIdentity` record:

```
ExternalIdentity
  id              — internal UUID
  userId          — FK to User
  externalSystem  — enum: DNDBEYOND | ROLL20 | FOUNDRY | ...
  externalUserId  — string (system-specific user identifier)
  email           — string (scraped from external profile)
  lastSeenAt      — timestamp
  createdAt       — timestamp
```

One user may have multiple `ExternalIdentity` records (one per system they've connected through). The `email` is the linking key — if the same email address appears from a different external system, it resolves to the same vtt-chat user.

### 5.2 Character External IDs

Characters may be associated with an external character record:

```
Character
  ...
  externalSystem    — enum (nullable)
  externalId        — string (nullable)
  characterUrl      — string (nullable)
```

When a character is created or updated via the extension, these fields are populated. They are used to:

- Detect updates when the same character reconnects in a later session.
- Prevent duplicate character records for the same external character.

### 5.3 Campaign External IDs

A campaign may be linked to a campaign on an external system:

```
CampaignExternalLink
  id              — internal UUID
  campaignId      — FK to Campaign
  externalSystem  — enum
  externalId      — string (e.g. DDB campaign ID)
  linkedAt        — timestamp
  linkedBy        — FK to User (who linked it, must be DM)
```

Multiple campaigns on the platform can link to the same external campaign (e.g. one DDB campaign might have a staging and a live vtt-chat campaign). However, within a single vtt-chat campaign, each external system may only have one active link at a time.

---

## 6. Data Sync and Override Policy

The DM controls whether data pushed from the extension can override campaign information.

### 6.1 Sync Policy Options

| Setting          | Label        | Behavior                                                                              |
| ---------------- | ------------ | ------------------------------------------------------------------------------------- |
| `NONE`           | No Updates   | Extension data is used for initial setup only. No updates after first login.          |
| `DM_ONLY`        | DM-only      | Only data pushed by the DM's extension session can update campaign/character records. |
| `DM_AND_PLAYERS` | DM & Players | Any connected user's extension data may trigger updates.                              |

The policy is stored per campaign:

```
Campaign
  extensionSyncPolicy  — enum: NONE | DM_ONLY | DM_AND_PLAYERS
```

Default: `DM_ONLY`.

### 6.2 What Can Be Synced

| Data field                     | Can be synced                  |
| ------------------------------ | ------------------------------ |
| User display name              | Yes (always, user owns this)   |
| User avatar                    | Yes (always, user owns this)   |
| Character name                 | Per sync policy                |
| Character class / race / level | Per sync policy                |
| Character avatar               | Per sync policy                |
| Campaign name                  | DM-only (regardless of policy) |
| Campaign player list           | DM-only (regardless of policy) |

DM-level campaign data (name, structure) can only be updated when the push comes from a user with DM membership in the campaign, regardless of the extensionSyncPolicy.

### 6.3 Sync Update Endpoint

```
POST /api/integrations/external/sync
```

Requires authentication (guest or full token). Validates the caller's campaign membership and role before applying any updates.

Body:

```json
{
  "campaignId": "uuid",
  "externalSystem": "dndbeyond",
  "source": "player",
  "characterUpdate": {
    "externalCharacterId": "ddb-char-67890",
    "level": 6,
    "class": "Ranger",
    "subclass": "Gloom Stalker"
  },
  "campaignUpdate": null
}
```

The server applies the update only if the sync policy permits it for the caller's role.

---

## 7. Account Upgrade (Guest → Full)

### 7.1 UI Prompt

Guest users are shown a persistent but dismissible upgrade prompt in the platform UI. This is rendered as an info banner in the app header and optionally in the user profile panel.

The prompt is not shown during active session play to avoid disruption.

### 7.2 Upgrade Flow (Player or DM Guest)

```
Guest user clicks "Upgrade to full account"
  → UI presents email (pre-filled, read-only) and password fields
  → POST /api/auth/upgrade
  → backend validates email matches guest account
  → backend sets authType = FULL, stores passwordHash
  → JWT reissued with full account claims
  → guest token invalidated
```

Endpoint:

```
POST /api/auth/upgrade
```

Requires valid guest token.

Body:

```json
{
  "password": "new-secure-password"
}
```

Response: new JWT + updated user record.

### 7.3 Spectator → Player / DM Account Transition

Spectators are not extension users. However, a user who started as a guest spectator can transition to a player or DM account by either path below. Both paths require **email verification** to confirm the spectator controls the claimed address.

**Path A — Register a full account:**

```
Spectator clicks "Create Account"
  → registration form with email pre-filled (read-only from spectator session)
  → user sets password
  → verification email sent to that address
  → user confirms email link
  → backend upgrades account to FULL and merges spectator session history
  → user may now join campaigns via player invite or standard auth
```

**Path B — Join via player invite link:**

```
Spectator opens a player invite link in the extension
  → extension sends POST /api/auth/extension/guest-login with invite code + email
  → backend finds matching spectator account by email
  → sends verification email to confirm ownership
  → user confirms link
  → backend merges spectator account with the new player membership
  → JWT issued with Player (or DM) role for the campaign
```

In both paths the user's vtt-chat UUID is preserved and all existing session history (spectator chat, presence records) is retained.

### 7.4 Data Continuity

All campaign memberships, characters, chat history, notes, and session history are preserved across the upgrade. The user's vtt-chat UUID does not change.

---

## 8. Security Considerations

### 8.1 Guest Token Scope

Guest JWTs carry:

- `authType: GUEST`
- A reduced token lifetime (e.g. 24 hours vs 30 days for full accounts)
- Renewable via the extension while the extension is active (silent renewal, no prompt)

Guest tokens are subject to the same WS:AUTH validation as full tokens.

### 8.2 Email Trust Boundary

The platform trusts the scraped email address only within the context of a valid invite code and an authorized external system. If:

- The invite code is invalid → request rejected.
- The external system is not authorized → request rejected.
- The email does not match an existing account → guest account created (not merged with any existing full account without explicit user confirmation).

### 8.3 No Credential Exposure

Guest login does not expose passwords. Guest accounts do not have passwords. The extension never transmits vtt-chat credentials; it only transmits data scraped from the external platform.

### 8.4 Token Storage

The extension stores the JWT in background script memory only. It is not written to:

- `localStorage`
- `sessionStorage`
- `chrome.storage` (persisted)
- Cookies

The token is lost when the browser is closed or the extension is unloaded.

---

## 9. DM Workflow

### 9.1 DM Account Requirement

DMs joining via the extension do **not** require a full vtt-chat account. The DM role is assigned automatically from the external system's campaign ownership data — the same player invite code is used for both players and DMs.

A full account is required only to generate **spectator invite links**. Guest DMs can launch sessions, manage players, and control session state, but cannot create spectator invites until they upgrade to a full account.

Player invite links (covering both players and the DM) are generated by a full-account DM or a sysadmin. Once joined, a DM of any account type can revoke or request reissuance of the player invite code.

### 9.2 Generating a Player Invite Link

Player invite codes cover both players and the DM — no separate DM invite is needed.

**To generate a player invite (via the vtt-chat UI):**

1. A full-account DM or sysadmin creates the campaign (or opens an existing one) in vtt-chat.
2. Navigate to Campaign Settings → Invites → Player Invite.
3. Click "Generate Player Invite Link".
4. Share with all participants (players and DM) — e.g. paste in Discord or on the DDB campaign page.
5. All participants connect via a supported browser extension. Role (DM or Player) is assigned from the external system's campaign ownership data.

**Sysadmin-issued invite (alternative flow):**

1. Sysadmin creates the campaign record and generates the player invite code from the admin panel.
2. Invite code is shared with the DM and players.
3. The first person to connect bootstraps the campaign data structures (see Section 4.5).

**Revoke and reissue:**

- A DM (any account type) or sysadmin may revoke and reissue the player invite code at any time.
- Revoking prevents new connections; the extension will fail to authenticate with the revoked code.
- Reissuing generates a new code; the old code is invalidated immediately.
- One active player invite code per campaign.

### 9.3 Generating a Spectator Invite Link

1. Navigate to Campaign Settings → Invites → Spectator Invite.
2. Ensure `spectatorPolicy` is not `NONE`.
3. Click "Generate Spectator Invite Link".
4. Share with spectators — no extension required. Clicking the link opens the spectator invite page.

- One active spectator invite code per campaign.
- DM may regenerate or disable at any time.
- If `spectatorPolicy = USERS`, the invite page will require the visitor to log in with a full account.
- If `spectatorPolicy = NONE`, the invite link will show a "Spectators not enabled" message.

### 9.4 Spectator Access Controls

From Campaign Settings → Spectators:

| Control          | Options                                                       |
| ---------------- | ------------------------------------------------------------- |
| Who can spectate | None / Guests & Full Accounts / Full Accounts Only            |
| Max spectators   | Integer (1–[sysadmin max], or platform default if left blank) |
| Waitlist         | Enabled / Disabled                                            |
| Discoverable     | Yes / No (whether campaign appears in the browse list)        |

Changing `spectatorPolicy` to `NONE` immediately disconnects all active spectators.
Reducing `spectatorMax` below the current active count drops the most recently joined spectators first.

### 9.5 Invite Link Lifecycle

- Player and spectator invite codes are separate and managed independently.
- **Player invite codes** can be revoked and reissued by a DM (any account type) or a sysadmin.
- **Spectator invite codes** can only be generated and managed by a full-account DM.
- Revoking an invite (setting `active = false`) prevents new joins but does not drop existing members.
- When a code is reissued, the previous code is invalidated immediately. Extensions holding the old code will fail token renewal and the user will need to reconnect with the new link.
- A sysadmin can revoke either invite type for any campaign.

### 9.6 Monitoring Linked Identities and Spectators

Campaign Settings shows the DM:

- Which external systems are linked to the campaign.
- Which users joined via extension vs. standard registration vs. spectator invite.
- Current extensionSyncPolicy and controls to change it.
- List of external identities per member.
- Active spectator list with slot count, connection status, and waitlist queue.

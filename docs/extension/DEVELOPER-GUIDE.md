# Extension Developer Guide: Connecting to VTT-Chat

_A step-by-step reference for the browser extension developer. This document covers everything needed to connect the extension to a running VTT-Chat instance — authentication, character sync, session status, and launch._

**Architecture and deep reference docs:**

- [EXTENSION-INTEGRATION.md](EXTENSION-INTEGRATION.md) — full endpoint table, metadata extraction, sync protocol
- [GUEST-AUTH.md](GUEST-AUTH.md) — trust model, invite link lifecycle, all auth flow variants
- [THIRD-PARTY-INTEGRATIONS.md](THIRD-PARTY-INTEGRATIONS.md) — system isolation, admin authorization

**Extension repository:** <https://github.com/AndyProsser/vtt-chat-extension>

---

## Prerequisites

Before calling any API, confirm:

1. **The platform has authorized D&D Beyond.** All requests with `externalSystem: "dndbeyond"` are rejected with `403 INTEGRATION_NOT_AUTHORIZED` unless a platform admin has enabled the system. Contact the platform operator if you get this error in a new deployment.

2. **The campaign has a valid player invite code.** Players and the DM both use the same invite code. The extension must never store the invite code after first login — use the `deviceCredential` from then on (see §3).

3. **The extension runs as a Manifest V3 extension.** Tokens live in background script memory only — never `localStorage`, `sessionStorage`, or `chrome.storage.sync`.

---

## The connection lifecycle

Every launch follows one of two paths depending on whether the extension has a stored `deviceCredential`.

```text
On extension activation
  ├─ deviceCredential in localStorage?
  │    YES → Returning user path (§2)
  │    NO  → First-time path (§3 → §4)
  │
  └─ Either path ends at: open /ext-launch tab (§6)
```

---

## 1. Platform status check

Run this first on every activation. It confirms the platform is reachable and not in maintenance.

```text
GET /api/platform/status
```

No auth required.

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

If `online` is `false` or `maintenanceMode` is `true`, show a non-blocking banner in the popup and skip all further calls.

---

## 2. Returning user path (device credential stored)

This is the normal path after the first login. No invite code is needed.

### 2a. Exchange the stored credential

```text
POST /api/auth/extension/credential/exchange
Content-Type: application/json

{
  "credential": "<stored-credential>",
  "deviceId": "<stable-device-id>"
}
```

The `deviceId` must be stable across sessions for the same browser profile. A UUID generated once and stored in `localStorage` works well.

**Success response:**

```json
{
  "token": "<jwt>",
  "credential": "<rotated-credential>"
}
```

**Store the new `credential` immediately** — the old one is now invalid. If you lose the new credential before storing it the user will need to re-enter their invite code.

**Error codes:**

| Code                       | Meaning                         | Action                                                                        |
| -------------------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| `CREDENTIAL_INVALID`       | Credential revoked or not found | Fall through to first-time path (§3)                                          |
| `CREDENTIAL_EXPIRED_GUEST` | Guest credential expired        | Fall through to first-time path (§3)                                          |
| `CREDENTIAL_EXPIRED_FULL`  | Full-account credential expired | Open `/ext-launch` with `hint=<email>` (password prompt only, no invite code) |

### 2b. Ensure a session exists

```text
POST /api/campaigns/:campaignId/session/ensure
Authorization: Bearer <token>
```

No body required.

**Response:**

```json
{
  "sessionId": "uuid",
  "sessionState": "IDLE",
  "campaignDisplayState": "GREENROOM"
}
```

`campaignDisplayState` values: `IDLE`, `GREENROOM`, `ACTIVE`, `PAUSED`, `COOLDOWN`.

If the campaign has an active session (any state other than `ENDED`/`CLEANUP`) it is returned unchanged. If no active session exists, a new `IDLE` session (greenroom) is created. Any campaign member may call this — you do not need to be the DM.

### 2c. Sync character data (before launch)

Before opening the launch tab, push the latest character state from the current DDB page. See §5.

### 2d. Open the launch tab

```text
/ext-launch?campaignId=<uuid>&token=<jwt>&sessionId=<id>
```

The SPA auto-authenticates and redirects to the campaign workspace. See §6.

---

## 3. First-time path: invite code validation

This path runs once per browser/campaign pair.

### 3a. Validate the invite code

```text
GET /api/campaigns/invite/:code/validate
```

No auth required.

**Valid response:**

```json
{
  "valid": true,
  "type": "player",
  "campaign": {
    "id": "uuid",
    "name": "The Lost Mines",
    "dmDisplayName": "Gandalf",
    "displayState": "GREENROOM"
  },
  "platformStatus": { "online": true, "activeUsers": 12, "activeCampaigns": 3 }
}
```

**Invalid response:**

```json
{ "valid": false, "reason": "INVITE_EXPIRED" }
```

If `valid` is `false`, show "This invite link is no longer valid." and stop.

### 3b. Account pre-check

```text
POST /api/auth/extension/preflight
Content-Type: application/json

{
  "email": "player@example.com",
  "externalSystem": "dndbeyond",
  "externalUserId": "ddb-user-12345",
  "inviteCode": "abc123..."
}
```

No auth required.

**Response variants:**

```json
// New user — proceed to guest login (§4)
{ "accountStatus": "none", "suggestedFlow": "guest" }

// Returning guest — proceed to guest login (§4)
{ "accountStatus": "guest", "suggestedFlow": "auto-login" }

// Full account, not logged in — open /ext-launch with hint param (§6b)
{ "accountStatus": "full", "suggestedFlow": "authenticate", "loginHint": "player@example.com" }

// Full account, already logged in — skip to session/ensure (§2b)
{ "accountStatus": "full", "suggestedFlow": "already-authenticated" }
```

**Show in the popup before the user clicks Launch:**

| Outcome                               | Display message                                                  |
| ------------------------------------- | ---------------------------------------------------------------- |
| Platform offline                      | "VTT-Chat is currently unreachable."                             |
| Invite invalid                        | "This invite link is no longer valid."                           |
| `accountStatus: none`                 | "Welcome! You'll join as a guest using your D&D Beyond account." |
| `accountStatus: guest`                | "Welcome back! Joining as [display name]."                       |
| `accountStatus: full` (not logged in) | "You have a VTT-Chat account. Please log in to continue."        |
| `accountStatus: full` (logged in)     | "Joining as [display name]."                                     |

---

## 4. Guest login

Handles both new users (`accountStatus: none`) and returning guests (`accountStatus: guest`). The endpoint is the same for both.

```text
POST /api/auth/extension/guest-login
Content-Type: application/json

{
  "inviteCode": "abc123...",
  "externalSystem": "dndbeyond",
  "externalUserId": "ddb-user-12345",
  "email": "player@example.com",
  "displayName": "Aragorn's Player",
  "avatarUrl": "https://assets.example.com/avatars/uploaded.webp",
  "deviceId": "<stable-device-id>",
  "character": {
    "name": "Aragorn",
    "race": "Human",
    "class": "Ranger",
    "subclass": "Hunter",
    "level": 5,
    "externalCharacterId": "ddb-char-67890",
    "characterUrl": "https://www.dndbeyond.com/characters/67890",
    "avatarUrl": "https://assets.example.com/avatars/char.webp"
  },
  "campaignPacket": {
    "externalCampaignId": "ddb-campaign-11111",
    "campaignName": "The Lost Mines of Phandelver",
    "dmExternalUserId": "ddb-user-99999",
    "members": [
      {
        "externalUserId": "ddb-user-12345",
        "displayName": "Aragorn's Player",
        "character": {
          "externalCharacterId": "ddb-char-67890",
          "name": "Aragorn",
          "class": "Ranger",
          "level": 5
        }
      }
    ]
  }
}
```

**Notes on the request body:**

- `avatarUrl` must be a VTT-Chat hosted URL — upload the image first (§4a) and use the returned URL here and in `character.avatarUrl`.
- `deviceId` is required to receive a `deviceCredential` in the response. Always send it.
- `campaignPacket` is **required on the first connection** (when no campaign has been bootstrapped for this invite code). On subsequent connections it is optional. If you always send it, the backend will silently ignore it after bootstrap.
- The backend determines DM vs Player from `campaignPacket.dmExternalUserId`. If `externalUserId` matches, the user receives the DM role automatically — no separate invite is needed.

**Success response:**

```json
{
  "token": "<jwt>",
  "deviceCredential": "<store-in-localStorage>",
  "user": {
    "id": "uuid",
    "displayName": "Aragorn's Player",
    "avatarUrl": "https://assets.example.com/avatars/uploaded.webp",
    "authType": "GUEST",
    "campaignId": "uuid",
    "role": "Player"
  },
  "character": {
    "id": "uuid",
    "name": "Aragorn",
    "avatarUrl": "https://assets.example.com/avatars/char.webp"
  },
  "campaignBootstrapped": false
}
```

**Store `deviceCredential` in `localStorage` immediately.** All future launches use this to skip the invite code.

**Error codes:**

| Code                         | HTTP | Meaning                                              |
| ---------------------------- | ---- | ---------------------------------------------------- |
| `INVITE_EXPIRED`             | 403  | Invite code invalid or revoked                       |
| `INTEGRATION_NOT_AUTHORIZED` | 403  | Platform has not enabled this system                 |
| `PLATFORM_NOT_AUTHORIZED`    | 403  | Campaign does not permit this external system        |
| `CAMPAIGN_PACKET_REQUIRED`   | 400  | First connection with no `campaignPacket` supplied   |
| `FULL_ACCOUNT_EXISTS`        | 409  | Email belongs to a full account — use standard login |

### 4a. Avatar upload (before guest-login)

The extension must not pass raw DDB CDN URLs as `avatarUrl`. Third-party CDN URLs expire. Upload the image to VTT-Chat first and use the hosted URL everywhere.

```text
POST /api/integrations/external/avatar-upload
Authorization: Bearer <token>   (use any valid token; or do this after guest-login if needed)
Content-Type: multipart/form-data

image: <file-bytes>
```

Accepted types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`. Max 2 MB.

```json
{ "avatarUrl": "https://assets.example.com/avatars/user-<id>-<hash>.webp" }
```

**Re-upload policy:** cache a fingerprint of the source URL in `chrome.storage.session` keyed by `externalCharacterId`. Only re-upload when the fingerprint changes.

---

## 5. Character sync

After login (or on any subsequent page load), push the current character state. This keeps the in-session character card and presence data up to date.

```text
POST /api/integrations/external/sync
Authorization: Bearer <token>
Content-Type: application/json

{
  "campaignId": "uuid",
  "externalSystem": "dndbeyond",
  "source": "player",
  "characterUpdate": {
    "externalCharacterId": "ddb-char-67890",
    "name": "Aragorn",
    "race": "Human",
    "class": "Ranger",
    "subclass": "Hunter",
    "level": 5,
    "avatarUrl": "https://assets.example.com/avatars/char.webp",
    "characterUrl": "https://www.dndbeyond.com/characters/67890",
    "stats": {
      "initiative": 3,
      "proficiencyBonus": 3,
      "passivePerception": 14,
      "abilityScores": { "str": 10, "dex": 16, "con": 14, "int": 18, "wis": 12, "cha": 8 },
      "spellSlots": {
        "total": { "1": 4, "2": 3 },
        "used":  { "1": 1, "2": 0 }
      },
      "hp":    { "current": 38, "max": 45, "temp": 0 },
      "ac":    16,
      "speed": 30
    },
    "conditions": ["Poisoned"],
    "features": ["Arcane Recovery"]
  }
}
```

**Field rules:**

- `externalCharacterId` is required — the backend looks up the character by `(campaignId, externalSystem, externalId)`.
- All other fields are optional. Omit a field to leave it unchanged.
- `name`, `race`, `class`, `subclass`, `avatarUrl` write to top-level Character columns.
- `level`, `characterUrl`, `stats`, `conditions`, `features` are merged into `Character.metadata`.
- **Always send the full `stats` object** — it replaces the stored stats entirely, it does not merge sub-keys.
- `hp`, `ac`, and `speed` are stored but not yet displayed in the platform UI (stubs for a future release).
- `source` must be `"player"` or `"dm"`.

**Success response:**

```json
{
  "message": "Sync completed successfully",
  "applied": {
    "characterUpdate": true,
    "campaignUpdate": false
  }
}
```

**Error codes:**

| Code                    | HTTP | Meaning                                         |
| ----------------------- | ---- | ----------------------------------------------- |
| `SYNC_POLICY_VIOLATION` | 403  | Campaign sync policy blocks this caller         |
| `SYNC_POLICY_DISABLED`  | 403  | Inventory/currency sync disabled for campaign   |
| `INVALID_INPUT`         | 400  | Missing `externalCharacterId` or bad field type |

**When to sync:**

- On character sheet page load (full sync)
- When DDB XHR responses indicate a stat change (incremental — send full stats object)
- Immediately before clicking **Launch Chat** (ensures state is current on join)

---

## 5a. Session status (popup display)

To display the current session state in the popup without requiring auth:

```text
GET /api/campaigns/:campaignId/session-status
```

No auth required.

```json
{
  "sessionId": "uuid",
  "sessionState": "ACTIVE",
  "campaignDisplayState": "ACTIVE"
}
```

If no active session exists, `sessionId` and `sessionState` are `null` and `campaignDisplayState` is `"IDLE"`.

Use this to show the session state in the popup before the user clicks Launch, so they know whether a session is in progress before they commit.

---

## 6. Opening the launch tab

### 6a. Authenticated launch (guest or full account with valid token)

```text
/ext-launch?campaignId=<uuid>&token=<jwt>&sessionId=<id>
```

The SPA auto-authenticates and redirects to the campaign workspace. No user interaction required.

### 6b. Full account — password prompt

```text
/ext-launch?campaignId=<uuid>&sessionId=<id>&hint=<email>
```

The SPA shows a single password field with the email pre-filled. On submit, it authenticates and redirects to the campaign workspace.

**The `/ext-launch` page never asks for an invite code.** If auth fails it shows an error with a "Try again" option — it does not fall back to the join flow.

---

## 7. Token renewal

Guest JWTs expire in 24 hours. The background script must renew silently:

1. Detect token expiry (check `exp` claim) before each API call, or handle `401` responses.
2. Call `POST /api/auth/extension/credential/exchange` to get a fresh JWT.
3. Store the rotated credential immediately.
4. Retry the original request.

Never prompt the user for their invite code during renewal — if the credential exchange fails with `CREDENTIAL_EXPIRED_GUEST`, the invite code flow (§3) must restart from scratch.

---

## 8. Quick reference

| Endpoint                                        | Auth        | When                                |
| ----------------------------------------------- | ----------- | ----------------------------------- |
| `GET /api/platform/status`                      | None        | Every activation                    |
| `GET /api/campaigns/invite/:code/validate`      | None        | First-time, before preflight        |
| `POST /api/auth/extension/preflight`            | None        | First-time, after invite validation |
| `POST /api/auth/extension/guest-login`          | None        | First-time login                    |
| `POST /api/auth/extension/credential/exchange`  | None        | Every returning launch              |
| `POST /api/integrations/external/avatar-upload` | Token       | Before guest-login / before sync    |
| `POST /api/integrations/external/sync`          | Token       | On page load and before launch      |
| `GET /api/campaigns/:id/session-status`         | None        | Popup display                       |
| `POST /api/campaigns/:id/session/ensure`        | Token       | After credential exchange           |
| `POST /api/auth/upgrade`                        | Guest token | User opts to upgrade                |

---

## 9. Common mistakes

**Storing the JWT in `localStorage`.** The JWT must only live in background script memory. The `deviceCredential` is the only thing that goes to `localStorage`.

**Passing raw DDB CDN URLs as avatarUrl.** Always upload to `/api/integrations/external/avatar-upload` first and use the returned hosted URL.

**Sending `campaignPacket` only on first login.** Always send it — the backend ignores it on subsequent connections and you avoid bugs when the campaign hasn't been bootstrapped yet.

**Sending partial stats.** The `stats` object replaces whatever is stored. If you send `{ initiative: 3 }` you will wipe `abilityScores`, `spellSlots`, etc. Always send the full `stats` object.

**Not rotating the credential immediately.** The `credential` returned from `/credential/exchange` is live the moment it's returned — the old one is already dead. Store the new one before doing anything else.

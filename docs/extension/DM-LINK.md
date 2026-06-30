# DM Identity & Campaign Linking

_How a VTT-Chat DM links their full account to an external system campaign, with automatic merging of any prior guest identity._

**Related docs:**

- [GUEST-AUTH.md](GUEST-AUTH.md) — player guest auth and overall trust model
- [DEVICE-CREDENTIALS.md](DEVICE-CREDENTIALS.md) — storage keys, reconnect flows, and exchange helper (both DM and player)
- [EXTENSION-INTEGRATION.md](EXTENSION-INTEGRATION.md) — extension architecture and §5f DM Campaign Sync
- [EXTENSION-UX.md](EXTENSION-UX.md) — popup states and overlay behaviour

---

## 1. Why the DM Flow Is Different

The player guest flow (§4.9 of GUEST-AUTH.md) deliberately lowers the barrier to entry: DDB has already verified the player's identity and campaign membership, so vtt-chat trusts that assertion and issues a guest token without requiring a password.

The DM flow cannot use the same trust model. The DM:

- Controls session state (start, pause, end)
- Controls campaign configuration (sync policy, room environments, spectator access)
- Is the anchor identity for the entire campaign's data

Allowing a guest token to hold those privileges is a security and data-integrity risk. More practically: the DM **already has** a full vtt-chat account, because they had to create the campaign there before any invite code could exist.

The DM link flow therefore enforces a full account login. Guest tokens are rejected from `POST /api/auth/extension/dm-link-init` and `POST /api/integrations/external/dm-sync`.

---

## 2. Design Principle: API-First, Tab Last

The DM link flow is intentionally **API-first**: all authentication, linking, and negotiation happens via direct API calls from the extension before a browser tab is ever opened.

```text
Extension                     Backend                          Browser tab
───────────                   ───────                          ───────────
POST /extension/dm-link-init
  (credentials + link params)
                 ──────────────────►
                 ← { token, deviceCredential, sessionId }

Store deviceCredential
Open /ext-launch?campaignId=…
  &token=…&sessionId=…                                 ──────────────────►
                                                        Token path: silent auth
                                                        ← redirect to campaign
```

The browser tab is opened **only after** the extension has a valid `deviceCredential` in hand. This is the same principle as the guest player flow, which completes all pre-auth work via API before the tab launches.

---

## 3. The Linking Mechanism

The bridge between vtt-chat and DDB is the **player invite code**:

```text
vtt-chat campaign  ←──────────────────────────────────────────────────→  DDB campaign
  (Campaign.id)       CampaignExternalLink(campaignId, externalId)        (DDB campaign ID)
                      ↑
                      created when DM enters invite code in extension popup
```

The sequence that creates this bridge:

1. DM creates a campaign in vtt-chat (requires full account — they are `currentDmId`).
2. DM generates a player invite link from Campaign Settings → Invites → Player Invite.
3. DM navigates to their DDB campaign page with the extension installed.
4. Extension detects DM ownership of the DDB campaign (see §4).
5. DM enters the vtt-chat invite code in the extension popup.
6. Extension validates the code (`GET /api/campaigns/invite/:code/validate`) and shows the campaign name.
7. DM confirms, enters their vtt-chat credentials in the popup, and clicks **Link & Launch** → the DM Link Flow begins (§5).

The invite code is used once to establish the link. Returning DM launches use the stored `deviceCredential` — no re-entry of the invite code is needed.

---

## 4. DM Detection in the Extension

The extension determines whether the user is the DM of the current DDB campaign by scraping the campaign page:

| Data point                 | Source                           | Used for                                |
| -------------------------- | -------------------------------- | --------------------------------------- |
| Logged-in DDB user ID      | DDB session cookie / profile API | `externalUserId` sent to all auth calls |
| DDB campaign owner user ID | Campaign page DOM / DDB API      | `dmExternalUserId` in campaign packet   |
| DDB campaign ID            | Campaign page URL / DOM          | `externalCampaignId` in sync requests   |

**DM identification rule:**

```text
if (loggedInDdbUserId === campaignDmExternalUserId) → user is DM of this campaign
```

If the rule is true and the extension popup has a stored device credential for this campaign → show the returning-DM UI (§9.2b).

If the rule is true and no credential exists → show the first-time DM UI with invite code entry (§9.2a).

If the rule is false but the user is in the member list → show the standard player UI.

---

## 5. DM First-Time Link Flow

_Runs once per DM per campaign. All authentication, linking, and session provisioning happen via API calls from the extension — the browser tab is opened only at the end._

```text
1.  DM navigates to their DDB campaign page.
2.  Extension shows DM UI — "You are the DM of this campaign."
3.  DM enters the vtt-chat player invite code into the popup.
4.  Extension: GET /api/campaigns/invite/:code/validate
      → confirm campaign name and that invite is active
      → if invalid: show error, stop
5.  Extension shows credential form:
      - Campaign: "Link 'The Lost Mines of Phandelver' to this DDB campaign? [Confirm]"
      - Email: pre-filled from DDB (read-only in PROD; editable username in DEV)
      - Password: entered by DM in the popup
6.  DM enters password and clicks "Link & Launch".
7.  Extension: POST /api/auth/extension/dm-link-init (see §6).
      Backend runs the full sequence atomically:
        a. Authenticates the DM (email + password → full-account JWT).
        b. Links the DM's vtt-chat account to the external campaign (dm-link).
        c. Syncs campaign name from DDB (best-effort; non-fatal).
        d. Ensures an IDLE session exists.
        e. Returns { token, deviceCredential, sessionId }.
8.  Extension stores deviceCredential in localStorage:
      Key: dmlink:<externalCampaignId>:<externalSystem>
      See DEVICE-CREDENTIALS.md for the full storage shape.
9.  Extension opens the campaign in a new tab:
      /ext-launch?campaignId=<uuid>&token=<jwt>&sessionId=<id>
      → /ext-launch sees the token and auto-authenticates silently (no form shown)
      → redirects to campaign workspace
```

**No browser tab is opened during steps 1–8.** The tab is opened only after the extension holds a valid credential.

---

## 6. POST /api/auth/extension/dm-link-init

The single endpoint the extension calls for first-time DM linking. Bundles authentication, linking, sync, and session provisioning in one round-trip.

### Request

```json
{
  "username": "dm@example.com",
  "password": "vtt-chat-password",
  "campaignId": "uuid",
  "externalSystem": "dndbeyond",
  "externalUserId": "string (DDB user ID of the DM)",
  "externalCampaignId": "string (DDB campaign ID)",
  "email": "string (DDB account email — for ExternalIdentity record)",
  "displayName": "string | null (DDB display name — informational only)",
  "deviceId": "uuid (stable per-browser identifier)",
  "campaignName": "string | undefined (DDB campaign name — used for best-effort name sync)"
}
```

`username` may be an email address (PROD) or a plain username (DEV passwordless mode). In DEV, email-format usernames are rejected.

### Server actions (in order)

1. Validate required fields.
2. Authenticate: look up user by email/username, verify password, reject if `authType !== FULL`.
3. Run `dmLinkAccount()` — see §7 for detailed logic.
4. Run `dmCampaignSync()` with `campaignName` if provided (best-effort; failure is non-fatal).
5. Ensure IDLE session: find any active session for the campaign or create a new one.
6. Issue JWT token for the authenticated user.
7. Return response.

### Response (200)

```json
{
  "token": "jwt",
  "deviceCredential": {
    "credential": "opaque-base64url-string",
    "deviceId": "uuid"
  },
  "sessionId": "uuid",
  "merged": false,
  "mergedAccount": null
}
```

When a guest account was merged (`merged: true`):

```json
{
  "token": "jwt",
  "deviceCredential": { "credential": "...", "deviceId": "..." },
  "sessionId": "uuid",
  "merged": true,
  "mergedAccount": {
    "userId": "uuid (the deactivated guest user)",
    "email": "player@example.com",
    "charactersTransferred": 2,
    "membershipsTransferred": 1
  }
}
```

### Error responses

| Status | Code                         | Cause                                                                   |
| ------ | ---------------------------- | ----------------------------------------------------------------------- |
| 400    | `INVALID_INPUT`              | Missing required field                                                  |
| 400    | `INVALID_LOGIN_REQUEST`      | Email-format username in DEV passwordless mode                          |
| 401    | `INVALID_CREDENTIALS`        | Wrong password or no full account found for that email/username         |
| 403    | `FORBIDDEN`                  | Authenticated user is a guest (`authType !== FULL`)                     |
| 403    | `INTEGRATION_NOT_AUTHORIZED` | External system is blocked or not authorized                            |
| 404    | `CAMPAIGN_NOT_FOUND`         | `campaignId` does not exist                                             |
| 409    | `ALREADY_CLAIMED`            | A different DDB identity has already linked this campaign as DM         |
| 409    | `IDENTITY_CONFLICT`          | `externalUserId` is already linked to a different full vtt-chat account |
| 500    | `DM_LINK_FAILED`             | Unexpected server error during linking                                  |
| 500    | `SESSION_ENSURE_FAILED`      | Unexpected server error during session provisioning                     |

---

## 7. POST /api/auth/extension/dm-link (JWT-based, standalone)

This endpoint is also available for cases where the extension already holds a valid JWT and only needs to run the linking step (e.g., integrations that perform login separately). It requires a full-account Bearer token.

See the inline JSDoc in `apps/backend/src/api/auth-extension.routes.ts` for the full request/response contract.

For first-time DM linking from the extension, use `dm-link-init` (§6) instead — it handles auth + linking in a single call.

---

## 8. DM Returning Launch Flow

_Normal path for all subsequent DM launches. No invite code, no password prompt — the device credential is the sole auth mechanism._

```text
1.  Extension detects DM ownership on DDB campaign page.
2.  Extension finds stored deviceCredential in localStorage
    (key: dmlink:<externalCampaignId>:<externalSystem>).
3.  POST /api/auth/extension/credential/exchange { credential, deviceId }
      → returns { token, credential } — fresh JWT + rotated credential
      → Store the rotated credential immediately (old one is now invalid)
      → On CREDENTIAL_INVALID / CREDENTIAL_EXPIRED_*: clear storage,
        fall back to first-time flow (§5)
4.  Extension fires dm-sync (throttled: at most once per 10 minutes per campaign):
        POST /api/integrations/external/dm-sync { campaignId, externalSystem,
          externalCampaignId, characters: [] }
      → updates campaign name and character stubs from DDB (best-effort; non-fatal)
5.  POST /api/campaigns/:campaignId/session/ensure
      → creates or confirms the IDLE session
      → returns { sessionId, sessionState, campaignDisplayState }
6.  Open /ext-launch?campaignId=<uuid>&token=<jwt>&sessionId=<id>
      → ext-launch validates the token silently (no form shown)
      → redirects straight to campaign workspace
```

---

## 9. dm-link Server Logic

### Auth requirement

The `dm-link-init` endpoint authenticates the DM internally. The standalone `dm-link` endpoint requires a full-account JWT (`authType = FULL`). Guest tokens return `403 FORBIDDEN` from both.

DM ownership is established via `CampaignExternalLink`, not `campaign.currentDmId`. First-time callers claim ownership by creating the link; returning callers are verified against the stored link.

### Server actions (in order)

1. Verify `authType === FULL` on the caller → `403` if guest.
2. Verify the external system is platform-authorized → `403 INTEGRATION_NOT_AUTHORIZED`.
3. Look up `CampaignExternalLink` for `(campaignId, externalSystem)`:
   - **No link exists** (first-time): take DM ownership — update `campaign.currentDmId` to caller; create the link with `linkedBy = callerUserId`.
   - **Link exists, `linkedBy === callerUserId`**: returning DM on same account — no ownership change.
   - **Link exists, `linkedBy ≠ callerUserId`**: check whether the linked account shares the same DDB identity (account recovery path). If yes: transfer ownership. If no: return `409 ALREADY_CLAIMED`.
4. Upsert `ExternalIdentity { userId: callerUserId, externalSystem, externalUserId, email }`.
5. **Guest account merge** — search for any other `ExternalIdentity` where `(externalSystem, externalUserId)` matches but `userId ≠ callerUserId`:
   - If found and that user is `authType = GUEST` → run merge (§10).
   - If found and that user is `authType = FULL` → do NOT auto-merge; return `409 IDENTITY_CONFLICT`.
   - If not found → skip merge.
6. Upsert `CampaignExternalLink { campaignId, externalSystem, externalId: externalCampaignId, linkedBy: callerUserId }`.
7. Issue `deviceCredential` (same mechanism as guest login credential).
8. Return result.

---

## 10. Guest Account Merge

### When it triggers

A merge is triggered in step 5 of the dm-link logic when the server finds an `ExternalIdentity` record with the same `(externalSystem, externalUserId)` that belongs to a different user whose `authType = GUEST`.

### How it happens

The typical path: the DM previously connected to a vtt-chat campaign as a player (or test user) via the extension, which created a guest account. That guest account now has an `ExternalIdentity` linking their DDB user ID to the guest `userId`. When they now log in with their real vtt-chat full account, the backend detects the collision and resolves it automatically.

### What gets transferred

| Data                         | Action                                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Character` rows             | `userId` updated from `guestUserId` → `callerUserId`                                                                                                                                       |
| `CampaignMembership` rows    | Upserted against `callerUserId`. If a conflicting membership exists for the same campaign, the caller's existing membership wins (DM role is preserved); the guest membership is discarded |
| `ExternalIdentity` (guest's) | Deleted — the new one already links `callerUserId`                                                                                                                                         |

### What does NOT transfer

| Data                            | Reason                                                                                                                                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat messages authored by guest | The `authorId` column in chat history is preserved as-is to maintain message attribution. Display name resolution at render time will now resolve to the full account's display name if the platform joins on `userId` |
| Admin audit log entries         | Preserved under the original `actorUserId` (the guest UUID)                                                                                                                                                            |
| Guest user record itself        | Soft-deleted (`isActive = false`). Not hard-deleted immediately — preserves referential integrity. A cleanup job may purge orphaned guest records on a configurable schedule                                           |

### Idempotency

Re-calling `dm-link-init` after a successful merge is safe — the upsert and merge search are both idempotent.

### IDENTITY_CONFLICT case (two full accounts)

If `externalUserId` is already linked to a **different full account**, the server returns `409 IDENTITY_CONFLICT` and takes no action. Resolution requires a sysadmin to manually audit and merge the two accounts. The extension should display: _"This DDB account is already linked to a different vtt-chat login. Please contact support."_

---

## 11. Campaign Name Sync

When `campaignName` is present in a `POST /api/auth/extension/dm-link-init` request (or `campaignData.name` in a `POST /api/integrations/external/dm-sync` request), the backend updates `Campaign.name` to match the DDB campaign name.

**Override behaviour:** If the DM renames the campaign inside vtt-chat after a sync, the next dm-sync will overwrite that rename back to the DDB name. A future campaign setting (`lockCampaignNameToExternal: boolean`, default `true`) will let DMs opt out. Until that setting exists, name sync always wins.

---

## 12. Extension Implementation

_What the extension repository must implement to support the DM link flow._

### 12.1 DM Ownership Detection

**On DDB campaign page load:**

```text
1. Scrape logged-in DDB user ID (from session / profile DOM).
2. Scrape campaign owner user ID (from campaign page DOM or DDB API).
3. If logged-in user ID === campaign owner user ID:
     → user is DM of this campaign
     → check localStorage for deviceCredential keyed by (externalCampaignId, externalSystem)
     → if found: show Returning DM UI (§12.2b)
     → if not found: show First-Time DM UI (§12.2a)
4. Else if logged-in user is in the campaign member list:
     → show standard Player Launch UI (existing flow)
5. Else:
     → show "You are not a member of this campaign" notice
```

### 12.2 Extension Popup States (DM)

#### 12.2a First-Time DM (no device credential)

```text
┌─────────────────────────────────────────────────────┐
│  VTT-Chat                                  [×]      │
│                                                     │
│  📋  The Lost Mines of Phandelver                   │
│      You are the DM of this campaign                │
│                                                     │
│  Enter your VTT-Chat invite code                    │
│  ┌────────────────────────────────────────────────┐ │
│  │  abc123...                                     │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  Email: dm@example.com  (pre-filled, read-only)     │
│  Password: [__________________________]             │
│                                                     │
│  [ Link & Launch as DM ]                            │
│                                                     │
│  ────────────────────────────────────────────────   │
│  Not the DM? Launch as player instead →             │
└─────────────────────────────────────────────────────┘
```

**Invite code validation (on blur / submit):**

- Call `GET /api/campaigns/invite/:code/validate`
- If valid: show campaign name below the field as a confirmation chip
- If invalid: show inline error "This code isn't valid"

**On "Link & Launch":**

1. Disable button, show spinner and progress label.
2. `POST /api/auth/extension/dm-link-init` (§6) with credentials + all linking params.
3. On success: store `deviceCredential` in localStorage, then open the campaign tab:

   ```text
   /ext-launch?campaignId=<uuid>&token=<jwt>&sessionId=<id>
   ```

4. On error: show inline error message from the response body, re-enable form.

**Progress labels (show while request is in flight):**

```text
Linking your DM account…
```

(The request is a single call; no multi-step labelling is needed in the extension.)

**Error handling:**

| Code                  | Extension UI message                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `INVALID_CREDENTIALS` | "Incorrect email or password."                                                              |
| `ALREADY_CLAIMED`     | "Another DM has already linked this campaign."                                              |
| `IDENTITY_CONFLICT`   | "This DDB account is already linked to a different vtt-chat login. Please contact support." |
| `CAMPAIGN_NOT_FOUND`  | "Campaign not found. Check your invite code."                                               |
| Other 4xx/5xx         | "Could not link your account. Please try again."                                            |

#### 12.2b Returning DM (device credential present)

```text
┌─────────────────────────────────────────────────────┐
│  VTT-Chat                                  [×]      │
│                                                     │
│  📋  The Lost Mines of Phandelver                   │
│      ✓ Linked · You are the DM                      │
│                                                     │
│  Status:  🟢 2 players online  ·  Session: Active   │
│                                                     │
│  [ Launch as DM ]          [ Sync Campaign ]        │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**"Launch as DM":** runs the returning DM launch flow (§8).

**"Sync Campaign":** fires `POST /api/integrations/external/dm-sync` immediately (ignores throttle), shows spinner, then success/error toast in popup.

### 12.3 /ext-launch Behaviour

`/ext-launch` with a `token` query param auto-authenticates silently and redirects to the campaign workspace. No login form is shown. This is the only path the extension uses after `dm-link-init` completes.

The old `mode=dm-link` URL parameter is no longer supported. Any attempt to open `/ext-launch` without a valid token will fall back to the hint form (email + password), which is a recovery path only.

### 12.4 Invite Code Handling

- Invite codes are entered once to establish the link. They are **not** stored in extension storage.
- The `deviceCredential` is the sole reconnection mechanism for returning DM launches.
- If the credential is lost or invalidated: the DM re-enters the invite code → first-time flow runs again (all operations are idempotent).
- The invite code input field should be cleared after a successful link (do not cache it even in session storage).

### 12.5 DM Sync Throttle

To avoid hammering the sync endpoint on every page load:

- Throttle: fire `dm-sync` at most once per 10 minutes per campaign.
- Store the last-sync timestamp in `chrome.storage.session` keyed by `dmsync:<campaignId>`.
- The **Sync Campaign** button in the popup always bypasses the throttle.
- On tab open (returning DM launch): check throttle → skip if within window.

### 12.6 Credential Storage Keys

| Key                                            | Content                                                      | Storage                  |
| ---------------------------------------------- | ------------------------------------------------------------ | ------------------------ |
| `dmlink:<externalCampaignId>:<externalSystem>` | `{ campaignId, deviceCredential: { credential, deviceId } }` | `localStorage`           |
| `dmsync:<campaignId>`                          | `{ lastSyncAt: ISO-string }`                                 | `chrome.storage.session` |

Note: `localStorage` is used here (not `chrome.storage.session`) so the DM credential survives browser restarts, matching the expected behaviour of a returning DM who expects to launch without re-entering their invite code.

---

## 13. Full-Account Requirement Summary

| Endpoint                                       | Guest token accepted?      | Notes                                                                     |
| ---------------------------------------------- | -------------------------- | ------------------------------------------------------------------------- |
| `POST /api/auth/extension/dm-link-init`        | **No** — `401/403`         | Authenticates internally; requires full account credentials               |
| `POST /api/auth/extension/dm-link`             | **No** — `403 FORBIDDEN`   | Full account JWT required                                                 |
| `POST /api/integrations/external/dm-sync`      | **No** — `403 FORBIDDEN`   | DM sync is a privileged campaign operation                                |
| `POST /api/auth/extension/guest-login`         | N/A — this creates a guest | Player-only path; DMs must use dm-link-init                               |
| `POST /api/auth/extension/credential/exchange` | Yes (pass-through)         | Validates existing credential; account type checked by downstream callers |
| `POST /api/integrations/external/sync`         | Yes                        | Per-player character sync; guest tokens permitted                         |

The `/api/auth/extension/guest-login` endpoint remains available for players. The DM must never be routed through `guest-login` after the first-time DM link flow is shipped; the extension must branch on DM ownership detection (§4) before deciding which path to take.

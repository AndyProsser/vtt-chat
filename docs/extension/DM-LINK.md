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

The DM link flow therefore enforces a full account login. Guest tokens are rejected from `POST /api/auth/extension/dm-link` and `POST /api/integrations/external/dm-sync`.

---

## 2. The Linking Mechanism

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
4. Extension detects DM ownership of the DDB campaign (see §3).
5. DM enters the vtt-chat invite code in the extension popup.
6. Extension validates the code (`GET /api/campaigns/invite/:code/validate`) and shows the campaign name.
7. DM confirms and clicks **Link & Launch** → the DM Link Flow begins (§4).

The invite code is used once to establish the link. Returning DM launches use the stored `deviceCredential` — no re-entry of the invite code is needed.

---

## 3. DM Detection in the Extension

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

If the rule is true and the extension popup has a stored device credential for this campaign → show the returning-DM UI (§10.2).

If the rule is true and no credential exists → show the first-time DM UI with invite code entry (§10.2).

If the rule is false but the user is in the member list → show the standard player UI.

---

## 4. DM First-Time Link Flow

_Runs once per DM per campaign. Establishes the campaign link, creates the ExternalIdentity, merges any duplicate guest account, and stores a device credential for future launches._

```text
1.  DM navigates to their DDB campaign page.
2.  Extension shows DM UI — "You are the DM of this campaign."
3.  DM enters the vtt-chat player invite code into the popup.
4.  Extension: GET /api/campaigns/invite/:code/validate
      → confirm campaign name and that invite is active
      → if invalid: show error, stop
5.  Extension shows: "Link 'The Lost Mines of Phandelver' to this DDB campaign? [Confirm]"
6.  DM clicks Confirm → extension opens:
        /ext-launch?campaignId=<uuid>&hint=<ddb-email>&mode=dm-link
      Note: no JWT in URL — this path requires password login; guest bypass is blocked.
7.  /ext-launch shows email (pre-filled from DDB, read-only) + password field.
      Page heading: "Log in to link your DM account"
8.  DM submits credentials → POST /api/auth/login → returns full-account JWT.
9.  /ext-launch (now authenticated) runs the full DM link sequence:
      a. POST /api/auth/extension/dm-link with the full-account JWT. Server:
           i.   Checks CampaignExternalLink for an existing DM claim on this campaign.
                First-time: takes DM ownership (updates campaign.currentDmId).
                Returning same account: no-op.
                Same DDB identity, different vtt-chat account: transfers ownership (account recovery).
                Different DDB identity already claimed: returns 409 ALREADY_CLAIMED.
           ii.  Upserts ExternalIdentity: (externalSystem, externalUserId) → callerUserId.
           iii. Runs guest account merge if a guest ExternalIdentity with same externalUserId exists (§6).
           iv.  Upserts CampaignExternalLink(campaignId, externalSystem, externalCampaignId).
           v.   Issues deviceCredential.
           vi.  Returns { deviceCredential, merged, mergedAccountSummary? }.
      b. POST /api/integrations/external/dm-sync → sync campaign name (best-effort; non-fatal).
      c. POST /api/campaigns/:campaignId/session/ensure → confirms or creates an IDLE session.
      d. Posts VTT_CHAT_DM_LINK_COMPLETE to window.opener (§9) with the deviceCredential.
10. Background script stores deviceCredential in localStorage.
    Key: dmlink:<externalCampaignId>:<externalSystem>
    See DEVICE-CREDENTIALS.md for the full storage shape.
11. /ext-launch redirects to campaign workspace.
```

---

## 5. DM Returning Launch Flow

_Normal path for all subsequent DM launches. No invite code, no password prompt — the device credential is the sole auth mechanism._

The DDB extension has already verified the DM is logged into DDB. Combined with the stored device credential, no vtt-chat password is ever required after the initial link.

```text
1.  Extension detects DM ownership on DDB campaign page.
2.  Extension finds stored deviceCredential in localStorage
    (key: dmlink:<externalCampaignId>:<externalSystem>).
3.  POST /api/auth/extension/credential/exchange { credential, deviceId }
      → returns { token, credential } — fresh JWT + rotated credential
      → Store the rotated credential immediately (old one is now invalid)
      → On CREDENTIAL_INVALID / CREDENTIAL_EXPIRED_GUEST: clear storage,
        fall back to first-time flow (§4)
4.  Extension fires dm-sync (throttled: at most once per 10 minutes per campaign):
        POST /api/integrations/external/dm-sync { campaignId, externalSystem,
          externalCampaignId, characters: [] }
      → updates campaign name and character stubs from DDB (best-effort; non-fatal)
5.  POST /api/campaigns/:campaignId/session/ensure
      → creates or confirms the IDLE session
      → returns { sessionId, sessionState, campaignDisplayState }
6.  Open /ext-launch?campaignId=<uuid>&token=<jwt>&sessionId=<id>
      → ext-launch validates the token silently (no password form shown)
      → redirects straight to campaign workspace
```

The `token` in the URL is what suppresses the password form. `/ext-launch` has two paths: the **token path** (auto-login, silent) and the **DM-link path** (first-time only, requires password). Returning DM always uses the token path.

---

## 6. POST /api/auth/extension/dm-link

### Auth requirement

Requires a full-account JWT (`authType = FULL`). Guest tokens return `403 FORBIDDEN`.

DM ownership is established via `CampaignExternalLink`, not `campaign.currentDmId`. First-time callers claim ownership by creating the link; returning callers are verified against the stored link.

### Request

```json
{
  "campaignId": "uuid",
  "externalSystem": "dndbeyond",
  "externalUserId": "string (DDB user ID of the DM)",
  "externalCampaignId": "string (DDB campaign ID)",
  "email": "string (DDB account email — informational only)",
  "displayName": "string | null (DDB display name — informational only)",
  "deviceId": "uuid (stable per-browser identifier)"
}
```

### Server actions (in order)

1. Verify `authType === FULL` on the caller's token → `403` if guest.
2. Verify the external system is platform-authorized → `403 INTEGRATION_NOT_AUTHORIZED`.
3. Look up `CampaignExternalLink` for `(campaignId, externalSystem)`:
   - **No link exists** (first-time): take DM ownership — update `campaign.currentDmId` to caller; create the link with `linkedBy = callerUserId`.
   - **Link exists, `linkedBy === callerUserId`**: returning DM on same account — no ownership change.
   - **Link exists, `linkedBy ≠ callerUserId`**: check whether the linked account shares the same DDB identity (account recovery path). If yes: transfer ownership. If no: return `409 ALREADY_CLAIMED`.
4. Upsert `ExternalIdentity { userId: callerUserId, externalSystem, externalUserId, email }`.
5. **Guest account merge** — search for any other `ExternalIdentity` where `(externalSystem, externalUserId)` matches but `userId ≠ callerUserId`:
   - If found and that user is `authType = GUEST` → run merge (§7).
   - If found and that user is `authType = FULL` → do NOT auto-merge; return `409 IDENTITY_CONFLICT`.
   - If not found → skip merge.
6. Upsert `CampaignExternalLink { campaignId, externalSystem, externalId: externalCampaignId, linkedBy: callerUserId }`.
7. Issue `deviceCredential` (same mechanism as guest login credential).
8. Return response.

### Response (200)

```json
{
  "message": "DM account linked successfully",
  "deviceCredential": {
    "credential": "opaque-base64url-string",
    "deviceId": "uuid"
  },
  "merged": false,
  "mergedAccount": null
}
```

When a merge occurred (`merged: true`):

```json
{
  "message": "DM account linked and guest account merged",
  "deviceCredential": { "credential": "...", "deviceId": "..." },
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

| Status | Code                         | Cause                                                                    |
| ------ | ---------------------------- | ------------------------------------------------------------------------ |
| 400    | `INVALID_INPUT`              | Missing `campaignId`, `externalSystem`, `externalUserId`, or `deviceId`  |
| 401    | `UNAUTHORIZED`               | Missing or invalid token                                                 |
| 403    | `FORBIDDEN`                  | Caller is a guest (`authType !== FULL`)                                  |
| 403    | `INTEGRATION_NOT_AUTHORIZED` | External system is blocked or not authorized                             |
| 404    | `CAMPAIGN_NOT_FOUND`         | `campaignId` does not exist                                              |
| 409    | `ALREADY_CLAIMED`            | A different DDB identity has already linked this campaign as DM          |
| 409    | `IDENTITY_CONFLICT`          | `externalUserId` is already linked to a different full vtt-chat account  |

---

## 7. Guest Account Merge

### When it triggers

A merge is triggered in step 5 of `POST /api/auth/extension/dm-link` when the server finds an `ExternalIdentity` record with the same `(externalSystem, externalUserId)` that belongs to a different user whose `authType = GUEST`.

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

Re-calling `dm-link` after a successful merge is safe:

- The `ExternalIdentity` upsert for `callerUserId` is a no-op.
- The guest `ExternalIdentity` no longer exists, so the merge search finds nothing.
- Response shows `merged: false, mergedAccount: null`.

### IDENTITY_CONFLICT case (two full accounts)

If `externalUserId` is already linked to a **different full account**, the server returns `409 IDENTITY_CONFLICT` and takes no action. Resolution requires a sysadmin to manually audit and merge the two accounts. The extension should display: _"This DDB account is already linked to a different vtt-chat login. Please contact support."_

---

## 8. Campaign Name Sync

When `campaignData.name` is present in a `POST /api/integrations/external/dm-sync` request, the backend updates `Campaign.name` to match the DDB campaign name. This keeps the two in sync without any manual step.

**Override behaviour:** If the DM renames the campaign inside vtt-chat after a sync, the next dm-sync will overwrite that rename back to the DDB name. A future campaign setting (`lockCampaignNameToExternal: boolean`, default `true`) will let DMs opt out of this behaviour. Until that setting exists, name sync always wins.

---

## 9. Extension Signalling — /ext-launch → Extension

After a successful `dm-link` call, `/ext-launch` signals the extension on **two channels simultaneously**. The extension must handle whichever arrives — it will normally receive one or the other depending on how the tab was opened.

### Message payload (identical on both channels)

```json
{
  "type": "VTT_CHAT_DM_LINK_COMPLETE",
  "payload": {
    "campaignId": "uuid",
    "deviceCredential": {
      "credential": "opaque-string",
      "deviceId": "uuid"
    },
    "merged": false
  }
}
```

### Channel A — BroadcastChannel (primary)

The ext-launch page posts to `new BroadcastChannel('vtt-chat-ext')` and immediately closes the channel. This works when the tab was opened via `chrome.tabs.create()` (the normal extension path), where `window.opener` is `null`.

**Extension content script** (injected into the vtt-chat domain) must listen and relay:

```typescript
const channel = new BroadcastChannel('vtt-chat-ext')
channel.onmessage = ({ data }: MessageEvent) => {
  if (data?.type === 'VTT_CHAT_DM_LINK_COMPLETE') {
    chrome.runtime.sendMessage(data)
  }
}
```

**Extension background script** handles the relayed message:

```typescript
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'VTT_CHAT_DM_LINK_COMPLETE') return
  const { campaignId, deviceCredential } = message.payload
  // Store using the externalCampaignId + externalSystem from extension context
  // (background script knows these from when it opened the ext-launch tab)
  localStorage.setItem(
    `dmlink:${externalCampaignId}:${externalSystem}`,
    JSON.stringify({ campaignId, deviceCredential })
  )
})
```

### Channel B — window.opener.postMessage (fallback)

The ext-launch page also calls `window.opener.postMessage(payload, origin)` if `window.opener` is set. This is the path when the extension popup used `window.open()` directly.

The extension popup must listen:

```typescript
window.addEventListener('message', (event: MessageEvent) => {
  if (event.origin !== VTT_CHAT_ORIGIN) return
  if (event.data?.type !== 'VTT_CHAT_DM_LINK_COMPLETE') return
  const { campaignId, deviceCredential } = event.data.payload
  localStorage.setItem(
    `dmlink:${externalCampaignId}:${externalSystem}`,
    JSON.stringify({ campaignId, deviceCredential })
  )
})
```

### Deduplication

The extension should track whether it has already stored the credential for this launch (e.g. a boolean flag per open ext-launch tab) so that receiving both channels doesn't trigger a double-store. A double-store is harmless but noisy.

If `merged: true`, the extension may optionally surface a one-time informational toast: _"A prior guest session was merged into your account."_

---

## 10. Extension Changes Required

_This section specifies what the extension repository must implement to support the DM link flow._

### 10.1 DM Ownership Detection

**On DDB campaign page load:**

```text
1. Scrape logged-in DDB user ID (from session / profile DOM).
2. Scrape campaign owner user ID (from campaign page DOM or DDB API).
3. If logged-in user ID === campaign owner user ID:
     → user is DM of this campaign
     → check localStorage for deviceCredential keyed by (campaignId, externalSystem)
     → if found: show Returning DM UI (§10.2b)
     → if not found: show First-Time DM UI (§10.2a)
4. Else if logged-in user is in the campaign member list:
     → show standard Player Launch UI (existing flow)
5. Else:
     → show "You are not a member of this campaign" notice
```

Note: `campaignId` at this stage is not yet known (it's the vtt-chat UUID, not the DDB ID). Step 3 checks localStorage for any credential keyed to this `externalCampaignId`. If a matching credential is found, the vtt-chat `campaignId` is retrieved from the stored credential record.

### 10.2 Extension Popup States (DM)

#### 10.2a First-Time DM (no device credential)

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
│  [ Link & Launch as DM ]                            │
│                                                     │
│  ────────────────────────────────────────────────   │
│  Not the DM? Launch as player instead →             │
└─────────────────────────────────────────────────────┘
```

**Validation on input field:**

- On blur / submit: call `GET /api/campaigns/invite/:code/validate`
- If valid: show campaign name below the field as a confirmation chip
- If invalid: show inline error "This code isn't valid"

**On "Link & Launch":**

- Disable button, show spinner
- Open `/ext-launch?campaignId=<uuid>&hint=<ddb-email>&mode=dm-link` in a new tab
- Listen for `VTT_CHAT_DM_LINK_COMPLETE` postMessage (§9)
- On receipt: store credential, close popup

#### 10.2b Returning DM (device credential present)

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

**"Launch as DM":** runs the returning DM launch flow (§5).

**"Sync Campaign":** fires `POST /api/integrations/external/dm-sync` immediately (ignores throttle), shows spinner, then success/error toast in popup.

### 10.3 /ext-launch DM-Link Page Behaviour

The `/ext-launch` route with `mode=dm-link` must:

1. **Block the guest bypass.** If no JWT is present in the URL params, always show the password login form — never call the guest-login endpoint.
2. Pre-fill email from the `hint` query param (read-only). In DEV passwordless mode show an editable username field instead.
3. Show heading: _"Log in to link your DM account"_.
4. Sub-heading: _"Log in with your vtt-chat account to link it to this DDB campaign."_
5. On successful `POST /api/auth/login`, run the DM link sequence in order:
   - **Step 1 — dm-link:** `POST /api/auth/extension/dm-link` with the JWT. Progress label: _"Linking your DM account…"_
     - On `409 ALREADY_CLAIMED`: show _"Another DM has already linked this campaign."_ Do not proceed.
     - On `409 IDENTITY_CONFLICT`: show _"This DDB account is already linked to a different vtt-chat login. Please contact support."_ Do not proceed.
   - **Step 2 — dm-sync:** `POST /api/integrations/external/dm-sync` to update campaign name. Progress label: _"Syncing campaign from D&D Beyond…"_ (best-effort; non-fatal).
   - **Step 3 — session/ensure:** `POST /api/campaigns/:campaignId/session/ensure`. Progress label: _"Preparing your session…"_ Captures the real `sessionId` for the redirect.
   - **Step 4 — postMessage:** Post `VTT_CHAT_DM_LINK_COMPLETE` to `window.opener` (§9). Progress label: _"Launching campaign…"_
   - Redirect to campaign workspace via the lobby auto-enter pattern.

### 10.4 Invite Code Handling

- Invite codes are entered once to establish the link. They are **not** stored in extension storage.
- The `deviceCredential` is the sole reconnection mechanism for returning DM launches.
- If the credential is lost or invalidated: the DM re-enters the invite code → first-time flow runs again (safe to repeat — all operations are idempotent).
- The invite code input field should be cleared after a successful link (do not cache it even in session storage).

### 10.5 DM Sync Throttle

To avoid hammering the sync endpoint on every page load:

- Throttle: fire `dm-sync` at most once per 10 minutes per campaign.
- Store the last-sync timestamp in `chrome.storage.session` keyed by `dmsync:<campaignId>`.
- The **Sync Campaign** button in the popup always bypasses the throttle.
- On tab open (returning DM launch): check throttle → skip if within window.

### 10.6 Credential Storage Keys

| Key                                            | Content                                                      | Storage                  |
| ---------------------------------------------- | ------------------------------------------------------------ | ------------------------ |
| `dmlink:<externalCampaignId>:<externalSystem>` | `{ campaignId, deviceCredential: { credential, deviceId } }` | `localStorage`           |
| `dmsync:<campaignId>`                          | `{ lastSyncAt: ISO-string }`                                 | `chrome.storage.session` |

Note: `localStorage` is used here (not `chrome.storage.session`) so the DM credential survives browser restarts, matching the expected behaviour of a returning DM who expects to launch without re-entering their invite code.

---

## 11. Full-Account Requirement Summary

| Endpoint                                       | Guest token accepted?      | Notes                                                                     |
| ---------------------------------------------- | -------------------------- | ------------------------------------------------------------------------- |
| `POST /api/auth/extension/dm-link`             | **No** — `403 FORBIDDEN`   | Full account is required to hold DM identity                              |
| `POST /api/integrations/external/dm-sync`      | **No** — `403 FORBIDDEN`   | DM sync is a privileged campaign operation                                |
| `POST /api/auth/extension/guest-login`         | N/A — this creates a guest | Player-only path; DMs must use dm-link                                    |
| `POST /api/auth/extension/credential/exchange` | Yes (pass-through)         | Validates existing credential; account type checked by downstream callers |
| `POST /api/integrations/external/sync`         | Yes                        | Per-player character sync; guest tokens permitted                         |

The `/api/auth/extension/guest-login` endpoint remains available for players. The DM must never be routed through `guest-login` after the first-time DM link flow is shipped; the extension must branch on DM ownership detection (§10.1) before deciding which path to take.

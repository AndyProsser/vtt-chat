# Browser Extension Integration

_A cross‑browser MV3 extension that injects UI, extracts metadata, syncs character/campaign context, and streams external logs into the platform._

**Note:** This document covers **technical architecture** and implementation.
For UX principles and overlay layout, see [EXTENSION-UX.md](EXTENSION-UX.md).
For guest auth, invite links, and pre-flight validation, see [GUEST-AUTH.md](GUEST-AUTH.md).
For third-party system separation and admin authorization, see [THIRD-PARTY-INTEGRATIONS.md](THIRD-PARTY-INTEGRATIONS.md).

**Extension repository:** <https://github.com/AndyProsser/vtt-chat-extension>
The existing extension has a functional D&D Beyond front-end and data-scraping layer. The integration contract with the vtt-chat backend is defined in [GUEST-AUTH.md](GUEST-AUTH.md) and this document.

---

## Overview

The browser extension provides deep integration between the VTT‑Chat platform and external VTTs such as:

- **D&D Beyond**
- **Roll20**
- **Foundry VTT**
- **Other web‑based tabletops**

The extension enables:

- **Guest / invite-link authentication** — join without creating an account; identity delegated to the external VTT
- Automatic detection of character/campaign pages
- Injected "Launch Chat" button
- Pre-flight validation (platform status, invite validity, existing account check)
- Character metadata extraction and sync (name, class, avatar, stats, conditions)
- Campaign metadata extraction (DM-controlled sync policy)
- External log ingestion (attacks, rolls, spells, movement)
- Auto‑effects (conditions, distance, whispers)
- Quick‑connect to the platform
- LiveKit token retrieval
- Session launch from the extension popup

This document defines:

- Extension architecture
- Injection rules
- Page detection
- Metadata extraction
- Character sync protocol (field mapping, avatar upload, stats)
- External log mapping
- Auto‑effects
- Communication with backend
- Security model

---

## 1. Extension Architecture

The extension uses a **modular MV3 architecture**:

```text
popup.html / popup.js
background.js
content.js
assets/
manifest.json
```

### Responsibilities

| Component           | Responsibility                                     |
| ------------------- | -------------------------------------------------- |
| **Popup**           | Server selection, invite code, quick connect       |
| **Background**      | API calls, token retrieval, tab messaging          |
| **Content Script**  | DOM injection, page detection, metadata extraction |
| **Injected UI**     | Launch button, status indicator                    |
| **Messaging Layer** | Popup ↔ Background ↔ Content                       |

---

## 2. Page Detection Rules

The extension only activates on **supported pages**.

### D&D Beyond

| Page              | URL Pattern                              | Behavior                                         |
| ----------------- | ---------------------------------------- | ------------------------------------------------ |
| Character Sheet   | `https://www.dndbeyond.com/characters/*` | Extract character metadata, inject launch button |
| Campaign Page     | `https://www.dndbeyond.com/campaigns/*`  | Extract campaign metadata, inject launch button  |
| Encounter Builder | `https://www.dndbeyond.com/encounters/*` | Optional logs                                    |
| Dice Rolls        | Any page                                 | Capture roll events                              |

### Roll20

| Page      | Behavior                           |
| --------- | ---------------------------------- |
| Game Page | Capture chat logs, whispers, rolls |

### Foundry VTT

| Page      | Behavior                                      |
| --------- | --------------------------------------------- |
| Game Page | Capture movement, rolls, whispers, conditions |

---

## 3. Injection Logic

The extension injects a **Launch Chat** button only on:

- Character pages
- Campaign pages

### Injection Rules

- Inject once per page load
- Re‑inject on SPA navigation (DDB uses React)
- Remove if DOM changes invalidate the target
- Button must be visually consistent with site theme

### Example Injected UI

```text
[ Launch VTT Chat ]
```

Clicking the button:

1. Opens the SPA in a new tab
2. Passes character/campaign metadata
3. Requests a LiveKit token
4. Joins the correct campaign/session

---

## 4. Metadata Extraction

The content script extracts all available character and campaign data from the host VTT.

### Character Metadata

The following fields are extracted and mapped to the `characterUpdate` payload (see [Section 5b](#5b-character-sync-protocol)):

| Field                     | DB Column / Location                         | Notes                                          |
| ------------------------- | -------------------------------------------- | ---------------------------------------------- |
| `externalCharacterId`     | `Character.externalId`                       | Required for all syncs; DDB character ID       |
| `name`                    | `Character.name`                             | Character name, not player name                |
| `race`                    | `Character.race`                             | Full race string, e.g. `"High Elf"`            |
| `class`                   | `Character.class`                            | Primary class, e.g. `"Wizard"`                 |
| `subclass`                | `Character.subclass`                         | Subclass, e.g. `"School of Evocation"`         |
| `level`                   | `Character.metadata.level`                   | Total character level (integer)                |
| `avatarUrl`               | `Character.avatarUrl`                        | URL returned from avatar-upload endpoint (§5c) |
| `characterUrl`            | `Character.metadata.characterUrl`            | Link back to the DDB character sheet           |
| `stats.hp`                | `Character.metadata.stats.hp`                | `{ current, max, temp }` object                |
| `stats.ac`                | `Character.metadata.stats.ac`                | Armour class (integer)                         |
| `stats.speed`             | `Character.metadata.stats.speed`             | Walk speed in feet (integer)                   |
| `stats.initiative`        | `Character.metadata.stats.initiative`        | Initiative bonus (integer)                     |
| `stats.proficiencyBonus`  | `Character.metadata.stats.proficiencyBonus`  | Proficiency bonus (integer)                    |
| `stats.passivePerception` | `Character.metadata.stats.passivePerception` | Passive Perception score                       |
| `stats.abilityScores`     | `Character.metadata.stats.abilityScores`     | `{ str, dex, con, int, wis, cha }` scores      |
| `stats.spellSlots`        | `Character.metadata.stats.spellSlots`        | `{ total: {1-9}, used: {1-9} }` map            |
| `conditions`              | `Character.metadata.conditions`              | Array of active condition strings              |
| `features`                | `Character.metadata.features`                | Notable features/traits array (optional)       |

All `stats.*`, `conditions`, and `features` are stored in the `Character.metadata` JSON column.
Only `name`, `race`, `class`, `subclass`, and `avatarUrl` are top-level DB columns.

### Extraction Method

- DOM scraping of the rendered character sheet
- Embedded JSON in `<script>` tags (DDB bootstraps character state into the page)
- XHR / GraphQL interception (DDB uses GraphQL for live updates)
- MutationObserver for SPA navigation and live stat changes

### Campaign Metadata

- Campaign ID
- Campaign name
- Player list
- DM user ID
- Campaign invite code (if visible)

---

## 5. Communication With Backend

The extension communicates with the backend via the **background script**.

### 5a. API Endpoints

| Endpoint                                            | Auth required     | Purpose                                                               |
| --------------------------------------------------- | ----------------- | --------------------------------------------------------------------- |
| `GET /api/platform/status`                          | None              | Pre-flight: platform online + activity stats                          |
| `GET /api/campaigns/invite/:code/validate`          | None              | Pre-flight: invite validity + campaign name (first-time join only)    |
| `GET /api/campaigns/:campaignId/session-status`     | None              | Session state for popup display; campaignId acts as the access gate   |
| `POST /api/auth/extension/preflight`                | None              | Pre-flight: existing account check for email                          |
| `POST /api/auth/extension/guest-login`              | None              | Guest auth: create or resume guest session (issues device credential) |
| `POST /api/auth/extension/credential/exchange`      | None              | Returning user: exchange device credential for a fresh JWT            |
| `POST /api/auth/login`                              | None              | Full account auth (if user has password)                              |
| `POST /api/auth/upgrade`                            | Guest token       | Upgrade guest → full account                                          |
| `POST /api/campaigns/:campaignId/session/ensure`    | Extension token   | Create IDLE session if none exists; returns existing session if any   |
| `POST /api/integrations/external/avatar-upload`     | Token             | Upload avatar image; returns hosted `avatarUrl`                       |
| `POST /api/integrations/external/sync`              | Token             | Push character/campaign updates per sync policy                       |
| `POST /api/integrations/external/dm-sync`           | DM token          | DM-triggered full sync; provisions party character stubs              |
| `POST /api/integrations/logs/ingest`                | Token             | External log ingestion (rolls, attacks, etc.)                         |
| `POST /api/livekit/token`                           | Token             | LiveKit room token                                                    |

### Message Flow

```text
content.js → background.js → backend API → background.js → content.js
```

### Security

- JWT stored in extension memory only
- No localStorage/sessionStorage
- No cookies
- No persistent tokens
- Guest tokens have a reduced lifetime (24 hours) and are silently renewed by the background script

See [GUEST-AUTH.md](GUEST-AUTH.md) for the full authentication flow specification.

---

### 5b. Character Sync Protocol

Character data is pushed via `POST /api/integrations/external/sync`. The sync policy on the campaign controls whether updates are accepted.

Two `characterUpdate` formats are accepted. When `classes` is present, it takes precedence over the legacy flat fields.

#### Request — multiclass format (preferred)

Use this format for multiclassed characters, or for any new extension work. The backend merges `className + " / " + subclassName` per entry and derives `level` from the sum of `classLevel` values.

```json
{
  "campaignId": "uuid",
  "externalSystem": "DDB",
  "source": "player",
  "characterUpdate": {
    "externalCharacterId": "string (required — DDB character ID)",
    "name": "string",
    "race": "string",
    "multiclass": true,
    "classes": [
      { "classExternalID": "1", "className": "Warlock", "classLevel": 4, "subclassName": "Archfey Patron" },
      { "classExternalID": "2", "className": "Fighter", "classLevel": 3, "subclassName": "Battle Master" }
    ],
    "avatarUrl": "string (URL returned from avatar-upload, or existing URL)",
    "characterUrl": "string (link back to DDB character sheet)",
    "stats": {
      "hp": { "current": 38, "max": 45, "temp": 0 },
      "ac": 16,
      "speed": 30,
      "initiative": 3,
      "proficiencyBonus": 3,
      "passivePerception": 14,
      "abilityScores": {
        "str": 10,
        "dex": 16,
        "con": 14,
        "int": 18,
        "wis": 12,
        "cha": 8
      },
      "spellSlots": {
        "total": { "1": 4, "2": 3, "3": 2 },
        "used": { "1": 1, "2": 0, "3": 0 }
      }
    },
    "conditions": ["Poisoned"],
    "features": ["Arcane Recovery", "Spell Mastery"]
  }
}
```

For a single-class character using this format, send a `classes` array with one entry and `"multiclass": false`.

#### Request — legacy flat format (backward compat)

Use this only for existing extension clients that have not yet adopted the `classes` array. When `classes` is absent, the backend reads `class`, `subclass`, and `level` directly.

```json
{
  "campaignId": "uuid",
  "externalSystem": "DDB",
  "source": "player",
  "characterUpdate": {
    "externalCharacterId": "string (required)",
    "name": "string",
    "race": "string",
    "class": "string",
    "subclass": "string",
    "level": 5,
    "avatarUrl": "string",
    "characterUrl": "string",
    "stats": { "..." : "..." },
    "conditions": [],
    "features": []
  }
}
```

#### Field Rules

- `externalCharacterId` is **required**; the backend looks up the character by `(campaignId, externalSystem, externalId)`.
- All other fields are **optional** — omit a field to leave it unchanged.
- When `classes` is present: backend merges each entry's `className + " / " + subclassName`, stores the full array in `Character.classes`, sets `Character.class` to the first entry's merged name, and sets `level` to the sum of all `classLevel` values. The legacy `class`, `subclass`, and `level` flat fields are ignored.
- When `classes` is absent: `name`, `race`, `class`, `subclass`, `avatarUrl` write to top-level `Character` columns; `level` is written to `Character.metadata`.
- `characterUrl`, `stats`, `conditions`, and `features` are always merged into `Character.metadata`.
- The backend merges metadata shallowly: sending `{ stats: { hp: ... } }` replaces the entire `stats` object, not individual sub-keys. Always send the full stats object.

#### Response (200)

```json
{
  "message": "Sync completed successfully",
  "applied": {
    "characterUpdate": true,
    "campaignUpdate": false
  }
}
```

#### Error Responses

| Status | Code                    | Cause                                               |
| ------ | ----------------------- | --------------------------------------------------- |
| 400    | `INVALID_INPUT`         | Missing `externalCharacterId` or bad field type     |
| 401    | `UNAUTHORIZED`          | Missing or invalid token                            |
| 403    | `FORBIDDEN`             | User not a member of the campaign                   |
| 403    | `SYNC_POLICY_VIOLATION` | Campaign sync policy prohibits this caller's update |

---

### 5c. Avatar Upload Flow

The extension must upload avatar images to VTT-Chat rather than storing raw third-party CDN URLs. Third-party URLs may expire, require authentication, or change.

#### Endpoint

```http
POST /api/integrations/external/avatar-upload
Authorization: Bearer <token>
Content-Type: multipart/form-data
Body: { image: <File> }
```

**Constraints:**

- Accepted MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
- Maximum file size: **2 MB**
- The uploaded file is stored by the platform and a stable, hosted URL is returned

#### Response (200)

```json
{
  "avatarUrl": "https://assets.example.com/avatars/user-<id>-<hash>.webp"
}
```

#### Extension Workflow

The extension performs avatar upload **before** the character sync, then includes the returned URL in the sync payload:

```text
1. Content script detects avatar image URL from DDB character sheet DOM
2. Background script fetches the image bytes from the DDB CDN URL
3. Background script POSTs the image as multipart/form-data to:
      POST /api/integrations/external/avatar-upload
4. Backend stores image, returns hosted { avatarUrl }
5. Background script includes that avatarUrl in the subsequent:
      POST /api/integrations/external/sync → characterUpdate.avatarUrl
```

#### Avatar Re-upload Policy

- On the first sync for a character, always upload the avatar.
- On subsequent syncs, compare the DDB source URL hash against a locally cached fingerprint.
- Only re-upload if the source image has changed (fingerprint mismatch).
- Cache the fingerprint in extension `chrome.storage.session` keyed by `externalCharacterId`.

---

### 5d. Inventory & Currency Sync Protocol

Inventory items and currency wallets can be pushed alongside character updates in the same `POST /api/integrations/external/sync` call, or in a dedicated call.

#### Inventory Request

```json
{
  "campaignId": "uuid",
  "externalSystem": "DDB",
  "source": "player",
  "inventoryUpdate": {
    "externalCharacterId": "ddb-char-123",
    "items": [
      {
        "externalId": "ddb-item-456",
        "name": "Longsword",
        "quantity": 1,
        "srdKey": "longsword",
        "srdCategory": "EQUIPMENT",
        "notes": "Heirloom blade"
      },
      {
        "externalId": "ddb-item-789",
        "name": "Potion of Healing",
        "quantity": 3,
        "srdCategory": "EQUIPMENT"
      }
    ]
  }
}
```

**Item field rules:**

| Field         | Required | Notes                                              |
| ------------- | -------- | -------------------------------------------------- |
| `externalId`  | Yes      | DDB item instance ID — used as the upsert key      |
| `name`        | Yes      | Display name as shown in DDB                       |
| `quantity`    | Yes      | Total quantity; clamped to `≥ 1`                   |
| `srdKey`      | No       | SRD item index if known (e.g. `"longsword"`)       |
| `srdCategory` | No       | `EQUIPMENT` (default), `MAGIC_ITEM`, or `HOMEBREW` |
| `notes`       | No       | Free-text annotation                               |

**Upsert semantics:** Items are matched by `(externalSource, externalId)` within the character's inventory. Existing items have their `name` and `quantity` updated. Items not in the payload are left untouched — the extension does not delete items.

#### Currency Request

```json
{
  "campaignId": "uuid",
  "externalSystem": "DDB",
  "source": "player",
  "currencyUpdate": {
    "externalCharacterId": "ddb-char-123",
    "wallet": { "gp": 42, "sp": 15, "cp": 200, "ep": 0, "pp": 0 }
  }
}
```

Currency sync uses **absolute values** — the wallet is SET to the provided amounts. Omit any denomination to leave it unchanged. The backend records the signed delta in the inventory history log for auditability.

#### Combined Sync (Recommended)

The extension should batch character, inventory, and currency updates into a single request to minimise round-trips:

```json
{
  "campaignId": "uuid",
  "externalSystem": "DDB",
  "source": "player",
  "sessionId": "active-session-uuid (optional)",
  "characterUpdate": { "externalCharacterId": "ddb-char-123", "name": "Tavita", "class": "Wizard", "level": 5 },
  "inventoryUpdate": { "externalCharacterId": "ddb-char-123", "items": [ ... ] },
  "currencyUpdate":  { "externalCharacterId": "ddb-char-123", "wallet": { "gp": 42 } }
}
```

#### Response (200)

```json
{
  "message": "Sync completed successfully",
  "applied": {
    "characterUpdate": true,
    "campaignUpdate": false,
    "inventoryItemsUpserted": 4,
    "currencyUpdated": true
  }
}
```

#### Sync Trigger Policy

The extension should sync inventory and currency:

- On character sheet page load (full sync)
- When DDB fires an XHR response that indicates item/currency state changed (incremental)
- Before the user clicks **Launch Chat** (ensures state is current on join)

---

### 5e. Campaign Inventory Sync Policy

Inventory and currency sync is governed by two layers of campaign policy. The backend enforces both layers on every sync request.

#### Layer 1 — Access Gate

The existing `extensionSyncPolicy` field (documented in [GUEST-AUTH.md](GUEST-AUTH.md)) acts as the top-level gate for **all** extension sync — character, inventory, and currency. When `extensionSyncPolicy` is `NONE`, no part of the sync payload is processed regardless of the Layer 2 settings below.

| `extensionSyncPolicy` | Effect |
| --- | --- |
| `NONE` | All sync payloads rejected (`SYNC_POLICY_VIOLATION`) |
| `DM_ONLY` | Only DM sync requests are processed |
| `DM_AND_PLAYERS` | DM and player sync requests are processed |

#### Layer 2 — Inventory-Specific Controls

When the caller is permitted by Layer 1, four additional campaign settings control inventory and currency sync specifically:

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `extensionInventorySyncEnabled` | `boolean` | `true` | When `false`, all `inventoryUpdate` payloads are rejected even if the caller passes Layer 1. |
| `extensionCurrencySyncEnabled` | `boolean` | `true` | When `false`, all `currencyUpdate` payloads are rejected. |
| `extensionPartyInventorySyncAccess` | `'DISABLED' \| 'DM_ONLY' \| 'ALL_PLAYERS'` | `'DM_ONLY'` | Who may write to the shared party inventory and party purse via extension sync. Character inventory is unaffected by this setting. |
| `extensionSyncConflictResolution` | `'OVERWRITE' \| 'IGNORE' \| 'PROMPT'` | `'OVERWRITE'` | How conflicting incoming values are resolved against the current persisted state. |

#### `extensionPartyInventorySyncAccess` Values

| Value | Behaviour |
| --- | --- |
| `DISABLED` | Extension sync cannot write to party inventory or party purse at all. Party-targeted items/currency in the payload are silently skipped. |
| `DM_ONLY` | Only sync requests sourced from the DM (`source: 'dm'`) may write to party inventory/currency. Player requests skip party items silently. |
| `ALL_PLAYERS` | Any campaign member's sync request may write to party inventory/currency. |

Character inventory is always writable by the character's owner (subject to `extensionInventorySyncEnabled`). `extensionPartyInventorySyncAccess` applies only to items and currency with `ownerType: 'PARTY'`.

#### `extensionSyncConflictResolution` Values

A **conflict** is: an incoming sync value for a record that already exists in the campaign inventory and differs from the persisted value.

| Value | Behaviour |
| --- | --- |
| `OVERWRITE` | Incoming value always wins. Matches the historical upsert semantics of the endpoint and treats DDB as the source of truth. |
| `IGNORE` | If the item (matched by `externalSource` + `externalId`) already exists, the incoming payload for that item is discarded and the existing record is left untouched. Net-new items (no existing record) are created normally. For currency: if the character wallet already has a non-zero balance for any denomination being sent, the entire `currencyUpdate` is discarded. |
| `PROMPT` | Conflicting changes are held in a pending sync queue for DM review rather than being applied immediately. Non-conflicting items (brand-new items, zero-balance denominations) are applied immediately as normal. |

##### PROMPT mode — Pending Sync Queue

When `extensionSyncConflictResolution` is `PROMPT`:

- The backend writes conflicting changes to a `PendingExtensionSync` record keyed by `(campaignId, characterId, externalSource, externalId)`.
- The DM receives an `INVENTORY:EXTENSION_SYNC_PENDING` WS event immediately after persistence.
- The INVENTORY panel shows a badge and a **Review Pending Syncs** button for the DM only.
- The DM can approve (apply the change via the standard 4-layer contract) or reject (discard) each pending item individually.
- Non-conflicting items from the same sync request are applied immediately without appearing in the queue.
- Pending sync records expire after 24 hours and are silently discarded.

#### Partial Application

When a policy blocks only part of a combined sync request (e.g. inventory enabled, currency disabled), the allowed parts are applied and the response reflects exactly what was and was not processed:

```json
{
  "message": "Sync completed with partial policy restrictions",
  "applied": {
    "characterUpdate": true,
    "inventoryItemsUpserted": 3,
    "currencyUpdated": false,
    "pendingConflicts": 0,
    "skippedReasons": {
      "currency": "SYNC_POLICY_DISABLED"
    }
  }
}
```

#### Error Responses

| Status | Code | Cause |
| --- | --- | --- |
| 403 | `SYNC_POLICY_DISABLED` | `extensionInventorySyncEnabled` is `false` and the request contains only `inventoryUpdate`; or `extensionCurrencySyncEnabled` is `false` and the request contains only `currencyUpdate`. |
| 403 | `SYNC_POLICY_PARTY_ACCESS_DENIED` | Caller is a player and `extensionPartyInventorySyncAccess` is `DM_ONLY` or `DISABLED`, and the request targets only party inventory. |

Requests containing both character and party targets are never rejected wholesale on a party policy violation — character items are applied and the party portions are skipped (see Partial Application above).

---

---

### 5f. DM Campaign Sync Protocol

The DM can manually trigger a full campaign sync from the extension popup after connecting. This sync is DM-only and operates independently of the per-player character sync covered in §5b.

#### When it runs

- The DM clicks **Sync Campaign** in the extension popup (manual trigger only).
- It also fires automatically after a successful DM login (`runGuestLoginAndLaunch` with `isDm=true`).

#### Endpoint

```http
POST /api/integrations/external/dm-sync
Authorization: Bearer <dm-token>
Content-Type: application/json
```

**Auth requirement:** The caller must be authenticated as the campaign DM. The backend rejects this endpoint with `403 FORBIDDEN` if the caller's role is not `DM` for the given campaign.

#### Request

```json
{
  "campaignId": "uuid",
  "externalSystem": "dndbeyond",
  "externalCampaignId": "string (DDB campaign ID)",
  "campaignData": {
    "name": "string",
    "description": "string or null",
    "publicNotes": "string or null",
    "dmExternalUserId": "string (DDB user ID of the DM)",
    "dmUsername": "string or null",
    "dateCreated": "ISO 8601 string or null",
    "memberCount": 4
  },
  "characters": [
    {
      "externalCharacterId": "string (DDB character ID)",
      "externalUserId": "string (DDB user ID of the character's owner)",
      "displayName": "string or null (DDB username)",
      "name": "string or null (character name)",
      "level": 5,
      "avatarUrl": "string or null (DDB CDN URL — not yet mirrored)",
      "characterUrl": "https://www.dndbeyond.com/characters/<id>"
    }
  ]
}
```

`characters` is populated by the extension by either:

1. Asking a live DDB tab's content script to extract full character data (`dm-fetch-campaign-data`).
2. Falling back to direct DDB API calls from the background script using the DM's session cookies (produces basic metadata only — no full stats).

#### Response (200)

```json
{
  "message": "DM campaign sync completed",
  "applied": {
    "campaignUpdated": true,
    "charactersProvisioned": 3,
    "charactersLinked": 1,
    "charactersSkipped": 0
  }
}
```

| Field                   | Meaning                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| `charactersProvisioned` | Stub character records created for players with no VTT-Chat link |
| `charactersLinked`      | Matched to an existing VTT-Chat user via ExternalIdentity        |
| `charactersSkipped`     | Omitted due to missing `externalCharacterId`                     |

#### Character resolution strategy

For each entry in `characters`, the backend applies the following resolution order:

##### Step 1 — Match by `externalUserId`

Look up an `ExternalIdentity` record where `(externalSystem, externalUserId)` matches. If found, the owning VTT-Chat user is known. Upsert the character against that user account (same as the standard player sync in §5b).

##### Step 2 — Stub creation (no match found)

If no `ExternalIdentity` exists for the given `externalUserId`, the backend creates an **unowned character stub**:

- `Character` row is created with `externalSystem`, `externalId` (`externalCharacterId`), `externalUserId`, and available metadata fields.
- `userId` is `null` — the stub has no VTT-Chat account owner yet.
- No `CampaignMembership` record is created at this point.
- The stub is visible to the DM in the campaign management panel, labelled as "pending player link".

Stubs are idempotent: re-running the DM sync updates the stub's metadata but does not create duplicates.

##### Step 3 — Lazy promotion on first player connect

When a player later connects via the extension (guest login or full login), the auth flow:

1. Creates or looks up an `ExternalIdentity` for their `(externalSystem, externalUserId)`.
2. Searches for an existing character stub in the campaign matching `(externalSystem, externalId=externalCharacterId)` with `userId IS NULL`.
3. If a stub is found: sets `userId` on the character, creates the `CampaignMembership`, and promotes the stub to a full campaign member. The character's existing metadata (name, level, avatar, etc.) from the DM sync is preserved and updated with any richer data from the player's own sync.
4. If no stub is found: the normal guest-login character creation path runs.

This means the DM sync pre-populates the campaign with character records that are seamlessly adopted the moment each player connects — no manual resolution needed for the common case.

#### Players with existing VTT-Chat accounts not yet linked to DDB

A player may have a full VTT-Chat account but no `ExternalIdentity` for DDB (they joined via email/password, not the extension). In this case:

- The DM sync **does not auto-link** them. Matching by display name or email is not attempted — DDB does not expose player emails via its campaign API, and fuzzy name matching risks incorrect merges.
- A stub character is created as normal (Step 2 above).
- The existing VTT-Chat user and the stub coexist until one of the following resolves it:
  - The player links their DDB account from their VTT-Chat profile settings (self-service).
  - The DM uses the campaign management panel to manually assign the stub to an existing member.
- Once linked, the stub is promoted via the same lazy-promotion logic (Step 3).

#### Avatar handling

The `avatarUrl` values in the DM sync payload are raw DDB CDN URLs. The backend **does not mirror avatars** during DM campaign sync — mirroring is performed by the extension during per-character syncs (§5c). The raw URLs are stored in `Character.metadata.avatarUrl` as a fallback until the player's own extension sync provides a mirrored URL.

#### Error responses

| Status | Code                          | Cause                                                              |
| ------ | ----------------------------- | ------------------------------------------------------------------ |
| 400    | `INVALID_INPUT`               | Missing `campaignId`, `externalSystem`, or malformed body          |
| 401    | `UNAUTHORIZED`                | Missing or invalid token                                           |
| 403    | `FORBIDDEN`                   | Caller is not the DM of the specified campaign                     |
| 403    | `INTEGRATION_NOT_AUTHORIZED`  | External system is blocked or not authorized by the platform admin |

---

## 6. External Log Ingestion

The extension captures logs from:

- D&D Beyond
- Roll20
- Foundry VTT

And sends them to:

```text
POST /api/integrations/logs/ingest
```

### Log Types

| Source      | Log Types                                                       |
| ----------- | --------------------------------------------------------------- |
| **DDB**     | Attack rolls, damage rolls, saving throws, skill checks, spells |
| **Roll20**  | Chat messages, whispers, rolls                                  |
| **Foundry** | Movement, rolls, whispers, conditions                           |

### Example Payload

```json
{
  "source": "DDB",
  "campaignExternalId": "ddb-123",
  "userExternalId": "ddb-user-456",
  "rawPayload": { ... }
}
```

### Mapping to Chat

Logs appear as:

```text
chat.externalLog
```

---

## 7. Auto‑Effects (Audio Integration)

The extension can automatically apply audio effects based on external events.

### Examples

| Event                  | Effect                                      |
| ---------------------- | ------------------------------------------- |
| DDB: Silenced          | Apply `SILENCED` condition preset           |
| DDB: Underwater        | Apply `UNDERWATER` preset                   |
| FVTT: Distance > 30 ft | Apply `FAR` distance preset                 |
| Roll20: /whisper       | Apply `IC_WHISPER` preset (DM monitor only) |
| FVTT: Fog Cloud        | Apply `FOG_MUFFLE` preset                   |

### Flow

```text
content.js → background.js → backend → WebSocket → audioReducer → AudioGraph
```

---

## 8. Whisper Detection

The extension detects whispers:

- Roll20: `/w username message`
- FVTT: private chat events
- DDB: whisper‑like events (homebrew)

Whispers trigger:

- `chat.whisper` event
- Optional IC preset (DM monitor only)

---

## 9. Distance Tracking (FVTT)

Foundry VTT exposes movement events.

The extension:

1. Reads token movement
2. Calculates distance between players
3. Sends distance updates to backend
4. Backend emits `audio.distanceChanged`
5. Audio engine applies distance preset

---

## 10. Session Launch Flow

When the user clicks **Launch Chat** or **Reopen Last Session** in the popup, the background script opens a new tab. The launch path taken depends on whether a device credential is stored.

### 10a. First-time Launch (No Device Credential)

This path runs once per browser/campaign pair, after the initial preflight and guest-login.

```text
1. Extract character/campaign metadata from host VTT page
2. Upload avatar (if changed) and capture hosted URL
3. POST /api/auth/extension/guest-login → receives JWT + deviceCredential
4. Store deviceCredential in localStorage; do NOT store the invite code
5. Resolve session via POST /api/campaigns/:campaignId/session/ensure
6. Open /ext-launch?campaignId=<uuid>&token=<jwt>&sessionId=<id>
   (tab auto-completes login and lands on the campaign workspace)
```

### 10b. Returning Launch (Device Credential Present)

This path is the normal path for all subsequent launches. No invite code is needed.

```text
1. POST /api/auth/extension/credential/exchange { credential, deviceId }
   → receives fresh JWT + rotated credential (store the new credential immediately)

2. POST /api/campaigns/:campaignId/session/ensure
   → if no session exists: creates an IDLE session (greenroom) — any member may do this
   → if a session already exists (any state): returns the existing session
   → returns { sessionId, sessionState, campaignDisplayState }

3. Branch by account type:

   GUEST account:
     → Open /ext-launch?campaignId=<uuid>&token=<jwt>&sessionId=<id>
     → Page auto-logs in (no password prompt) and redirects to campaign workspace

   FULL account (not yet verified this device session):
     → Open /ext-launch?campaignId=<uuid>&sessionId=<id>&hint=<email>
     → Page shows a single password field (email pre-filled, read-only)
     → On submit: POST /api/auth/login → JWT issued
     → Redirect to campaign workspace

   FULL account (JWT already valid in extension memory):
     → Open /ext-launch?campaignId=<uuid>&token=<jwt>&sessionId=<id>
     → Page skips password prompt and redirects directly to campaign workspace
```

### 10c. Extension Launch Page (`/ext-launch`)

`/ext-launch` is a dedicated, minimal SPA route — not the player join page (`/join/:code`). Its only purpose is to complete authentication for extension-triggered launches and then navigate to the campaign workspace. It must never ask for an invite code.

| Scenario | What the page does |
| --- | --- |
| `token` param present and valid | Auto-authenticate, redirect to campaign workspace |
| `hint` param present, no `token` | Show password field (email pre-filled), authenticate on submit |
| Auth fails | Show error with "Try again" — do not fall back to the join flow |

The campaign workspace is opened as `/campaigns/:campaignId` (or the session view if the session is ACTIVE/PAUSED/COOLDOWN).

### 10d. Sync Before Launch

Before opening the launch tab, the background script performs a final sync:

```text
1. Upload avatar if fingerprint changed
2. POST /api/integrations/external/sync (character + inventory + currency if applicable)
3. POST /api/campaigns/:campaignId/session/ensure → confirm session
4. Open /ext-launch tab
```

Sync failures must not block the launch. If sync fails, open the tab anyway and surface a non-blocking warning in the popup.

---

## 11. Extension Popup

The popup allows:

- Server selection
- Invite code entry
- Quick connect
- Re‑launch last session
- Status indicator

### Cached Data

- Last server
- Last campaign
- Last character
- Avatar fingerprint (per `externalCharacterId`) — used to skip redundant re-uploads
- Expiry: 72 hours

---

## 12. Pre-flight Validation

The pre-flight sequence has two paths depending on whether the extension already holds a device credential for this campaign.

### 12a. Returning User (Device Credential Stored)

```text
1. GET /api/platform/status
     → Is the platform reachable?

2. POST /api/auth/extension/credential/exchange { credential, deviceId }
     → Success: refresh JWT and continue to launch (skip invite code steps)
     → CREDENTIAL_INVALID / CREDENTIAL_EXPIRED_GUEST: fall back to first-time flow
     → CREDENTIAL_EXPIRED_FULL: prompt for email + password, no invite code needed
```

If credential exchange succeeds, the extension shows the popup with the campaign/character summary and a **Launch Chat** button. No invite code is required.

### 12b. First-time User (No Device Credential)

```text
1. GET /api/platform/status
     → Is the platform reachable and not in maintenance mode?

2. GET /api/campaigns/invite/:code/validate
     → Is the invite code valid? What campaign is this?

3. POST /api/auth/extension/preflight
     → Does this email have an existing account? Guest, full, or none?
```

Results determine which UI branch to show in the extension popup. See [GUEST-AUTH.md § 3. Pre-flight Validation](GUEST-AUTH.md) for full response shapes and UI outcome mapping.

After a successful first-time login (`POST /api/auth/extension/guest-login`), the device credential is stored and all subsequent launches use path 12a.

---

## 13. Guest Auth & Identity

The extension supports a guest authentication model where the external VTT (e.g. D&D Beyond) acts as the identity provider.

**Key behaviours:**

- Extension player-invite POST flow is the only path that creates guest accounts.
- Returning guests are matched by `(email + externalSystem)` and their data is updated per the campaign's sync policy.
- Users with an existing full vtt-chat account must log in with their password.
- Guest users can upgrade to a full account from within the platform UI.
- Direct browser watch-link (GET) spectator flow is registration-first and does not create new guest spectators.

See [GUEST-AUTH.md](GUEST-AUTH.md) for the complete specification covering:

- Invite link generation and validation
- All four authentication path variants
- External identity tracking (`ExternalIdentity` record)
- Data sync policy (`NONE | DM_ONLY | DM_AND_PLAYERS`)
- Account upgrade flow
- Security model

---

## 14. Design Principles

### 1. Non‑intrusive

Extension injects UI only where appropriate.

### 2. Zero persistent auth

Tokens live only in memory.

### 3. Trust delegation

Authentication is delegated to the third-party VTT — vtt-chat trusts that the external system has already validated the user's identity and campaign membership.

### 4. Declarative auto‑effects

Extension sends events; backend decides effects.

### 5. Cross‑browser

Chrome, Edge, Firefox supported.

### 6. SPA‑friendly

Handles React/SPA navigation via MutationObserver.

### 7. Fail‑safe

If extension fails, platform still works. Guest auth is only one of two supported auth paths.

### 8. Mirror, don't link

Avatar images and other media are mirrored through the VTT-Chat asset pipeline rather than stored as raw third-party URLs. This prevents broken images when external CDN URLs expire or change.

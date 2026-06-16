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

| Endpoint                                        | Auth required | Purpose                                         |
| ----------------------------------------------- | ------------- | ----------------------------------------------- |
| `GET /api/platform/status`                      | None          | Pre-flight: platform online + activity stats    |
| `GET /api/campaigns/invite/:code/validate`      | None          | Pre-flight: invite validity + campaign name     |
| `POST /api/auth/extension/preflight`            | None          | Pre-flight: existing account check for email    |
| `POST /api/auth/extension/guest-login`          | None          | Guest auth: create or resume guest session      |
| `POST /api/auth/login`                          | None          | Full account auth (if user has password)        |
| `POST /api/auth/upgrade`                        | Guest token   | Upgrade guest → full account                    |
| `POST /api/integrations/external/avatar-upload` | Token         | Upload avatar image; returns hosted `avatarUrl` |
| `POST /api/integrations/external/sync`          | Token         | Push character/campaign updates per sync policy |
| `POST /api/integrations/logs/ingest`            | Token         | External log ingestion (rolls, attacks, etc.)   |
| `POST /api/livekit/token`                       | Token         | LiveKit room token                              |

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

#### Request

```json
{
  "campaignId": "uuid",
  "externalSystem": "DDB",
  "source": "player",
  "characterUpdate": {
    "externalCharacterId": "string (required — DDB character ID)",
    "name": "string",
    "race": "string",
    "class": "string",
    "subclass": "string",
    "level": 5,
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

#### Field Rules

- `externalCharacterId` is **required**; the backend looks up the character by `(campaignId, externalSystem, externalId)`.
- All other fields are **optional** — omit a field to leave it unchanged.
- `name`, `race`, `class`, `subclass`, `avatarUrl` write to top-level `Character` columns.
- `level`, `characterUrl`, `stats`, `conditions`, and `features` are merged into `Character.metadata`.
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

When user clicks **Launch Chat**:

```text
content.js → background.js → backend → SPA tab
```

### Steps

1. Extract character/campaign metadata
2. Upload avatar (if changed) and capture hosted URL
3. Request LiveKit token
4. Open SPA with query params:
   <https://app/chat?campaign=123&character=456>
5. SPA connects to WebSocket
6. SPA joins campaign
7. SPA joins correct room

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

Before showing any join UI or requesting a token, the background script runs the pre-flight sequence:

```text
1. GET /api/platform/status
     → Is the platform reachable and not in maintenance mode?

2. GET /api/campaigns/invite/:code/validate
     → Is the invite code valid? What campaign is this?

3. POST /api/auth/extension/preflight
     → Does this email have an existing account? Guest, full, or none?
```

Results determine which UI branch to show in the extension popup. See [GUEST-AUTH.md § 3. Pre-flight Validation](GUEST-AUTH.md) for full response shapes and UI outcome mapping.

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

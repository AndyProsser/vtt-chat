# **EXTENSION-INTEGRATION.md**

# Browser Extension Integration

_A cross‑browser MV3 extension that injects UI, extracts metadata, syncs character/campaign context, and streams external logs into the platform._

**Note:** This document covers **technical architecture** and implementation.
For UX principles and overlay layout, see [EXTENSION-UX.md](EXTENSION-UX.md).

---

## 📘 Overview

The browser extension provides deep integration between the VTT‑Chat platform and external VTTs such as:

- **D&D Beyond**
- **Roll20**
- **Foundry VTT**
- **Other web‑based tabletops**

The extension enables:

- Automatic detection of character/campaign pages
- Injected “Launch Chat” button
- Character metadata extraction
- Campaign metadata extraction
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
- External log mapping
- Auto‑effects
- Communication with backend
- Security model

---

# 🧩 1. Extension Architecture

The extension uses a **modular MV3 architecture**:

```
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

# 🧭 2. Page Detection Rules

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

# 🧩 3. Injection Logic

The extension injects a **Launch Chat** button only on:

- Character pages
- Campaign pages

### Injection Rules

- Inject once per page load
- Re‑inject on SPA navigation (DDB uses React)
- Remove if DOM changes invalidate the target
- Button must be visually consistent with site theme

### Example Injected UI

```
[ Launch VTT Chat ]
```

Clicking the button:

1. Opens the SPA in a new tab
2. Passes character/campaign metadata
3. Requests a LiveKit token
4. Joins the correct campaign/session

---

# 🧬 4. Metadata Extraction

The content script extracts:

### Character Metadata

- Character ID
- Name
- Race
- Class / Subclass
- Level
- Avatar URL
- DDB character URL
- Conditions (silenced, poisoned, etc.)
- HP / AC / Speed (optional)

### Campaign Metadata

- Campaign ID
- Campaign name
- Player list
- DM user ID
- Campaign invite code (if visible)

### Extraction Method

- DOM scraping
- Embedded JSON in `<script>` tags
- XHR interception (DDB uses GraphQL)
- MutationObserver for SPA navigation

---

# 🔌 5. Communication With Backend

The extension communicates with the backend via the **background script**.

### API Calls

- `/auth/extension-login`
- `/campaigns/:id/characters`
- `/integrations/logs/ingest`
- `/livekit/token`

### Flow

```
content.js → background.js → backend API → background.js → content.js
```

### Security

- JWT stored in extension memory only
- No localStorage/sessionStorage
- No cookies
- No persistent tokens

---

# 📡 6. External Log Ingestion

The extension captures logs from:

- D&D Beyond
- Roll20
- Foundry VTT

And sends them to:

```
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

```
chat.externalLog
```

---

# 🎚️ 7. Auto‑Effects (Audio Integration)

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

```
content.js → background.js → backend → WebSocket → audioReducer → AudioGraph
```

---

# 🔐 8. Whisper Detection

The extension detects whispers:

- Roll20: `/w username message`
- FVTT: private chat events
- DDB: whisper‑like events (homebrew)

Whispers trigger:

- `chat.whisper` event
- Optional IC preset (DM monitor only)

---

# 🗺️ 9. Distance Tracking (FVTT)

Foundry VTT exposes movement events.

The extension:

1. Reads token movement
2. Calculates distance between players
3. Sends distance updates to backend
4. Backend emits `audio.distanceChanged`
5. Audio engine applies distance preset

---

# 🧭 10. Session Launch Flow

When user clicks **Launch Chat**:

```
content.js → background.js → backend → SPA tab
```

### Steps

1. Extract character/campaign metadata
2. Request LiveKit token
3. Open SPA with query params:
   ```
   https://app/chat?campaign=123&character=456
   ```
4. SPA connects to WebSocket
5. SPA joins campaign
6. SPA joins correct room

---

# 🧱 11. Extension Popup

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
- Expiry: 72 hours

---

# 🧠 12. Design Principles

### 1. Non‑intrusive

Extension injects UI only where appropriate.

### 2. Zero persistent auth

Tokens live only in memory.

### 3. Declarative auto‑effects

Extension sends events; backend decides effects.

### 4. Cross‑browser

Chrome, Edge, Firefox supported.

### 5. SPA‑friendly

Handles React/SPA navigation via MutationObserver.

### 6. Fail‑safe

If extension fails, platform still works.

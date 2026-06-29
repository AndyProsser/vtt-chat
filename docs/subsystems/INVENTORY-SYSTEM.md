# Inventory System

VTT-Chat tracks character and party inventory in-session, with full history logging and SRD-backed item search. Inventory is campaign-scoped and persists across sessions.

---

## 1. Overview

The inventory system provides:

- **Character Inventory** — each player character has their own personal inventory.
- **Party Inventory** — a shared pool accessible to all players (subject to campaign settings).
- **Currency** — GP/SP/CP/EP/PP tracked per character and as a party purse.
- **Inventory History Log** — a complete, filterable record of every add/move/remove action.
- **SRD Integration** — item search backed by the D&D 5e SRD API (2014 or 2024, DM-selected per campaign).
- **Chat Commands** — `/take`, `/give`, `/loot`, `/loot-split`, `/drop` as first-class actions.

All inventory changes during an `ACTIVE` session produce a system message in the chat timeline **and** an entry in the inventory history log. Outside an active session (greenroom, IDLE), changes are recorded in the history log only (no chat message).

---

## 2. Data Model

### 2.1 InventoryItem

```ts
interface InventoryItem {
  id: string
  campaignId: string
  ownerId: string // characterId or 'party'
  ownerType: 'CHARACTER' | 'PARTY'
  name: string
  quantity: number // always ≥ 1
  source: 'SRD' | 'CUSTOM' | 'EXTERNAL'
  srdIndex?: string // SRD item index (e.g. 'longsword'); set when source = 'SRD'
  srdRuleset?: '2014' | '2024'
  notes?: string // free-text DM/player annotation; the only editable field for CUSTOM items
  externalId?: string // External system item ID (e.g. DDB item ID); set when source = 'EXTERNAL'
  externalSource?: string // External system name (e.g. 'DDB'); set when source = 'EXTERNAL'
  addedBy: string // userId
  addedAt: Date
  updatedAt: Date

  // ── Container support (§2.1b) ─────────────────────────────────────────────
  isContainer: boolean // true only for the five recognised container types
  containerId?: string // ID of the parent InventoryItem; null = top-level

  // ── Extended item data ────────────────────────────────────────────────────
  // Stored in a metadata JSON column. Absent for CUSTOM items.
  // Populated from the SRD API at add-time for SRD items, or from the DDB
  // extension sync for EXTERNAL items. See §2.1c for field mapping.
  itemType?: string // primary category, e.g. 'Weapon', 'Armor', 'Adventuring Gear'
  itemSubtype?: string // sub-category, e.g. 'Martial Melee', 'Light Armor', 'Druidic Focus'
  weight?: number // weight in lb
  costGp?: number // base cost normalised to GP (e.g. SRD cost 10sp → 1.0 gp)
  description?: string // flavor text / mechanical description
  damage?: string // combined string, e.g. '1d8 slashing'
  properties?: string[] // base weapon properties PLUS range/thrown/versatile/armor merged in
  // e.g. ['Finesse', 'Light', 'Thrown (20/60)', 'Nick']
  // e.g. ['Versatile (1d10)']
  // e.g. ['Light Armor (AC 11)']
  // See §2.1c for full merge rules
}
```

### 2.1b Container Items

Five item types can act as containers: **Backpack**, **Chest**, **Pouch**, **Sack**, **Basket**.

| Rule                       | Detail                                                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recognised container types | `backpack`, `chest`, `pouch`, `sack`, `basket` (matched by SRD index or item name, case-insensitive)                                                                               |
| Nesting depth              | **Exactly one level.** A container can hold items; it cannot hold another container.                                                                                               |
| Ownership                  | All items inside a container must share the container's `ownerId`/`ownerType`.                                                                                                     |
| Container transfer         | Moving a container between owners (character ↔ party) atomically moves all of its contents in the same DB transaction and emits a single `INVENTORY:CONTAINER_TRANSFERRED` event.  |
| Custom containers          | CUSTOM items are never automatically flagged `isContainer = true`. A DM can manually mark a custom item as a container (e.g. "Bag of Holding homebrew") via the item detail panel. |
| Capacity                   | Capacity tracking (current weight vs. container weight limit) is a planned feature and is **not** part of this contract. Weight display is informational only.                     |

### 2.1c Field Mapping — SRD and DDB

All source data is normalised at ingestion time. Range, thrown, versatile, and armor class data are **merged into `properties[]`** rather than stored as separate fields.

**Scalar fields:**

| `InventoryItem` field | SRD source                                       | DDB source                                     |
| --------------------- | ------------------------------------------------ | ---------------------------------------------- |
| `itemType`            | `equipment_categories[0].name`                   | `type.typeName`                                |
| `itemSubtype`         | _(derived from equipment subcategory)_           | `subType`                                      |
| `weight`              | `weight`                                         | `weight`                                       |
| `costGp`              | `cost.quantity` + `cost.unit` (normalised to GP) | `definition.cost` (normalised to GP)           |
| `description`         | `description`                                    | `definition.notes`                             |
| `damage`              | `damage.damage_dice` + `damage.damage_type.name` | `damage.diceString` + `damage.damageType.name` |

**`properties[]` assembly** — entries appended in this order:

| What is merged              | SRD source                       | DDB source                                  | Appended as              |
| --------------------------- | -------------------------------- | ------------------------------------------- | ------------------------ |
| Weapon properties           | `properties[].name`              | `definition.properties[].name`              | `"Finesse"`, `"Nick"`, … |
| Ranged attack range         | `range.normal` / `range.long`    | `definition.range` / `definition.longRange` | `"Range (60/120)"`       |
| Thrown weapon range         | `throw_range.normal` / `.long`   | `definition.throwRange` / `.throwLongRange` | `"Thrown (20/60)"`       |
| Versatile two-handed damage | `two_handed_damage.damage_dice`  | two-handed damage dice string               | `"Versatile (1d10)"`     |
| Armor class                 | `armor_class.base` + subcategory | `definition.armorClass` + `type.typeName`   | `"Light Armor (AC 11)"`  |

**Examples by item type:**

| Item       | `damage`       | `properties`                                         |
| ---------- | -------------- | ---------------------------------------------------- |
| Longsword  | `1d8 slashing` | `["Versatile (1d10)"]`                               |
| Dagger     | `1d4 piercing` | `["Finesse", "Light", "Nick", "Thrown (20/60)"]`     |
| Longbow    | `1d8 piercing` | `["Ammo", "Heavy", "Two-Handed", "Range (150/600)"]` |
| Leather    | _(none)_       | `["Light Armor (AC 11)"]`                            |
| Chain Mail | _(none)_       | `["Heavy Armor (AC 16)", "Stealth Disadvantage"]`    |
| Caltrops   | _(none)_       | _(none — gear, no combat properties)_                |

### 2.2 Currency

```ts
interface CurrencyWallet {
  id: string
  campaignId: string
  ownerId: string // characterId or 'party'
  ownerType: 'CHARACTER' | 'PARTY'
  pp: number // platinum
  gp: number // gold
  ep: number // electrum
  sp: number // silver
  cp: number // copper
  updatedAt: Date
}
```

### 2.3 PendingExtensionSync

Created only when the campaign's `extensionSyncConflictResolution` setting is `PROMPT` and an incoming extension sync value conflicts with an existing record (see §12.3). Holds the conflicting change until the DM approves or rejects it.

```ts
interface PendingExtensionSync {
  id: string
  campaignId: string
  characterId: string
  externalSource: string // e.g. 'DDB'
  externalId: string // item externalId, or 'currency' for a wallet conflict
  kind: 'ITEM' | 'CURRENCY'
  incomingPayload: Partial<InventoryItem> | Partial<CurrencyWallet>
  existingSnapshot: Partial<InventoryItem> | Partial<CurrencyWallet> // value at time of conflict, for diff display
  createdAt: Date
  expiresAt: Date // createdAt + 24h
}
```

### 2.4 InventoryHistoryEntry

```ts
interface InventoryHistoryEntry {
  id: string
  campaignId: string
  sessionId: string | null // null = outside active session
  actorUserId: string
  actorCharacterId: string | null
  action: 'ADD' | 'REMOVE' | 'TRANSFER' | 'LOOT_SPLIT'
  itemName: string
  quantity: number
  fromOwner: string | null // characterId, 'party', or null (new item)
  toOwner: string | null // characterId, 'party', or null (dropped)
  currencyDelta?: Partial<CurrencyWallet> // populated for currency transfers
  timestamp: Date
  chatMessageId: string | null // linked system message, null if outside ACTIVE session
}
```

---

## 3. SRD Integration

### 3.1 Campaign Setting

DMs choose the SRD ruleset in Campaign Settings. The selected ruleset determines which API endpoint is called for item search autocomplete:

| Ruleset | Base URL                            |
| ------- | ----------------------------------- |
| 2014    | `https://www.dnd5eapi.co/api/2014/` |
| 2024    | `https://www.dnd5eapi.co/api/2024/` |

The setting is stored as `campaign.srdRuleset: '2014' | '2024'`. Default: `'2014'`.

### 3.2 Item Search

When a user types an item name in the inventory panel or in a chat command argument, a debounced autocomplete queries `GET /api/srd/items?q={query}` — a backend proxy that forwards to the appropriate SRD endpoint based on `campaign.srdRuleset`. The backend proxy caches responses (TTL 24h) to avoid rate-limit exposure and handles network unavailability gracefully (autocomplete degrades silently; free-text entry is always available).

SRD item fields stored locally: `index`, `name`. The full item description is fetched on demand when the user opens an item detail view.

### 3.3 Custom Items

Items not found in the SRD can be added as free-text. `source: 'CUSTOM'`, `srdIndex` omitted. Custom items support the same `name`, `quantity`, `notes` fields as SRD-backed items.

---

## 4. Party Inventory — Permission Model

The default behaviour and DM-configurable overrides:

| Action                                           | Default        | DM Can Change?             |
| ------------------------------------------------ | -------------- | -------------------------- |
| Players use `/take` (Party → Character)          | **ON**         | Yes — per campaign setting |
| Players use `/give` to Party (Character → Party) | **ON**         | Yes — per campaign setting |
| Players use `/loot` (add new item to Party)      | **OFF**        | Yes — per campaign setting |
| DM uses `/loot`, `/loot-split`                   | Always allowed | No                         |
| DM moves any item between any owners             | Always allowed | No                         |

Campaign settings path: `Campaign Settings → Inventory → Player Permissions`.

---

## 5. UI: INVENTORY Right-Rail Tab

A new **INVENTORY** tab is added to the session right-rail dock, between PARTY and ROOMS in the canonical tab order.

### 5.1 Role Visibility

| Role      | Visibility                                                                                |
| --------- | ----------------------------------------------------------------------------------------- |
| DM        | Full access: own "DM notes" bag, all character inventories, party inventory, full history |
| Player    | Own character inventory + party inventory (subject to campaign settings) + own history    |
| Spectator | Read-only view of party inventory and all character inventories                           |

### 5.2 Panel Layout

Items are grouped into sections. Each container item forms a collapsible section for its contents. Top-level (un-containerised) items appear in an uncollapsed default section below the containers.

```text
┌──────────────────────────────────────────────────────┐
│  INVENTORY                                   [+Add]  │
│  ──────────────────────────────────────────────────  │
│  [Party] [My Character] [▾]   ← DM sees per-player   │
│                                                      │
│  ☐  BACKPACK (3)                  12 lb  [▾ Hide]    │
│    ─────────────────────────────────────────────     │
│  ─  Longsword    Weapon · 3 lb   1    15 gp   [⋯]   │
│  ─  Shield       Armor · 6 lb    1    10 gp   [⋯]   │
│  ─  Torch        Gear · 1 lb     3     —      [⋯]   │
│                                                      │
│  ☐  POUCH (1)                      1 lb  [▾ Hide]    │
│    ─────────────────────────────────────────────     │
│  ─  Caltrops     Gear · 2 lb    20     1 gp   [⋯]   │
│                                                      │
│  ─  Dagger    Weapon · 1 lb     2     2 gp    [⋯]   │  ← top-level
│                                                      │
│  Currency                                            │
│  GP: 42  SP: 15  CP: 200                             │
│                                                      │
│  [History ↗]                                         │
└──────────────────────────────────────────────────────┘
```

**Column layout (item rows):**

| Column | Source                           | Notes                         |
| ------ | -------------------------------- | ----------------------------- |
| Name   | `item.name`                      | Always shown                  |
| Tags   | `itemType` + weapon `properties` | Inline; e.g. `Weapon · Light` |
| Weight | `item.weight`                    | In lb; `—` for CUSTOM items   |
| Qty    | `item.quantity`                  | Always shown                  |
| Cost   | `item.costGp`                    | Shown in GP; `—` if unknown   |

Full item detail (damage, description, range, armor class, all properties, notes) opens in a Radix Popover on row click — see §5.6.

### 5.3 Item Actions

Clicking `[⋯]` on an item opens an inline action menu:

- **View details** — opens the item detail popper (§5.6)
- **Move to container** — place item inside a container owned by the same owner; containers are listed; disabled if item is itself a container
- **Remove from container** — moves item to top-level (keeps same owner)
- **Move to…** — transfer to another character or to/from party (role-gated by campaign settings); if the item is a container, all contents transfer atomically
- **Edit notes** — free-text annotation (available for all items including CUSTOM)
- **Remove** — drop item (requires confirmation); if item is a container with contents, confirmation warns that all contents will also be removed

### 5.4 Inventory History Log

The history log is accessible via the **History ↗** button (opens an overlay within the INVENTORY panel). It shows a reverse-chronological list of all `InventoryHistoryEntry` records for the campaign, filterable by:

- Character / Party
- Date range
- Item name
- Action type (ADD, REMOVE, TRANSFER, LOOT_SPLIT)

Each entry shows: timestamp, actor, action, item, quantity, from/to owner, and a link to the chat message (if in session).

---

### 5.5 Currency Transfers

The currency area in the INVENTORY panel exposes three actions per wallet/purse:

| Action       | Description                                                                     |
| ------------ | ------------------------------------------------------------------------------- |
| **Add**      | Credit the wallet/purse from an external source (loot, sale proceeds, DM award) |
| **Remove**   | Debit the wallet/purse (purchase, expenditure) without a destination            |
| **Transfer** | Move currency between two owners with both sides balanced atomically            |

**Rules:**

- The form always shows the current balance of **both** source and destination before the user confirms.
- **Remove** and **Transfer** amounts are hard-capped at the available balance per denomination. The UI disables submission and the API returns `400` (with a per-denomination breakdown) if the amount would produce a negative balance.
- For **Transfer**, only online players are shown as eligible character targets. Offline players' wallets cannot be credited unattended — they pull from the party purse on rejoin instead.
- DM can add/remove/transfer on behalf of any owner (party or any character).
- Players can add/remove from their own wallet. Players can also transfer **to** party or any online player, and can **take** from the party purse — both subject to the same campaign permission gate as `/take`.

**UI pattern (modal / inline form):**

```text
┌──────────────────────────────────────────────────┐
│  Transfer Currency                               │
│  ──────────────────────────────────────────────  │
│  From:  [Tavita's Wallet]   Current: 12gp 5sp    │
│  To:    [Party Purse]       Current: 200gp 0sp   │
│                                                  │
│  PP [0]  GP [10]  EP [0]  SP [0]  CP [0]         │
│                                                  │
│  [Transfer]  [Cancel]                            │
└──────────────────────────────────────────────────┘
```

### 5.6 Container Drag-and-Drop

Items can be reorganised via drag-and-drop within the INVENTORY panel.

| Drag source           | Drop target                             | Outcome                                                             |
| --------------------- | --------------------------------------- | ------------------------------------------------------------------- |
| Item (non-container)  | Container section header or body        | Move item into that container (`containerId` updated)               |
| Item (non-container)  | Top-level area (outside any container)  | Remove from container, promote to top-level                         |
| Container             | Another owner's tab (Party ↔ Character) | Transfer container + all contents atomically                        |
| Item inside container | Another owner's tab                     | Transfer single item; it becomes top-level on the destination owner |

**Constraints enforced by both UI and backend:**

- Containers cannot be dropped onto another container (nesting prohibited).
- Items cannot be dragged between owners unless role permissions allow the transfer.
- On drop, the UI optimistically reorders then waits for the WS event to confirm. If the API rejects, the item snaps back and a toast is shown.

### 5.7 Item Detail Popper

Clicking any item row (outside the `[⋯]` action trigger) opens a Radix Popover with the item's full detail. Content varies by `source`:

**SRD / EXTERNAL items:**

```text
┌─────────────────────────────────────────────┐
│  Longsword                    Weapon · 3 lb  │
│  Martial Melee                    Cost: 15gp  │
│  ───────────────────────────────────────────  │
│  Damage:     1d8 slashing                     │
│  Properties: Versatile (1d10)                 │
│  ───────────────────────────────────────────  │
│  A versatile weapon that can be wielded       │
│  one- or two-handed.                          │
│  ───────────────────────────────────────────  │
│  Notes: [Heirloom — belonged to my father   ] │
│                                    [Save]     │
└─────────────────────────────────────────────┘
```

**CUSTOM items:**

```text
┌─────────────────────────────────────────────┐
│  Cursed Amulet                               │
│  ───────────────────────────────────────────  │
│  Notes: [Found in the ruins of Thyrin Keep ] │
│                                    [Save]     │
└─────────────────────────────────────────────┘
```

Fields shown only when populated: Damage, Properties, Description. Weight and cost always shown when present.

## 6. Chat Commands

See `docs/subsystems/CHAT-SYSTEM.md` §9.3 for the full command table. Inventory-specific behaviour:

### `/loot-random [CR] [Rarity?] [hoard?]` (DM only) ✅ implemented

Generates randomised post-combat loot and adds everything directly to the Party Inventory.

**Arguments:**

| Argument | Required | Values                                                                              | Default                  |
| -------- | -------- | ----------------------------------------------------------------------------------- | ------------------------ |
| `CR`     | Yes      | `0`–`30`                                                                            | —                        |
| `Rarity` | No       | `mundane` / `common` / `uncommon` / `rare` / `very-rare` / `legendary` / `artifact` | Auto-selected by CR band |
| `hoard`  | No       | keyword flag                                                                        | Off — individual loot    |

**Behaviour:**

- **Coins** — non-hoard uses the DMG Individual Treasure table (d100 per roll, N rolls ≈ 50–75% of connected-player count); `hoard` uses the DMG Treasure Hoard table scaled by player count.
- **Items** — drawn from static SRD 5.1 item lists in `loot-tables.ts`, weighted by a CR-biased rarity roll. Rarity arg caps the maximum tier that can be selected.
- **Quantity scaling** — both coins and item count are multiplied by `clamp(CR / avgLevel, 0.5, 2.0)`, where `avgLevel` is the ceiling-average of connected players' character levels (falls back to CR when no character levels are set). Non-hoard generates 50–75% × player count items; hoard generates 150–300% × player count items.
- **Output** — all items are added to Party Inventory via `addInventoryItem` (one call per item); coins added via `adjustCurrency`; both broadcast `INVENTORY:ITEM_ADDED` / `INVENTORY:CURRENCY_CHANGED` to the campaign. A single `[Loot]` system chat message summarises the drop in the current room.

**Implementation files:**

- `apps/backend/src/services/inventory/loot-tables.ts` — static SRD item lists (D&D 5e SRD 5.1 CC-BY 4.0) and DMG coin-table functions
- `apps/backend/src/services/inventory/loot-random.service.ts` — arg parser, rarity roller, coin generator, item generator, summary formatter
- `apps/backend/src/api/chat-command.routes.ts` — `handleLootRandomCommand` handler
- `packages/shared/types/chatCommands.ts` — command registered (DM, ACTIVE state)

**Examples:**

```text
/loot-random 5               → individual CR 5 loot, auto rarity (up to uncommon)
/loot-random 12 rare         → CR 12 loot, magic items up to Rare
/loot-random 8 uncommon hoard → CR 8 hoard pile, items up to Uncommon, 150–300% quantity
/loot-random 3 mundane       → CR 3, mundane weapons/armor/gear only
```

### `/loot [item] [qty?]` (DM only)

Adds an item directly to Party Inventory. Generates a loot system message in the room's chat:
`[DM added {qty}× {item} to the party inventory]`

### `/loot-split [item] [qty?]` (DM only)

Proposes a loot distribution across all players currently in the room. A **Loot Split Card** appears in chat — each player sees their share and a one-click Accept button. Unaccepted shares revert to Party Inventory after 60 seconds. The DM sees a summary of who accepted.

### `/take [item] [qty?]`

Moves the named item from Party Inventory to the player's own character inventory. Fails with toast if the item is not in Party Inventory or quantity is insufficient.
Chat system message: `[{player} took {qty}× {item} from the party inventory]`

### `/give @{player|party} [item] [qty?]`

Moves the item from the sender's character inventory to the named player or to the party pool.
Chat system message: `[{sender} gave {qty}× {item} to {target}]`

### `/drop [item] [qty?]`

Removes the item from the sender's inventory (or party, if DM). Requires confirmation toast before executing.
Chat system message: `[{player} dropped {qty}× {item}]`

### Currency shorthand

All commands accept a currency argument as the item name using coin notation:

- `/give @party 10gp` — transfers 10 GP from character wallet to party purse
- `/take 5sp` — takes 5 SP from party purse to character wallet
- `/loot 200gp 50sp` — adds currency to party purse

---

## 7. WebSocket Events

All events are defined in `shared/events/inventory.ts`.

| Event                              | Trigger                                                    | Payload                                                                                |
| ---------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `INVENTORY:ITEM_ADDED`             | Item added to any inventory                                | `{ campaignId, ownerId, ownerType, item: InventoryItem }`                              |
| `INVENTORY:ITEM_REMOVED`           | Item removed or dropped                                    | `{ campaignId, ownerId, ownerType, itemId, quantity }`                                 |
| `INVENTORY:ITEM_UPDATED`           | Item metadata updated (notes, quantity, containerId, etc.) | `{ campaignId, ownerId, ownerType, item: InventoryItem }`                              |
| `INVENTORY:ITEM_TRANSFERRED`       | Single item moved between owners                           | `{ campaignId, fromOwner, toOwner, item: InventoryItem }`                              |
| `INVENTORY:CONTAINER_TRANSFERRED`  | Container + all contents moved between owners              | `{ campaignId, fromOwner, toOwner, container: InventoryItem, items: InventoryItem[] }` |
| `INVENTORY:LOOT_SPLIT_PROPOSED`    | DM initiates loot split                                    | `{ campaignId, sessionId, splitId, items, proposedShares }`                            |
| `INVENTORY:LOOT_SPLIT_ACCEPTED`    | Player accepts their share                                 | `{ campaignId, splitId, playerId, acceptedItems }`                                     |
| `INVENTORY:LOOT_SPLIT_EXPIRED`     | Split card timer expires                                   | `{ campaignId, splitId, revertedItems }`                                               |
| `INVENTORY:CURRENCY_CHANGED`       | Wallet or purse updated                                    | `{ campaignId, ownerId, ownerType, delta: CurrencyWallet }`                            |
| `INVENTORY:EXTENSION_SYNC_PENDING` | Extension sync produces a conflict under `PROMPT` policy   | `{ campaignId, characterId, pendingSyncId, kind: 'ITEM' \| 'CURRENCY', externalId }`   |

**Notes on new events:**

- `INVENTORY:ITEM_UPDATED` fires for any in-place mutation that does not change ownership: notes edits, quantity changes, `containerId` changes (drag-and-drop within the same owner), and extended field updates from extension sync.
- `INVENTORY:CONTAINER_TRANSFERRED` carries the full container item and all its contents in a single payload. Clients must replace the container and all matching `containerId` items atomically to avoid a flash of orphaned items.

WS dispatch rules:

- All `INVENTORY:*` events broadcast to all connected clients in the campaign session, **except** `INVENTORY:EXTENSION_SYNC_PENDING`, which is sent only to connected DM clients (see §12.3, §12.4).
- Backend emits only **after** PostgreSQL write succeeds.
- Spectators receive `ITEM_ADDED`, `ITEM_REMOVED`, `ITEM_UPDATED`, `ITEM_TRANSFERRED`, `CONTAINER_TRANSFERRED`, `CURRENCY_CHANGED` in read-only mode.

---

## 8. API Endpoints

> **Note on path prefixes:** the tables below use `/api/campaigns/:id/inventory/...` as originally
> designed, but the implemented router (`apps/backend/src/api/inventory.routes.ts`) is actually
> mounted at `/api/inventory/:campaignId/...`. The "Pending Extension Sync" endpoints below follow
> the real, implemented mount — see `docs/CONTRACTS.md` "Extension Inventory Sync Policy Contract".

### Party Inventory

| Method   | Path                                          | Description                                                    |
| -------- | --------------------------------------------- | -------------------------------------------------------------- |
| `GET`    | `/api/campaigns/:id/inventory/party`          | List all party inventory items                                 |
| `POST`   | `/api/campaigns/:id/inventory/party`          | Add item to party inventory (DM, or player if setting enabled) |
| `PUT`    | `/api/campaigns/:id/inventory/party/:itemId`  | Update quantity, notes, `containerId`, or extended fields      |
| `DELETE` | `/api/campaigns/:id/inventory/party/:itemId`  | Remove item; if container, also removes all contents           |
| `GET`    | `/api/campaigns/:id/inventory/party/currency` | Get party purse                                                |
| `PUT`    | `/api/campaigns/:id/inventory/party/currency` | Update party purse                                             |

### Character Inventory

| Method   | Path                                                      | Description                                               |
| -------- | --------------------------------------------------------- | --------------------------------------------------------- |
| `GET`    | `/api/campaigns/:id/inventory/character/:charId`          | List all character inventory items                        |
| `POST`   | `/api/campaigns/:id/inventory/character/:charId`          | Add item to character                                     |
| `PUT`    | `/api/campaigns/:id/inventory/character/:charId/:itemId`  | Update quantity, notes, `containerId`, or extended fields |
| `DELETE` | `/api/campaigns/:id/inventory/character/:charId/:itemId`  | Remove item; if container, also removes all contents      |
| `GET`    | `/api/campaigns/:id/inventory/character/:charId/currency` | Get character wallet                                      |
| `PUT`    | `/api/campaigns/:id/inventory/character/:charId/currency` | Update character wallet                                   |

**`containerId` update rules (applies to both party and character `PUT` endpoints):**

- Setting `containerId` to a valid container `id` within the same owner moves the item into that container.
- Setting `containerId` to `null` promotes the item to top-level.
- Attempting to set `containerId` on an item that is itself a container returns `400 CONTAINER_NESTING_FORBIDDEN`.
- Attempting to set `containerId` to an item that is not a container returns `400 NOT_A_CONTAINER`.
- `containerId` must reference an item owned by the same `ownerId`/`ownerType`; cross-owner `containerId` is rejected.

### Transfer

| Method | Path                                                      | Description                                                                                             |
| ------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/campaigns/:id/inventory/transfer`                   | Move item between owners; if item `isContainer`, atomically moves all contents too                      |
| `POST` | `/api/campaigns/:id/inventory/loot-split`                 | DM proposes a loot split                                                                                |
| `POST` | `/api/campaigns/:id/inventory/loot-split/:splitId/accept` | Player accepts their split share                                                                        |
| `POST` | `/api/campaigns/:id/inventory/transfer/currency`          | Atomic two-sided currency transfer between any two owners; validates available balance per denomination |

### SRD Proxy

| Method | Path                       | Description                                               |
| ------ | -------------------------- | --------------------------------------------------------- |
| `GET`  | `/api/srd/items?q={query}` | Search SRD items (proxied, cached, ruleset from campaign) |
| `GET`  | `/api/srd/items/:index`    | Fetch full SRD item detail                                |

### History

| Method | Path                                   | Description                        |
| ------ | -------------------------------------- | ---------------------------------- |
| `GET`  | `/api/campaigns/:id/inventory/history` | Paginated history log with filters |

### Pending Extension Sync (`PROMPT` conflict resolution only)

See §12.3 and [EXTENSION-INTEGRATION.md §5e](../extension/EXTENSION-INTEGRATION.md) for the policy that creates these records.

| Method | Path                                                         | Description                                                                 |
| ------ | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `GET`  | `/api/inventory/:campaignId/sync/pending`                    | List pending extension sync conflicts awaiting DM review (DM only)          |
| `POST` | `/api/inventory/:campaignId/sync/pending/:pendingId/approve` | Apply the pending change via the standard 4-layer contract (DM only)        |
| `POST` | `/api/inventory/:campaignId/sync/pending/:pendingId/reject`  | Discard the pending change, leaving the existing record untouched (DM only) |

---

## 9. 4-Layer State Contract

Every inventory mutation must follow the standard 4-layer contract:

1. **Validate** — check role, campaign settings, item existence, and quantity.
2. **Persist** — write to PostgreSQL (`InventoryItem`, `CurrencyWallet`, `InventoryHistoryEntry`). On failure: stop, surface error, retry up to 3×.
3. **Broadcast** — emit WS event after persistence succeeds. If session is `ACTIVE`, also emit `CHAT:MESSAGE_SENT` with the inventory system message.
4. **Update Zustand** — all clients update from WS payload via `inventorySlice`.

Redis is **not** used for inventory state (not presence/audio data). Zustand is treated as stale on reconnect; the panel rehydrates via the REST API on mount.

---

## 10. Zustand Slice

`inventorySlice` in `apps/frontend/src/store/`:

```ts
interface InventoryState {
  partyItems: InventoryItem[] // flat list; containerId links items to containers
  partyWallet: CurrencyWallet
  characterItems: Record<string, InventoryItem[]> // keyed by characterId; also flat
  characterWallets: Record<string, CurrencyWallet>
  pendingLootSplits: LootSplitProposal[]
  isLoading: boolean
}
```

Items are stored as a **flat array** — the container hierarchy is derived at render time by grouping on `containerId`. Do not nest items in a tree structure in state; derived trees cause unnecessary snapshot churn on every item update.

**Derived selectors (define outside components as stable references):**

```ts
// Returns container items first (sorted by name), then top-level items
const EMPTY_ITEMS: InventoryItem[] = []
const selectPartyContainers = (state) => state.partyItems.filter((i) => i.isContainer)

const selectItemsInContainer = (containerId: string) => (state) =>
  state.partyItems.filter((i) => i.containerId === containerId)

const selectTopLevelPartyItems = (state) =>
  state.partyItems.filter((i) => !i.containerId && !i.isContainer)
```

**WS handler responsibilities:**

- `INVENTORY:ITEM_ADDED` → append to appropriate `partyItems` or `characterItems[charId]` array
- `INVENTORY:ITEM_REMOVED` → filter out by `itemId`; if item was a container, also filter out all items with matching `containerId`
- `INVENTORY:ITEM_UPDATED` → replace matching item in-place (covers `containerId` changes from drag-and-drop and extended field updates from extension sync)
- `INVENTORY:ITEM_TRANSFERRED` → remove from source owner's array, upsert into destination owner's array; `containerId` resets to `null` on transfer unless specified in payload
- `INVENTORY:CONTAINER_TRANSFERRED` → apply `ITEM_TRANSFERRED` logic for the container and then for every item in the payload's `items` array, in a single state update

Selectors must not return new array/object references when underlying data is unchanged (use `useShallow` or stable empty constants).

---

## 11. Persistence Scope

| Data                            | Scope                                            |
| ------------------------------- | ------------------------------------------------ |
| `InventoryItem` records         | Campaign-scoped — survive all session boundaries |
| `CurrencyWallet` records        | Campaign-scoped                                  |
| `InventoryHistoryEntry` records | Campaign-scoped, permanent                       |
| Loot split proposals            | Session-scoped — expire after 60s or session end |

---

## 12. External Sync (Extension Integration)

The browser extension can push character inventory and currency state from external VTTs (D&D Beyond, Roll20, etc.) into VTT-Chat via `POST /api/integrations/external/sync`. All synced items carry `source: 'EXTERNAL'` and are tracked by `externalId` + `externalSource`.

### 12.1 Item Sync

Items are **upserted** by `(campaignId, characterId, externalSource, externalId)`:

- If an item with the matching `externalSource`+`externalId` already exists on the character, its `name` and `quantity` are updated in place.
- If no match is found, a new item is created with `source: 'EXTERNAL'`.
- Items not present in the sync payload are **left untouched** (merge semantics — the extension does not delete items).

The `inventoryUpdate` payload:

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
        "notes": "Heirloom blade",
        "weight": 3,
        "itemType": "Weapon",
        "itemSubtype": "Martial Melee",
        "costGp": 15,
        "damage": "1d8 slashing",
        "properties": ["Versatile (1d10)"],
        "description": "A versatile sword, wielded one- or two-handed."
      },
      {
        "externalId": "ddb-item-789",
        "name": "Dagger",
        "quantity": 2,
        "srdKey": "dagger",
        "srdCategory": "EQUIPMENT",
        "weight": 1,
        "itemType": "Weapon",
        "itemSubtype": "Simple Melee",
        "costGp": 2,
        "damage": "1d4 piercing",
        "properties": ["Finesse", "Light", "Nick", "Thrown (20/60)"]
      }
    ]
  }
}
```

**Extended field rules for item sync:**

- All extended fields (`weight`, `itemType`, `itemSubtype`, `costGp`, `damage`, `properties`, `description`) are **optional**. Omitting a field leaves the persisted value unchanged.
- Sending `null` explicitly clears the field.
- Extended fields are ignored for CUSTOM items created inside VTT-Chat — they are only applied when `externalId` is present.
- The `srdKey` field is unchanged; it continues to identify the SRD item for detail lookups. Extended fields are a cache of the data the SRD (or DDB) would return on a detail fetch, reducing the need for on-demand lookups.
- Container detection from the extension: if the synced item's `name` (case-insensitive) or `srdKey` matches a known container type (`backpack`, `chest`, `pouch`, `sack`, `basket`), the backend sets `isContainer = true` automatically. The extension does not need to send an `isContainer` field.

### 12.2 Currency Sync

Currency is synced as **absolute values** — the wallet is SET to the provided amounts, not adjusted by a delta. The previous balance is compared and a signed delta is recorded in the history log for auditability.

The `currencyUpdate` payload:

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

Partial wallets are supported — omitting a denomination leaves it unchanged.

### 12.3 Sync Policy

Extension inventory sync is governed by two layers of campaign-scoped policy, both enforced by the backend on every `POST /api/integrations/external/sync` call.

#### Layer 1 — Access Gate (`extensionSyncPolicy`)

The existing top-level policy controls whether extension sync is permitted at all, and for which roles:

| Value            | Who can sync (character, inventory, currency)     |
| ---------------- | ------------------------------------------------- |
| `NONE`           | Nobody — all extension sync payloads are rejected |
| `DM_ONLY`        | DM only                                           |
| `DM_AND_PLAYERS` | DM and players                                    |

When `extensionSyncPolicy` is `NONE`, no inventory or currency sync request is processed regardless of the Layer 2 settings below.

#### Layer 2 — Inventory-Specific Controls

When `extensionSyncPolicy` permits the caller, four additional settings provide granular control over inventory and currency sync specifically:

| Setting                             | Type                                 | Default     | Controls                                                                                                                                                                          |
| ----------------------------------- | ------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extensionInventorySyncEnabled`     | boolean                              | `true`      | When `false`, all `inventoryUpdate` payloads are rejected even if the caller is permitted by Layer 1.                                                                             |
| `extensionCurrencySyncEnabled`      | boolean                              | `true`      | When `false`, all `currencyUpdate` payloads are rejected.                                                                                                                         |
| `extensionPartyInventorySyncAccess` | `DISABLED \| DM_ONLY \| ALL_PLAYERS` | `DM_ONLY`   | Who may write to party inventory/purse via extension sync. Character inventory is always writable by the character's own player (subject to `extensionInventorySyncEnabled`).     |
| `extensionSyncConflictResolution`   | `OVERWRITE \| IGNORE \| PROMPT`      | `OVERWRITE` | How conflicts (incoming value differs from persisted state) are handled. `OVERWRITE` applies immediately; `IGNORE` discards the incoming value; `PROMPT` queues it for DM review. |

See [EXTENSION-INTEGRATION.md §5e](../extension/EXTENSION-INTEGRATION.md) for the full enforcement contract, partial application rules, and the `PROMPT` pending-sync queue flow.

### 12.4 WS Broadcast

For `OVERWRITE` and `IGNORE` conflict resolution, the sync endpoint does **not** currently broadcast individual `INVENTORY:ITEM_ADDED` / `INVENTORY:CURRENCY_CHANGED` events per synced item. The frontend panel rehydrates from the REST API on next mount or panel focus. A future enhancement may batch-broadcast a `INVENTORY:EXTERNAL_SYNC_APPLIED` event.

For `PROMPT` conflict resolution, each conflicting value broadcasts `INVENTORY:EXTENSION_SYNC_PENDING` to DM clients only (see §7, §2.3). Once a pending sync is approved via `POST .../sync/pending/:pendingId/approve` (§8), the change applies through the standard 4-layer contract and broadcasts the normal `INVENTORY:ITEM_ADDED` / `INVENTORY:CURRENCY_CHANGED` event like any other inventory mutation.

---

## 13. Related Docs

- [docs/subsystems/CHAT-SYSTEM.md](CHAT-SYSTEM.md) — Chat commands §9
- [docs/CONTRACTS.md](../CONTRACTS.md) — Inventory API and WS event contracts (to be added)
- [docs/architecture/DATA-MODEL.md](../architecture/DATA-MODEL.md) — Prisma schema additions for `InventoryItem`, `CurrencyWallet`, `InventoryHistoryEntry`
- [docs/extension/EXTENSION-INTEGRATION.md](../extension/EXTENSION-INTEGRATION.md) — External sync protocol §5b, §5d

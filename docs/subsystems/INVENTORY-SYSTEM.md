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
  source: 'SRD' | 'CUSTOM'
  srdIndex?: string // SRD item index (e.g. 'longsword'), populated when source = 'SRD'
  srdRuleset?: '2014' | '2024'
  notes?: string // free-text DM/player annotation
  addedBy: string // userId
  addedAt: Date
  updatedAt: Date
}
```

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

### 2.3 InventoryHistoryEntry

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
| 2024    | `https://www.dnd5eapi.co/api2024/`  |

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

```
┌─────────────────────────────┐
│  INVENTORY           [+Add] │
│  ─────────────────────────  │
│  [Party] [My Character] [▾] │  ← tabs; DM also sees per-player tabs
│                             │
│  Item list                  │
│  ─ item name      qty   [⋯] │
│  ─ item name      qty   [⋯] │
│                             │
│  Currency                   │
│  GP: 42  SP: 15  CP: 200   │
│                             │
│  [History ↗]                │  ← opens inventory history log overlay
└─────────────────────────────┘
```

### 5.3 Item Actions

Clicking `[⋯]` on an item opens an inline action menu:

- **Move to…** — transfer to another character or to/from party (role-gated by campaign settings)
- **Edit notes** — free-text annotation
- **Remove** — drop item (requires confirmation)

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

For **Add** and **Remove**, "From / To" collapses to a single "Wallet / Purse" label showing the current balance. Denomination fields follow the same layout. Remove fields are disabled per denomination when the balance for that coin type is 0.

**Atomic guarantee:** The backend applies both the debit and credit in a single PostgreSQL transaction. If either write fails, neither side changes. `INVENTORY:CURRENCY_CHANGED` fires for both affected owners after the transaction commits.

---

## 6. Chat Commands

See `docs/subsystems/CHAT-SYSTEM.md` §9.3 for the full command table. Inventory-specific behaviour:

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

| Event                           | Trigger                     | Payload                                                     |
| ------------------------------- | --------------------------- | ----------------------------------------------------------- |
| `INVENTORY:ITEM_ADDED`          | Item added to any inventory | `{ campaignId, ownerId, ownerType, item: InventoryItem }`   |
| `INVENTORY:ITEM_REMOVED`        | Item removed or dropped     | `{ campaignId, ownerId, ownerType, itemId, quantity }`      |
| `INVENTORY:ITEM_TRANSFERRED`    | Item moved between owners   | `{ campaignId, fromOwner, toOwner, item: InventoryItem }`   |
| `INVENTORY:LOOT_SPLIT_PROPOSED` | DM initiates loot split     | `{ campaignId, sessionId, splitId, items, proposedShares }` |
| `INVENTORY:LOOT_SPLIT_ACCEPTED` | Player accepts their share  | `{ campaignId, splitId, playerId, acceptedItems }`          |
| `INVENTORY:LOOT_SPLIT_EXPIRED`  | Split card timer expires    | `{ campaignId, splitId, revertedItems }`                    |
| `INVENTORY:CURRENCY_CHANGED`    | Wallet or purse updated     | `{ campaignId, ownerId, ownerType, delta: CurrencyWallet }` |

WS dispatch rules:

- All `INVENTORY:*` events broadcast to all connected clients in the campaign session.
- Backend emits only **after** PostgreSQL write succeeds.
- Spectators receive `ITEM_ADDED`, `ITEM_REMOVED`, `ITEM_TRANSFERRED`, `CURRENCY_CHANGED` in read-only mode.

---

## 8. API Endpoints

### Party Inventory

| Method   | Path                                          | Description                                                    |
| -------- | --------------------------------------------- | -------------------------------------------------------------- |
| `GET`    | `/api/campaigns/:id/inventory/party`          | List all party inventory items                                 |
| `POST`   | `/api/campaigns/:id/inventory/party`          | Add item to party inventory (DM, or player if setting enabled) |
| `PUT`    | `/api/campaigns/:id/inventory/party/:itemId`  | Update quantity or notes                                       |
| `DELETE` | `/api/campaigns/:id/inventory/party/:itemId`  | Remove item from party inventory                               |
| `GET`    | `/api/campaigns/:id/inventory/party/currency` | Get party purse                                                |
| `PUT`    | `/api/campaigns/:id/inventory/party/currency` | Update party purse                                             |

### Character Inventory

| Method   | Path                                                      | Description                        |
| -------- | --------------------------------------------------------- | ---------------------------------- |
| `GET`    | `/api/campaigns/:id/inventory/character/:charId`          | List all character inventory items |
| `POST`   | `/api/campaigns/:id/inventory/character/:charId`          | Add item to character              |
| `PUT`    | `/api/campaigns/:id/inventory/character/:charId/:itemId`  | Update item                        |
| `DELETE` | `/api/campaigns/:id/inventory/character/:charId/:itemId`  | Remove item                        |
| `GET`    | `/api/campaigns/:id/inventory/character/:charId/currency` | Get character wallet               |
| `PUT`    | `/api/campaigns/:id/inventory/character/:charId/currency` | Update character wallet            |

### Transfer

| Method | Path                                                      | Description                                                                                             |
| ------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/campaigns/:id/inventory/transfer`                   | Move item between any two owners (validates permissions)                                                |
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
  partyItems: InventoryItem[]
  partyWallet: CurrencyWallet
  characterItems: Record<string, InventoryItem[]> // keyed by characterId
  characterWallets: Record<string, CurrencyWallet>
  pendingLootSplits: LootSplitProposal[]
  isLoading: boolean
}
```

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

## 12. Related Docs

- [docs/subsystems/CHAT-SYSTEM.md](CHAT-SYSTEM.md) — Chat commands §9
- [docs/CONTRACTS.md](../CONTRACTS.md) — Inventory API and WS event contracts (to be added)
- [docs/architecture/DATA-MODEL.md](../architecture/DATA-MODEL.md) — Prisma schema additions for `InventoryItem`, `CurrencyWallet`, `InventoryHistoryEntry`

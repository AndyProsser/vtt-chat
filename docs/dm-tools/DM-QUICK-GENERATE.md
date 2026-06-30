# DM Quick Generate — Chat Slash Commands

Status: Planned. Tracked as `W-DM-Quick-Generate` in ROADMAP.md.

DM-only chat commands that generate narrative content on demand. Each command resolves server-side, outputs a formatted system message in chat, and optionally persists the result to campaign data. The UX goal: DM types a single command mid-session and gets usable content within 200 ms — no tab switching, no prep required.

The pattern mirrors `/loot-random`: parse args → generate (static tables or AI) → persist → broadcast → system message.

---

## 1. Commands

### `/npc [type]`

Generates a named NPC with a brief description, personality hook, and speech quirk.

| Type keyword | Description                          |
| ------------ | ------------------------------------ |
| `guard`      | City/town guard, gate watch, patrol  |
| `barkeep`    | Tavern/inn owner or server           |
| `villager`   | Generic commoner                     |
| `peasant`    | Rural farm worker or serf            |
| `shopowner`  | General goods merchant               |
| `trader`     | Travelling merchant / caravan member |
| `noble`      | Minor lord, courtier, or socialite   |
| `thug`       | Street-level criminal or enforcer    |
| `cultist`    | Generic cult member                  |
| `random`     | Picks type at random, then generates |

**Output (system message):**

```
[NPC] Marta Fenwick — Barkeep
Stout and sharp-eyed. Wipes the same mug constantly.
"I don't want trouble. Not again."
```

**Persistence**: saved to campaign as a lightweight `NpcRecord` (name, type, blurb, session). Surfaced later in a DM-only NPC panel (out of scope for this item).

---

### `/place [type]`

Generates a named location with a brief atmosphere line and one notable feature.

| Type keyword      | Description                               |
| ----------------- | ----------------------------------------- |
| `tavern`          | Inn, drinking hall, roadside stop         |
| `shop`            | General store, trade goods                |
| `smithy`          | Blacksmith or weaponsmith                 |
| `temple`          | Shrine, chapel, or major temple           |
| `cave`            | Natural cave entrance or cavern           |
| `dungeon-room`    | Single generic dungeon chamber            |
| `house`           | Ordinary dwelling (urban or rural)        |
| `market`          | Open-air stall market or bazaar           |
| `forest-clearing` | Natural outdoor resting point             |
| `ruin`            | Collapsed structure, overgrown or flooded |
| `random`          | Picks type at random, then generates      |

**Output (system message):**

```
[Place] The Rusted Spur — Tavern
Low beams, cheap tallow candles. Smells of sawdust and old ale.
Notable: A board of job postings, most torn or weather-stained.
```

**Persistence**: saved as a `PlaceRecord` (name, type, blurb, session). Surfaced later in a DM-only location panel (out of scope for this item).

---

### `/encounter [type]`

Generates a quick encounter framing — not stat blocks, just the narrative setup and stakes.

| Type keyword | Description                                     |
| ------------ | ----------------------------------------------- |
| `ambush`     | Enemies waiting in cover                        |
| `patrol`     | Guards or soldiers on a predictable route       |
| `escort`     | NPC needing protection to a destination         |
| `pursuit`    | Party is being chased                           |
| `standoff`   | Tense confrontation, neither side attacks first |
| `random`     | Random type from the above                      |

**Output (system message):**

```
[Encounter] Ambush — Road Bandits
Six figures step from the treeline. The leader holds a crossbow.
"Coin or blood. Your choice."
Terrain: Narrow road, dense brush on both sides. Torchlight only.
```

**Not persisted** — encounter framing is ephemeral; no DB write.

---

### `/trap [type]`

Generates a trap description with trigger, effect, and DC.

| Type keyword | Description                                  |
| ------------ | -------------------------------------------- |
| `dart`       | Pressure-plate dart trap                     |
| `pit`        | Concealed pit, spiked or plain               |
| `alarm`      | Bell, glyph, or tripwire that alerts enemies |
| `poison-gas` | Sealed chamber or vial trap                  |
| `net`        | Ceiling-mounted net drop                     |
| `random`     | Random type                                  |

**Output (system message):**

```
[Trap] Concealed Pit
Trigger: Pressure plate under the flagstone (Perception DC 14).
Effect: 10-ft drop, 3d6 bludgeoning. Spiked floor (1d6 piercing).
Disable: Thieves' Tools DC 13.
```

**Not persisted** — ephemeral.

---

### `/rumor`

Generates a single tavern rumor or street-level plot hook. No type argument — always random. Useful for populating ambient world-building mid-session.

**Output (system message):**

```
[Rumor] A shepherd north of Dawnford swears he saw torches moving through the Ashwood three nights running. No one goes into the Ashwood after dark.
```

**Not persisted** — ephemeral.

---

### `/weather [region]`

Generates a weather description appropriate for the region type.

| Region keyword | Description                                      |
| -------------- | ------------------------------------------------ |
| `coastal`      | Sea breeze, fog, salt air                        |
| `mountain`     | Thin air, sudden storms, snow above the treeline |
| `forest`       | Canopy cover, damp, wind reduced                 |
| `plains`       | Open sky, exposed, long-distance visibility      |
| `desert`       | Heat, sandstorm risk, no cloud cover             |
| `arctic`       | Blizzard risk, whiteout, extreme cold            |
| `underground`  | No weather — cave air, dripping, temperature     |
| `random`       | Picks region and condition at random             |

**Output (system message):**

```
[Weather] Coastal — Overcast
Grey sky, sea wind from the southwest. Smell of rain. Visibility good but light failing early. A storm is building offshore.
```

**Not persisted** — ephemeral.

---

## 2. AI vs Static Tables

Each command supports two resolution modes, selected automatically based on whether an AI provider is configured (see [AI-WRITING-ASSISTANT.md](../ai/AI-WRITING-ASSISTANT.md) for provider contract).

| Mode              | When used                 | Output character                                                                         |
| ----------------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| **Static tables** | No AI provider configured | Randomised from curated D&D 5e-compatible tables; deterministic tone                     |
| **AI-generated**  | AI provider available     | Free-form prose; campaign context injected (setting, tone, session summary if available) |

Static table mode must be fully functional at ship. AI mode is an enhancement. The command interface and output format are identical from the DM's perspective.

### AI prompt contract (when AI-generated)

Prompts are constructed server-side only. The DM's command args and the following campaign context are injected:

- Campaign name and setting description (if set)
- Session tone/genre tags (if set)
- Most recent session summary paragraph (if transcription pipeline available)

**Never injected**: player notes, Whisper chat, DM-private notes, character backstory marked private.

Prompt output is sanitised (length cap, no markdown except line breaks) before being inserted into the system message.

---

## 3. Architecture

### 3.1 Command registration

Extend `ChatCommandName` in `packages/shared/types/chatCommands.ts`:

```ts
| 'npc' | 'place' | 'encounter' | 'trap' | 'rumor' | 'weather'
```

Each command definition:

```ts
{
  name: 'npc',
  slash: '/npc',
  syntax: '/npc [type]',
  description: 'Generate a quick NPC.',
  example: '/npc barkeep',
  roles: [Role.DM],
  availableInStates: [SessionState.ACTIVE, SessionState.PAUSED],
}
```

Commands are DM-only and restricted to `ACTIVE` / `PAUSED` states (no greenroom or post-session generation).

### 3.2 Backend handler pattern

Each command follows the pattern established by `handleLootRandomCommand` in `apps/backend/src/api/chat-command.routes.ts`:

1. Parse and validate `args` (type keyword; default to `random` if omitted)
2. Resolve via static tables or AI provider
3. For persistent types (`npc`, `place`): write `NpcRecord` / `PlaceRecord` to DB
4. Send system message via `sendMessage()` with `MessageType.SYSTEM`
5. Broadcast `CHAT:MESSAGE_SENT` — no new WS event required for ephemeral types
6. For persistent types: also broadcast `NPC:CREATED` / `PLACE:CREATED`
7. Return `201` with the generated content

Static generation logic lives in dedicated service files:

| Service          | Path                                                     |
| ---------------- | -------------------------------------------------------- |
| NPC tables       | `apps/backend/src/services/generate/npc-tables.ts`       |
| Place tables     | `apps/backend/src/services/generate/place-tables.ts`     |
| Encounter tables | `apps/backend/src/services/generate/encounter-tables.ts` |
| Trap tables      | `apps/backend/src/services/generate/trap-tables.ts`      |
| Rumor tables     | `apps/backend/src/services/generate/rumor-tables.ts`     |
| Weather tables   | `apps/backend/src/services/generate/weather-tables.ts`   |
| AI resolver      | `apps/backend/src/services/generate/ai-resolver.ts`      |

### 3.3 Data model (persistent types only)

`NpcRecord` and `PlaceRecord` are lightweight campaign-scoped records. They are not character sheets — just the quick-gen snapshot.

```ts
// NpcRecord
{
  id: UUID
  campaignId: UUID
  sessionId: UUID // session when generated
  type: string // 'barkeep' | 'guard' | ...
  name: string
  blurb: string // 2–3 line output
  generatedBy: 'static' | 'ai'
  createdAt: DateTime
}

// PlaceRecord
{
  id: UUID
  campaignId: UUID
  sessionId: UUID
  type: string
  name: string
  blurb: string
  generatedBy: 'static' | 'ai'
  createdAt: DateTime
}
```

### 3.4 WS events (persistent types only)

Defined in `packages/shared/events/dm-generate.ts`:

- `NPC:CREATED` — payload: `{ id, name, type, blurb, sessionId }`
- `PLACE:CREATED` — payload: `{ id, name, type, blurb, sessionId }`

Ephemeral commands (`encounter`, `trap`, `rumor`, `weather`) produce no new WS event; the system message via `CHAT:MESSAGE_SENT` is sufficient.

---

## 4. Future scope (not in this item)

- **DM panel** — browsable list of generated NPCs and places per campaign, with edit and tag support.
- **Pin to notes** — one-click to append generated content to a session note.
- **Player reveal** — DM can "reveal" an NPC or place to players, adding it to a shared compendium view.
- **Cross-command linking** — `/encounter` can reference a previously generated `/place` by name.
- **Portrait generation** — AI image generation for NPC portraits (requires separate image provider gate).

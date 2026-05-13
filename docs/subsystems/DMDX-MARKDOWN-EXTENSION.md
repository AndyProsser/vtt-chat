# 🧙‍♂️ D&D Markdown Extension Specification (DMDX)

A lightweight Markdown extension for tabletop RPG notes.
All syntax is **optional**, **non‑breaking**, and **backwards‑compatible** with standard Markdown.

---

## 1. Block Types

All DMDX blocks use fenced code blocks with a **type identifier**.

````markdown
```<type>
<content>
```
````

Your renderer detects `<type>` and applies custom logic.

Supported types:

- **npc** — Non‑player characters
- **monster** — Statblocks
- **encounter** — Combat or social encounters
- **loot** — Treasure lists
- **spell** — Spell descriptions
- **session** — Session logs
- **roll** — Dice expressions
- **map** — Embedded images or maps
- **timeline** — Mermaid‑style sequences

All content inside blocks is **YAML‑like**, but you can parse it with a permissive key/value reader.

---

## 2. NPC Block

````markdown
```npc
name: Elira Dawnwhisper
race: Elf
class: Wizard
level: 5
alignment: CG
tags: quest-giver, arcane, friendly
portrait: attachment://elira.png
notes: >
  A wandering mage who seeks lost artifacts.
```
````

### Rendering expectations

- Portrait displayed if present
- Tags become chips/badges
- Notes rendered as Markdown

---

## 3. Monster Block (Statblock)

````markdown
```monster
name: Goblin
size: Small
type: Humanoid (goblinoid)
ac: 15
hp: 7
speed: 30 ft
abilities:
  str: 8
  dex: 14
  con: 10
  int: 10
  wis: 8
  cha: 8
actions:
  - name: Scimitar
    to_hit: +4
    damage: 1d6+2 slashing
  - name: Shortbow
    to_hit: +4
    damage: 1d6+2 piercing
```
````

---

## 4. Encounter Block

````markdown
```encounter
name: Wolves in the Snow
difficulty: medium
environment: tundra
creatures:
  - Wolf x3
  - Dire Wolf x1
objectives:
  - Survive the ambush
  - Track the alpha wolf
loot_ref: wolf_loot
map_ref: snow_map
```
````

### Notes

- `loot_ref` and `map_ref` link to other blocks in the same note
- You can render this as a card with initiative tools

---

## 5. Loot Block

````markdown
```loot id=wolf_loot
items:
  - Fur scraps
  - Silver ring (10gp)
  - Potion of Healing
```
````

---

## 6. Spell Block

````markdown
```spell
name: Fireball
level: 3
school: Evocation
casting_time: 1 action
range: 150 ft
components: V, S, M (a tiny ball of bat guano and sulfur)
duration: Instantaneous
description: >
  A bright streak flashes from your pointing finger…
```
````

---

## 7. Session Log Block

````markdown
```session
date: 2026-05-13
dm: Arlen
players:
  - Andy (Ranger)
  - Marnie (Cleric)
summary: >
  The party tracked the goblins to the ruined watchtower.
events:
  - Found a hidden cache of potions
  - Negotiated with a captured scout
  - Discovered signs of a larger threat
```
````

---

## 8. Roll Block (Dice Expressions)

````markdown
```roll
1d20+5
```
````

Your renderer:

- Parses the expression
- Displays the result inline or as a popup

---

## 9. Map / Image Block

Supports base64 or attachment tokens.

````markdown
```map id=snow_map
title: Snowfield Ambush
image: attachment://snowfield.png
```
````

Or inline:

````markdown
```map
image: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...
```
````

---

## 10. Timeline Block (Mermaid‑style)

````markdown
```timeline
A --> B: Goblins flee
B --> C: Party gives chase
C --> D: Wolves ambush
```
````

You can render this using Mermaid or your own flowchart engine.

---

## 11. Inline Enhancements

### Inline dice

```text
Attack roll: {1d20+7}
Damage: {2d6+4}
```

### Inline tags

```text
Elira is {friendly} and {arcane}.
```

### Inline references

```text
See encounter: @Wolves in the Snow
```

---

# 🧱 Minimal Parsing Rules

1. Detect fenced blocks with a known type
2. Parse key/value pairs (YAML‑ish)
3. Preserve Markdown inside multiline values (`>` or `|`)
4. Allow optional `id=` after block type
5. Allow references via `id` or `@Name`

This keeps your parser tiny and your UX powerful.

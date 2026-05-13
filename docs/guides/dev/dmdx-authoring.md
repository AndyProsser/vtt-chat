# DMDX Authoring Guide

This guide helps developers and DMs create high-quality DMDX blocks quickly using either AI-assisted generation or manual editing in VS Code.

Related specs:

- ../../subsystems/DMDX-MARKDOWN-EXTENSION.md
- ../../subsystems/DMDX-IMPLEMENTATION-CONTRACT.md

## 1. Authoring Workflow

1. Start with normal markdown narrative.
2. Insert DMDX fenced blocks where structure is useful.
3. Run block validation checklist before saving.
4. Fix warnings or use a repair prompt.
5. Save and preview in Notes/Journal renderer.

## 2. VS Code Setup

Workspace support provided by:

- .vscode/settings.json custom markdown code-block language mappings
- .vscode/dmdx.code-snippets block templates

Developer expectation:

- DMDX fences get YAML formatting and indentation behavior in markdown files.
- Snippets can scaffold all 9 block types.

## 3. AI Prompt Templates

Use these templates with your preferred AI editor workflow.

### 3.1 NPC

Prompt:

Create one DMDX npc block for a level ${level} ${class} named ${name}. Include race, alignment, tags, portrait attachment token, and 2-3 sentence notes.

### 3.2 Monster

Prompt:

Create one DMDX monster block for CR ${cr} with AC, HP, speed, full abilities map, and 2 actions. Keep values coherent for a standard 5e encounter.

### 3.3 Encounter

Prompt:

Create one DMDX encounter block for environment ${environment}, difficulty ${difficulty}, creature list, 2 objectives, and references to loot and map blocks.

### 3.4 Loot

Prompt:

Create one DMDX loot block with id ${id} and 4 items including one potion and one coin-value item.

### 3.5 Spell

Prompt:

Create one DMDX spell block using 5e style fields and a concise markdown-friendly description.

### 3.6 Session

Prompt:

Create one DMDX session block with date ${date}, DM ${dm}, player roster, summary, and 3-5 chronological events.

### 3.7 Roll

Prompt:

Create one DMDX roll block for ${intent}. Use a single valid dice expression only.

### 3.8 Map

Prompt:

Create one DMDX map block with id ${id}, title, and an attachment token image field. Do not use inline data URIs.

### 3.9 Timeline

Prompt:

Create one DMDX timeline block with 4-6 arrow steps describing this scene: ${scene}. Use Mermaid-style flow lines.

## 4. Campaign Style Injection

Prepend this instruction for consistency:

Apply campaign style: tone=${tone}; setting=${setting}; naming-pattern=${namingPattern}; lore-constraints=${constraints}. Keep output compatible with DMDX v1 block fields.

## 5. Validation Checklist

- Fence type is one of the 9 supported types.
- Key names are lowercase snake_case where applicable.
- Block fields match expected shapes (lists/maps/scalars).
- map.image uses attachment:// token only.
- timeline lines preserve arrow syntax.
- No executable or unsafe URI schemes.
- References use valid id or @Name.
- Content remains understandable as plain markdown if custom renderer is unavailable.

## 6. Repair Prompts

### 6.1 Generic Repair

Repair this DMDX block to match v1 schema without changing narrative intent. Keep unknown keys if safe. Return only the corrected block.

### 6.2 Strict Map Repair

Repair this map block for v1 policy: replace inline data URI with attachment:// placeholder token, preserve title and id.

### 6.3 Timeline Repair

Normalize this timeline block to Mermaid-style arrow lines. Preserve event order and meaning.

## 7. Manual Editing Tips

- Keep one concept per block.
- Use ids for reusable references.
- Place loot/map blocks near encounter blocks for readability.
- Keep long prose in markdown paragraphs, not deeply nested key fields.

## 8. Review Expectations

When reviewing DMDX-heavy notes/journals:

- verify visibility/privacy does not change because of block content
- verify map policy (attachment token only)
- verify malformed blocks degrade gracefully
- verify timeline fallback readability

# DMDX Implementation Contract

This document defines how DMDX is implemented across backend, frontend, storage, websocket sync, and developer tooling.

Scope: Notes and Journal surfaces.

## 1. Goals

- Keep markdown fully compatible for users who never use DMDX.
- Allow structured RPG blocks without introducing a separate note format.
- Preserve privacy and role controls from the notes/journal model.
- Keep parser behavior resilient: warnings over hard failures unless unsafe input is detected.

## 2. Non-Goals

- No custom markdown file extension.
- No hard dependency on a full YAML parser.
- No cross-campaign block references.
- No mandatory UI block builder for v1.

## 3. Canonical v1 Block Set

- npc
- monster
- encounter
- loot
- spell
- session
- roll
- map
- timeline

## 4. System-Wide Data Flow

1. User edits markdown in Notes or Journal.
2. Frontend runs lightweight parse/validation for previews and warnings.
3. Save request sends canonical markdown string to backend.
4. Backend runs safety validation and optional structured extraction.
5. Backend persists markdown as source of truth.
6. Frontend rehydrates and renders markdown + DMDX blocks deterministically.

## 5. Source of Truth and Persistence

- Canonical source: markdown content field in Notes/Journal storage.
- Optional parsed block JSON is derived cache only.
- Rebuild of parsed cache from markdown must always be possible.
- Migration strategy: no required migration for existing markdown notes.

## 6. Validation Policy (Balanced)

Validation levels:

- Warning: malformed shape, unknown keys, missing optional fields.
- Error: unsafe content, unsupported URI schemes, forbidden inline payloads for persisted fields.

Rules:

- Never drop original user markdown on parse errors.
- Store markdown even when warnings exist.
- Block save only for unsafe content.
- Return structured warning list with line and field hints when available.

## 7. Security and Content Policy

- Persisted map.image uses attachment tokens only: attachment://`<token>`.
- Persisted inline data URI images are rejected.
- Allowed URI schemes for DMDX links are explicit allowlist: https, http, attachment.
- Rendering must sanitize markdown HTML output.
- Timeline text is treated as content, never executed as script.

## 8. Rendering Contract

### 8.1 Notes and Journal

- Both surfaces support DMDX blocks in v1.
- Unknown block types render as regular fenced code.
- Known block types render as structured cards/components.

### 8.2 Timeline

- Primary renderer: Mermaid.
- Fallback: plain-text timeline preserving original lines.
- Fallback must not lose author content.

### 8.3 Roll

- Parse dice expression and show deterministic result display.
- Invalid expressions render warning state, not crash state.

## 9. API Contract Additions

Recommended request validation shape:

- notes.create / notes.update request body keeps markdown field unchanged.
- optional response metadata:
  - dmdxSummary: block counts by type.
  - dmdxWarnings: parse/validation warnings.

No API contract should require clients to submit pre-parsed block JSON.

## 10. WebSocket and Sync

- Existing note/journal update events remain canonical sync channel.
- DMDX metadata may be included as optional enrichment.
- Clients must continue to function if metadata is absent.

## 11. Permissions and Privacy

DMDX never bypasses note visibility rules.

- DM-only note with DMDX remains DM-only.
- Shared note with DMDX follows shared visibility.
- Block references resolve only within content user can already access.

## 12. Observability

Track at minimum:

- parse_warning_count by block type
- parse_error_count by reason
- render_fallback_timeline_count
- rejected_inline_map_payload_count

This ensures parser quality can be improved without breaking author flow.

## 13. Testing Requirements

Backend tests:

- accepts standard markdown without DMDX
- parses each block type with warning-free baseline fixture
- rejects persisted inline data URI map payloads
- preserves markdown verbatim on warning-only parse results

Frontend tests:

- renders each supported block type
- unknown fence type fallback behavior
- timeline Mermaid failure fallback
- warning badges/messages for malformed blocks

Integration tests:

- create/update/reload parity for notes with mixed markdown + DMDX
- role/visibility boundaries remain enforced with DMDX content

## 14. Rollout Plan

1. Parser + validator behind feature flag.
2. Notes UI rendering in enabled campaigns.
3. Journal UI rendering parity.
4. Telemetry review and warning trend hardening.
5. Enable by default when warning/error baseline is stable.

## 15. Developer Experience Deliverables

- VS Code fenced-language mappings for DMDX block identifiers.
- Markdown snippets for all block templates.
- AI prompt templates and repair prompts for DMDX authoring.
- Validation checklist for code review and CI content checks.

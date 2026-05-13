# DMDX Implementation Ticket

Status: Ready for execution
Owner: Platform (Backend + Frontend)
Priority: High
Scope: Notes + Journal

## Objective

Implement DMDX end-to-end with balanced validation, secure map handling, deterministic rendering, resilient fallback behavior, and telemetry visibility.

References:

- ../subsystems/DMDX-MARKDOWN-EXTENSION.md
- ../subsystems/DMDX-IMPLEMENTATION-CONTRACT.md
- ../guides/dev/dmdx-authoring.md

## Decision Lock (v1)

- Support all 9 block types.
- Validation policy is balanced (warn on malformed, block only unsafe).
- Persisted map image field uses attachment tokens only.
- Timeline uses Mermaid renderer with plain-text fallback.
- Enabled in Notes and Journal.

## Execution Checklist

### 1. Backend: Parser and Validation

- [ ] Create parser module for DMDX block discovery and YAML-like key/value extraction.
- [ ] Implement balanced validator with warning and error channels.
- [ ] Preserve raw markdown source regardless of warning-only parse outcome.
- [ ] Reject unsafe URI schemes in token fields.
- [ ] Reject persisted inline data URI for map.image.
- [ ] Return structured warning list with line/field hints when available.

Suggested files:

- backend/src/modules/notes/services/dmdxParser.ts
- backend/src/modules/notes/services/dmdxValidator.ts
- backend/src/modules/journal/services/dmdxParser.ts (or shared service)

### 2. Backend: API Integration

- [ ] Integrate parser/validator into notes create/update flows.
- [ ] Integrate parser/validator into journal create/update flows.
- [ ] Keep markdown as canonical payload field.
- [ ] Add optional response metadata: dmdxSummary, dmdxWarnings.
- [ ] Ensure warning metadata is additive and backward-compatible for clients.

Suggested files:

- backend/src/api/routes/notes.ts
- backend/src/api/routes/journal.ts
- backend/src/modules/notes/controllers/\*
- backend/src/modules/journal/controllers/\*

### 3. Frontend: Rendering

- [ ] Add DMDX parse/render adapter for Notes.
- [ ] Add DMDX parse/render adapter for Journal.
- [ ] Render known block types with dedicated components.
- [ ] Render unknown block types as standard fenced blocks.
- [ ] Surface validator warnings in non-blocking UI (badge/panel/inline callout).

Suggested files:

- frontend/src/components/notes/\*
- frontend/src/components/journal/\*
- frontend/src/utils/dmdx/\*

### 4. Frontend: Timeline Fallback

- [ ] Add Mermaid timeline renderer path.
- [ ] Add deterministic plain-text fallback when Mermaid fails or is unavailable.
- [ ] Ensure fallback preserves line order and content exactly.
- [ ] Ensure fallback path does not break page render.

Suggested files:

- frontend/src/components/notes/renderers/DmdxTimeline.tsx
- frontend/src/components/journal/renderers/DmdxTimeline.tsx

### 5. Telemetry and Observability

- [ ] Emit parse_warning_count by block type.
- [ ] Emit parse_error_count by reason.
- [ ] Emit render_fallback_timeline_count.
- [ ] Emit rejected_inline_map_payload_count.
- [ ] Add dashboard or query examples for these metrics.

Suggested files:

- backend/src/lib/telemetry/\*
- docs/operations/TELEMETRY.md

### 6. Editor and Developer Experience

- [x] Add VS Code fenced-language mappings for DMDX blocks.
- [x] Add VS Code snippets for all 9 block types.
- [ ] Confirm snippets and mapping work in markdown files in Notes/Journal authoring flow.
- [ ] Add CI doc lint/validation check for DMDX examples if needed.

Current files:

- .vscode/settings.json
- .vscode/dmdx.code-snippets

## Test Checklist

### Backend Unit Tests

- [ ] Parser recognizes all 9 block types.
- [ ] Unknown block types are ignored by parser without data loss.
- [ ] Validator emits warnings for malformed but safe structures.
- [ ] Validator errors on unsafe URI schemes.
- [ ] Validator errors on persisted inline data URI map payload.
- [ ] Raw markdown is unchanged after warning-only parse.

Suggested test location:

- backend/tests/unit/dmdx/\*.test.ts

### Backend Integration Tests

- [ ] Notes create/update persists markdown with DMDX content.
- [ ] Journal create/update persists markdown with DMDX content.
- [ ] API responses include optional dmdx warnings/summary when present.
- [ ] Existing clients remain compatible when metadata is absent.

Suggested test location:

- backend/tests/integration/notes/\*.test.ts
- backend/tests/integration/journal/\*.test.ts

### Frontend Unit Tests

- [ ] Each known block type renders with expected component shell.
- [ ] Unknown block type renders fenced-code fallback.
- [ ] Timeline renderer falls back when Mermaid parse/render fails.
- [ ] Warning UI appears when dmdxWarnings are present.

Suggested test location:

- frontend/src/tests/dmdx/\*.test.tsx

### End-to-End / Behavioral Tests

- [ ] User can save mixed markdown + DMDX in Notes and reload with parity.
- [ ] User can save mixed markdown + DMDX in Journal and reload with parity.
- [ ] Role visibility rules remain unchanged with DMDX content.
- [ ] Unsafe map payload is rejected with clear error message.

## Acceptance Criteria

- Parser and validator run for Notes and Journal saves.
- Markdown remains canonical source and is never discarded on warning-only parse.
- Unsafe content is blocked.
- Timeline fallback is deterministic and user-visible.
- Telemetry captures warning/error/fallback/rejection metrics.
- All required backend/frontend tests are in place and passing.

## Definition of Done

- [ ] All checklist items above completed or explicitly deferred with rationale.
- [ ] Test suite additions merged and green.
- [ ] Docs updated if any contract behavior changed during implementation.
- [ ] Feature flag decision documented (enabled-by-default or gated).

## Risk and Mitigation

- Risk: Parser over-strictness blocks normal authoring.
  - Mitigation: balanced validation and warning-first behavior.
- Risk: Mermaid introduces rendering instability.
  - Mitigation: hard fallback path and render failure telemetry.
- Risk: Map payload abuse or oversized inline blobs.
  - Mitigation: token-only persisted map policy and explicit rejection path.

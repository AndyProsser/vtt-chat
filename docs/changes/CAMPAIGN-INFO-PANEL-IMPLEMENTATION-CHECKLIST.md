# Campaign Info Panel Implementation Checklist

Status: Drafted from product clarification (2026-05-14)
Owner: Frontend + Backend
Related: [ROADMAP.md](../../ROADMAP.md), [docs/ui/UI-COMPONENTS.md](../ui/UI-COMPONENTS.md), [docs/ui/DM-CAMPAIGN-SETTINGS.md](../ui/DM-CAMPAIGN-SETTINGS.md), [docs/operations/TESTING-READINESS.md](../operations/TESTING-READINESS.md)

## 1) Locked Product Contract

Campaign Info panel goals:

- Keep panel simple and low-clutter.
- DM edits campaign `name`, `description`, and `poster` directly in this panel.
- Players and spectators are read-only.
- Stats are compact, visually subtle, and interesting.
- Extra explanatory copy for stats is hidden in tooltip/popper.

Locked behavior:

- Visibility: DM + Player + Spectator can open panel.
- Edit role: DM only.
- Save model: explicit `Save` / `Cancel` (no autosave).
- Poster actions: upload, replace, remove.
- Description editor: tiny WYSIWYG helper only.
- Description formatting allowed only:
  - bold
  - italic
  - bullet lists
  - numbered lists
- Description formatting blocked:
  - links
  - headings
  - images
  - tables
  - advanced markdown features

## 2) Stats Contract

Compact stat cards to show by default:

1. Total campaign length
2. Player count
3. Session count
4. Completed session count
5. Next session ETA (if available)

Stat definitions:

- Total campaign length = sum of active session durations only.
- Player count = campaign member players (not spectators).
- Session count = total campaign sessions created.
- Completed session count = sessions in ended/completed state.
- Next session ETA = nearest upcoming scheduled start; when unavailable show `TBD`.

Popper rule:

- Each stat has a short definition-only tooltip/popper.
- Popper does not include long methodology text.

## 3) Frontend Implementation Checklist

- [ ] Keep/extend [frontend/src/components/session/CampaignInformationPanel.tsx](../../frontend/src/components/session/CampaignInformationPanel.tsx) as the canonical UI.
- [ ] Add in-panel DM edit mode with explicit Save/Cancel.
- [ ] Add minimalist WYSIWYG description helper toolbar limited to allowed formatting.
- [ ] Enforce formatting whitelist in editor output.
- [ ] Add poster upload/replace/remove controls in panel.
- [ ] Render compact stat cards with popper definitions.
- [ ] Ensure read-only mode for player/spectator while keeping data visible.
- [ ] Keep visual density low and avoid expanding panel footprint.

## 4) Backend/API Checklist

- [ ] Ensure campaign metadata endpoint supports name, description, poster updates from panel workflow.
- [ ] Ensure backend validation/sanitization enforces description formatting limits.
- [ ] Ensure campaign stats endpoint returns all required stat fields:
  - total campaign length (active duration sum)
  - player count
  - session count
  - completed session count
  - next session ETA
- [ ] Ensure role authz enforces DM-only mutation and non-DM read-only behavior.

## 5) W0 Acceptance Checklist

- [ ] DM can edit name, description, and poster entirely inside Campaign Info panel.
- [ ] Save/Cancel workflow is explicit and stable.
- [ ] Description editor allows only bold, italic, bullet list, and numbered list.
- [ ] Description editor blocks links/headings/images/tables.
- [ ] Poster upload, replace, and remove flows work without leaving panel.
- [ ] Compact stat row includes required 5 stats and does not increase panel clutter.
- [ ] Each stat has tooltip/popper definition text.
- [ ] Player and spectator can view all panel content but cannot edit.

## 6) W2 Test Gate Checklist

- [ ] Unit/component tests for Campaign Info edit/read-only role gating.
- [ ] Editor-formatting tests for allowlist and denylist behavior.
- [ ] Poster action tests for upload/replace/remove.
- [ ] Stats rendering tests for values and fallback behavior (`TBD` next session ETA).
- [ ] Popper tooltip tests for stat definition visibility.
- [ ] Integration tests for DM save/cancel state transitions and persistence.
- [ ] API tests for DM-only mutation authz and non-DM read-only access.

Suggested verification commands:

- `npm --prefix frontend run test`
- `npm --prefix backend run test`
- `npm run qa:coverage-report`

## 7) Definition of Done

Done means:

- Campaign Info panel behavior matches locked contract for permissions, editing flow, and formatting limits.
- Compact stats and popper explanations are delivered without UI clutter.
- W0 acceptance checklist is complete and W2 tests pass reliably.

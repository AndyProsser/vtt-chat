# Extension Roadmap

This document tracks extension-specific milestones that are not required for core-platform Stage 13 closure in the main vtt-chat repository.

Primary execution repository: <https://github.com/AndyProsser/vtt-chat-extension>

Last updated: 2026-05-02

---

## Scope and Positioning

- This roadmap covers optional/supporting extension integration milestones that continue after main-platform Stage 13.1-13.3 completion.
- Core-platform guest-auth and external identity runtime work remains tracked in `ROADMAP.md` (Stage 13 complete, Stage 14 hardening active).

---

## Stage E1 (Former Stage 13.4): Extension Backend Contract Integration (D&D Beyond)

Status: **Planned**

Scope:

- Wire the existing extension front-end and scraping layer to the vtt-chat backend endpoints delivered in core Stage 13.1-13.3.

Extension changes required:

- Background script: implement pre-flight sequence (`/api/platform/status` -> `/api/campaigns/invite/:code/validate` -> `/api/auth/extension/preflight`).
- Background script: implement guest-login call and in-memory JWT storage with silent renewal.
- Background script: implement sync update calls on character level-up/class change events.
- Popup UI: display pre-flight results (platform status, invite validity, account status branch).
- Popup UI: login form for full-account users (email pre-filled, password entry).
- Popup UI: display "platform not enabled" message for blocked systems.

Backend contract requirements:

- No new backend endpoints required beyond main-platform Stage 13.1-13.3.

Target validation tests:

- Contract tests asserting extension-submitted payloads match backend schema (character fields, invite code format, `externalSystem` enum).
- Integration tests for the full pre-flight -> guest-login -> token storage sequence against a local backend.
- Tests for silent token renewal behavior when guest JWT is within renewal window.
- Tests asserting extension handles backend errors gracefully (platform offline, invite expired, system blocked).

Exit criteria:

- D&D Beyond extension path is wired end-to-end to shipped backend contracts.
- Extension-side error handling and token lifecycle behavior pass contract/integration checks.

---

## Stage E2 (Former Stage 13.5): VTT Overlay Bridge Contracts (Roll20, Foundry, Others)

Status: **Deferred / Planned**

Scope:

- Extend the integration layer to Roll20 and Foundry after Stage E1 (D&D Beyond) validates end-to-end.

Planned work:

- Register Roll20 and Foundry in the `ExternalSystem` registry (initially `LOG_ONLY` or `BLOCKED`).
- Implement bridge contracts for Roll20/Foundry ingestion normalization.
- Implement overlay UX and event synchronization with core app state/privacy constraints.
- Validate extension-side role/privacy enforcement and reconnection/state recovery behavior per platform.

Exit criteria:

- Additional VTT systems are integrated with contract parity and policy-safe behavior.
- Platform-specific bridge behavior is tested and documented.

---

## Dependency Notes

- Depends on core-platform Stage 13.1-13.3 runtime contracts already shipped in this repository.
- Coordination with `docs/extension/GUEST-AUTH.md`, `docs/extension/EXTENSION-INTEGRATION.md`, and `docs/extension/THIRD-PARTY-INTEGRATIONS.md` should be maintained as implementation progresses.

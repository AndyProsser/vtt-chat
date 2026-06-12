# Extension Roadmap

This document tracks extension-specific milestones that are not required for core-platform Stage 13 closure in the main vtt-chat repository.

Primary execution repository: <https://github.com/AndyProsser/vtt-chat-extension>

Last updated: 2026-06-08

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

- Background script: generate and persist a stable `deviceId` (UUID v4) in `localStorage` on first install. Include `deviceId` in all extension auth calls.
- Background script: implement pre-flight sequence (`/api/platform/status` → `/api/campaigns/invite/:code/validate` → `/api/auth/extension/preflight`). Only run this flow if no valid device credential is stored.
- Background script: on each launch, attempt `POST /api/auth/extension/credential/exchange` with `{ credential, deviceId }` before falling back to the invite flow. Replace stored credential in `localStorage` on every successful exchange.
- Background script: handle credential exchange error codes:
  - `CREDENTIAL_INVALID` — treat as first launch, prompt for invite code.
  - `CREDENTIAL_EXPIRED_GUEST` — prompt user to re-enter a fresh invite code.
  - `CREDENTIAL_EXPIRED_FULL` — prompt user for email and password.
- Background script: implement guest-login call on first join; store the returned `deviceCredential` in `localStorage` (not the invite URL or code). Keep the JWT in memory only — never persist the JWT.
- Background script: implement sync update calls on character level-up/class change events.
- Popup UI: display pre-flight results (platform status, invite validity, account status branch).
- Popup UI: login form for full-account users (email pre-filled, password entry).
- Popup UI: display "platform not enabled" message for blocked systems.

Backend contract requirements:

- `POST /api/auth/extension/credential/exchange` — new endpoint. Accepts `{ credential, deviceId }`. Returns `{ token, credential }` on success; `401` with code `CREDENTIAL_INVALID`, `CREDENTIAL_EXPIRED_GUEST`, or `CREDENTIAL_EXPIRED_FULL` on failure. See `docs/CONTRACTS.md` — Extension Device Credential Contract.
- `GET /api/auth/extension/credentials` — new endpoint. Returns active credentials for the authenticated user (for a future "Connected Devices" settings panel).
- `DELETE /api/auth/extension/credentials/:credentialId` — new endpoint. User or admin credential revocation.
- `POST /api/auth/extension/guest-login` response must include `deviceCredential` in addition to `token`.

Target validation tests:

- Contract tests asserting extension-submitted payloads match backend schema (character fields, invite code format, `externalSystem` enum).
- Integration tests for the full pre-flight → guest-login → credential storage → credential exchange sequence against a local backend.
- Tests for silent JWT renewal from stored credential when JWT is within renewal window.
- Tests asserting extension handles backend errors gracefully (platform offline, invite expired, system blocked, credential expired).
- Tests for credential rotation: exchanged credential replaces old; old credential returns `CREDENTIAL_INVALID`.
- Tests for expiry path by account type: guest path prompts invite, full path prompts password.

Exit criteria:

- D&D Beyond extension path is wired end-to-end to shipped backend contracts.
- Extension stores device credential (not invite URL) and survives invite code rotation.
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
- Extension Device Credential Contract locked in `docs/CONTRACTS.md` (2026-06-08) — new backend endpoints required before Stage E1 can close (see Backend contract requirements above).
- Coordination with `docs/extension/GUEST-AUTH.md`, `docs/extension/EXTENSION-INTEGRATION.md`, and `docs/extension/THIRD-PARTY-INTEGRATIONS.md` should be maintained as implementation progresses.

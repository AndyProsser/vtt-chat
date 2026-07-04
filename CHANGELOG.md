# Changelog

All notable changes to this project are documented here. One entry per version covers key features and fixes; full implementation detail is archived in [docs/CHANGELOG-ARCHIVE-2026-06.md](docs/CHANGELOG-ARCHIVE-2026-06.md).

---

## [Unreleased]

### Fixed — Inventory

- **DDB/SRD item data now renders correctly in the detail card**: extended metadata (type, subtype, weight, cost, damage, properties, description) was largely empty. Three root causes fixed: (1) `normalizeFromSrd` only read the 2014 SRD schema, so the default 2024 ruleset (`equipment_categories[]` array, `description` not `desc`, a 5 ft melee `range`) produced empty metadata — it now handles both schemas and de-duplicates enriched properties (`Versatile (1d10)` replaces bare `Versatile`); (2) the DnD Beyond extension's live payload uses different field names than the documented contract (`type`/`subtype`/`cost`, split `damage`+`damageType`, comma-separated `properties` string) — `normalizeExternalItemMetadata` now maps these (and still accepts the canonical names); (3) HTML descriptions from DDB are now stripped to plain text at ingestion (`stripHtml`).
- **SRD ↔ DDB reconciliation**: a manually-added SRD/CUSTOM item is now **converted in place** when a DnD Beyond item with the same name (exact, case-insensitive) syncs — the row is stamped with `externalId`/`externalSource`, `source` becomes `EXTERNAL` (so previously-CUSTOM items render their new metadata), and `srdKey` is preserved. Unmatched SRD/CUSTOM items (null `externalId`) are **never deleted** by a sync. See `docs/subsystems/INVENTORY-SYSTEM.md` §12.1.
- **Inventory item rows no longer emit a nested-`<li>` hydration error**: the top-level drop zone (`<li>`) wrapped row `<li>`s directly; rows are now wrapped in a nested `<ul>` (matching the container-section pattern).

### Changed — Inventory

- **Item detail popover → read-only hover card**: the per-item detail popup now opens on hover (not click), is read-only, and vanishes when the pointer moves onto it — matching the player profile cards. Properties render as pills; notes are edited via the row's Edit action. The header is a single line (`Type (Subtype) · weight · cost`), and the generic DDB `Other Gear` type is displayed as its subtype (e.g. `Adventuring Gear`) in both the card and the row meta line.

### Fixed — Performance

- **Session timer no longer forces a React commit every second**: `SessionTimerLeaf` drove its 1-second clock through `setState`, so each tick committed and dragged sibling toolbar icons, the memoized `ConnectionStatusLeaf`, and the open right-rail Radix `Tabs` through reconciliation — pure wasted work observed in an idle greenroom profiler trace. The per-second value is now written directly to the DOM via refs (imperative tick); React state is retained only for the server-driven anchor and popper visibility. No `setState` per tick → no commit → nothing outside the leaf re-renders on the clock.
- **Mic level meter no longer pins the browser refresh driver at 60fps while idle**: `useMicLevelMeter` (mounted permanently via the left-rail `AudioPanel`) ran a per-frame `requestAnimationFrame` Web-Audio FFT loop whenever the mic was on — even when nothing read the level (audio settings closed, not transmitting). A Firefox profile of an idle greenroom showed this keeping `RefreshDriverTick` / style / paint running ~60×/s (the bulk of the ~2–3% idle CPU). The loop now (1) skips entirely unless the meter is visible (`settingsOpen`) or the user is transmitting, and (2) samples via a ~30Hz `setInterval` instead of rAF, so it never keeps the refresh driver awake. Speaking detection (120ms poll) and the meter bar are unaffected.
- **`MicLevelMeter` no longer wakes the CPU while idle**: the meter leaf inside `AudioDevicePanel` (rendered unconditionally, so always mounted in a session) ran a per-frame `requestAnimationFrame` loop for the whole session even when the level was a flat zero, pinning the refresh driver. It now (1) writes the CSS variable from a ~30Hz `setInterval` instead of rAF, and (2) takes an `active` prop — when inactive it resets the bar once and runs **no** timer at all. The device-panel transmit meter is `active` only while actually transmitting, so a **muted mic disables it completely** (no timer); the settings-panel meter is only mounted while that panel is open. Earlier rounds left a 30Hz wake firing ~32×/s (807 `setTimeout` over 25s); the audio stack now goes fully idle (~2.6 `setTimeout`/s, all normal app heartbeats).
- **Typing-indicator dots no longer animate while hidden**: the `chatTypingDot` dots are always in the DOM and the inactive overlay is hidden via `visibility: hidden` (which does NOT stop CSS animations), so the `1.2s infinite` compositor animation ran every frame forever — keeping the refresh driver awake in a fully idle session (confirmed via a `CSS animation iteration` marker named `chatTypingDot`). The animation is now scoped to `.session-chat-window__typing-overlay--active`, so it only runs when someone is actually typing.

### Added — Audio

- **Audio device preferences now persist locally**: the selected microphone/speaker (plus mic gain, master/background volume, push-to-talk, auto-gain, and noise-filter level) are saved to `localStorage` and restored on app load. Because the choice is machine-dependent it's stored per-browser, not on the account. Since `useLiveKit` reads `selectedMicDeviceId` from the store, the remembered mic is used the instant you hit unmute after opening the page — no re-selection. Runtime/transient fields (`enabled`, `microphoneOn`, `isSpeaking`) are intentionally not persisted, so the app always loads muted. Persisted prefs also survive session resets.

### Fixed — Audio

- **Audio device lists were empty on the first open of the settings panel**: `AudioSettingsPanel` enumerated devices once on mount, but on first open mic permission isn't granted yet, so the browser returns devices with empty ids/labels (filtered out) → empty dropdowns until the panel was closed and reopened. `devicechange` alone doesn't help (Firefox fires it on physical add/remove, not on permission-grant), so the panel now deterministically acquires permission first — `getUserMedia({audio:true})`, immediately released — and only then enumerates, guaranteeing populated lists on first open. `devicechange` is still wired for genuine hot-plug while the panel is open.

### Fixed — Tooling

- **Removed stale committed `.d.ts` artifacts from `packages/shared`**: eleven declaration files (e.g. `events/session.d.ts`) were committed once during the monorepo restructure and never regenerated — `session.d.ts` still described the pre-COOLDOWN event union. Apps resolve `@shared` straight to the `.ts` sources so typechecking was unaffected, but `package.json` `types`/`exports` pointed at the stale `index.d.ts`; both now point at `index.ts`. Also deleted a stray root-level `backend/prisma/migrations/` folder that duplicated an existing migration in `apps/backend/prisma/migrations/`.
- **Stale `SessionInit.tsx` references updated**: `CLAUDE.md`, `.github/copilot-instructions.md`, and `audioPresetsSlice.ts` comments still pointed at the long-removed `SessionInit.tsx` for the environment-sync effect — it now lives in `hooks/session/useWorkspacesAudioProjection.ts`. Also corrected the documented `useWebSocket` dependency array (`onAuthFailure` is consumed via a ref) and the frontend WS-handler test path (`apps/frontend/tests/state/`).
- **ESLint was broken for all sub-apps**: `apps/{frontend,admin,backend}/eslint.config.mjs` imported the shared config from `../eslint.config.mjs` (`apps/eslint.config.mjs`, which does not exist) instead of the repo-root `../../eslint.config.mjs` — a stale path missed in the rs-05 config restructure. `npx eslint` now resolves in every app.

---

## [0.9.6] — 2026-06-24

### Added — W-Extension-DM-Link

- **`POST /api/auth/extension/dm-link`**: New endpoint for DMs to link their full vtt-chat account to their external system (DDB) identity on first extension launch. Issues a `deviceCredential` for future returning-DM launches. Full-account JWT required; guest tokens are rejected with 403.
- **Guest account merge**: If the DM previously connected as a guest player (same DDB `externalUserId`), their Characters and CampaignMemberships are automatically transferred to the full account and the guest user is soft-deleted. If two full accounts share the same DDB identity, the endpoint returns `409 IDENTITY_CONFLICT` for admin resolution.
- **`POST /api/integrations/external/dm-sync` — full-account enforcement**: Guest JWTs now receive `403 FORBIDDEN`. Protects the privileged DM campaign sync operation.
- **Campaign name sync**: `dm-sync` now updates `Campaign.name` when `campaignData.name` differs from the stored name. DDB is treated as the source of truth for the campaign name.
- **Character stubs**: `Character.userId` is now nullable. `dm-sync` provisions unowned stub characters (userId = null) for players who have no vtt-chat account yet; stubs are promoted to owned characters automatically when the player connects via the extension.
- **`/ext-launch?mode=dm-link`** page spec and extension popup DM states added to `docs/extension/DM-LINK.md` and `docs/extension/EXTENSION-UX.md` (Section 10).

### Fixed

- **Character stats reverted to defaults (all 10s) when a player went offline**: extension-synced characters stored ability scores in the external nested shape while the offline PARTY path read only the flat shape. Now ONE canonical flat shape is enforced end-to-end.
- **Extension sync wrote to a character row the UI never displays** (intermittent "synced but not visible"): the sync matched characters by `externalId` with no active-row handling, while every PARTY projection reads the active character. The sync now resolves deterministically (active, then most-recent) and atomically marks it the single active row.
- **Synced stats applied incorrectly / stale values lingered**: extension data is treated as source-of-truth with section-wise overwrite semantics via a new `mergeCharacterMetadata` helper. The stats section is reset wholesale on every sync; sections absent from a packet are preserved. Sync read+write runs under `SELECT … FOR UPDATE` to serialize concurrent packets.
- **Slash commands broken** (`/loot`, `/loot-split`, `/spend`, `/earn`, `/take`, `/give`, `/drop`): `MessageInput` had no catch-all for server-side commands — they fell through the if-else chain silently. Added a generic `onServerCommand` prop that forwards any unrecognised slash command to `POST /api/chat/command`. `ChatWindow` wires it up.

### Changed — Character stats consistency

- Added `normalizeCharacterStats` + `NormalizedCharacterStats` to `packages/shared/utils/character-stats.ts` — the single source of truth for character stat shape.
- Extension data is now transformed to the canonical flat shape at every ingestion point (`integration-sync.service.ts`, `extension.service.ts`).
- Both backend read projections (`listCampaignMembersForPresence`, `getSessionParticipantProfiles`) normalize on read.
- Removed the dual-format band-aids in the frontend (`PartyPanel.helpers.ts`, `groupsPanel.ts`, `presenceSlice.ts`, `roomSlice.ts`).

### Changed — W-Inventory-System

- **`/loot-split` auto-split**: Removed the 60-second accept flow. Loot is now distributed immediately when the DM runs `/loot-split` — each connected player's share is transferred party→character in the same request. Non-even remainders stay in the party inventory. The `LootSplitCard` in chat shows the completed split with named recipients; no accept button or countdown.
- **Currency transfer UI**: Transfer mode added to `InventoryCurrencyRow`. DM can transfer from party wallet to any connected player; players can take from party to themselves or give from their own wallet to party or other connected players. Transfer form shows source and destination balances before confirming; INSUFFICIENT_FUNDS shows denomination-level shortfall.
- **Denomination-coloured borders**: Coin boxes in view mode and all edit/transfer inputs now carry per-denomination border colours (PP = platinum-blue, GP = amber, EP = teal, SP = violet-grey, CP = copper-brown).
- **Browser spin-button suppression**: Number inputs in the inventory panel no longer show native up/down arrows.
- **Inventory history filters**: Transfer log filterable by owner (character / party) and date range.

### Removed

- `INVENTORY:LOOT_SPLIT_PROPOSED`, `INVENTORY:LOOT_SPLIT_ACCEPTED`, `INVENTORY:LOOT_SPLIT_EXPIRED` WS events — replaced by immediate `INVENTORY:ITEM_TRANSFERRED` broadcasts per recipient.
- `lootSplitSlice` Zustand slice and its three WS handlers (`handleLootSplitProposed`, `handleLootSplitAccepted`, `handleLootSplitExpired`).
- `POST /api/inventory/:campaignId/loot-split/:splitId/accept` endpoint.
- `loot-split.service.ts` Redis-backed accept/expire lifecycle.
- `expiresAt` field from `LootSplitCardMetadata`; replaced with `appliedAt` and `remainder`.

---

## [0.9.5] — 2026-06-22

### Performance & Reliability

- **Memory leak (critical)**: Speaking indicators were rebuilding `sessionPresence` on every speaking-stop event, causing ~912-fiber re-renders per second and Firefox exceeding 8 GB over 12+ hours. The `handlePresenceStateChanged` fast path now skips the write when the stored state already matches. Tests added in `roomSlice.test.ts`.
- **Session-transition cascade**: `WorkspaceInitialization` was re-rendering up to 63× per session due to fresh object references from `sessionSlice` writes that changed nothing. No-op guards added to `replaceSessions`, `setCurrentSession`, and the cooldown/pause maps in `handleSessionStateChanged`. Tests added in `sessionSlice.test.ts`.
- **In-session campaign-list reload**: `CAMPAIGN:LIST_INVALIDATED` was triggering `/api/campaigns` fetches on every PAUSE/RESUME. Requests are now deferred during live sessions and flushed when the user returns to lobby — including when a player exits before the session officially ends.
- **TypingIndicator over-subscription**: The overlay subscribed to the full `sessionPresence` map to resolve display names. Replaced with a `useShallow` `{userId → displayName}` lookup that only fires when names change.

### Added — W-Inventory-System

- Character and party inventory panel (new INVENTORY right-rail tab). Party purse and per-character wallets with GP/SP/CP/EP/PP currency. Item search via SRD proxy with 24-hour Redis cache; custom items supported.
- Chat commands: `/loot`, `/loot-random` (DMG Individual/Hoard Treasure tables, CR-scaled), `/loot-split` (timed player-accept flow with `LootSplitCard`), `/take`, `/give`, `/drop`, `/earn`, `/spend`.
- Campaign-level player inventory permissions: `allowPlayerGive`, `allowPlayerTake`, `allowPlayerLoot` (configurable in Campaign Settings).
- Currency shorthand parsing for `/give`, `/take`, `/earn`, `/spend`: `10gp 3sp`, `5ep`, etc.
- Full 4-layer state: PostgreSQL → WS broadcast → Zustand `inventorySlice` and `lootSplitSlice`.
- WS events: `INVENTORY:ITEM_ADDED`, `INVENTORY:ITEM_REMOVED`, `INVENTORY:ITEM_TRANSFERRED`, `INVENTORY:LOOT_SPLIT_PROPOSED`, `INVENTORY:LOOT_SPLIT_ACCEPTED`, `INVENTORY:LOOT_SPLIT_EXPIRED`, `INVENTORY:CURRENCY_CHANGED`.

---

## [0.9.2] — 2026-06-16

### Added

- **W-Extension-MVP**: Full guest auth, device credential persistence (90-day rolling), character/inventory/currency sync, and two-layer campaign sync policy (`extensionSyncPolicy` + four campaign-level fields). Backend fully production-ready for extension integration. Auth bugfix: `auth-extension.routes.ts` was never mounted by the real router — endpoints previously 404'd in production despite passing tests.
- **W-Session-Schedule**: Recurring session schedule (weekly / biweekly / monthly-Nth weekday), timezone-aware next-session-date calculation, DM manual override with one-time consume on session end. `CAMPAIGN:SCHEDULE_UPDATED` WS event.
- **W-Queues Phase 3**: `vttchat:recording` queue, feature-gated recording/summary workers, admin queue inspection via `GET|POST|DELETE /api/admin/queues/*` (proxied by backend with `adminAuthMiddleware`).
- **W-DM-Campaign-Portability**: DM self-service campaign export and import; schedule fields included in export bundle.
- **W-Chat-Commands**: `/roll`, `/me`, `/whisper`, `/OOC`, `/dm` commands with role-aware autocomplete palette and help popup. Backend re-validates role and session state before execution.

### Changed

- RS-Monorepo: Restructured from flat layout to `apps/` + `packages/` with npm workspaces. Moved frontend/backend/admin to `apps/`, shared to `packages/`, docker-compose files to `infra/`. All configs, Dockerfiles, tsconfigs, CI workflows, and documentation updated.

---

## [0.8.5] — 2026-05-28

### Changed

- Per-user transient state (speaking, presence online/offline, ghost mode, mic mute) extracted into memoized leaf indicator components each subscribing to a single Zustand primitive. Eliminates long-session memory growth and Radix tooltip/popover churn on every presence flip.
- `AvatarOverlay` API simplified to a single `presence` bundle prop; cascading styles now driven by CSS `:has()` selectors instead of parent className threading.
- Leaf-isolation pattern documented as a non-negotiable architectural mandate in CLAUDE.md and copilot-instructions.md.

---

## [0.8.0] — 2026-05-23

### Changed

- Lint hardening pass: ESLint 10 flat config, React linting migrated to `@eslint-react/eslint-plugin`, full suite clean across all packages.
- Settings unification: single role-aware `WorkspaceSettingsPanel` entrypoint. Standalone route-level campaign settings flow removed.

---

## [0.7.0] — 2026-05-14

### Changed

- Frontend refactor: components, types, utils, and styles moved to canonical domain locations. Session orchestration hooks, room/group domain types, and invite/join helpers extracted to `hooks/session/`, `types/session/`, and `utils/session/`.
- Backend service decomposition: session logic refactored toward `session/core.service.ts`; access-control and session-logging pathways expanded.

---

## [0.6.0] — 2026-05

### Added

- Shared canonical entity contracts (`UserEntity`, `SessionEntity`, `RoomEntity`, `MessageEntity`, `NoteEntity`, `PresenceEntity`) in `packages/shared/types/entities.ts`.
- Shared utilities (`format.ts`, `ws-events.ts`, `session-state.ts`) and cross-system type alignment tests across all three apps.

---

## [0.5.4] — 2026-05

### Added

- Admin types directory `admin/src/types/` with canonical domain types and `@/` path alias. Route-level integration tests for all four admin areas: users, logs, campaigns, and settings.

---

## [0.5.3] — 2026-05

### Changed

- Admin user model redesigned: credentials merged into `User` with `AdminRole` (`SUPER_ADMIN`, `ADMIN`, `CAMPAIGN_DM`, `READ_ONLY`). Cross-app auth handoff tokens for no-relogin app switching. Moderation endpoints with audit trail. Admin integration authorization controls for extension systems.

---

## [0.5.2] — 2026-04-20

### Documentation

- Architecture and extension auth docs expanded. README rewritten as project introduction with quick-start and developer onboarding.

---

## [0.5.1] — 2026-04

### Added

- Admin telemetry baseline endpoints (`/api/admin/telemetry/dashboard`, `/status`, `/logs`). Admin SPA shell with dashboard/status/logs workflows.

---

## [0.5.0] — 2026-04

### Added

- LiveKit token issuance, frontend LiveKit lifecycle hook, audio panel runtime, backend audio control routes.

---

## [0.4.0] — 2026-04

### Added

- Redis-first presence and room state. Prisma snapshot persistence and DB recovery. Session transition room orchestration and typed transition events. Frontend room/presence hydration and reconnect topology restoration.

---

## [0.3.0] — 2026-04

### Added

- Notes CRUD with visibility model (`DM_ONLY`, `PLAYERS_VISIBLE`, `CUSTOM`), publish-to-chat flow, WS propagation, frontend notes panel/card UX.

---

## [0.2.0] — 2026-04

### Added

- Chat persistence (Prisma) with edit/soft-delete, whisper visibility filtering, session boundary system messages, frontend WS compatibility with backend event envelopes.

---

## [0.1.0] — Initial Setup

### Added

- Repository structure, backend TypeScript skeleton (Express, WebSocket, Prisma, Redis, LiveKit), frontend React + Vite skeleton with Zustand, full documentation set, GitHub Actions CI/CD workflows, Docker build workflows.

---

_Full implementation detail: [docs/CHANGELOG-ARCHIVE-2026-06.md](docs/CHANGELOG-ARCHIVE-2026-06.md)_

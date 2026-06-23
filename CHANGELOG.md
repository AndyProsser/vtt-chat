# Changelog

All notable changes to this project are documented here. One entry per version covers key features and fixes; full implementation detail is archived in [docs/CHANGELOG-ARCHIVE-2026-06.md](docs/CHANGELOG-ARCHIVE-2026-06.md).

---

## [Unreleased]

### Fixed

- **Character stats reverted to defaults (all 10s) when a player went offline** (e.g. extension-synced "Silk" on the PARTY panel): extension-synced characters stored ability scores in the external **nested** shape (`metadata.stats.abilityScores.{str,dex,…}`) while mock players stored the **flat** shape (`metadata.{strength,dexterity,…}`). Readers had accreted per-call band-aids to tolerate both, and the offline PARTY path read only the flat keys — so synced scores fell back to 10. Now there is ONE canonical flat shape end-to-end.
- **Extension sync wrote to a character row the UI never displays** (intermittent "synced but not visible / doesn't persist"): the sync matched the character by `externalId` with no `orderBy`/active handling, while every PARTY/presence projection reads the user's **active** character. With duplicate or inactive rows the write and the read targeted different rows, so synced data silently vanished. The sync now resolves the character deterministically (active, then most-recent), and atomically marks it the single active character for its owner — guaranteeing the write target and display source are the same row.
- **Synced stats applied incorrectly / stale values lingered**: extension data is now treated as the **source of truth** with section-wise **overwrite** semantics, not a shallow jsonb merge. A new shared `mergeCharacterMetadata` helper fully replaces each section the packet carries — the stats section is reset wholesale (every canonical stat key cleared then re-set, legacy nested `stats` dropped) so no stale ability/combat value survives a re-sync — while sections **absent** from a packet are preserved (the extension's first packet often omits stats, so a stats-less packet must never wipe stats). Both ingestion points (the sync API and guest-auth login) use the same helper, and the sync read+write runs under a row lock (`SELECT … FOR UPDATE`) so concurrent packets serialize and can't lose each other's writes.

### Changed — Character stats consistency

- Added `normalizeCharacterStats` + `NormalizedCharacterStats` to `packages/shared/utils/character-stats.ts` — the single source of truth for character stat shape. Idempotent; accepts the extension-nested payload, extension-stored metadata, and the mock/legacy flat shape.
- Extension data is now transformed to the canonical flat shape at **every ingestion point** — `integration-sync.service.ts` (and it strips the obsolete nested `stats` key) and guest-auth `extension.service.ts`.
- Both backend read projections (`listCampaignMembersForPresence`, `getSessionParticipantProfiles`) normalize on read, so online live-presence, offline PARTY snapshots, and legacy un-resynced rows all surface identical canonical stats.
- Removed the dual-format band-aids in the frontend (`PartyPanel.helpers.ts`, `groupsPanel.ts`, `presenceSlice.ts`, `roomSlice.ts`) — they now read flat canonical keys only.

---

## [0.9.6] — 2026-06-22

### Fixed

- **Slash commands broken** (`/loot`, `/loot-split`, `/spend`, `/earn`, `/take`, `/give`, `/drop`): `MessageInput` had no catch-all for server-side commands — they fell through the if-else chain silently. Added a generic `onServerCommand` prop that forwards any unrecognised slash command to `POST /api/chat/command`. `ChatWindow` wires it up.

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

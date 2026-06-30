# VTT-Chat Roadmap

**Last Updated**: 2026-06-22 (v0.9.6)
**Purpose**: Track upcoming feature enhancements. Each item is an independent unit of work; detailed design and acceptance criteria live in `docs/`. Bugs and operational issues are tracked separately.
**Archive**: Completed phases and detailed delivery notes → [docs/DEVELOPMENT-ROADMAP-2026-06.md](docs/DEVELOPMENT-ROADMAP-2026-06.md)

---

## Legend

🟢 Done · 🟡 In Progress · 🔴 Blocked · ⚪ Not Started
**Priority**: 🔴 Critical · 🟡 High · 🟡 Medium · 🔵 Low

---

## Planned

### Admin System — Reimagined Command Centre

**Status**: ⚪ Not Started (design complete)
**Priority**: 🟡 High

**Design**: [`docs/architecture/ADMIN-SYSTEM.md`](docs/architecture/ADMIN-SYSTEM.md)

A full redesign of the admin app — consolidating the 8-page nav into 5, absorbing redundant telemetry pages, and bringing the aesthetic and scope up to "mini command centre with a D&D flavour":

- **Dashboard** (_The Scrying Pool_): unified status strip + activity charts + live job summary; replaces the current Dashboard, Analytics, and System Health pages
- **Campaigns** (_The Chronicle_): full lifecycle management — archive, backup, restore, lock, import/export, reassign DM, rename, per-campaign storage, session logs, recordings (future)
- **Users** (_Guild Roster_): moderation, role management, bans with duration, invite via email
- **Settings** (_The Tome_): major expansion — SMTP + email templates, AI provider configuration (local/remote/cloud), backup schedule + history, job queue schedule + live inspector, external system integrations
- **Logs** (_Hall of Records_): unified viewer for events, errors, email, trace, and audit logs in a single tabbed page

See the design doc for page-by-page acceptance criteria, component guidelines, and colour palette.

---

### W-Recording-Transcription-Summary

**Status**: ⚪ Not Started
**Priority**: 🔵 Low
**Depends on**: W-Queues (done)

Post-session audio recording, local transcription (Whisper.cpp or FasterWhisper), and AI-generated session summary. Runs entirely offline by default; cloud LLM is an opt-in enhancement for summarization only. Controlled by the `VTTCHAT_SUMMARY_PROCESSING_ENABLED` capability gate (off by default).

**Docs**: [docs/architecture/TRANSCRIPTION-RECORDING-SYSTEM.md](docs/architecture/TRANSCRIPTION-RECORDING-SYSTEM.md), [docs/ai/AI-CONTEXT-SUMMARY-PROCESSING.md](docs/ai/AI-CONTEXT-SUMMARY-PROCESSING.md)

---

### W-DM-Quick-Generate

**Status**: ⚪ Not Started
**Priority**: 🔵 Low
**Depends on**: W-AI-Writing-Assistant

DM-facing chat slash commands that generate quick narrative content on demand — NPCs, locations, encounters, traps, rumors, and weather — without leaving the chat panel. Commands follow the same pattern as `/loot-random`: typed in chat, resolved server-side, output as a system message and (optionally) persisted to campaign data. AI provider optional: falls back to static D&D 5e tables when no provider is configured.

Commands planned: `/npc`, `/place`, `/encounter`, `/trap`, `/rumor`, `/weather`

**Docs**: [docs/dm-tools/DM-QUICK-GENERATE.md](docs/dm-tools/DM-QUICK-GENERATE.md)

---

### W-AI-Writing-Assistant

**Status**: ⚪ Not Started
**Priority**: 🔵 Low
**Depends on**: W-Notes-Editor (done)

In-editor AI assistance for Notes and Journal. "Ask AI" button opens a non-blocking inline prompt panel; output shown as a diff-preview before the user accepts. Works with a local LLM or optional cloud AI (opt-in, per-campaign consent required). DM-private notes and Whisper content are never included in AI context, regardless of provider.

**Docs**: [docs/ai/AI-WRITING-ASSISTANT.md](docs/ai/AI-WRITING-ASSISTANT.md), [docs/subsystems/DMDX-MARKDOWN-EXTENSION.md](docs/subsystems/DMDX-MARKDOWN-EXTENSION.md)

---

### W-Desktop-App

**Status**: ⚪ Not Started
**Priority**: 🔵 Low

Tauri-based desktop client for Windows, macOS, and Linux. Uses the existing backend — no new server-side contracts required. Primary benefit: native OS integration (notifications, file system access for recording output, system tray).

---

### W-PWA-App

**Status**: ⚪ Not Started
**Priority**: 🔵 Low

Progressive Web App for mobile and desktop browsers. Installable, works offline for basic navigation and read-only access.

---

### W-Accessibility-Advanced

**Status**: ⚪ Not Started
**Priority**: 🔵 Low

Full WCAG AAA compliance, enhanced screen reader coverage, voice control, and adaptive input support. Builds on the WCAG AA baseline shipped in v0.8.0.

**Docs**: [docs/ui/ACCESSIBILITY.md](docs/ui/ACCESSIBILITY.md)

---

### W-Localization

**Status**: ⚪ Not Started
**Priority**: 🔵 Low

i18n translation framework, string extraction tooling, and multi-language support for the frontend and admin apps.

---

## Recently Completed

### W-Inventory-System — v0.9.5 / v0.9.6

🟢 Done — Core inventory shipped in v0.9.5; remaining items closed in v0.9.6:

- Inventory history filter by owner (character / party) and date range
- Currency transfer UI with dual-balance preview, denomination-coloured inputs, and role-gated give/take flows
- `/loot-split` redesigned as an immediate auto-split (no accept flow); non-even remainders go to party
- Broken slash commands fixed (`/loot`, `/loot-split`, `/spend`, `/earn`, `/take`, `/give`, `/drop`)

**Docs**: [docs/subsystems/INVENTORY-SYSTEM.md](docs/subsystems/INVENTORY-SYSTEM.md)

---

## See Also

- [docs/DEVELOPMENT-ROADMAP-2026-06.md](docs/DEVELOPMENT-ROADMAP-2026-06.md) — Completed phases and historical delivery notes
- [docs/CONTRACTS.md](docs/CONTRACTS.md) — API and WS event contracts
- [docs/architecture/](docs/architecture/) — Per-subsystem architecture docs
- [CHANGELOG.md](CHANGELOG.md) — Release history

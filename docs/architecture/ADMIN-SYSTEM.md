# Admin System — UI Design & Acceptance Criteria

**Status**: Design / Pre-implementation  
**Supersedes**: The scattered placeholder notes in `ROADMAP.md → Admin System`  
**Auth & RBAC**: Defined in [`ADMIN-ARCHITECTURE.md`](ADMIN-ARCHITECTURE.md) — this document does not repeat that content.  
**Related**: [`QUEUE-JOB-MANAGER.md`](QUEUE-JOB-MANAGER.md), [`docs/ai/LOCAL-AI-PROVIDER.md`](../ai/LOCAL-AI-PROVIDER.md), [`docs/architecture/EMAIL-SYSTEM.md`](EMAIL-SYSTEM.md)

---

## 1. Vision

The Admin console is a **mini command centre for a sysadmin with a D&D flavour**. It is not a game interface — it is a professional operations tool that happens to be steeped in the aesthetic language of the campaigns it serves.

### Design Philosophy

- **Clarity first**: every control has an obvious effect. No mystery meat, no ambiguous icons without labels.
- **Safe defaults**: all configuration ships with sensible values. Admins can change things as needed, but the system should work well without touching Settings.
- **Progressive disclosure**: the common 80% of actions are immediate and prominent; destructive or rare operations are one extra step away.
- **Moderate D&D flavour**: nav items use functional English labels; page headers use fantasy-titled subtitles (e.g. "Dashboard — *The Scrying Pool*"). Section headings within pages may lean further into the theme. Icons draw on the D&D aesthetic (scrolls, tomes, dice, crystal ball, shield). Colour palette favours deep dungeon blues, amber for warnings, crimson for danger, and aged parchment tones in dark mode.

---

## 2. Navigation Structure

### Current → New (consolidation map)

| Current nav item | New nav item | Change |
|---|---|---|
| Dashboard | **Dashboard** | Absorbs Analytics + System Health |
| Analytics | *(removed)* | Merged into Dashboard |
| System Health | *(removed)* | Merged into Dashboard |
| Rooms & Campaigns | **Campaigns** | Renamed, spec expanded |
| Users | **Users** | No change in position |
| Logs & Activity | **Logs** | Renamed, scope clarified |
| Settings | **Settings** | Absorbs Integrations, major expansion |
| Integrations | *(removed)* | Folded into Settings → External Systems |

### Final Top-Level Nav (5 items)

```
[⟡ Dashboard]  [⚔ Campaigns]  [⚜ Users]  [⚙ Settings]  [📜 Logs]
```

Nav items display a short functional label and a small themed icon. The fantasy subtitle appears only on the page header, not in the sidebar.

---

## 3. Page Specifications

---

### 3.1 Dashboard — *The Scrying Pool*

**Purpose**: Instant operational awareness. One glance tells the admin whether everything is healthy, who is online, and whether any jobs are stuck.

#### Layout

Three zones, top-to-bottom:

**Zone A — Status Strip** (always-visible, auto-refreshes every 15s)

| Metric | Detail |
|---|---|
| Active Sessions | Campaigns currently in ACTIVE state |
| Connected Users | Live WebSocket connections |
| System Status | Aggregate health pill: Healthy / Degraded / Critical |
| Last Backup | Time since last successful backup (amber if > 24h, red if > 72h) |
| Error Rate (1h) | Errors in the last hour |

**Zone B — Activity Charts** (time range selector: 1h / 24h / 7d)

Two charts side-by-side:
- **Message Throughput** (messages/min over time) — colour: `#22c55e`
- **Connected Users** (concurrent connections over time) — colour: `#60a5fa`

Below the charts, a second row:
- **CPU Load (%)** — colour: `#f59e0b`
- **Memory Usage (%)** — colour: `#a78bfa`
- **Disk Usage (%)** — colour: `#fb923c`
- **Network I/O** (bytes/s in+out) — colour: `#e879f9`

All charts share the same time axis. Values are sourced from `/telemetry/status` and `/telemetry/dashboard`.

**Zone C — Running Jobs** (live queue summary)

A compact table of active and recently-failed jobs, grouped by queue:

| Queue | Active | Waiting | Failed (24h) | Actions |
|---|---|---|---|---|
| backup | 0 | 1 | 0 | — |
| transcription | 1 | 0 | 2 | Retry Failed |

Clicking a queue name navigates to the full job inspector in Settings → Job Queues.

#### Acceptance Criteria

- [ ] Replaces the three current overlapping telemetry pages (Dashboard, Analytics, PlatformStatus)
- [ ] Time-range selector persists in session storage (doesn't reset on page nav)
- [ ] System Status pill turns amber at ≥ 70% CPU or memory; red at ≥ 85%
- [ ] Last Backup time is sourced from job history, not Settings — it reflects the actual last successful completion
- [ ] Running Jobs panel shows a zero-state ("All queues clear — *the roads are safe*") when nothing is active or failed
- [ ] Charts support empty-state gracefully (no data → dashed empty area, not an error)
- [ ] Auto-refresh does not cause scroll-jump or layout shift

---

### 3.2 Campaigns — *The Chronicle*

**Purpose**: Full lifecycle management of every campaign. Read-heavy; most operations are triggered via contextual actions on a campaign row or detail panel. Admins cannot edit campaign content — only manage its lifecycle and metadata.

#### Layout

Left-side filtered list + right-side detail panel (master-detail).

**Campaign List** (left, ~40% width)

- Search bar (name, DM username)
- Status filter: All / Active / Idle / Archived / Locked
- Sort: Name / Created / Last Session / Storage Used
- Each row: campaign name, DM avatar+name, status badge, player count, last session date, storage used
- Pagination or virtual scroll for large lists

**Campaign Detail Panel** (right, ~60% width)

Tabs within the detail panel:

**Overview tab**
- Campaign name (display only) + Edit Name action (Super Admin / Admin only)
- DM name + Reassign DM button (opens a player picker — only existing players in the campaign)
- Status badge + status history (last 5 transitions)
- Created at / Last session at
- Storage breakdown: chat history, recordings, notes, handouts, audio assets
- Total storage used (prominent)
- Campaign tags / notes (admin-only annotation field, not visible to players)

**Sessions tab**
- Table of all sessions: date, state at end, duration, player count, DM
- Each row expandable: shows rooms active, conditions in play, message count
- For ENDED sessions: link to session log (chat history) and recordings (if any)
- Filter by date range, state

**Players tab**
- Table: username, role (DM / Player), characters, join date, last seen
- Action per row: Remove from Campaign (with confirmation)
- No editing of character details — read-only

**Recordings tab**
- Table: session date, duration, file size, status (available / processing / failed)
- Download link per recording (Super Admin only)
- Status reflects the transcription pipeline if enabled
- Zero-state: "Recording pipeline not yet enabled — see ROADMAP for W-Recording-Transcription-Summary"

**Danger Zone tab** (collapsible, red border)
- Lock Campaign (freezes the campaign, prevents new sessions, reversible)
- Archive Campaign (soft-delete; campaign is hidden from DM; recoverable)
- Export Campaign (generates a portable bundle: JSON + assets)
- Restore Campaign (from a previously exported bundle — file upload)
- Backup Campaign (triggers an immediate backup job)
- Import Campaign (import from external bundle — creates a new campaign, does not overwrite)
- *Delete Campaign (Super Admin only; permanent; requires typing campaign name to confirm)*

#### Acceptance Criteria

- [ ] Admins CANNOT edit rooms, chat history, player notes, audio settings, or any in-session content
- [ ] "Reassign DM" picker shows only current campaign members; warns that the existing DM loses DM role
- [ ] "Rename Campaign" changes only the display name; no cascade to session history or recordings
- [ ] Export produces a self-contained bundle suitable for import into another VTT-Chat instance
- [ ] Lock state is enforced at the API layer (not just UI gating); locked campaigns cannot be started
- [ ] Archive hides from DM view but the campaign is fully recoverable by Admin/Super Admin
- [ ] Delete is Super Admin only, requires typed confirmation, and emits an audit log entry
- [ ] Storage shown is real: sourced from the database, not a placeholder percentage
- [ ] Recordings tab shows a clear "not yet enabled" state when the pipeline is off; does not show errors

---

### 3.3 Users — *Guild Roster*

**Purpose**: Visibility into every account; moderation and access control.

#### Layout

Full-width table with inline action panel (slides in from the right on row click).

**User Table**

Columns: Avatar, Username, Email, Role (admin badge if applicable), Status (Active / Suspended / Archived), Campaigns (count, expandable), Last Seen, Joined

Filters: Status / Role / Campaign membership / Search (username, email)

**User Detail Panel** (slide-in)

- Profile summary: avatar, username, email, join date, last login, IP of last login
- Campaigns: list of campaigns they belong to with their role in each
- Characters: list of characters across all campaigns
- Admin role badge (if applicable)
- Suspension history (if any)

**Actions** (contextual, role-gated):

| Action | Who can perform | Notes |
|---|---|---|
| Reset Password | Admin, Super Admin | Sends a reset email; does not expose new password |
| Ban (Temporary) | Admin, Super Admin | Duration selector: hours / days / permanent; shows in user status |
| Kick (Session Only) | Admin, Super Admin | Forces disconnection; does not ban |
| Archive User | Super Admin | Soft-delete; preserves all data |
| Restore User | Super Admin | Restores archived user |
| Promote to Admin | Super Admin | Opens role selector: Admin / Read-only |
| Demote from Admin | Super Admin | Removes admin role; user remains a regular member |
| Invite via Email | Admin, Super Admin | Sends an invite email; new users land on onboarding |

**Ban Configuration Modal** (when banning):
- Reason (required — stored in audit log and shown to user on login)
- Duration: 1h / 6h / 24h / 3 days / 7 days / 30 days / Permanent
- Notify by email (toggle, default on)

#### Acceptance Criteria

- [ ] Bans are enforced at the API layer; suspended users are rejected at session and WS connection
- [ ] Kicked users receive a `SESSION_KICKED` WS event before disconnection
- [ ] Archived users cannot log in; their data is not shown to other players but is not deleted
- [ ] Password reset sends email via the configured email provider; does not display or log the reset link
- [ ] Invite sends an email with a one-time onboarding link; link expires after 48 hours
- [ ] Promoting a user to Admin adds the role without requiring them to log out and back in
- [ ] All moderation actions are written to the audit log (actor, target, action, timestamp, reason)
- [ ] Table handles 1000+ users without layout degradation (virtual scroll or server-side pagination)

---

### 3.4 Settings — *The Tome*

**Purpose**: Configure all system-level behaviour. Sensible defaults mean most sections can be ignored during normal operation. Sections are grouped thematically; each section is independently saveable.

#### Sub-sections (sidebar within the Settings page)

```
System
  ├── General
  ├── Feature Flags
  └── Maintenance

Email
  ├── SMTP Configuration
  └── Email Templates

AI Integration
  ├── Provider Configuration
  └── Model Selection

Backup & Recovery
  ├── Backup Schedule
  └── Backup History

Job Queues
  ├── Schedule Configuration
  └── Queue Inspector

Storage
  └── Retention Policies

External Systems
  └── Integration Management  ← (formerly the Integrations page)
```

---

#### 3.4.1 General

- Primary Region (existing)
- Site display name (shown in emails and the browser tab)
- Admin console session timeout (hours; default 24)
- Max campaigns per user (default 0 = unlimited)

#### 3.4.2 Feature Flags

- Chat Pipeline enabled/disabled (existing)
- Audio Overrides enabled/disabled (existing)
- AI Writing Assistant enabled/disabled (requires AI provider configured)
- Recording & Transcription enabled/disabled (requires AI provider configured; off by default)
- DM Quick Generate enabled/disabled (falls back to static tables if AI is off)
- Guest accounts enabled/disabled

#### 3.4.3 Maintenance

- Maintenance Mode: Off / Read-only / Full (existing)
- Maintenance message (displayed to users when mode is active)
- Scheduled maintenance window (future: datetime range + recurring)

---

#### 3.4.4 SMTP Configuration

Fields:
- Host, Port
- Username, Password (masked)
- Encryption: None / STARTTLS / TLS
- From address, From display name
- Reply-to address (optional)
- Send test email (button — sends to the logged-in admin's email)

Save and test are independent actions: save persists the config, test fires a test message without saving.

#### 3.4.5 Email Templates

A list of all system email templates with a preview + edit panel.

Templates:

| Template | Trigger |
|---|---|
| User Invite | Admin invites a new user |
| Password Reset | User requests a password reset |
| Campaign Invite | DM invites a player to a campaign |
| Ban Notice | User is banned (when "notify by email" is on) |
| Session Summary | Post-session summary delivery (when recording pipeline is on) |
| Admin Alert | System alert email to admins |

Each template has:
- Subject line (with `{{variable}}` tokens)
- Body (Markdown + HTML; preview renders both)
- Available variables listed alongside the editor
- Reset to Default button

Templates are stored in the database; defaults are seeded on first run.

---

#### 3.4.6 AI Provider Configuration

The AI subsystem is optional. When disabled, features fall back to static tables or are hidden entirely.

**Provider Mode selector** (radio/card UI):

| Mode | Description |
|---|---|
| **Disabled** | No AI features. DM Quick Generate uses static D&D 5e tables. Writing Assistant is hidden. |
| **Local (Ollama)** | Ollama running in Docker on this machine. Base URL defaults to `http://ollama:11434`. |
| **Remote GPU** | Ollama or compatible server on another machine on the same network (e.g. gaming PC). Custom base URL + optional bearer token. |
| **Cloud API** | OpenAI or Anthropic. API key + model selection. Data leaves the server; per-campaign consent required. |

When a mode is selected, only the relevant fields are shown (no dead fields).

**Local / Remote GPU fields:**
- Base URL (default `http://ollama:11434` for local)
- Bearer token (optional, for remote)
- Test Connection button (pings `/api/tags` on the Ollama endpoint)
- Available models (auto-populated after a successful connection test)
- Summary model selector (dropdown from available models)
- Assistant model selector (dropdown from available models)

**Cloud API fields:**
- Provider: OpenAI / Anthropic
- API Key (masked after save)
- Summary model (e.g. `claude-opus-4-8`, `gpt-4o`)
- Assistant model (e.g. `claude-haiku-4-5-20251001`, `gpt-4o-mini`)
- Monthly spend limit (USD; 0 = unlimited)
- Data privacy notice (non-dismissible when Cloud mode is active: "AI prompts are sent to a third-party cloud provider. Per-campaign consent is required before use.")

**Health indicator**: a small status chip shows the last-known connection state (Connected / Unreachable / Not configured). Clicking it runs a live test.

See [`docs/ai/LOCAL-AI-PROVIDER.md`](../ai/LOCAL-AI-PROVIDER.md) for the full two-model architecture and model recommendations.

---

#### 3.4.7 Backup Schedule

- Backup target: Local filesystem path / S3-compatible endpoint
  - Local: directory path (must be writable by the backend process)
  - S3: bucket name, endpoint URL, access key, secret key, path prefix
- Schedule: cron expression with a human-readable preview (e.g. `0 2 * * *` → "Every day at 02:00")
- Retention: keep last N backups (default 7)
- Backup Now button (immediate one-off job; shows live status)
- Next scheduled backup (computed from cron + current time)

#### 3.4.8 Backup History

Table of past backup jobs:
- Started at, Completed at, Duration
- Status: Success / Failed / In Progress
- Size (compressed)
- Target path / S3 key
- Download (Super Admin only, for local targets)
- Retry (for failed jobs)

---

#### 3.4.9 Job Queue Schedule

Per-queue schedule configuration:

| Queue | Description | Default schedule |
|---|---|---|
| backup | Database backup | Daily 02:00 |
| transcription | Audio transcription (if enabled) | After each session |
| summary | Session summary generation (if enabled) | After transcription |
| cleanup | Purge expired data, temp files | Weekly Sunday 03:00 |

Each queue shows its current schedule (cron) with an editable field and human-readable preview.

Changes save immediately; a confirmation toast confirms the new schedule.

#### 3.4.10 Queue Inspector

A live view of the job queue system (data from `GET /api/admin/queues`).

Per queue:
- Active count, Waiting count, Failed count, Completed (24h)
- Expandable failed jobs table: job ID, error message, attempts, last attempted at
- Per-job actions: Retry, Delete

Bulk actions: Retry All Failed (per queue), Obliterate Queue (Super Admin only, with typed confirmation).

Auto-refreshes every 10 seconds when the Queue Inspector sub-section is open.

---

#### 3.4.11 Storage / Retention Policies

- Log retention (days) — existing
- Telemetry retention (days) — existing
- Diagnostic log retention (days) — existing
- Max log file size (MB) — existing
- Max log files per sink — existing
- Recording file retention (days; 0 = keep forever)

#### 3.4.12 External Systems (formerly Integrations)

The existing Integrations table is relocated here. No functional change to the table itself.

Title: "External Systems — *Authorized Guilds*"  
Subtitle: "Third-party systems permitted to authenticate players or push event logs."

The same Authorize / Log Only / Block actions from the current page are preserved.

---

#### Settings Acceptance Criteria

- [ ] Each section is independently saveable; saving one section does not reset unsaved changes in another
- [ ] All sensitive fields (passwords, API keys) are masked after initial save; shown only on explicit "reveal" action
- [ ] SMTP test email is sent to the logged-in admin's email only — never to an arbitrary address
- [ ] AI Provider connection test is non-destructive and does not save any changes
- [ ] Cron expressions show a human-readable preview as-you-type
- [ ] Backup target (local/S3) is validated before save; a test-write is attempted against the target
- [ ] All Settings changes are written to the admin audit log
- [ ] Cloud API mode shows a persistent data-privacy notice that cannot be dismissed or hidden

---

### 3.5 Logs — *Hall of Records*

**Purpose**: Unified, searchable log viewer for every event type. Single place to go when something breaks.

#### Log Types (tabs)

| Tab | Source | Retention |
|---|---|---|
| **Events** | WS event stream, session lifecycle events | Configured in Settings |
| **Errors** | Application errors, unhandled exceptions | Configured in Settings |
| **Email** | Outbound email delivery results | Configured in Settings |
| **Trace** | Diagnostic/verbose backend traces | Configured in Settings |
| **Audit** | Admin action log (from ADMIN-ARCHITECTURE.md §8) | Immutable; Super Admin only for export |

#### Shared Controls (all tabs)

- Time range picker: Last 1h / 6h / 24h / 7d / Custom
- Search / filter bar (full-text or structured, depending on log type)
- Export as JSON or CSV (date-range limited; warns if range is large)
- Auto-refresh toggle (default off — fetching continuously would mask reading)
- Log level filter where applicable (error / warn / info / debug)

#### Events tab specifics

- Filter by event family (AUDIO, ROOM, SESSION, PRESENCE, CAMPAIGN, CHAT, NOTES)
- Filter by campaign or session ID
- Expandable rows show full event payload (JSON viewer with syntax highlight)

#### Errors tab specifics

- Stack trace expansion per error
- Group by error message (toggle)
- Mark as reviewed (Admin action; noted in audit log)

#### Email tab specifics

- Status column: Queued / Sent / Bounced / Failed
- Recipient, template name, sent at, delivery latency
- Retry failed email (re-queues the send job)

#### Trace tab specifics

- Read-only; verbose level means high volume — default range is 1h
- Warning banner: "Trace logs are high-volume diagnostic data. Extended exports may be slow."

#### Audit tab specifics

- Restricted to Super Admin and Admin (read-only for Admin)
- Columns: Timestamp, Actor, Action, Target, Changes (old→new), IP, Status
- Cannot be deleted from the UI (purge is a Super Admin API-level operation)

#### Acceptance Criteria

- [ ] All five log types are accessible from a single page via tabs — no separate nav items
- [ ] Log viewer handles empty states with a thematic zero-state message per tab (e.g. "The roads are quiet — no errors in the last 24 hours")
- [ ] Large result sets use virtual scrolling or server-side pagination, not DOM-dumping
- [ ] Export warns if the requested range would exceed a reasonable row count (e.g. > 10,000 rows) and asks for confirmation
- [ ] Audit tab is hidden from the nav for Campaign DM and Read-only roles
- [ ] Expanding a log row does not navigate away from the log list

---

## 4. Design Language

### Icons (themed, not literal)

| Concept | Icon style |
|---|---|
| Dashboard / status | Crystal ball / scrying orb |
| Campaigns | Open book / chronicle |
| Users | Shield with crest / guild sigil |
| Settings | Tome / grimoire |
| Logs | Scroll / parchment roll |
| AI integration | Rune / arcane sigil |
| Jobs / queues | Clockwork gear with a D20 |
| Danger Zone actions | Red sigil / wax-seal-with-skull motif |
| Success states | Green lantern / lit torch |
| Warning states | Amber hourglass |
| Error / critical | Crimson sword-cross |

Icons must always have a visible text label or aria-label. Never icon-only controls for non-obvious actions.

### Colour Palette (dark mode primary)

| Role | Hex |
|---|---|
| Background (deep) | `#0e1117` |
| Surface (cards, panels) | `#161b27` |
| Border | `#2a3147` |
| Text primary | `#e8e6e0` (warm white, parchment tint) |
| Text secondary | `#7e8698` |
| Accent (interactive) | `#5865d4` (arcane blue) |
| Success | `#22c55e` |
| Warning | `#f59e0b` |
| Danger | `#ef4444` |
| AI / magic | `#a78bfa` (arcane purple) |

### Copy Tone

- Section headers may use fantasy language ("*The Scrying Pool*", "*Guild Roster*") as subtitles only — primary headings remain functional.
- Zero-states use brief atmospheric flavour text followed by a clear action CTA.
- Destructive confirmation dialogs: plain language, no thematic fluff. Clarity over atmosphere when the stakes are high.
- Error messages: plain English, no jargon, no fantasy framing.

---

## 5. Structural Changes from Current Admin

### Pages being removed

| Removed page | Reason | Content moved to |
|---|---|---|
| `Analytics` | Redundant with Dashboard | Dashboard Zone B (charts) |
| `PlatformStatus` / System Health | Redundant with Dashboard | Dashboard Zone A (status strip) + Zone B |
| `Integrations` | Too thin for a top-level nav slot | Settings → External Systems |

### Settings scope expansion

The existing `RuntimeSettings` type and its four current sections (System Config, Feature Flags, Storage, Log Sink Policies) are preserved and extended. New sections (Email, AI, Backup, Job Queues, External Systems) are additive — they do not require migrating existing data.

---

## 6. Implementation Notes

### Framework

The current admin app uses **Material UI (MUI)** with a custom dark theme. This spec is compatible with that stack. Custom D&D-flavoured icons should be SVG assets in `apps/admin/src/assets/icons/`.

### File size constraint

Per CLAUDE.md: no source file > 400 lines. Each Settings sub-section should be its own component file. Each Dashboard zone should be its own component.

### Data sources

- Telemetry / system metrics: existing `/api/admin/telemetry/*` endpoints (extend as needed)
- Jobs: existing `/api/admin/queues/*` proxy endpoints (already built)
- AI provider health: new `GET /api/admin/ai/status` — returns connection state + available models
- Backup history: new `GET /api/admin/backups` — returns job history from the queue system
- Email logs: extend existing log sink to expose email delivery results via `GET /api/admin/logs/email`

### AI settings persistence

AI provider configuration (mode, endpoint, keys) is stored in the `RuntimeSettings` record in the database. Keys are encrypted at rest using the server's `SECRET_KEY`. They are never returned in full via the API after initial save — the GET response returns masked values.

### Recordings (future)

The Recordings tab in Campaigns is a **defined placeholder** for `W-Recording-Transcription-Summary`. The tab should render with a clear "not yet available" state that links to the relevant roadmap item. Do not show loading spinners or errors for a feature that isn't built yet.

---

## 7. Acceptance Criteria — System-level

- [ ] Admin console passes a WCAG 2.1 AA audit for all interactive controls
- [ ] All five top-level nav items render within 500ms of navigation (no full-page skeleton delays)
- [ ] No admin action irreversibly destroys data without: (a) a typed confirmation, (b) an audit log entry, (c) Super Admin role requirement
- [ ] The console renders correctly at 1280px wide (minimum desktop target); no horizontal scroll
- [ ] The AI settings section is fully functional when AI is disabled (i.e. the section is accessible and allows enabling AI, not hidden until AI is on)
- [ ] All forms show field-level validation errors inline, not only on submit
- [ ] The admin console does not share component code with the main frontend beyond `packages/shared/` utilities — no accidental coupling

---

## 8. Out of Scope for This Release

- Mobile/tablet layout (admin is desktop-only)
- 2FA for admin login (noted in ADMIN-ARCHITECTURE.md §9 as future)
- IP whitelisting for admin access
- Approval workflows for destructive operations
- LDAP/SAML integration
- Real-time collaborative admin sessions (two admins editing Settings simultaneously)

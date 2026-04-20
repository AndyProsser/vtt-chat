# VTT-Chat

> A DM-grade, session-aware voice and chat platform built specifically for tabletop RPGs — because Discord was never designed for this.

<!--
Build and release status badges will be enabled once CI workflows are activated.

[![Backend CI](https://github.com/AndyProsser/vtt-chat/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/AndyProsser/vtt-chat/actions/workflows/backend-ci.yml)
[![Frontend CI](https://github.com/AndyProsser/vtt-chat/actions/workflows/frontend-ci.yml/badge.svg)](https://github.com/AndyProsser/vtt-chat/actions/workflows/frontend-ci.yml)
[![Release](https://github.com/AndyProsser/vtt-chat/actions/workflows/release.yml/badge.svg)](https://github.com/AndyProsser/vtt-chat/actions/workflows/release.yml)
-->

**Version:** 0.5.2 — active development, not yet production-ready\
**Status:** Stages 0–7 complete · Stage 8 in progress · Stages 9–13 planned — see [ROADMAP.md](ROADMAP.md)\
**Release notes:** [CHANGELOG.md](CHANGELOG.md)

---

## What Is VTT-Chat?

VTT-Chat is a self-hostable communication platform designed from the ground up for tabletop role-playing games. It replaces the awkward combination of Discord voice, browser tabs, and scattered notes that most groups cobble together.

The platform is built around how tabletop sessions actually work:

- The **DM has full authority** — over the session, audio, presence, and what spectators can see.
- **Roles are first-class citizens** — DM, Player, and Spectator each have a tailored experience with explicit, documented permission boundaries.
- **Privacy is enforced by design** — whispers stay private, DM notes are never exposed, and spectators cannot access the green room.
- **Sessions have a lifecycle** — green room → active session → recap, with state persisted through reconnects and network drops.

VTT-Chat is designed for groups that play regularly and want something that feels native to the hobby, not bolted together from general-purpose tools.

---

## Why Not Discord?

Discord is a fantastic general-purpose voice and chat tool. It was not designed for TTRPGs. Specifically, it lacks:

- **DM-controlled session gating** — you cannot lock a voice channel to session-only access, or meaningfully separate "at the table" from "watching from the sidelines".
- **Role-aware chat** — in-character and out-of-character messages live in the same stream. Whispers are channel invites.
- **Integrated notes and audio** — ambient sound, trigger effects, and shared notes require third-party bots or separate apps.
- **VTT integration** — there is no first-party bridge between your character sheet and your voice channel.
- **Spectator support** — there is no concept of a read-only observer who can watch a session without being a full participant.

VTT-Chat is what Discord would be if it was purpose-built for tabletop games.

---

## How It Works

```
Browser Extension (D&D Beyond / Roll20 / Foundry)
      |  scrapes identity + character data
      v
  VTT-Chat Frontend (React SPA)
      |  WebSocket + REST
      v
  VTT-Chat Backend (Node.js / Express)
      |
      +-- PostgreSQL  — persistent campaign, session, chat, and notes state
      +-- Redis       — ephemeral presence, session bus, pub/sub
      +-- LiveKit     — real-time voice and audio routing
```

Players and DMs connect via the web app and the browser extension. The extension scrapes identity and character data from supported VTTs (D&D Beyond first; Roll20 and Foundry planned) and authenticates users automatically using a per-campaign invite code — no manual account creation required. Your VTT account is the credential.

Spectators join via a separate web-only invite page. No extension or VTT account is required to watch.

---

## Tech Stack

| Layer             | Technology                                |
| ----------------- | ----------------------------------------- |
| Frontend          | React 19, Vite, Zustand, TypeScript       |
| Backend           | Node.js, Express 5, TypeScript            |
| Realtime          | WebSocket (`ws`), LiveKit (voice + audio) |
| Database          | PostgreSQL (via Prisma ORM)               |
| Cache / Bus       | Redis                                     |
| Reverse proxy     | Caddy (automatic HTTPS)                   |
| Containers        | Docker + Docker Compose                   |
| Browser extension | Separate repo — see below                 |

---

## Design Philosophy

VTT-Chat is built on four principles:

1. **DM authority is absolute.** The DM starts and ends sessions, controls audio, manages presence, and sets spectator policy. Nothing overrides this.
2. **Roles before features.** Every capability is defined by role (DM, Player, Spectator), not by feature flags. The [Permissions Matrix](docs/architecture/PERMISSIONS-MATRIX.md) is the authoritative reference.
3. **Privacy by default.** Whispers, DM notes, and green room state are never exposed to unauthorised roles — enforced server-side, not just hidden in the UI.
4. **Deterministic state.** All state changes flow through typed events and deterministic reducers. There are no side-effects outside the defined event pipeline.

See [docs/philosophy/](docs/philosophy/) for the full philosophy documentation.

---

## Repository Structure

```
vtt-chat/
  backend/    — Node.js/Express API, WebSocket server, Prisma schema
  frontend/   — React SPA (player/DM client)
  admin/      — React SPA (sysadmin panel)
  shared/     — Shared TypeScript types, event contracts, validators
  docs/       — Full architecture, design, and API documentation
  install.sh  — Ubuntu Server home deployment script
```

The browser extension lives in a separate repository: **[AndyProsser/vtt-chat-extension](https://github.com/AndyProsser/vtt-chat-extension)**

---

## Quick Start — Self-Hosting on Ubuntu Server

VTT-Chat is designed to run on a home server or small VPS. The `install.sh` script handles all dependencies and initial configuration on Ubuntu Server 22.04+.

**Before you start, you will need:**

- A domain name pointing at your server (Caddy handles automatic HTTPS)
- Ports **8443/TCP** (HTTPS), **7880/TCP** (LiveKit), and **7881–7980/UDP** (LiveKit media) open in your firewall or router

### 1. Run the installer

```bash
curl -fsSL https://raw.githubusercontent.com/AndyProsser/vtt-chat/main/install.sh | sudo bash -s setup
```

This installs Docker, Caddy, and UFW; downloads the latest release; and writes a config file at `/opt/vtt-chat/install-config.yml`.

### 2. Edit the config

```bash
sudo nano /opt/vtt-chat/install-config.yml
```

Set your domain name at minimum. Passwords marked `auto` are generated randomly on first run.

### 3. Start the stack

```bash
cd /opt/vtt-chat
docker compose up -d
```

VTT-Chat will be available at `https://your-domain:8443`.

For full setup details, reverse-proxy configuration, and upgrade instructions see [docs/operations/](docs/operations/).

---

## Developer Quick Start

See [DEVELOPING.md](DEVELOPING.md) for the full setup guide (Linux/Ubuntu focused). The short version:

**Requirements:** Node.js 25, Docker, Docker Compose

```bash
git clone https://github.com/AndyProsser/vtt-chat.git
cd vtt-chat
npm install                                        # installs all workspaces
docker compose -f docker-compose.dev.yml up -d    # starts Postgres, Redis, LiveKit
# in separate terminals:
npm run dev --prefix backend
npm run dev --prefix frontend
```

Backend runs on `http://localhost:3000`, frontend on `http://localhost:5173`.

---

## Documentation

The full documentation suite lives in [`docs/`](docs/README.md) and covers architecture, API specification, data model, permissions, subsystem behaviour, and the extension integration.

Key entry points:

| Document                                                                               | Purpose                                  |
| -------------------------------------------------------------------------------------- | ---------------------------------------- |
| [docs/README.md](docs/README.md)                                                       | Full documentation index                 |
| [ROADMAP.md](ROADMAP.md)                                                               | Delivery stages and current build status |
| [CHANGELOG.md](CHANGELOG.md)                                                           | Release history                          |
| [docs/architecture/ARCHITECTURE-DIAGRAM.md](docs/architecture/ARCHITECTURE-DIAGRAM.md) | System structure overview                |
| [docs/architecture/PERMISSIONS-MATRIX.md](docs/architecture/PERMISSIONS-MATRIX.md)     | Role capability reference                |
| [docs/architecture/API-SPEC.md](docs/architecture/API-SPEC.md)                         | REST and WebSocket API                   |
| [docs/extension/GUEST-AUTH.md](docs/extension/GUEST-AUTH.md)                           | Extension auth and invite flow           |
| [DEVELOPING.md](DEVELOPING.md)                                                         | Developer environment setup              |

---

## Contributing

Contributions are welcome. Before opening a pull request:

1. Read [DEVELOPING.md](DEVELOPING.md) for environment setup.
2. Check [ROADMAP.md](ROADMAP.md) for current focus areas and planned stages.
3. Follow the existing code style (ESLint + Prettier, enforced by CI).
4. Add or update tests for any changed behaviour.
5. Keep PRs focused — one concern per PR.

For larger changes or new features, open a discussion issue first so the design can be agreed before implementation starts.

**[Submit a bug report or feature request →](https://github.com/AndyProsser/vtt-chat/issues)**
**[Open a pull request →](https://github.com/AndyProsser/vtt-chat/pulls)**

See [docs/meta/CONTRIBUTING.md](docs/meta/CONTRIBUTING.md) for the full contribution guide and [docs/meta/ONBOARDING.md](docs/meta/ONBOARDING.md) for new contributor onboarding.

---

## Release and Versioning

This repository uses semantic-release with Conventional Commits to determine version bumps and generate release notes.

- Feature commits (`feat`) trigger minor releases.
- Fix/documentation/refactor commits (scoped) trigger patch releases.
- Release notes are written to [CHANGELOG.md](CHANGELOG.md).

Version maintenance rules:

1. `package.json` is the canonical project version.
2. `backend/package.json`, `frontend/package.json`, `admin/package.json`, and `shared/package.json` must match the root version.
3. The version line in this README must match the latest released version.

See [docs/meta/RELEASE-PLAN.md](docs/meta/RELEASE-PLAN.md) for commit scopes, release buckets, and message templates.

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating you agree to abide by its terms.

---

## License

[MIT](LICENSE)

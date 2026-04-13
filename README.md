# VTT‑Chat
*A DM‑grade, session‑aware tabletop voice & chat platform for D&D and other TTRPGs.*

![Status](https://img.shields.io/badge/status-active%20development-brightgreen)
![Docker](https://img.shields.io/badge/Docker-ready-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue)
![React](https://img.shields.io/badge/React-19.x-61dafb)
![LiveKit](https://img.shields.io/badge/LiveKit-voice%20optimized-ff8800)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 🎯 Project Summary

**VTT‑Chat** is a lightweight, privacy‑respecting, DM‑controlled **voice‑first virtual tabletop communication platform** designed for home‑hosted campaigns. It provides:

- High‑quality **voice chat** powered by **LiveKit** (voice-only optimized, no video overhead)
- **DM voice presets**, **player conditions**, and **room environments**
- **Session‑aware chat** with boundaries and lazy‑loading
- **Metadata cards** (XP, loot, encounters, combat, recap)
- **Notes system** with DM‑controlled visibility
- **Player‑safe audio controls** (gain/gate/mute/device)
- **DM‑only overrides** (session‑scoped)
- **Admin dashboard** for platform management, user/campaign control, analytics, and system logs
- **HomeLab‑friendly deployment** with Docker + Caddy
- **Self‑signed TLS** for non‑domain setups
- **Optional DNS‑01 ACME** for domain owners

The platform is designed so a DM (or any group member) can deploy the entire system on a **fresh Ubuntu Server** in a few hours using a guided install script.

---

## 📘 Documentation

All architectural details, UX rules, audio behavior, session model, metadata system, and deployment assumptions are documented in:
- **[ARCHITECTURE](./docs/ARCHITECTURE.md)** — Full system design, UX, and data model
- **[DEPLOYMENT](./docs/DEPLOYMENT.md)** — HomeLab setup, Docker configuration, and troubleshooting
- **[ROADMAP](./docs/ROADMAP.md)** — Development phases and feature priorities
- **[CONTRIBUTING](./CONTRIBUTING.md)** — Developer guidelines and contribution workflow

👉 *The ARCHITECTURE doc is the full knowledge pack used by AI to understand the project.*

---

## 🧩 Core Technologies

| Component | Technology |
|----------|------------|
| Voice transport | **LiveKit (voice-only optimized, UDP + TCP)** |
| Backend API | **Node.js + TypeScript + Express** |
| Player Client | **React 19 + TypeScript (SPA)** |
| Admin Dashboard | **React 19 + TypeScript (SPA)** |
| Realtime events | **WebSocket** |
| Database | **PostgreSQL 16+** |
| Cache / presence | **Redis 7** |
| Reverse proxy | **Caddy 2** |
| Deployment | **Docker / Docker Compose / Docker Swarm** |
| TLS | **Self‑signed** or **ACME DNS‑01** |

---

## 🏡 HomeLab Deployment Goals

VTT‑Chat is designed for **technical home users** who want to self‑host:

- Runs on **Ubuntu Server**
- Uses **Docker** for all services
- Uses **Caddy** for reverse proxy + TLS
- Supports **non‑standard HTTPS ports** (80/443 often blocked by ISPs)
- Works with:
  - Self‑signed certificates (default)
  - DNS‑01 ACME for domain owners
- One‑shot **install script** will:
  - Install Docker + Caddy
  - Generate TLS certs
  - Configure reverse proxy
  - Deploy backend, player SPA, admin dashboard, Postgres, Redis, LiveKit
  - Create `.env` files with sensible defaults

## 🏠 Home Server Quick Start

1. Download and bootstrap the installer from GitHub:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/AndyProsser/vtt-chat/main/install.sh | sudo bash -s setup
   ```
2. Edit `/opt/vtt-chat/install-config.yml` to confirm install directory, ports, and LiveKit settings.
3. Build the stack:
   ```bash
   sudo vtt-chat-server build
   ```
4. Start the stack:
   ```bash
   sudo vtt-chat-server start
   ```
5. Once running, access the app at:
   ```
   https://<server-ip>:8443
   ```
6. Access the **admin dashboard** at:
   ```
   https://<server-ip>:8443/admin
   ```
7. Control the server with:
   ```bash
   sudo vtt-chat-server stop      # Stop all services
   sudo vtt-chat-server restart   # Restart services
   sudo vtt-chat-server status    # View service status
   sudo vtt-chat-server update    # Pull latest and rebuild
   sudo /opt/vtt-chat/server status
   ```

### Home router port forwarding

If your ISP blocks `80`/`443`, forward these ports instead:

- TCP `8443` → server `8443`
- UDP `7881-7980` → server `7881-7980`

Then access the app at:

```text
https://<server-ip>:8443
```

For stable routing, reserve a static local IP or DHCP lease for your server in your router settings.

If you want the public domain route later, set `domain`, `dns_provider`, and `dns_token` in `install-config.yml`.

A separate **D&D Beyond VTT‑Chat Launcher Extension** will be developed to make launching the app seamless for players and DMs.

👉 **[DEPLOYMENT](./docs/DEPLOYMENT.md)**

---

## 🧱 Project Status

This repository is currently in **active development**.
The architecture and UX have been fully defined, and implementation will proceed in structured stages.

If you encounter issues, ideas, or feature requests:

👉 Please open an Issue: **[ISSUES](https://github.com/AndyProsser/vtt-chat/issues)**

## 📦 License

This project is licensed under the **MIT License**.

👉 **[LICENSE](./LICENSE)**

---

## ⚠️ Trademarks & Legal

- **Dungeons & Dragons**, **D&D**, and related terms are trademarks of **Wizards of the Coast LLC**.
- **LiveKit** is a trademark of **LiveKit, Inc.**
- All other trademarks are property of their respective owners.
- This project is **not affiliated** with Wizards of the Coast, LiveKit, or any other trademark holder.

This repository is a **fan‑made, non‑commercial tool** intended to support tabletop role‑playing groups.

---

## 🤝 Contributing

Contributions, suggestions, and improvements are welcome.
Please use the GitHub Issues page to discuss changes before submitting PRs.

👉 **[CONTRIBUTE](./CONTRIBUTING.md)**

---

## 🚀 Roadmap (High‑Level)
Development Status
### ✅ Completed
- Project architecture & design documentation
- GitHub repository setup
- Docker containerization (backend, frontend, admin, LiveKit)
- Admin dashboard SPA (user/campaign management, analytics, logs, platform status)
- Docker Compose configuration (dev & production with voice-only LiveKit)
- LiveKit optimization (voice-only, UDP+TCP for NAT traversal)
- Caddy reverse proxy setup
- Deployment documentation
- API route scaffolding for all endpoints

### 🔄 In Progress
- Backend API implementation (Express routes)
- Frontend player app
- Authentication system (admin & user login)
- Database schema & ORM setup
- WebSocket event handling

### 📋 Planned
- Audio engine (DM presets, player conditions, environments)
- Session-aware chat with lazy-loading
- Metadata cards & timeline system
- Notes management & sharing
- HomeLab install script
- Full backend business logic
- Player app UI components

👉 See **[ROADMAP](./docs/ROADMAP.md)** for detailed phases and timelines

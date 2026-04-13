# VTT‑Chat
*A DM‑grade, session‑aware tabletop voice & chat platform for D&D and other TTRPGs.*

`https://img.shields.io/badge/build-pending-lightgrey`
`https://img.shields.io/badge/Docker-ready-blue`
`https://img.shields.io/badge/TypeScript-6.x-blue`
`https://img.shields.io/badge/React-19.x-61dafb`
`https://img.shields.io/badge/LiveKit-integrated-ff8800`
`https://img.shields.io/badge/License-MIT-green`

---

## Build Status

### Backend
![Backend CI](https://github.com/AndyProsser/vtt-chat/actions/workflows/backend-ci.yml/badge.svg)
![Backend Docker](https://github.com/AndyProsser/vtt-chat/actions/workflows/backend-docker.yml/badge.svg)

### Frontend
![Frontend CI](https://github.com/AndyProsser/vtt-chat/actions/workflows/frontend-ci.yml/badge.svg)
![Frontend Docker](https://github.com/AndyProsser/vtt-chat/actions/workflows/frontend-docker.yml/badge.svg)

---

## Release Status

![GitHub Release](https://img.shields.io/github/v/release/AndyProsser/vtt-chat)
![GitHub Changelog](https://img.shields.io/badge/Changelog-Auto--Generated-blue)

---

## 🎯 Project Summary

**VTT‑Chat** is a lightweight, privacy‑respecting, DM‑controlled **voice‑first virtual tabletop communication platform** designed for home‑hosted campaigns. It provides:

- High‑quality **voice chat** powered by **LiveKit**
- **DM voice presets**, **player conditions**, and **room environments**
- **Session‑aware chat** with boundaries and lazy‑loading
- **Metadata cards** (XP, loot, encounters, combat, recap)
- **Notes system** with DM‑controlled visibility
- **Player‑safe audio controls** (gain/gate/mute/device)
- **DM‑only overrides** (session‑scoped)
- **HomeLab‑friendly deployment** with Docker + Caddy
- **Self‑signed TLS** for non‑domain setups
- **Optional DNS‑01 ACME** for domain owners

The platform is designed so a DM (or any group member) can deploy the entire system on a **fresh Ubuntu Server** in a few hours using a guided install script.

---

## 📘 Documentation

All architectural details, UX rules, audio behavior, session model, metadata system, and deployment assumptions are documented in:

👉 **`[ARCHITECTURE](./docs/ARCHITECTURE.md)`**
*(This is the full knowledge pack used by GitHub AI to understand the project.)*

---

## 🧩 Core Technologies

| Component | Technology |
|----------|------------|
| Voice transport | **LiveKit (native server)** |
| Backend | **Node.js + TypeScript** |
| Frontend | **React + TypeScript (SPA)** |
| Realtime events | **WebSockets** |
| Database | **PostgreSQL** |
| Cache / presence / rate limiting | **Redis** |
| Reverse proxy | **Caddy** |
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
  - Deploy backend, SPA, Postgres, Redis, LiveKit
  - Create `.env` files with sensible defaults

## 🏠 Home Server Quick Start

1. Download and bootstrap the installer from GitHub:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/AndyProsser/vtt-chat/main/install.sh | sudo bash -s setup
   ```
2. Edit `/opt/vtt-chat/install-config.yml` to confirm install directory, ports, and LiveKit settings.
3. Build the stack:
   ```bash
   sudo /opt/vtt-chat/server build
   ```
4. Start the stack:
   ```bash
   sudo /opt/vtt-chat/server start
   ```
5. Stop the stack:
   ```bash
   sudo /opt/vtt-chat/server stop
   ```
6. Restart the stack:
   ```bash
   sudo /opt/vtt-chat/server restart
   ```
7. Update the server:
   ```bash
   sudo /opt/vtt-chat/server update
   ```
8. Check the running stack status:
   ```bash
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

👉 **`[DEPLOYMENT](./docs/DEPLOYMENT.md)`**

---

## 🧱 Project Status

This repository is currently in **active development**.
The architecture and UX have been fully defined, and implementation will proceed in structured stages.

If you encounter issues, ideas, or feature requests:

👉 **Please open an Issue:**
`https://github.com/AndyProsser/vtt-chat/issues`

---

## 📦 License

This project is licensed under the **MIT License**.

👉 **`[LICENSE](./LICENSE)`**

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

👉 **`[CONTRIBUTE](./CONTRIBUTING.md)`**

---

## 🚀 Roadmap (High‑Level)

- Backend architecture & API
- SPA core framework
- LiveKit integration
- Audio engine (DM voice, conditions, environments)
- Metadata cards & timeline
- Notes system
- Session boundaries & lazy‑load chat
- HomeLab installer script
- Admin app (optional future)

👉 **`[ROADMAP](./docs/ROADMAP.md)`**

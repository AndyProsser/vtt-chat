# 🛠️ VTT‑Chat — Developer Setup Guide

Welcome to the VTT‑Chat development environment.
This guide walks you through everything you need to get productive, with a focus on **Linux** and **WSL (Windows Subsystem for Linux)** for Windows users.

It assumes you're using:

- **Ubuntu 22.04+** (or any modern Debian‑based distro)
- **WSL 2** (if on Windows — see [Windows Setup](#-windows--wsl-setup) section below)
- Docker‑based local development
- VS Code as the primary editor

---

## 🪟 Windows + WSL Setup

**Recommendation:** We recommend developing on Linux natively or via WSL for the best experience. Native Windows development is not officially supported due to path handling, Docker integration, and shell script incompatibilities.

### **Prerequisites for Windows Developers**

- Windows 10 (Build 19041+) or Windows 11
- Administrator privileges

### **1. Install WSL 2**

WSL 2 provides a full Linux kernel and native Docker support.

**PowerShell (as Administrator):**

```powershell
wsl --install
```

This installs WSL 2 with Ubuntu by default. If you need to specify a version or distro:

```powershell
wsl --install -d Ubuntu-24.04
```

**Restart your computer after installation.**

Verify installation:

```powershell
wsl --version
```

### **2. Install Docker Desktop**

Docker Desktop integrates with WSL 2 and is required for local development.

1. Download from [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop)
2. Install and start Docker Desktop
3. In Docker Desktop settings:
   - Go to **Resources > WSL Integration**
   - Enable integration with your WSL distro (e.g., Ubuntu-24.04)

Verify Docker works in WSL:

```bash
wsl -e docker --version
```

### **3. Access Your Project from WSL**

Clone the repo or mount your Windows drive:

```bash
# From WSL bash
cd /mnt/c/Users/YourUsername/dev/vtt-chat
```

Or clone directly in WSL:

```bash
git clone https://github.com/AndyProsser/vtt-chat.git ~/vtt-chat
cd ~/vtt-chat
```

### **4. Continue with the Required Tools section below**

From here, use the Linux-native instructions in WSL bash, not PowerShell.

All backend, frontend, and infrastructure scripts are designed to run in WSL/Linux. When working on Windows:

- Run npm scripts in WSL (not PowerShell)
- Run `./infra/scripts/server` commands in WSL
- Use VS Code with the **Remote - WSL** extension for seamless editing

---

---

## 📦 1. System Requirements

### **Minimum**

- 4 CPU cores
- 8 GB RAM
- 10 GB free disk space

### **Recommended**

- 8+ CPU cores
- 16+ GB RAM
- SSD storage
- Hardware virtualization enabled (for Docker performance)

---

## 🧰 2. Required Tools

Install these first — they’re essential for backend, frontend, and Docker workflows.

### **Docker Engine + Docker Compose**

```bash
sudo apt update
sudo apt install docker.io docker-compose-plugin -y
sudo usermod -aG docker $USER
```

Log out and back in to apply group changes.

### **Node.js 26**

```bash
curl -fsSL https://deb.nodesource.com/setup_26.x | sudo -E bash -
sudo apt install -y nodejs
```

### **Git**

```bash
sudo apt install git -y
```

### **Make (optional but recommended)**

```bash
sudo apt install make -y
```

---

## 🧩 3. Recommended Developer Apps

### **VS Code**

The primary editor for this project.

```bash
sudo snap install code --classic
```

### **DBeaver**

GUI for Postgres.

```bash
sudo snap install dbeaver-ce
```

### **RedisInsight**

GUI for Redis.

```bash
sudo snap install redisinsight
```

### **Insomnia or Postman**

For API testing.

```bash
sudo snap install insomnia
```

### **Docker Desktop (optional)**

If you prefer a GUI for containers.

---

## 🧱 4. Clone the Repository

```bash
git clone https://github.com/yourname/vtt-chat.git
cd vtt-chat
```

---

## 🧪 5. Environment Variables

Copy the example env files:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Fill in:

- Postgres password
- Redis password
- LiveKit API key + secret
- Backend URL
- Frontend URL

---

## 🧵 6. Install Dependencies

### Root (Linting & Formatting Tools)

```bash
npm install
```

### Backend

```bash
cd backend
npm install
```

### Frontend

```bash
cd frontend
npm install
```

---

## 🐳 7. Running the Development Environment

Use the hot‑reload dev stack:

```bash
docker compose -f docker-compose.dev.yml up --build
```

This gives you:

| Service     | URL                             |
| ----------- | ------------------------------- |
| Frontend    | <http://localhost:8080>         |
| Backend API | <http://localhost:8080/api>     |
| LiveKit     | <http://localhost:8080/livekit> |
| Postgres    | localhost:5432                  |
| Redis       | localhost:6379                  |

Caddy handles routing automatically.

---

## 🧠 8. VS Code Workspace

Open the workspace file:

```text
vtt-chat.code-workspace
```

This gives you:

- Full repo visibility
- Recommended extensions
- Debug configs
- Tasks for dev/build/docker

---

## 🐞 9. Debugging

### Backend Debug

Run from VS Code:

```text
Run → "Backend: Debug"
```

### Frontend Debug

Launch Chrome debugger:

```text
Run → "Frontend: Debug"
```

### Combined Debug

```text
Run → "Dev: Backend + Frontend"
```

---

## 🧹 10. Code Style & Linting

This project uses:

- Prettier (formatting)
- ESLint (linting)
- EditorConfig (consistency)

From the repo root, run:

```bash
npm run lint           # Check style issues
npm run lint:packages  # Lint backend + frontend + admin sequentially
npm run lint:backend   # Lint backend only
npm run lint:frontend  # Lint frontend only
npm run lint:admin     # Lint admin only
npm run ci:lint  # Local CI lint gate (WSL on Windows, Linux shell elsewhere)
npm run ci:lint:strict  # Alias of ci:lint for stricter CI-style workflows
npm run format         # Auto-format all files
npm run check          # Run linting checks
```

For Windows developers, run lint/install commands from WSL bash so the toolchain matches Linux behavior:

```bash
wsl -e bash -lc "cd /mnt/c/Users/<your-user>/dev/vtt-chat && npm install"
wsl -e bash -lc "cd /mnt/c/Users/<your-user>/dev/vtt-chat && npm run lint"
wsl -e bash -lc "cd /mnt/c/Users/<your-user>/dev/vtt-chat && npm run ci:lint"
```

ESLint note:

- React linting now runs through `@eslint-react/eslint-plugin`, so the old peer-dependency workaround for `eslint-plugin-react` is no longer needed.
- The repo root and package-local ESLint entrypoints now use ESM flat config files (`eslint.config.mjs`) so `npm run lint` works consistently from the root, `frontend/`, `admin/`, and `backend/`.

VS Code will auto‑format on save.

---

## 🧪 11. Running Tests (if enabled later)

Backend:

```bash
npm test
```

Frontend:

```bash
npm run test
```

---

## 🎭 11a. DEV Mock Players

When running in development mode (`NODE_ENV=development`), the backend seeds a DEV mock-player catalogue and auto-populates each session with a **randomized roster of 3–5 mock players** so you can test DM superpowers without needing real participants.

Roster behavior:

- Mock players are selected from a catalogue of at least 20 D&D archetype variations.
- Player/character identity is randomized with race, class/subclass, and level metadata.
- Levels are constrained to a tight party band (within 2 levels).
- Mock usernames always use the `dev_mock_*` prefix.
- Mock players use a dedicated avatar marker (`/branding/mock-player-avatar.svg`) so they are visually obvious.
- The chosen roster persists across session stop/start cycles for the same campaign.
- A fresh browser page load rerolls that campaign roster once, and you can also force reroll via the reset endpoint.

Room safety behavior:

- Players are never left without a valid room.
- If a target room is missing or deleted, the backend fails movement back to `MAIN`.
- Ending Whisper restores users to their prior valid room; if unavailable, they are moved to `MAIN`.

**You are always the DM** when using the normal dev browser session.

### Joining mock players to a session

```bash
curl -X POST http://localhost:3001/api/dev/mock-players/join \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "<your-session-id>"}'
```

### Getting mock player tokens (for a private browser session)

```bash
curl "http://localhost:3001/api/dev/mock-players?sessionId=<your-session-id>"
```

Copy a `token` value from the response and use it to log in as that player in an **incognito/private browser window**. That session behaves as a real player alongside the mocks.

### Removing mock players from a session

```bash
curl -X POST http://localhost:3001/api/dev/mock-players/remove \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "<your-session-id>"}'
```

### Rerolling mock players instantly (no restart)

```bash
curl -X POST http://localhost:3001/api/dev/mock-players/reset \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "<your-session-id>", "campaignId": "<your-campaign-id>"}'
```

Mock accounts are **never seeded or accessible in production** — the routes and seed logic are hard-gated behind `config.isDevelopment`.

---

## 🚀 12. Building for Production

From the repo root, build both together:

```bash
npm run build
```

Or build individually:

```bash
npm run build:backend
npm run build:frontend
```

Full Docker build:

```bash
docker compose build
```

---

## 🧭 13. Useful Commands

### Stop all dev containers

```bash
docker compose -f docker-compose.dev.yml down
```

### View logs

```bash
docker compose logs -f
```

### Rebuild everything

```bash
docker compose -f docker-compose.dev.yml up --build
```

---

## ❤️ 14. Need Help?

If you run into issues:

- Check Docker logs
- Verify `.env` files
- Ensure ports aren’t in use
- Confirm Node 20 is installed

---

## 🎉 You’re Ready to Develop

You now have:

- A full Linux dev environment
- Hot‑reload backend + frontend
- Local LiveKit
- Postgres + Redis
- VS Code workspace with debugging
- Docker‑based local stack

This is the exact setup used for real development on VTT‑Chat.

---

# 🐧 **Optional: Arch Linux Developer Setup** <!-- markdownlint-disable-line MD025 -->

Arch Linux is a fantastic choice for development thanks to its rolling‑release model and up‑to‑date packages. Below is a streamlined setup path for VTT‑Chat on Arch‑based systems (Arch, EndeavourOS, Manjaro, Garuda, etc.).

---

## 📦 1. System Requirements

Same as Ubuntu:

- 4+ cores (8 recommended)
- 8–16 GB RAM
- SSD strongly recommended
- Docker requires virtualization enabled in BIOS

---

## 🧰 2. Required Packages

### **Update your system first**

```bash
sudo pacman -Syu
```

### **Install core tools**

```bash
sudo pacman -S --needed git nodejs npm docker docker-compose make
```

Verify Node.js version:

```bash
node --version  # Should be 26.x or later
```

### **Enable Docker**

```bash
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

Log out and back in to apply group changes.

---

## 🧩 3. Recommended Developer Apps (Arch Versions)

### **VS Code (AUR)**

If you want the official Microsoft build:

```bash
paru -S visual-studio-code-bin
```

Or open‑source VSCodium:

```bash
sudo pacman -S codium
```

### **DBeaver**

```bash
sudo pacman -S dbeaver
```

### **RedisInsight (AUR)**

```bash
paru -S redisinsight
```

### **Insomnia**

```bash
sudo pacman -S insomnia
```

---

## 🧱 4. Clone the Repository

```bash
git clone https://github.com/yourname/vtt-chat.git
cd vtt-chat
```

---

## 🔧 5. Environment Variables

Copy the example files:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Fill in:

- Postgres password
- Redis password
- LiveKit API key + secret
- Backend URL
- Frontend URL

---

## 📦 6. Install Dependencies

### Root (Linting & Formatting Tools)

```bash
npm install
```

### Backend

```bash
cd backend
npm install
```

### Frontend

```bash
cd frontend
npm install
```

---

## 🐳 7. Running the Dev Environment (Hot Reload)

Use the dev compose file:

```bash
docker compose -f docker-compose.dev.yml up --build
```

### Hot reload configuration (Linux vs Windows/WSL)

The dev compose stack supports configurable file-watch polling for **Backend, Frontend, and Admin**.

By default (`.env.dev.example`):

- `DEV_WATCH_USE_POLLING=false`
- `DEV_WATCH_INTERVAL_MS=150`

This default is best for Linux hosts (native filesystem events, lower CPU).

For Windows + WSL + Docker bind mounts, if hot reload is missing or inconsistent:

1. Set `DEV_WATCH_USE_POLLING=true` in your `.env`
2. Keep `DEV_WATCH_INTERVAL_MS=150` (or tune to `200-300` if CPU is high)
3. Recreate containers:

```bash
docker compose -f docker-compose.dev.yml down
docker compose -f docker-compose.dev.yml up --build
```

Notes:

- These vars apply to backend/frontend/admin dev containers.
- Polling improves reliability on Windows bind mounts, but can increase CPU usage.
- If possible, store the repo in the WSL filesystem (for example under `~/`) for best watcher performance.

This gives you:

| Service  | URL                             |
| -------- | ------------------------------- |
| Frontend | <http://localhost:8080>         |
| Backend  | <http://localhost:8080/api>     |
| LiveKit  | <http://localhost:8080/livekit> |

---

## 🧠 8. VS Code Workspace

Open:

```text
vtt-chat.code-workspace
```

You’ll get:

- Full repo visibility
- Debug configs
- Recommended extensions
- Tasks for dev/build/docker

---

## 🐞 9. Debugging

Backend:

```text
Run → Backend: Debug
```

Frontend:

```text
Run → Frontend: Debug
```

Both:

```text
Run → Dev: Backend + Frontend
```

---

## 🧹 10. Code Style

Arch users often have Prettier + ESLint globally installed, but the project uses local versions.
VS Code will auto‑format on save.

From the repo root, run:

```bash
npm run lint      # Check style issues
npm run format    # Auto-format all files
npm run check     # Run linting checks
```

---

## 🚀 11. Building for Production

From the repo root, build both together:

```bash
npm run build
```

Or build individually:

```bash
npm run build:backend
npm run build:frontend
```

Full Docker build:

```bash
docker compose build
```

---

## 🧭 12. Useful Commands

Stop dev stack:

```bash
docker compose -f docker-compose.dev.yml down
```

Logs:

```bash
docker compose logs -f
```

Rebuild:

```bash
docker compose -f docker-compose.dev.yml up --build
```

---

## 🎉 Arch Linux is Ready to Go

You now have a fully functional Arch‑based development environment with:

- Hot reload backend + frontend
- Local LiveKit
- Postgres + Redis
- VS Code workspace
- Docker‑based orchestration

Arch users will feel right at home.

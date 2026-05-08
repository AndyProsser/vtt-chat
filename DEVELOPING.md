# 🛠️ VTT‑Chat — Developer Setup Guide (Linux)

Welcome to the VTT‑Chat development environment.
This guide walks you through everything you need to get productive on **Linux**, including recommended tools, apps, and workflows.

It assumes you’re using:

- Ubuntu 22.04+ (or any modern Debian‑based distro)
- Docker‑based local development
- VS Code as the primary editor

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

### **Node.js 25**

```bash
curl -fsSL https://deb.nodesource.com/setup_25.x | sudo -E bash -
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
npm run lint      # Check style issues
npm run format    # Auto-format all files
npm run check     # Run linting checks
```

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
node --version  # Should be 25.x or later
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

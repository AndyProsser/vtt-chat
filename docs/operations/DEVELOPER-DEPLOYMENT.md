# VTT‑Chat Deployment Guide

> _HomeLab‑friendly installation for Ubuntu Server + Docker + Caddy_

---

## Overview

This document explains how to deploy **VTT‑Chat** on a **fresh Ubuntu Server** using:

- **Docker** (Engine + Compose or Swarm)
- **Caddy** as the reverse proxy
- **Self‑signed TLS certificates** for local IP access
- **Optional ACME DNS‑01** for domain owners
- **Non‑standard HTTPS ports** (e.g., 8443) to avoid ISP blocks
- **LiveKit** running as a dedicated native server

The goal is to allow a DM (or any group member) to deploy the entire platform on a small home server in **a few hours**, with minimal technical overhead.

---

## 1. System Requirements

### Minimum Recommended Hardware

- **CPU:** 2+ cores
- **RAM:** 4 GB minimum (8 GB recommended)
- **Storage:** 20 GB free
- **Network:** Stable broadband connection
- **OS:** Ubuntu Server 22.04 LTS or newer

### Required Software

- Docker Engine
- Docker Compose or Docker Swarm
- Caddy (reverse proxy + TLS)
- Git
- curl / wget

---

## 2. Network & Port Requirements

VTT‑Chat is designed for **non‑standard HTTPS ports** because many ISPs block 80/443.

### Required Ports (default HomeLab configuration)

| Service               | Port          | Protocol      | Purpose                    |
| --------------------- | ------------- | ------------- | -------------------------- |
| Caddy HTTPS           | **8443**      | TCP           | SPA + Backend              |
| Caddy HTTP (optional) | 8080          | TCP           | Redirect only              |
| Backend API           | internal      | TCP           | Behind Caddy               |
| LiveKit Signaling     | **7880**      | TCP/WebSocket | Control messages           |
| LiveKit Media         | **7881–7980** | UDP + TCP     | Voice transport (fallback) |
| Postgres              | internal      | TCP           | Database                   |
| Redis                 | internal      | TCP           | Cache/presence             |

### Optional

- TURN server (if needed for strict NAT environments)

---

## 3. TLS Strategy

### Default (No Domain)

- Generate **self‑signed certificates**
- Caddy terminates TLS on port **8443**
- SPA accessed via:
  <https://{server-ip}:8443>

### With Domain (Optional)

- Use **ACME DNS‑01** challenge
- Works even if ports 80/443 are blocked
- Requires DNS provider API token

### External Reverse Proxy (Cloudflare, Nginx Proxy, etc.)

If you terminate public TLS at an external edge (for example Cloudflare on `443`) and forward to this host on an internal port (for example `8443`), keep these rules:

- Browser-facing origin should stay a single canonical URL (example: `https://chat.example.com`).
- Frontend API/WS targets should remain same-origin from the browser perspective.
- Prefer relative frontend env values in deployed bundles:
  - `VITE_API_URL=/api`
  - `VITE_WS_URL=/ws`
- Avoid baking `localhost` or internal-only origins into frontend build vars.
- Backend CORS allow-list (if used) must include the external browser origin (example: `https://chat.example.com`).

This allows external `443 -> internal 8443` mapping without browser CORS issues.

---

## 4. Directory Structure

A typical installation will look like:

```text
/opt/vtt-chat/
    backend/
    frontend/
    livekit/
    caddy/
    postgres/
    redis/
    docker-compose.yml
    .env
```

---

### 4.1 Docker Compose Setup

VTT‑Chat provides two preconfigured Docker Compose files:

| File                     | Use Case          | Features                                                 |
| ------------------------ | ----------------- | -------------------------------------------------------- |
| `docker-compose.dev.yml` | Local development | Hot-reload, verbose logging, HTTP on 8080                |
| `docker-compose.yml`     | Production        | Optimized images, HTTPS only on 8443, persistent storage |

Both files:

- Use `livekit.yaml` configuration file
- Set up the same network and services
- Expose correct UDP/TCP ports
- Connect via internal network

---

## 5. Installation Steps (High-Level)

Below is the high‑level flow.
A full install script will automate these steps.

---

### 5.1 Update System

```bash
sudo apt update && sudo apt upgrade -y
```

---

### 5.2 Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Log out and back in.

---

### 5.3 Install Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo apt-key add -
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

---

### 5.4 Clone the Repository

```bash
git clone https://github.com/AndyProsser/vtt-chat.git
cd vtt-chat
```

---

### 5.5 Create `.env` Files

The install script will generate defaults, but manual setup looks like:

```bash
cp .env.example .env
nano .env
```

Key variables:

- `LIVEKIT_API_KEY=...` (arbitrary string for development)
- `LIVEKIT_API_SECRET=...` (arbitrary string for development)
- `POSTGRES_PASSWORD=...`
- `REDIS_PASSWORD=...`

For production, generate strong random values for API credentials.

---

### 5.6 Configure LiveKit (Optional)

The `livekit.yaml` file is already configured for voice-only with optimal settings.

**Edit if you need to:**

- Change port ranges (not recommended unless there are conflicts)
- Adjust STUN servers
- Enable debug logging (set `logging.level: debug`)

**For production**, consider adding a TURN server if users are behind strict corporate firewalls.

---

### 5.6.1 Generate Self‑Signed Certificates (No Domain)

```bash
mkdir -p caddy/certs
openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout caddy/certs/selfsigned.key \
  -out caddy/certs/selfsigned.crt \
  -subj "/CN=vtt-chat"
```

Caddyfile example:

```yaml
https://:8443 {
tls /opt/vtt-chat/caddy/certs/selfsigned.crt /opt/vtt-chat/caddy/certs/selfsigned.key
reverse_proxy backend:3000
reverse_proxy /livekit livekit:7880
encode gzip
}
```

---

### 5.7 Start Docker Stack

**Development:**

```bash
docker compose -f docker-compose.dev.yml up -d
```

**Production:**

```bash
docker compose -f docker-compose.yml up -d
```

Or for Docker Swarm (production):

```bash
docker swarm init
docker stack deploy -c docker-compose.yml vttchat
```

The stack will start:

- **postgres** (database)
- **redis** (cache/presence)
- **livekit** (voice signaling & media)
- **backend** (API server)
- **frontend** (web SPA)
- **caddy** (reverse proxy + TLS)ker stack deploy -c docker-compose.yml vttchat

---

### 5.8 Access the App

Open:
<https://{server-ip}:8443>

Accept the self‑signed certificate.

---

### 5.9 (Optional) Add Server Control Script to PATH

VTT‑Chat includes a `server` control script for easy management. To access it globally as `vtt-chat-server`:

#### Option 1: Symlink (Recommended)

```bash
sudo ln -s /opt/vtt-chat/server /usr/local/bin/vtt-chat-server
chmod +x /opt/vtt-chat/server
```

#### Option 2: Add to PATH

Add to your shell profile (`.bashrc`, `.zshrc`, etc.):

```bash
export PATH="/opt/vtt-chat:$PATH"
```

Then reload your shell:

```bash
source ~/.bashrc
```

#### Usage

Once installed, you can control the stack:

```bash
vtt-chat-server build      # Configure and build stack
vtt-chat-server start      # Start services
vtt-chat-server stop       # Stop services
vtt-chat-server restart    # Restart and rebuild if needed
vtt-chat-server status     # Show service status
vtt-chat-server update     # Pull latest from repo and rebuild
vtt-chat-server help       # Show available commands
```

---

## 6. LiveKit Deployment

containerized service\*\* with configuration via `infra/livekit/livekit.yaml`.

### Configuration File

A `infra/livekit/livekit.yaml` file controls all LiveKit settings:

- **Signaling port:** 7880 (TCP/WebSocket)
- **Media ports:** 7881–7980 (UDP + TCP for NAT fallback)
- **Voice-only optimization:** Video disabled, Opus codec configured
- **NAT traversal:** STUN servers for clients behind firewalls
- **Room auto-cleanup:** Empty rooms removed after 5 minutes
- **API credentials:** Passed via environment variables (`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`)

### How It Works

- Docker Compose mounts `infra/livekit/livekit.yaml` into the container at `/etc/livekit.yaml`
- Both dev and production compose files use the same config file approach
- The backend communicates with LiveKit via internal network (`http://livekit:7880`)
- Clients connect via the exposed ports

### LiveKit + Public Edge Requirements

LiveKit media paths must be reachable from clients independently of your SPA/API reverse proxy path.

- Set LiveKit advertised public IP correctly:
  - Production compose supports `LIVEKIT_NODE_IP`.
  - This must resolve to the real public IP clients can reach.
- Open/forward LiveKit ports end-to-end:
  - `7880/tcp` signaling
  - `7881-8980/udp` media
  - `7881/tcp` fallback
- Do not rely on standard HTTP reverse proxying for WebRTC UDP media.
- If using Cloudflare, keep LiveKit host DNS-only (no orange-cloud HTTP proxy) unless you have an L4 product that explicitly supports this traffic.

Example split:

- `chat.example.com` -> Cloudflare/proxy -> Caddy (`8443` internal)
- `livekit.example.com` -> direct public IP -> LiveKit (`7880`, `7881-8980/udp`)

### Voice-Only Optimization

The current setup is optimized for **voice-only** communication:

- `video_enabled: false` disables video codec overhead
- Opus audio codec for excellent compression
- Reduces bandwidth and CPU usage
- Suitable for TTT/RPG chat applications

For details, see `infra/livekit/livekit.yaml`.

---

## 7. Database & Redis

### Postgres

- Stores:
  - Users
  - Campaigns
  - Messages
  - Metadata cards
  - Notes
  - Session boundaries
  - Player/DM settings
  - Conditions & environments

### Redis

- Stores:
  - Presence
  - Ping cooldowns
  - Ephemeral audio overrides
  - WebSocket session state

---

## 8. Testing the Deployment

### Verify services

```bash
docker ps
docker logs -f vttchat-backend
docker logs -f vttchat-livekit
docker logs -f vttchat-caddy
```

### Verify ports

```bash
# HTTPS proxy
sudo ss -tulpn | grep 8443

# LiveKit signaling
sudo ss -tulpn | grep 7880

# LiveKit media (UDP)
sudo ss -tulpn | grep 7881
```

### Verify connectivity

```bash
# Test backend API
curl -k https://localhost:8443/api/health

# Test WebSocket
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  wss://localhost:8443/ws
```

---

## 9. Troubleshooting

### Browser refuses self‑signed cert

Add exception manually or use a domain with proper ACME certificates.

### LiveKit audio not working

1. Check both UDP AND TCP ports 7881–7980 are exposed:

   ```bash
   sudo ss -tulpn | grep 7881
   ```

2. Verify `infra/livekit/livekit.yaml` is mounted correctly:

   ```bash
   docker exec vttchat-livekit cat /etc/livekit.yaml
   ```

3. Check LiveKit logs for configuration errors:

   ```bash
   docker logs vttchat-livekit | grep -i error
   ```

### SPA cannot connect to backend

1. Verify Caddy is routing correctly:

   ```bash
   docker logs vttchat-caddy | grep -i reverse_proxy
   ```

2. Check backend is healthy:

   ```bash
   curl -k https://localhost:8443/api/health
   ```

### LiveKit config not being read

- Ensure `infra/livekit/livekit.yaml` exists
- Verify it's a valid YAML file (check indentation)
- Restart the container:

  ```bash
  docker compose restart livekit
  ```

### High audio latency or drops

- Check if TCP fallback is being used (UDP may be blocked)
- Monitor resource usage:

  ```bash
  docker stats vttchat-livekit
  ```

- Ensure minimum 4GB RAM available

### WebSocket connection fails

- Check `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are set in `.env`
- Verify backend can reach LiveKit:

  ```bash
  docker exec vttchat-backend curl http://livekit:7880/health
  ```

### Prisma local migration failure recovery (P1010 / P3018)

Use this flow when Prisma cannot access the DB (`P1010`) or a migration failed and drift was detected (`P3018`) in local development.

Important:

- This reset flow is for local/dev only.
- It drops and recreates the local `vtt-chat` database.
- All local DB data will be lost.

1. Confirm Postgres access with your local superuser password:

   ```bash
   export PGPASSWORD='<postgres-password>'
   psql -h localhost -U postgres -d postgres -c "select current_user, current_database();"
   ```

2. Ensure backend Prisma CLI can read `DATABASE_URL` from backend env:

   ```text
   # backend/prisma.config.ts should include:
   # import 'dotenv/config'
   ```

3. Set local backend DB URL in `backend/.env`:

   ```text
   DATABASE_URL=postgresql://postgres:<postgres-password>@localhost:5432/vtt-chat?schema=public
   ```

4. Reset local DB and recreate it cleanly:

   ```text
   dropdb -h localhost -U postgres --if-exists vtt-chat
   createdb -h localhost -U postgres -O postgres vtt-chat
   ```

5. Apply migrations:

   ```text
   cd backend
   npx prisma migrate dev --name stage6_rooms_presence_snapshots
   ```

6. Verify schema/tooling health:

   ```text
   npx prisma migrate status
   npm run build
   npm test -- --run
   ```

---

## 10. Security Notes

- Self‑signed certs are fine for local networks
- For remote access, use DNS‑01 ACME
- Keep Postgres/Redis internal‑only
- Use strong passwords in `.env`
- Keep server updated

---

## 11. Planned Enhancements

- Automated install script
- Optional TURN server
- Admin dashboard
- Monitoring & metrics
- Backup/restore automation

---

## Trademark Disclaimer

- **Dungeons & Dragons**, **D&D**, and related terms are trademarks of **Wizards of the Coast LLC**.
- **LiveKit** is a trademark of **LiveKit, Inc.**
- All other trademarks belong to their respective owners.
- VTT‑Chat is **not affiliated** with any trademark holder.

# **DEPLOYMENT.md**

# Deployment Guide

_A production‑grade deployment strategy for HomeLab servers running Docker, Caddy, Postgres, Redis, and LiveKit._

---

## 📘 Overview

This document describes how to deploy the **VTT‑Chat platform** on:

- A HomeLab mini‑server
- Ubuntu Server (recommended)
- Docker Engine + Docker Compose
- Caddy for HTTPS
- Postgres for persistence
- Redis for presence
- LiveKit for audio transport
- Optional TURN server for NAT traversal

This guide covers:

- System requirements
- Folder structure
- Environment variables
- Docker Compose stack
- Caddy configuration
- LiveKit integration
- TURN server setup
- Backup strategy
- Upgrades & zero‑downtime deploys

---

# 🧩 1. System Requirements

### Minimum

| Component | Requirement          |
| --------- | -------------------- |
| CPU       | 2 cores              |
| RAM       | 4 GB                 |
| Disk      | 20 GB                |
| OS        | Ubuntu Server 22.04+ |
| Network   | Stable broadband     |

### Recommended (for 6–10 players)

| Component | Requirement          |
| --------- | -------------------- |
| CPU       | 4–6 cores            |
| RAM       | 8–16 GB              |
| Disk      | 100+ GB (recordings) |
| Network   | 20–50 Mbps up/down   |

---

# 🗂️ 2. Folder Structure

Recommended repo layout:

```
/vtt-chat
  /backend
  /frontend
  /livekit
  /caddy
  /docker
  /scripts
  /docs
```

Deployment folder:

```
/opt/vtt-chat
  docker-compose.yml
  .env
  Caddyfile
  /data
    /postgres
    /redis
    /recordings
    /snapshots
```

---

# 🔐 3. Environment Variables

Create `.env`:

```
POSTGRES_USER=vtt
POSTGRES_PASSWORD=supersecret
POSTGRES_DB=vtt

REDIS_PASSWORD=anothersecret

JWT_SECRET=changeme
API_URL=https://yourdomain.com
WS_URL=wss://yourdomain.com/ws

LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret
LIVEKIT_URL=https://yourdomain.com:7880

TURN_URL=turn:yourdomain.com:3478
TURN_USERNAME=turnuser
TURN_PASSWORD=turnpass
```

---

# 🐳 4. Docker Compose Stack

`docker-compose.yml`:

```yaml
version: '3.9'

services:
  postgres:
    image: postgres:17
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - ./data/postgres:/var/lib/postgresql/data

  redis:
    image: redis:8
    restart: unless-stopped
    command: ['redis-server', '--requirepass', '${REDIS_PASSWORD}']
    volumes:
      - ./data/redis:/data

  backend:
    build: ./backend
    restart: unless-stopped
    env_file: .env
    depends_on:
      - postgres
      - redis

  frontend:
    build: ./frontend
    restart: unless-stopped

  livekit:
    image: livekit/livekit-server
    restart: unless-stopped
    command: >
      --config /livekit.yaml
    volumes:
      - ./livekit/livekit.yaml:/livekit.yaml
      - ./data/recordings:/recordings

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
      - '7880:7880'
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - ./data/caddy:/data
      - ./data/caddy-config:/config
```

---

# 🔐 5. Caddy Configuration (HTTPS + Reverse Proxy)

`Caddyfile`:

```
yourdomain.com {
  encode gzip
  tls you@example.com

  handle_path /api/* {
    reverse_proxy backend:3000
  }

  handle_path /ws/* {
    reverse_proxy backend:3000
  }

  handle {
    reverse_proxy frontend:4173
  }
}

# LiveKit WebRTC
:7880 {
  reverse_proxy livekit:7880
}
```

Caddy automatically:

- Issues HTTPS certificates
- Renews certificates
- Handles HTTP/2 and HTTP/3
- Proxies WebSocket traffic

---

# 🎧 6. LiveKit Configuration

`livekit.yaml`:

```yaml
port: 7880
rtc:
  tcp_port: 7881
  udp_port: 7882
  use_external_ip: true
keys:
  ${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}
recording:
  enabled: true
  output_directory: /recordings
turn:
  enabled: true
  domain: yourdomain.com
  tls_port: 5349
  udp_port: 3478
```

---

# 🌐 7. TURN Server (Optional but Recommended)

If your players are behind strict NAT:

```
docker run -d \
  --name coturn \
  -p 3478:3478 \
  -p 5349:5349 \
  instrumentisto/coturn \
  --no-auth \
  --realm yourdomain.com \
  --use-auth-secret \
  --static-auth-secret=${TURN_PASSWORD}
```

Update `.env`:

```
TURN_URL=turn:yourdomain.com:3478
TURN_USERNAME=turnuser
TURN_PASSWORD=turnpass
```

---

# 🔄 8. Deployment Steps

### 1. Clone repo

```
git clone https://github.com/yourname/vtt-chat
cd vtt-chat
```

### 2. Create `.env`

```
cp .env.example .env
nano .env
```

### 3. Build & start

```
docker compose up -d --build
```

### 4. Run migrations

```
docker compose exec backend npx prisma migrate deploy
```

### 5. Verify services

```
docker compose ps
```

### 6. Access the app

```
https://yourdomain.com
```

---

# 🧪 9. Health Checks

### Backend

```
curl https://yourdomain.com/api/health
```

### LiveKit

```
curl https://yourdomain.com:7880
```

### Redis

```
docker compose exec redis redis-cli -a $REDIS_PASSWORD ping
```

### Postgres

```
docker compose exec postgres psql -U vtt -c "SELECT 1;"
```

---

# 💾 10. Backups

### Postgres

```
pg_dump -U vtt vtt > backup.sql
```

### Redis

```
docker compose exec redis redis-cli -a $REDIS_PASSWORD save
```

### Recordings

```
rsync -av ./data/recordings /backup/
```

### Full campaign export

```
GET /api/campaigns/:id/export
```

---

# 🔁 11. Upgrades & Zero‑Downtime Deploys

### Pull latest

```
git pull
```

### Rebuild

```
docker compose up -d --build
```

### Migrate

```
docker compose exec backend npx prisma migrate deploy
```

### Restart LiveKit only (optional)

```
docker compose restart livekit
```

---

# 🧠 12. Design Principles

### 1. HomeLab‑friendly

Runs on a single mini‑server.

### 2. Zero‑config HTTPS

Caddy handles certificates automatically.

### 3. Modular

Backend, frontend, LiveKit, TURN, Redis, Postgres are isolated.

### 4. Resilient

Redis snapshots + Postgres backups + object storage.

### 5. Scalable

Can be moved to Swarm/Kubernetes later.

### 6. Developer‑friendly

Local dev uses the same Compose stack.

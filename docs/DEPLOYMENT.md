# VTT‑Chat Deployment Guide  
*HomeLab‑friendly installation for Ubuntu Server + Docker + Caddy*

---

## 📘 Overview

This document explains how to deploy **VTT‑Chat** on a **fresh Ubuntu Server** using:

- **Docker** (Engine + Compose or Swarm)  
- **Caddy** as the reverse proxy  
- **Self‑signed TLS certificates** for local IP access  
- **Optional ACME DNS‑01** for domain owners  
- **Non‑standard HTTPS ports** (e.g., 8443) to avoid ISP blocks  
- **LiveKit** running as a dedicated native server  

The goal is to allow a DM (or any group member) to deploy the entire platform on a small home server in **a few hours**, with minimal technical overhead.

---

# 🏡 1. System Requirements

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

# 🔧 2. Network & Port Requirements

VTT‑Chat is designed for **non‑standard HTTPS ports** because many ISPs block 80/443.

### Required Ports (default HomeLab configuration)

| Service | Port | Purpose |
|--------|------|---------|
| Caddy HTTPS | **8443** | SPA + Backend |
| Caddy HTTP (optional) | 8080 | Redirect only |
| Backend API | internal | Behind Caddy |
| LiveKit WebSocket | **7880** | Signaling |
| LiveKit UDP | **7881–7980** | Voice transport |
| Postgres | internal | DB |
| Redis | internal | Cache/presence |

### Optional

- TURN server (if needed for strict NAT environments)

---

# 🔐 3. TLS Strategy

### Default (No Domain)

- Generate **self‑signed certificates**
- Caddy terminates TLS on port **8443**
- SPA accessed via:  
  ```
  https://<server-ip>:8443
  ```

### With Domain (Optional)

- Use **ACME DNS‑01** challenge  
- Works even if ports 80/443 are blocked  
- Requires DNS provider API token  

---

# 📦 4. Directory Structure

A typical installation will look like:

```
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

# 🚀 5. Installation Steps (High-Level)

Below is the high‑level flow.  
A full install script will automate these steps.

---

## 5.1 Update System

```
sudo apt update && sudo apt upgrade -y
```

---

## 5.2 Install Docker

```
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Log out and back in.

---

## 5.3 Install Caddy

```
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo apt-key add -
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

---

## 5.4 Clone the Repository

```
git clone https://github.com/AndyProsser/vtt-chat.git
cd vtt-chat
```

---

## 5.5 Create `.env` Files

The install script will generate defaults, but manual setup looks like:

```
cp .env.example .env
nano .env
```

Key variables:

- `VTTCHAT_PORT=8443`
- `LIVEKIT_WS_PORT=7880`
- `LIVEKIT_UDP_RANGE=7881-7980`
- `POSTGRES_PASSWORD=...`
- `REDIS_PASSWORD=...`

---

## 5.6 Generate Self‑Signed Certificates (No Domain)

```
mkdir -p caddy/certs
openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout caddy/certs/selfsigned.key \
  -out caddy/certs/selfsigned.crt \
  -subj "/CN=vtt-chat"
```

Caddyfile example:

```
https://:8443 {
    tls /opt/vtt-chat/caddy/certs/selfsigned.crt /opt/vtt-chat/caddy/certs/selfsigned.key
    reverse_proxy backend:3000
    reverse_proxy /livekit livekit:7880
    encode gzip
}
```

---

## 5.7 Start Docker Stack

```
docker compose up -d
```

Or for Swarm:

```
docker swarm init
docker stack deploy -c docker-compose.yml vttchat
```

---

## 5.8 Access the App

Open:

```
https://<server-ip>:8443
```

Accept the self‑signed certificate.

---

# 🎙️ 6. LiveKit Deployment

LiveKit runs as a **native binary** inside a container or directly on the host.

### Configuration includes:

- WebSocket port (7880)
- UDP port range (7881–7980)
- Internal token server (backend)
- Room settings
- Logging

A typical `livekit.yaml`:

```yaml
port: 7880
rtc:
  port_range_start: 7881
  port_range_end: 7980
keys:
  devkey: secret
```

---

# 🗄️ 7. Database & Redis

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

# 🧪 8. Testing the Deployment

### Verify services:

```
docker ps
docker logs backend
docker logs livekit
docker logs caddy
```

### Verify ports:

```
sudo ss -tulpn | grep 8443
sudo ss -tulpn | grep 7880
```

### Verify TLS:

Open browser → accept self‑signed cert.

---

# 🛠️ 9. Troubleshooting

### Browser refuses self‑signed cert  
Add exception manually.

### LiveKit audio not working  
Check UDP ports 7881–7980.

### SPA cannot connect to backend  
Check Caddy reverse proxy config.

### DM voice/conditions not applying  
Check WebSocket connection in browser dev tools.

---

# 🔐 10. Security Notes

- Self‑signed certs are fine for local networks  
- For remote access, use DNS‑01 ACME  
- Keep Postgres/Redis internal‑only  
- Use strong passwords in `.env`  
- Keep server updated  

---

# 📦 11. Future Enhancements

- Automated install script  
- Optional TURN server  
- Admin dashboard  
- Monitoring & metrics  
- Backup/restore automation  

---

# ⚠️ Trademark Disclaimer

- **Dungeons & Dragons**, **D&D**, and related terms are trademarks of **Wizards of the Coast LLC**.  
- **LiveKit** is a trademark of **LiveKit, Inc.**  
- All other trademarks belong to their respective owners.  
- VTT‑Chat is **not affiliated** with any trademark holder.

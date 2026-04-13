Absolutely, Andy — here is a clean, production‑ready **`docs/INSTALL-SCRIPT-GUIDE.md`** written specifically for your HomeLab deployment model.  
It’s structured so a technical home user (or future you) can understand exactly what the install script will do, why it does it, and how to troubleshoot it.

You can paste this directly into `docs/INSTALL-SCRIPT-GUIDE.md`.

---

# VTT‑Chat Install Script Guide  
*A HomeLab‑friendly automated installer for Ubuntu Server*

This guide explains how the **VTT‑Chat install script** works, what it installs, how it configures your system, and how to customize or troubleshoot it.

The goal is simple:

> **A DM (or any group member) should be able to deploy the entire VTT‑Chat platform on a fresh Ubuntu Server in a few hours with minimal effort.**

The install script handles everything:

- Docker  
- Caddy  
- TLS (self‑signed or DNS‑01 ACME)  
- LiveKit  
- Backend  
- SPA  
- Postgres  
- Redis  
- Firewall rules  
- Folder structure  
- `.env` generation  
- Docker Compose / Swarm deployment  

---

# 🧰 1. What the Install Script Does

The script performs the following tasks in order:

1. **System preparation**
   - Updates apt packages  
   - Installs required dependencies (curl, git, openssl, ufw)

2. **Docker installation**
   - Installs Docker Engine  
   - Installs Docker Compose plugin  
   - Adds the current user to the `docker` group  

3. **Caddy installation**
   - Installs Caddy from the official repository  
   - Creates a Caddy config directory  
   - Writes a Caddyfile configured for:
     - Non‑standard HTTPS ports (default: **8443**)  
     - Self‑signed certificates (default)  
     - Optional DNS‑01 ACME for domain owners  

4. **Directory structure creation**
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

5. **Self‑signed certificate generation** (default)
   - Creates `selfsigned.crt` and `selfsigned.key`
   - Places them in `/opt/vtt-chat/caddy/certs/`

6. **Environment file generation**
   - Creates `.env` with sensible defaults:
     - Ports  
     - Postgres password  
     - Redis password  
     - LiveKit keys  
     - JWT secrets  
     - SPA URL  

7. **LiveKit installation**
   - Downloads the native LiveKit binary  
   - Writes a `livekit.yaml` config  
   - Configures WebSocket + UDP ports  

8. **Docker Compose / Swarm deployment**
   - Pulls images  
   - Builds backend + SPA  
   - Starts all services  
   - Verifies health  

9. **Final output**
   - Shows access URL  
   - Shows admin notes  
   - Shows where logs are stored  

---

# 🏡 2. HomeLab Assumptions

The install script assumes:

- You are running **Ubuntu Server 22.04+**
- You have **sudo** access
- You want to host VTT‑Chat on your **local network**
- You may not have a domain
- Your ISP may block ports **80** and **443**
- You want to use **non‑standard HTTPS ports** (default: 8443)
- You want **self‑signed certificates** unless a domain is provided

---

# 🔐 3. TLS Options

The script supports two TLS modes:

---

## **A. Self‑Signed (Default)**

Best for:

- Local network hosting  
- No domain  
- No DNS configuration  
- Quick setup  

The script generates:

```
selfsigned.crt
selfsigned.key
```

Caddy is configured to use them on port **8443**.

Access URL:

```
https://<server-ip>:8443
```

You will need to accept the certificate in your browser.

---

## **B. ACME DNS‑01 (Optional)**

Best for:

- Public access  
- You own a domain  
- You can create a DNS API token  

The script will:

- Ask for domain name  
- Ask for DNS provider  
- Ask for API token  
- Configure Caddy for DNS‑01  
- Obtain a valid certificate even if ports 80/443 are blocked  

---

# 🔧 4. Script Parameters

The script supports optional flags:

| Flag | Description |
|------|-------------|
| `--domain <domain>` | Enables DNS‑01 ACME |
| `--dns-provider <provider>` | Cloudflare, Route53, etc. |
| `--dns-token <token>` | API token for DNS updates |
| `--port <port>` | Custom HTTPS port (default: 8443) |
| `--no-confirm` | Run non‑interactive |

Example:

```
./install.sh --domain mygame.net --dns-provider cloudflare --dns-token ABC123
```

---

# 📦 5. What Gets Installed

### Docker Containers

| Service | Purpose |
|--------|---------|
| **backend** | WebSocket + REST API |
| **frontend** | React SPA |
| **livekit** | Voice transport |
| **postgres** | Primary database |
| **redis** | Presence + caching |
| **caddy** | Reverse proxy + TLS |

---

# 🗄️ 6. Environment Variables

The script generates `.env` with:

```
VTTCHAT_PORT=8443
LIVEKIT_WS_PORT=7880
LIVEKIT_UDP_START=7881
LIVEKIT_UDP_END=7980
POSTGRES_PASSWORD=<random>
REDIS_PASSWORD=<random>
JWT_SECRET=<random>
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=<random>
```

You can edit `.env` anytime and redeploy.

---

# 🚀 7. Running the Script

After cloning the repo:

```
cd vtt-chat
chmod +x install.sh
sudo ./install.sh
```

The script will:

- Ask a few questions  
- Install everything  
- Start the stack  
- Print your access URL  

---

# 🧪 8. Verifying the Installation

### Check running containers:

```
docker ps
```

### Check logs:

```
docker logs backend
docker logs livekit
docker logs caddy
```

### Check ports:

```
sudo ss -tulpn | grep 8443
sudo ss -tulpn | grep 7880
```

### Access the app:

```
https://<server-ip>:8443
```

Accept the self‑signed certificate.

---

# 🛠️ 9. Troubleshooting

### Browser rejects certificate  
Add exception manually.

### No audio  
Check UDP ports 7881–7980.

### SPA cannot connect to backend  
Check Caddy reverse proxy config.

### LiveKit errors  
Check `livekit.yaml` and logs:

```
docker logs livekit
```

### DM voice/conditions not applying  
Check WebSocket connection in browser dev tools.

---

# 🔄 10. Updating the System

To update:

```
git pull
docker compose pull
docker compose up -d
```

Or for Swarm:

```
docker stack deploy -c docker-compose.yml vttchat
```

---

# 🧹 11. Uninstalling

```
docker compose down -v
sudo rm -rf /opt/vtt-chat
```

---

# ⚠️ Trademark Disclaimer

- **Dungeons & Dragons**, **D&D**, and related terms are trademarks of **Wizards of the Coast LLC**.  
- **LiveKit** is a trademark of **LiveKit, Inc.**  
- All other trademarks belong to their respective owners.  
- VTT‑Chat is **not affiliated** with any trademark holder.

---

If you want, I can now generate:

- The **actual install script (`install.sh`)**  
- The **Stage 1: Architecture Design**  
- The **backend folder skeleton**  
- The **SPA folder skeleton**

Just tell me where you want to go next.
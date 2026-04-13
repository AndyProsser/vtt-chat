#!/usr/bin/env bash
set -e

###############################################
# VTT-Chat HomeLab Installer
# ---------------------------------------------
# This script installs:
# - Docker Engine + Compose
# - Caddy reverse proxy
# - Self-signed TLS certificates (default)
# - Optional DNS-01 ACME (domain mode)
# - LiveKit native server
# - Postgres + Redis
# - Backend + Frontend containers
# - Full directory structure under /opt/vtt-chat
###############################################

# Default values
INSTALL_DIR="/opt/vtt-chat"
HTTPS_PORT=8443
DOMAIN=""
DNS_PROVIDER=""
DNS_TOKEN=""
NON_INTERACTIVE=false

###############################################
# Parse arguments
###############################################
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --domain) DOMAIN="$2"; shift ;;
        --dns-provider) DNS_PROVIDER="$2"; shift ;;
        --dns-token) DNS_TOKEN="$2"; shift ;;
        --port) HTTPS_PORT="$2"; shift ;;
        --no-confirm) NON_INTERACTIVE=true ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

###############################################
# Confirm installation
###############################################
if [ "$NON_INTERACTIVE" = false ]; then
    echo "=============================================="
    echo " VTT-Chat HomeLab Installer"
    echo " Install directory: $INSTALL_DIR"
    echo " HTTPS port: $HTTPS_PORT"
    if [ -z "$DOMAIN" ]; then
        echo " TLS Mode: Self-signed certificates"
    else
        echo " TLS Mode: DNS-01 ACME for domain $DOMAIN"
        echo " DNS Provider: $DNS_PROVIDER"
    fi
    echo "=============================================="
    read -p "Proceed with installation? (y/n): " CONFIRM
    if [[ "$CONFIRM" != "y" ]]; then
        echo "Installation cancelled."
        exit 0
    fi
fi

###############################################
# System preparation
###############################################
echo "[1/10] Updating system packages..."
sudo apt update -y
sudo apt upgrade -y
sudo apt install -y curl git ufw openssl

###############################################
# Install Docker
###############################################
echo "[2/10] Installing Docker..."
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"

###############################################
# Install Caddy
###############################################
echo "[3/10] Installing Caddy..."
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo apt-key add -
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy

###############################################
# Create directory structure
###############################################
echo "[4/10] Creating directory structure..."
sudo mkdir -p $INSTALL_DIR/{backend,frontend,livekit,caddy/certs,postgres,redis}
sudo mkdir -p $INSTALL_DIR/logs

###############################################
# Generate environment file
###############################################
echo "[5/10] Generating .env file..."

POSTGRES_PASSWORD=$(openssl rand -hex 16)
REDIS_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
LIVEKIT_SECRET=$(openssl rand -hex 32)

cat <<EOF | sudo tee $INSTALL_DIR/.env >/dev/null
VTTCHAT_PORT=$HTTPS_PORT

POSTGRES_PASSWORD=$POSTGRES_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD

JWT_SECRET=$JWT_SECRET

LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=$LIVEKIT_SECRET

LIVEKIT_WS_PORT=7880
LIVEKIT_UDP_START=7881
LIVEKIT_UDP_END=7980
EOF

###############################################
# TLS configuration
###############################################
if [ -z "$DOMAIN" ]; then
    echo "[6/10] Generating self-signed TLS certificates..."
    sudo openssl req -x509 -nodes -days 365 \
        -newkey rsa:2048 \
        -keyout $INSTALL_DIR/caddy/certs/selfsigned.key \
        -out $INSTALL_DIR/caddy/certs/selfsigned.crt \
        -subj "/CN=vtt-chat"
else
    echo "[6/10] Configuring DNS-01 ACME for domain $DOMAIN..."
    # DNS-01 ACME config will be added here later
fi

###############################################
# Write Caddyfile
###############################################
echo "[7/10] Writing Caddyfile..."

if [ -z "$DOMAIN" ]; then
cat <<EOF | sudo tee $INSTALL_DIR/caddy/Caddyfile >/dev/null
https://:${HTTPS_PORT} {
    tls $INSTALL_DIR/caddy/certs/selfsigned.crt $INSTALL_DIR/caddy/certs/selfsigned.key
    reverse_proxy /api* backend:3000
    reverse_proxy /livekit* livekit:7880
    reverse_proxy frontend:5173
    encode gzip
}
EOF
else
cat <<EOF | sudo tee $INSTALL_DIR/caddy/Caddyfile >/dev/null
https://$DOMAIN:${HTTPS_PORT} {
    tls {
        dns $DNS_PROVIDER $DNS_TOKEN
    }
    reverse_proxy /api* backend:3000
    reverse_proxy /livekit* livekit:7880
    reverse_proxy frontend:5173
    encode gzip
}
EOF
fi

###############################################
# Install LiveKit
###############################################
echo "[8/10] Installing LiveKit..."

sudo curl -L https://github.com/livekit/livekit/releases/latest/download/livekit-linux \
    -o $INSTALL_DIR/livekit/livekit
sudo chmod +x $INSTALL_DIR/livekit/livekit

cat <<EOF | sudo tee $INSTALL_DIR/livekit/livekit.yaml >/dev/null
port: 7880
rtc:
  port_range_start: 7881
  port_range_end: 7980
keys:
  devkey: $LIVEKIT_SECRET
EOF

###############################################
# Write docker-compose.yml
###############################################
echo "[9/10] Writing docker-compose.yml..."

cat <<EOF | sudo tee $INSTALL_DIR/docker-compose.yml >/dev/null
version: "3.9"

services:
  caddy:
    image: caddy:latest
    container_name: vttchat_caddy
    ports:
      - "${HTTPS_PORT}:${HTTPS_PORT}"
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile
      - ./caddy/certs:/certs
    restart: unless-stopped

  postgres:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - ./postgres:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7
    command: ["redis-server", "--requirepass", "${REDIS_PASSWORD}"]
    restart: unless-stopped

  livekit:
    image: livekit/livekit-server:latest
    command: ["--config", "/livekit/livekit.yaml"]
    volumes:
      - ./livekit:/livekit
    ports:
      - "7880:7880"
      - "7881-7980:7881-7980/udp"
    restart: unless-stopped

  backend:
    build: ./backend
    env_file: .env
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  frontend:
    build: ./frontend
    env_file: .env
    restart: unless-stopped
EOF

###############################################
# Start the stack
###############################################
echo "[10/10] Starting Docker stack..."
cd $INSTALL_DIR
sudo docker compose up -d

echo "=============================================="
echo " VTT-Chat installation complete!"
echo " Access the app at:"
echo "   https://<server-ip>:${HTTPS_PORT}"
echo " (Accept the self-signed certificate)"
echo "=============================================="

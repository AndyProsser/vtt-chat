#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/opt/vtt-chat"
TARGET_USER="${SUDO_USER:-$USER}"
REPO_NAME="${REPO_NAME:-AndyProsser/vtt-chat}"
BRANCH="${BRANCH:-main}"
REPO_ARCHIVE_URL="${REPO_ARCHIVE_URL:-https://codeload.github.com/${REPO_NAME}/tar.gz/${BRANCH}}"
CONFIG_FILE="$INSTALL_DIR/install-config.yml"

function show_help() {
  cat <<HELP
Usage: $0 setup

This installer bootstraps a VTT-Chat home server deployment at $INSTALL_DIR.
It installs Docker, Caddy, UFW, downloads the repository contents, and writes a
config file that you can edit before building and running the stack.

Commands:
  setup    Install dependencies and populate $INSTALL_DIR
  help     Show this help message
HELP
}

function install_prereqs() {
  echo "[1/8] Installing base packages..."
  sudo apt update -y
  sudo apt upgrade -y
  sudo apt install -y curl rsync ufw openssl apt-transport-https ca-certificates gnupg lsb-release
}

function install_docker() {
  echo "[2/8] Installing Docker..."
  curl -fsSL https://get.docker.com | sudo sh
  sudo systemctl enable docker
  if [[ -n "${TARGET_USER:-}" ]]; then
    sudo usermod -aG docker "$TARGET_USER" || true
  fi
}

function install_caddy() {
  echo "[3/8] Installing Caddy..."
  sudo apt install -y debian-keyring debian-archive-keyring
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo tee /usr/share/keyrings/caddy-stable-archive-keyring.gpg >/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt update
  sudo apt install -y caddy
}

function configure_ufw() {
  echo "[4/8] Configuring UFW firewall..."
  sudo ufw default deny incoming
  sudo ufw default allow outgoing
  sudo ufw allow OpenSSH
  sudo ufw allow 8443/tcp
  sudo ufw allow 7880/tcp
  sudo ufw allow 7881:7980/udp
  sudo ufw --force enable
  sudo ufw status verbose
}

function create_install_dir() {
  echo "[5/8] Creating install directory at $INSTALL_DIR..."
  sudo mkdir -p "$INSTALL_DIR"
  sudo chown "$TARGET_USER":"$TARGET_USER" "$INSTALL_DIR"
}

function download_source() {
  echo "[6/8] Installing VTT-Chat files..."
  mkdir -p "$INSTALL_DIR"

  if [[ -d "$SCRIPT_DIR/backend" && -d "$SCRIPT_DIR/frontend" && -f "$SCRIPT_DIR/install-config.yml" ]]; then
    echo "Copying local repository files into $INSTALL_DIR..."
    rsync -a --delete \
      --exclude '.git' \
      --exclude 'node_modules' \
      --exclude 'backend/node_modules' \
      --exclude 'frontend/node_modules' \
      --exclude 'dist' \
      --exclude 'caddy/certs' \
      --exclude 'install-config.yml' \
      --exclude 'config.yml' \
      --exclude '.env' \
      --exclude 'backend/.env' \
      --exclude 'frontend/.env' \
      "$SCRIPT_DIR/" "$INSTALL_DIR/"
  else
    echo "Downloading repository archive from $REPO_ARCHIVE_URL..."
    tmpdir=$(mktemp -d)
    curl -fsSL "$REPO_ARCHIVE_URL" | tar -xz --strip-components=1 -C "$tmpdir"
    rsync -a --delete \
      --exclude '.git' \
      --exclude 'node_modules' \
      --exclude 'backend/node_modules' \
      --exclude 'frontend/node_modules' \
      --exclude 'dist' \
      --exclude 'caddy/certs' \
      --exclude 'install-config.yml' \
      --exclude 'config.yml' \
      --exclude '.env' \
      --exclude 'backend/.env' \
      --exclude 'frontend/.env' \
      "$tmpdir/" "$INSTALL_DIR/"
    rm -rf "$tmpdir"
  fi

  sudo chown -R "$TARGET_USER":"$TARGET_USER" "$INSTALL_DIR"
}

function write_install_config() {
  if [[ -f "$CONFIG_FILE" ]]; then
    echo "[7/8] Preserving existing install-config.yml"
    return
  fi

  echo "[7/8] Writing default install-config.yml..."
  cat <<EOF >"$CONFIG_FILE"
install_dir: $INSTALL_DIR
https_port: 8443
backend_port: 3000
frontend_port: 5173
postgres_port: 5432
redis_port: 6379
postgres_password: auto
redis_password: auto
livekit_port: 7880
livekit_udp_start: 7881
livekit_udp_end: 7980
livekit_api_key: devkey
livekit_api_secret: auto
jwt_secret: auto
domain: ""
dns_provider: ""
dns_token: ""
use_self_signed: true
EOF
}

function make_scripts_executable() {
  echo "[8/8] Making server scripts executable..."
  sudo chmod +x "$INSTALL_DIR/install.sh" "$INSTALL_DIR/server" "$INSTALL_DIR/scripts"/*.sh
}

function setup() {
  install_prereqs
  install_docker
  install_caddy
  configure_ufw
  create_install_dir
  download_source
  write_install_config
  make_scripts_executable

  echo "[Done] Bootstrapping complete."
  echo "Edit $CONFIG_FILE before running the stack."
  echo "Then build and start with:"
  echo "  sudo $INSTALL_DIR/server build"
  echo "  sudo $INSTALL_DIR/server start"
}

if [[ $# -eq 0 ]]; then
  show_help
  exit 0
fi

case "$1" in
  setup)
    setup
    ;;
  help|-h|--help)
    show_help
    ;;
  *)
    echo "Unknown command: $1"
    show_help
    exit 1
    ;;
esac

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TARGET_USER="${SUDO_USER:-$USER}"
REPO_NAME="${REPO_NAME:-AndyProsser/vtt-chat}"
BRANCH="${BRANCH:-main}"
REPO_ARCHIVE_URL="${REPO_ARCHIVE_URL:-https://codeload.github.com/${REPO_NAME}/tar.gz/${BRANCH}}"
INSTALL_DIR_DEFAULT="/opt/vtt-chat"
INSTALL_DIR="${INSTALL_DIR:-$INSTALL_DIR_DEFAULT}"
CONFIG_FILE=""

DEV_PROFILE=false
ASSUME_YES=false
DISTRO_FAMILY=""
LOCAL_REPO_MODE=false
WSL_MODE=false
DOCKER_CMD=""
LOG_FILE="${TMPDIR:-/tmp}/vtt-chat-install.log"

COLOR_RED=""
COLOR_GREEN=""
COLOR_YELLOW=""
COLOR_BLUE=""
COLOR_BOLD=""
COLOR_RESET=""

ACTIONS=()
WARNINGS=()
ERRORS=()

function initialize_output() {
  if [[ -t 1 ]]; then
    COLOR_RED=$'\033[0;31m'
    COLOR_GREEN=$'\033[0;32m'
    COLOR_YELLOW=$'\033[1;33m'
    COLOR_BLUE=$'\033[0;34m'
    COLOR_BOLD=$'\033[1m'
    COLOR_RESET=$'\033[0m'
  fi
}

function print_stage() {
  printf '%b\n' "${COLOR_BLUE}${COLOR_BOLD}$1${COLOR_RESET}"
}

function print_info() {
  printf '%b\n' "$1"
}

function print_ok() {
  printf '%b\n' "${COLOR_GREEN}[OK]${COLOR_RESET} $1"
}

function print_warn() {
  printf '%b\n' "${COLOR_YELLOW}[WARN]${COLOR_RESET} $1"
}

function print_fail() {
  printf '%b\n' "${COLOR_RED}[FAIL]${COLOR_RESET} $1"
}

function print_step_ok() {
  printf '%b\n' "  - $1 ... ${COLOR_GREEN}OK${COLOR_RESET}"
}

function print_step_warn() {
  printf '%b\n' "  - $1 ... ${COLOR_YELLOW}WARN${COLOR_RESET}"
}

function run_logged_step() {
  local label="$1"
  shift

  printf '%b' "  - ${label} ... "
  if "$@" >>"$LOG_FILE" 2>&1; then
    printf '%b\n' "${COLOR_GREEN}OK${COLOR_RESET}"
  else
    printf '%b\n' "${COLOR_RED}FAIL${COLOR_RESET}"
    print_fail "${label} failed. See $LOG_FILE"
    exit 1
  fi
}

function show_help() {
  cat <<HELP
Usage: $0 [--dev] [--yes] <command>

Commands:
  check    Validate system readiness and show what would change
  setup    Install/configure prerequisites and populate $INSTALL_DIR
  help     Show this help message

Options:
  --dev    Developer profile (Node.js v26 + npm latest + dev utilities)
  --yes    Skip confirmation prompt for setup

Profiles:
  Admin (default): Fast server bootstrap for running VTT-Chat via Docker.
  Dev (--dev): Adds Node.js v26 and dev tooling for local development.

Platform support:
  - PROD/Admin: Ubuntu Server is the primary support target.
  - DEV: Ubuntu/Debian, Fedora, and CachyOS/Arch are supported.
  - Recommended for both server and DEV: Ubuntu LTS 24.x or 26.x.
  - Recommended editor: VS Code.

Notes:
  - Caddy is not installed by this script; it is run from Docker Compose.
  - If run from a git clone, setup defaults to repo-local mode (uses current clone path, no /opt sync).
  - Repo Docker/infra config files are used as tested defaults.
  - In WSL, Docker Desktop integration is preferred over Linux Docker Engine install.
  - Existing $CONFIG_FILE is preserved so admins can keep custom settings.

Examples:
  ./install check
  ./install setup
  ./install --dev check
  ./install --dev setup
HELP
}

function initialize_runtime_paths() {
  if [[ -d "$REPO_ROOT/.git" && -z "${INSTALL_DIR:-}" ]]; then
    LOCAL_REPO_MODE=true
    INSTALL_DIR="$REPO_ROOT"
  elif [[ -d "$REPO_ROOT/.git" && "$INSTALL_DIR" == "$INSTALL_DIR_DEFAULT" ]]; then
    LOCAL_REPO_MODE=true
    INSTALL_DIR="$REPO_ROOT"
  fi

  CONFIG_FILE="$INSTALL_DIR/infra/install-config.yml"
}

function is_interactive_shell() {
  [[ -t 0 && -t 1 ]]
}

function prompt_user() {
  local question="$1"
  local default="${2:-y}"
  local response
  if [[ "$default" == "y" ]]; then
    read -r -p "$question [Y/n]: " response
    response="${response:-y}"
  else
    read -r -p "$question [y/N]: " response
    response="${response:-n}"
  fi
  [[ "$response" == "y" || "$response" == "Y" ]]
}

function detect_distro_family() {
  local id=""
  local id_like=""

  if [[ -f /etc/os-release ]]; then
    id=$(grep -E '^ID=' /etc/os-release | cut -d= -f2 | tr -d '"' | tr '[:upper:]' '[:lower:]')
    id_like=$(grep -E '^ID_LIKE=' /etc/os-release | cut -d= -f2 | tr -d '"' | tr '[:upper:]' '[:lower:]')
  fi

  if [[ "$id" == "ubuntu" || "$id" == "debian" || "$id_like" == *"debian"* || "$id_like" == *"ubuntu"* ]]; then
    DISTRO_FAMILY="debian"
  elif [[ "$id" == "fedora" || "$id" == "rhel" || "$id" == "rocky" || "$id" == "almalinux" || "$id_like" == *"fedora"* || "$id_like" == *"rhel"* ]]; then
    DISTRO_FAMILY="fedora"
  elif [[ "$id" == "arch" || "$id" == "cachyos" || "$id" == "manjaro" || "$id_like" == *"arch"* ]]; then
    DISTRO_FAMILY="arch"
  else
    DISTRO_FAMILY="unknown"
  fi
}

function detect_wsl_environment() {
  if [[ -n "${WSL_INTEROP:-}" ]]; then
    WSL_MODE=true
    return
  fi

  if grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null; then
    WSL_MODE=true
    return
  fi

  WSL_MODE=false
}

function resolve_docker_command() {
  if command -v docker >/dev/null 2>&1; then
    DOCKER_CMD="docker"
    return 0
  fi

  if command -v docker.exe >/dev/null 2>&1; then
    DOCKER_CMD="docker.exe"
    return 0
  fi

  DOCKER_CMD=""
  return 1
}

function docker_cli_available() {
  resolve_docker_command
}

function docker_compose_available() {
  if ! resolve_docker_command; then
    return 1
  fi
  "$DOCKER_CMD" compose version >/dev/null 2>&1
}

function parse_yaml_value_from_file() {
  local file_path="$1"
  local key="$2"
  local value

  if [[ ! -f "$file_path" ]]; then
    return 1
  fi

  value=$(grep -E "^[[:space:]]*${key}:" "$file_path" | head -n1 | cut -d':' -f2- || true)
  value="${value#${value%%[![:space:]]*}}"
  value="${value%${value##*[![:space:]]}}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "$value"
}

function get_config_value_or_default() {
  local key="$1"
  local fallback="$2"
  local parsed

  parsed=$(parse_yaml_value_from_file "$CONFIG_FILE" "$key" || true)
  if [[ -n "$parsed" ]]; then
    echo "$parsed"
  else
    echo "$fallback"
  fi
}

function add_action() {
  ACTIONS+=("$1")
}

function add_warning() {
  WARNINGS+=("$1")
}

function add_error() {
  ERRORS+=("$1")
}

function print_list() {
  local title="$1"
  shift
  local items=("$@")
  local item

  if [[ ${#items[@]} -eq 0 ]]; then
    return
  fi

  printf '%b\n' "${COLOR_BOLD}${title}${COLOR_RESET}"
  for item in "${items[@]}"; do
    echo "  - $item"
  done
}

function is_port_in_use() {
  local port="$1"
  ss -ltnu 2>/dev/null | awk '{print $5}' | grep -Eq "[:.]${port}$"
}

function detect_conflicting_ports() {
  local https_port
  local livekit_port
  local udp_start
  local udp_end
  local p

  https_port=$(get_config_value_or_default "https_port" "8443")
  livekit_port=$(get_config_value_or_default "livekit_port" "7880")
  udp_start=$(get_config_value_or_default "livekit_udp_start" "7881")
  udp_end=$(get_config_value_or_default "livekit_udp_end" "7980")

  if is_port_in_use "$https_port"; then
    add_warning "Port $https_port is already in use. Review install-config.yml before build."
  fi

  if is_port_in_use "$livekit_port"; then
    add_warning "Port $livekit_port is already in use. Review install-config.yml before build."
  fi

  for ((p = udp_start; p <= udp_end; p++)); do
    if is_port_in_use "$p"; then
      add_warning "At least one LiveKit UDP port in $udp_start-$udp_end appears in use."
      break
    fi
  done
}

function assert_safe_install_target() {
  local repo_real
  local install_real

  repo_real=$(realpath "$REPO_ROOT")
  install_real=$(realpath -m "$INSTALL_DIR")

  if [[ "$install_real" == "/" ]]; then
    add_error "INSTALL_DIR cannot be /."
  fi

  if [[ "$repo_real" == "$install_real" && "$LOCAL_REPO_MODE" == "false" ]]; then
    add_error "INSTALL_DIR resolves to repo path, but repo-local mode was not enabled."
  fi
}

function collect_preflight_findings() {
  ACTIONS=()
  WARNINGS=()
  ERRORS=()

  detect_distro_family
  detect_wsl_environment

  if [[ "$WSL_MODE" == "true" ]]; then
    add_warning "WSL environment detected. Docker Engine install inside WSL may fail or conflict. Docker Desktop WSL integration is recommended."
  fi

  if [[ "$DISTRO_FAMILY" == "unknown" ]]; then
    add_error "Unsupported distro. Supported: Ubuntu/Debian, Fedora, Arch/CachyOS."
  fi

  if [[ "$DISTRO_FAMILY" != "debian" && "$DEV_PROFILE" == "false" ]]; then
    add_warning "Admin profile was primarily designed for Ubuntu/Debian; continuing on $DISTRO_FAMILY."
  fi

  assert_safe_install_target

  if [[ "$LOCAL_REPO_MODE" == "false" && ! -d "$INSTALL_DIR" ]]; then
    add_action "Create install directory at $INSTALL_DIR"
  elif [[ "$LOCAL_REPO_MODE" == "false" && -n "$(find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 2>/dev/null | head -n1)" ]]; then
    add_warning "Install directory $INSTALL_DIR already has files. Setup will sync and may replace generated files there."
  fi

  if ! docker_cli_available; then
    if [[ "$WSL_MODE" == "true" ]]; then
      add_warning "Docker CLI is not currently available in WSL. Enable Docker Desktop WSL integration or install Docker manually in WSL before setup."
      add_action "Attempt Docker Engine install inside WSL (best-effort; may fail)"
    else
      add_action "Install Docker Engine"
    fi
  fi

  if ! docker_compose_available; then
    add_action "Ensure Docker Compose plugin is available"
  fi

  if [[ "$DEV_PROFILE" == "true" ]]; then
    local node_major=""
    if command -v node >/dev/null 2>&1; then
      node_major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)
    fi

    if [[ "$node_major" != "26" ]]; then
      add_action "Install Node.js v26 for DEV"
    fi

    if ! command -v npm >/dev/null 2>&1; then
      add_action "Install npm"
    else
      local npm_current
      local npm_latest
      npm_current=$(npm --version 2>/dev/null || true)
      printf '%b' "  Checking npm version..."
      npm_latest=$(npm view npm version 2>/dev/null || true)
      printf '\r%-40s\r' ""
      if [[ -z "$npm_latest" ]]; then
        add_warning "Could not check latest npm version (network unavailable); current: ${npm_current:-unknown}"
      elif [[ "$npm_current" != "$npm_latest" ]]; then
        add_action "Update npm (current: $npm_current, latest: $npm_latest)"
      fi
    fi
  fi

  if [[ ! -f "$CONFIG_FILE" ]]; then
    add_action "Write default install-config.yml at $CONFIG_FILE"
  fi

  detect_conflicting_ports

  if docker_cli_available && "$DOCKER_CMD" ps --format '{{.Names}}' 2>/dev/null | grep -qE '^vttchat-'; then
    add_warning "Existing vttchat containers are running. Review with ./server status before rebuild."
  fi
}

function print_preflight_report() {
  local profile="${COLOR_BLUE}PROD${COLOR_RESET}"
  if [[ "$DEV_PROFILE" == "true" ]]; then
    profile="${COLOR_YELLOW}DEV${COLOR_RESET}"
  fi

  print_stage "Preflight Report"
  echo "  Profile: ${COLOR_BOLD}$profile${COLOR_RESET}"
  echo "  Distro: ${COLOR_BOLD}$DISTRO_FAMILY${COLOR_RESET}"
  echo "  WSL: ${COLOR_BOLD}$WSL_MODE${COLOR_RESET}"
  echo "  Install dir: ${COLOR_BOLD}$INSTALL_DIR${COLOR_RESET}"
  echo ""

  if [[ ${#ACTIONS[@]} -gt 0 ]]; then
    print_list "${COLOR_BLUE}Actions Needed:${COLOR_RESET}" "${ACTIONS[@]}"
  fi
  if [[ ${#WARNINGS[@]} -gt 0 ]]; then
    print_list "${COLOR_YELLOW}Warnings:${COLOR_RESET}" "${WARNINGS[@]}"
  fi
  if [[ ${#ERRORS[@]} -gt 0 ]]; then
    print_list "${COLOR_RED}Blocking Issues:${COLOR_RESET}" "${ERRORS[@]}"
  fi

  if [[ ${#ACTIONS[@]} -eq 0 && ${#WARNINGS[@]} -eq 0 && ${#ERRORS[@]} -eq 0 ]]; then
    print_ok "All good, nothing to do."
  fi

  echo ""
}

function maybe_confirm_proceed() {
  if [[ "$ASSUME_YES" == "true" ]]; then
    return
  fi

  if [[ ${#ACTIONS[@]} -eq 0 && ${#WARNINGS[@]} -eq 0 ]]; then
    return
  fi

  if is_interactive_shell; then
    local default="n"
    if [[ ${#ACTIONS[@]} -gt 0 ]]; then
      default="y"
    fi
    if ! prompt_user "Proceed with setup changes?" "$default"; then
      echo "Aborted."
      exit 1
    fi
  fi
}

function install_base_packages_debian() {
  run_logged_step "Update apt package index" sudo apt update -y
  run_logged_step "Install Debian base packages" sudo apt install -y curl rsync ufw openssl apt-transport-https ca-certificates gnupg lsb-release git jq unzip make
}

function install_base_packages_fedora() {
  run_logged_step "Refresh dnf metadata" sudo dnf makecache -y
  run_logged_step "Install Fedora base packages" sudo dnf install -y curl rsync openssl ca-certificates gnupg2 git jq unzip make firewalld
}

function install_base_packages_arch() {
  run_logged_step "Refresh pacman package index" sudo pacman -Sy --noconfirm
  run_logged_step "Install Arch base packages" sudo pacman -S --noconfirm curl rsync openssl ca-certificates gnupg git jq unzip make firewalld
}

function install_base_packages() {
  print_stage "[1/7] Installing base packages"
  case "$DISTRO_FAMILY" in
    debian)
      install_base_packages_debian
      ;;
    fedora)
      install_base_packages_fedora
      ;;
    arch)
      install_base_packages_arch
      ;;
  esac
}

function install_docker() {
  print_stage "[2/7] Installing/configuring Docker"
  if docker_cli_available; then
    print_step_ok "Docker CLI already available via '$DOCKER_CMD' (skipping install)"
    return
  fi

  if [[ "$WSL_MODE" == "true" ]]; then
    print_step_warn "Running Docker Engine install inside WSL (may fail/conflict with Docker Desktop integration)"
    print_step_warn "If this step fails, enable Docker Desktop WSL integration and rerun ./install check"
  fi

  if ! docker_cli_available; then
    run_logged_step "Install Docker Engine" bash -lc "curl -fsSL https://get.docker.com | sudo sh"
  fi

  if [[ "$WSL_MODE" == "false" ]]; then
    run_logged_step "Enable/start Docker service" sudo systemctl enable --now docker
    if [[ -n "${TARGET_USER:-}" ]]; then
      if sudo usermod -aG docker "$TARGET_USER" >>"$LOG_FILE" 2>&1; then
        print_ok "Added $TARGET_USER to docker group"
      else
        print_warn "Could not add $TARGET_USER to docker group"
      fi
    fi
  else
    print_step_warn "WSL detected: skipping systemctl enable/start and docker group modification"
  fi
}

function configure_firewall_admin() {
  local enable_now="true"
  if [[ "$DEV_PROFILE" == "true" ]]; then
    enable_now="false"
  fi

  print_stage "[3/7] Configuring firewall rules for current profile"

  local https_port
  local livekit_port
  local udp_start
  local udp_end

  function _ufw_allow_ssh() {
    if sudo ufw allow OpenSSH >/dev/null 2>&1; then
      return 0
    fi
    add_warning "UFW profile 'OpenSSH' not found; skipping SSH firewall rule."
    return 1
  }

  function _firewalld_allow_ssh() {
    if sudo firewall-cmd --permanent --add-service=ssh >/dev/null 2>&1; then
      return 0
    fi
    add_warning "firewalld service 'ssh' not found; skipping SSH firewall rule."
    return 1
  }

  function _firewalld_offline_allow_ssh() {
    if sudo firewall-offline-cmd --add-service=ssh >/dev/null 2>&1; then
      return 0
    fi
    add_warning "firewalld offline service 'ssh' not found; skipping SSH firewall rule."
    return 1
  }

  https_port=$(get_config_value_or_default "https_port" "8443")
  livekit_port=$(get_config_value_or_default "livekit_port" "7880")
  udp_start=$(get_config_value_or_default "livekit_udp_start" "7881")
  udp_end=$(get_config_value_or_default "livekit_udp_end" "7980")

  case "$DISTRO_FAMILY" in
    debian)
      if command -v ufw >/dev/null 2>&1; then
        run_logged_step "Set UFW default deny incoming" sudo ufw default deny incoming
        run_logged_step "Set UFW default allow outgoing" sudo ufw default allow outgoing
        _ufw_allow_ssh || true
        run_logged_step "Allow HTTPS port ${https_port}/tcp" sudo ufw allow "${https_port}/tcp"
        run_logged_step "Allow LiveKit TCP port ${livekit_port}/tcp" sudo ufw allow "${livekit_port}/tcp"
        run_logged_step "Allow LiveKit UDP range ${udp_start}:${udp_end}/udp" sudo ufw allow "${udp_start}:${udp_end}/udp"
        if [[ "$enable_now" == "true" ]]; then
          run_logged_step "Enable UFW" sudo ufw --force enable
        elif sudo ufw status 2>/dev/null | grep -qi '^Status: active'; then
          print_step_ok "UFW already active"
        else
          print_step_warn "DEV profile leaves UFW disabled (rules are saved)"
        fi
      else
        add_warning "UFW not available; firewall rules were not applied."
      fi
      ;;
    arch)
      if command -v firewall-cmd >/dev/null 2>&1; then
        if [[ "$enable_now" == "true" ]]; then
          run_logged_step "Enable/start firewalld" sudo systemctl enable --now firewalld
          _firewalld_allow_ssh || true
          run_logged_step "Allow HTTPS port ${https_port}/tcp" sudo firewall-cmd --permanent --add-port="${https_port}/tcp"
          run_logged_step "Allow LiveKit TCP port ${livekit_port}/tcp" sudo firewall-cmd --permanent --add-port="${livekit_port}/tcp"
          run_logged_step "Allow LiveKit UDP range ${udp_start}-${udp_end}/udp" sudo firewall-cmd --permanent --add-port="${udp_start}-${udp_end}/udp"
          run_logged_step "Reload firewalld" sudo firewall-cmd --reload
        elif sudo systemctl is-active --quiet firewalld; then
          _firewalld_allow_ssh || true
          run_logged_step "Allow HTTPS port ${https_port}/tcp" sudo firewall-cmd --permanent --add-port="${https_port}/tcp"
          run_logged_step "Allow LiveKit TCP port ${livekit_port}/tcp" sudo firewall-cmd --permanent --add-port="${livekit_port}/tcp"
          run_logged_step "Allow LiveKit UDP range ${udp_start}-${udp_end}/udp" sudo firewall-cmd --permanent --add-port="${udp_start}-${udp_end}/udp"
          run_logged_step "Reload firewalld" sudo firewall-cmd --reload
          print_step_ok "firewalld already active; rules updated"
        elif command -v firewall-offline-cmd >/dev/null 2>&1; then
          _firewalld_offline_allow_ssh || true
          run_logged_step "Queue HTTPS port ${https_port}/tcp offline" sudo firewall-offline-cmd --add-port="${https_port}/tcp"
          run_logged_step "Queue LiveKit TCP port ${livekit_port}/tcp offline" sudo firewall-offline-cmd --add-port="${livekit_port}/tcp"
          run_logged_step "Queue LiveKit UDP range ${udp_start}-${udp_end}/udp offline" sudo firewall-offline-cmd --add-port="${udp_start}-${udp_end}/udp"
          print_step_warn "DEV profile keeps firewalld disabled (offline rules saved)"
        else
          add_warning "firewalld is installed but not active, and firewall-offline-cmd is unavailable; rules were not applied."
        fi
      elif command -v ufw >/dev/null 2>&1; then
        add_warning "firewalld not available on Arch/CachyOS. Falling back to UFW."
        run_logged_step "Set UFW default deny incoming" sudo ufw default deny incoming
        run_logged_step "Set UFW default allow outgoing" sudo ufw default allow outgoing
        _ufw_allow_ssh || true
        run_logged_step "Allow HTTPS port ${https_port}/tcp" sudo ufw allow "${https_port}/tcp"
        run_logged_step "Allow LiveKit TCP port ${livekit_port}/tcp" sudo ufw allow "${livekit_port}/tcp"
        run_logged_step "Allow LiveKit UDP range ${udp_start}:${udp_end}/udp" sudo ufw allow "${udp_start}:${udp_end}/udp"
        if [[ "$enable_now" == "true" ]]; then
          run_logged_step "Enable UFW" sudo ufw --force enable
        elif sudo ufw status 2>/dev/null | grep -qi '^Status: active'; then
          print_step_ok "UFW already active"
        else
          print_step_warn "DEV profile leaves UFW disabled (rules are saved)"
        fi
      else
        add_warning "Neither firewalld nor UFW is available on Arch/CachyOS; firewall rules were not applied."
      fi
      ;;
    fedora)
      if command -v firewall-cmd >/dev/null 2>&1; then
        if [[ "$enable_now" == "true" ]]; then
          run_logged_step "Enable/start firewalld" sudo systemctl enable --now firewalld
          _firewalld_allow_ssh || true
          run_logged_step "Allow HTTPS port ${https_port}/tcp" sudo firewall-cmd --permanent --add-port="${https_port}/tcp"
          run_logged_step "Allow LiveKit TCP port ${livekit_port}/tcp" sudo firewall-cmd --permanent --add-port="${livekit_port}/tcp"
          run_logged_step "Allow LiveKit UDP range ${udp_start}-${udp_end}/udp" sudo firewall-cmd --permanent --add-port="${udp_start}-${udp_end}/udp"
          run_logged_step "Reload firewalld" sudo firewall-cmd --reload
        elif sudo systemctl is-active --quiet firewalld; then
          _firewalld_allow_ssh || true
          run_logged_step "Allow HTTPS port ${https_port}/tcp" sudo firewall-cmd --permanent --add-port="${https_port}/tcp"
          run_logged_step "Allow LiveKit TCP port ${livekit_port}/tcp" sudo firewall-cmd --permanent --add-port="${livekit_port}/tcp"
          run_logged_step "Allow LiveKit UDP range ${udp_start}-${udp_end}/udp" sudo firewall-cmd --permanent --add-port="${udp_start}-${udp_end}/udp"
          run_logged_step "Reload firewalld" sudo firewall-cmd --reload
          print_step_ok "firewalld already active; rules updated"
        elif command -v firewall-offline-cmd >/dev/null 2>&1; then
          _firewalld_offline_allow_ssh || true
          run_logged_step "Queue HTTPS port ${https_port}/tcp offline" sudo firewall-offline-cmd --add-port="${https_port}/tcp"
          run_logged_step "Queue LiveKit TCP port ${livekit_port}/tcp offline" sudo firewall-offline-cmd --add-port="${livekit_port}/tcp"
          run_logged_step "Queue LiveKit UDP range ${udp_start}-${udp_end}/udp offline" sudo firewall-offline-cmd --add-port="${udp_start}-${udp_end}/udp"
          print_step_warn "DEV profile keeps firewalld disabled (offline rules saved)"
        else
          add_warning "firewalld is installed but not active, and firewall-offline-cmd is unavailable; rules were not applied."
        fi
      else
        add_warning "firewalld not available; firewall rules were not applied."
      fi
      ;;
  esac
}

function install_nodejs_v26_debian() {
  run_logged_step "Download NodeSource setup script" curl -fsSL https://deb.nodesource.com/setup_26.x -o /tmp/nodesource_setup.sh
  run_logged_step "Configure NodeSource repository" sudo bash /tmp/nodesource_setup.sh
  run_logged_step "Install Node.js 26" sudo apt install -y nodejs
  rm -f /tmp/nodesource_setup.sh >>"$LOG_FILE" 2>&1 || true
}

function install_nodejs_v26_fedora() {
  run_logged_step "Configure NodeSource repository" bash -lc "curl -fsSL https://rpm.nodesource.com/setup_26.x | sudo bash -"
  run_logged_step "Install Node.js 26" sudo dnf install -y nodejs
}

function install_nodejs_v26_arch() {
  run_logged_step "Install nvm" sudo pacman -S --noconfirm nvm
  run_logged_step "Install Node.js 26 via nvm" sudo -u "$TARGET_USER" bash -lc 'export NVM_DIR="$HOME/.nvm"; if [[ -s /usr/share/nvm/init-nvm.sh ]]; then . /usr/share/nvm/init-nvm.sh; fi; nvm install 26; nvm alias default 26'
}

function install_dev_stack() {
  print_stage "[3/7] Installing DEV toolchain (Node.js v26 + npm latest + utilities)"

  case "$DISTRO_FAMILY" in
    debian)
      install_nodejs_v26_debian
      ;;
    fedora)
      install_nodejs_v26_fedora
      ;;
    arch)
      install_nodejs_v26_arch
      ;;
  esac

  if command -v npm >/dev/null 2>&1; then
    if [[ "$DISTRO_FAMILY" == "arch" ]]; then
      run_logged_step "Update npm to latest" sudo -u "$TARGET_USER" bash -lc 'export NVM_DIR="$HOME/.nvm"; if [[ -s /usr/share/nvm/init-nvm.sh ]]; then . /usr/share/nvm/init-nvm.sh; fi; npm install -g npm@latest'
    else
      run_logged_step "Update npm to latest" sudo npm install -g npm@latest
    fi
  fi
}

function create_install_dir() {
  print_stage "[4/7] Ensuring install directory at $INSTALL_DIR"
  if [[ "$LOCAL_REPO_MODE" == "true" ]]; then
    mkdir -p "$INSTALL_DIR"
    print_step_ok "Using repo-local install directory"
  else
    run_logged_step "Create install directory" sudo mkdir -p "$INSTALL_DIR"
    run_logged_step "Set install directory ownership" sudo chown "$TARGET_USER":"$TARGET_USER" "$INSTALL_DIR"
  fi
}

function download_source() {
  print_stage "[5/7] Syncing VTT-Chat files into $INSTALL_DIR"

  if [[ "$LOCAL_REPO_MODE" == "true" ]]; then
    print_step_ok "Repo-local mode detected. Skipping source sync; using current clone at $REPO_ROOT"
    return
  fi

  mkdir -p "$INSTALL_DIR"

  if [[ -d "$REPO_ROOT/apps/backend" && -d "$REPO_ROOT/apps/frontend" && -f "$REPO_ROOT/infra/install-config.yml" ]]; then
    print_info "Using local repository source (repo-safe copy to install dir)."
    run_logged_step "Sync repository into install directory" rsync -a --delete \
      --exclude '.git' \
      --exclude 'node_modules' \
      --exclude 'apps/backend/node_modules' \
      --exclude 'apps/frontend/node_modules' \
      --exclude 'apps/admin/node_modules' \
      --exclude 'packages/shared/node_modules' \
      --exclude 'dist' \
      --exclude 'coverage' \
      --exclude 'caddy/certs' \
      --exclude 'infra/install-config.yml' \
      --exclude 'config.yml' \
      --exclude '.env' \
      --exclude 'apps/backend/.env' \
      --exclude 'apps/frontend/.env' \
      "$REPO_ROOT/" "$INSTALL_DIR/"
  else
    print_info "Downloading repository archive from $REPO_ARCHIVE_URL"
    local tmpdir
    tmpdir=$(mktemp -d)
    run_logged_step "Download repository archive" bash -lc "curl -fsSL '$REPO_ARCHIVE_URL' | tar -xz --strip-components=1 -C '$tmpdir'"
    run_logged_step "Sync extracted archive into install directory" rsync -a --delete \
      --exclude '.git' \
      --exclude 'node_modules' \
      --exclude 'apps/backend/node_modules' \
      --exclude 'apps/frontend/node_modules' \
      --exclude 'apps/admin/node_modules' \
      --exclude 'packages/shared/node_modules' \
      --exclude 'dist' \
      --exclude 'coverage' \
      --exclude 'caddy/certs' \
      --exclude 'infra/install-config.yml' \
      --exclude 'config.yml' \
      --exclude '.env' \
      --exclude 'apps/backend/.env' \
      --exclude 'apps/frontend/.env' \
      "$tmpdir/" "$INSTALL_DIR/"
    rm -rf "$tmpdir" >>"$LOG_FILE" 2>&1 || true
  fi

  run_logged_step "Set install tree ownership" sudo chown -R "$TARGET_USER":"$TARGET_USER" "$INSTALL_DIR"
}

function write_install_config() {
  if [[ -f "$CONFIG_FILE" ]]; then
    print_stage "[6/7] Preserving existing install-config.yml"
    print_step_ok "$CONFIG_FILE already exists"
    return
  fi

  print_stage "[6/7] Writing default install-config.yml"
  mkdir -p "$INSTALL_DIR/infra"
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
  print_step_ok "Wrote $CONFIG_FILE"
}

function make_scripts_executable() {
  print_stage "[7/7] Making launcher scripts executable"
  if [[ "$LOCAL_REPO_MODE" == "true" ]]; then
    chmod +x "$INSTALL_DIR/infra/scripts/install.sh" "$INSTALL_DIR/infra/scripts/server" "$INSTALL_DIR/install"
    print_step_ok "Updated executable bits in repo-local mode"
  else
    run_logged_step "Set installed script permissions" sudo chmod +x "$INSTALL_DIR/infra/scripts/install.sh" "$INSTALL_DIR/infra/scripts/server"
    run_logged_step "Link install launcher" ln -sf "$INSTALL_DIR/infra/scripts/install.sh" "$INSTALL_DIR/install"
    run_logged_step "Link server launcher" ln -sf "$INSTALL_DIR/infra/scripts/server" "$INSTALL_DIR/server"
  fi
}

function print_post_setup_instructions() {
  echo ""
  echo "${COLOR_GREEN}[Done]${COLOR_RESET} Environment bootstrap complete."
  echo ""
  echo "${COLOR_BLUE}Next steps:${COLOR_RESET}"
  echo "  1) Change into the install directory:"
  echo "       cd $INSTALL_DIR"
  echo "  2) Edit config:"
  echo "       nano infra/install-config.yml"
  if [[ "$DEV_PROFILE" == "true" ]]; then
    echo "  3) Validate mode files and env keys:"
    echo "       ./server --dev doctor"
    echo "  4) Build ${COLOR_YELLOW}DEV${COLOR_RESET} stack from tested repo configs:"
    echo "       ./server --dev build"
    echo "  5) Manage ${COLOR_YELLOW}DEV${COLOR_RESET} runtime:"
    echo "       ./server --dev start"
    echo "       ./server --dev status"
    echo "       ./server --dev stop"
  else
    echo "  3) Validate mode files and env keys:"
    echo "       ./server doctor"
    echo "  4) Build ${COLOR_BLUE}PROD${COLOR_RESET} stack from tested repo configs:"
    echo "       ./server build"
    echo "  5) Manage ${COLOR_BLUE}PROD${COLOR_RESET} runtime:"
    echo "       ./server start"
    echo "       ./server status"
    echo "       ./server stop"
  fi
  echo ""
  echo "${COLOR_YELLOW}Note:${COLOR_RESET} Docker group changes may require logout/login for non-root users."
  echo ""
}

function run_check() {
  initialize_output
  printf '%b\n' "Running preflight checks..."
  collect_preflight_findings
  print_preflight_report

  if [[ ${#ERRORS[@]} -gt 0 ]]; then
    exit 1
  fi
}

function run_setup() {
  initialize_output
  : >"$LOG_FILE"
  print_info "Detailed install log: $LOG_FILE"

  printf '%b\n' "Running preflight checks..."
  collect_preflight_findings
  print_preflight_report

  if [[ ${#ERRORS[@]} -gt 0 ]]; then
    echo "Blocking issues detected. Resolve them, then rerun setup."
    exit 1
  fi

  if [[ ${#ACTIONS[@]} -eq 0 && ${#WARNINGS[@]} -eq 0 ]]; then
    echo "All good, nothing to do."
    exit 0
  fi

  maybe_confirm_proceed

  install_base_packages
  install_docker
  configure_firewall_admin
  if [[ "$DEV_PROFILE" == "true" ]]; then
    install_dev_stack
  fi
  create_install_dir
  download_source
  write_install_config
  make_scripts_executable
  print_step_ok "Setup stages completed successfully"
  print_post_setup_instructions
}

COMMAND=""
for arg in "$@"; do
  case "$arg" in
    --dev)
      DEV_PROFILE=true
      ;;
    --yes)
      ASSUME_YES=true
      ;;
    check|setup|help|-h|--help)
      if [[ -z "$COMMAND" ]]; then
        COMMAND="$arg"
      fi
      ;;
    *)
      ;;
  esac
done

if [[ -z "$COMMAND" ]]; then
  initialize_runtime_paths
  show_help
  exit 0
fi

initialize_runtime_paths

case "$COMMAND" in
  check)
    run_check
    ;;
  setup)
    run_setup
    ;;
  help|-h|--help)
    show_help
    ;;
  *)
    echo "Unknown command: $COMMAND"
    show_help
    exit 1
    ;;
esac

#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONFIG_FILE="$INSTALL_DIR/infra/install-config.yml"
REPO_NAME="${REPO_NAME:-AndyProsser/vtt-chat}"
BRANCH="${BRANCH:-main}"
REPO_ARCHIVE_URL="${REPO_ARCHIVE_URL:-https://codeload.github.com/${REPO_NAME}/tar.gz/${BRANCH}}"

# Mode: DEV or PROD (default: PROD)
MODE="${MODE:-PROD}"
DEV_MODE=false
FORCE_OVERWRITE=false
PROMPT_OVERWRITE=false
DEV_FULL_CLEAN_DETECTED_CONTAINERS=0
DEV_FULL_CLEAN_DETECTED_IMAGES=0
DEV_FULL_CLEAN_DETECTED_VOLUMES=0
DEV_FULL_CLEAN_DETECTED_BUILD_RECORDS=0
DEV_FULL_CLEAN_REMOVED_CONTAINERS=0
DEV_FULL_CLEAN_REMOVED_IMAGES=0
DEV_FULL_CLEAN_REMOVED_VOLUMES=0
DEV_FULL_CLEAN_REMOVED_BUILD_RECORDS=0
PROD_CLEAN_DETECTED_BUILD_RECORDS=0
PROD_CLEAN_REMOVED_BUILD_RECORDS=0
PROD_CLEAN_RETAINED_BUILD_RECORDS=0

# Wrapper so every compose invocation uses the repo root as the project
# directory. Docker Compose resolves .env relative to the project directory;
# since the compose files now live in infra/ we must override that default or
# the variables in the compose files will be empty.
function dc() {
  docker compose --project-directory "$INSTALL_DIR" "$@"
}

function show_help() {
  cat <<HELP
Usage: $0 [--dev] <command>

Options:
  --dev     Use DEV environment (default: PROD)
  --force   Overwrite existing generated config files without prompting
  --prompt-overwrite
            Prompt before overwriting existing generated config files

Environment flags:
  SKIP_DEV_NPM_INSTALL=1
            Skip automatic npm install sync for DEV start/restart

Commands:
  build     Validate mode files, prepare env files, and build the Docker stack
  start     Start the Docker stack
  restart   Restart the Docker stack and rebuild if needed
  stop      Stop the Docker stack
  update    Refresh the install from the repository and rebuild
  doctor    Check config integrity for the selected mode
  status    Show Docker Compose service status
  clean     Remove stale Docker artifacts and logs (default). In DEV, use --full to destroy all DEV data and containers (confirmation required).
  help      Show this help message

Examples:
  server start              # Start PROD environment
  server --dev start        # Start DEV environment
  server --dev stop         # Stop DEV environment
  server clean              # Prune stale Docker images, containers, volumes, logs
  server --dev clean --full # FULLY DESTROY all DEV Docker data, containers, images, volumes, logs (confirmation required)

Before running build, edit $CONFIG_FILE with your desired ports and credentials.

⚠️  WARNING: Do not run PROD and DEV instances simultaneously. They use common ports and may conflict.
HELP
}

# --- CLEAN COMMAND IMPLEMENTATION ---
function clean_logs_and_artifacts() {
  echo "Cleaning custom logs and workspace artifacts..."
  # Keep cleanup surgical: never traverse dependency/metadata trees.
  local -a protected_dirs=(
    "node_modules"
    ".git"
    ".vscode"
    ".idea"
  )

  # Limit artifact cleanup to the main workspace app roots.
  local -a artifact_roots=(
    "$INSTALL_DIR"
    "$INSTALL_DIR/apps/backend"
    "$INSTALL_DIR/apps/frontend"
    "$INSTALL_DIR/apps/admin"
  )

  local root
  for root in "${artifact_roots[@]}"; do
    [[ -d "$root" ]] || continue

    local -a prune_args=(
      "("
      "-type" "d"
      "("
    )

    local protected_dir
    for protected_dir in "${protected_dirs[@]}"; do
      prune_args+=("-name" "$protected_dir" "-o")
    done
    unset 'prune_args[${#prune_args[@]}-1]'
    prune_args+=(")" "-prune" ")" "-o")

    # Remove log files while skipping protected directories.
    find "$root" "${prune_args[@]}" -type f -name "*.log" -exec rm -f {} +

    # Remove common build artifacts while skipping protected directories.
    find "$root" "${prune_args[@]}" -type d \( -name "dist" -o -name "coverage" -o -name ".turbo" -o -name ".vite" \) -exec rm -rf {} +
  done

  # Only remove known runtime log directories. Never wildcard-delete any folder named
  # "logs" because source code paths like admin/src/features/logs must be preserved.
  local log_dirs=(
    "$INSTALL_DIR/logs"
    "$INSTALL_DIR/apps/backend/logs"
    "$INSTALL_DIR/apps/frontend/logs"
    "$INSTALL_DIR/apps/admin/logs"
  )
  local log_dir
  for log_dir in "${log_dirs[@]}"; do
    if [[ -d "$log_dir" ]]; then
      rm -rf "$log_dir"
    fi
  done

  # Run npm run clean in root, backend, frontend, admin if package.json exists
  for d in "$INSTALL_DIR" "$INSTALL_DIR/apps/backend" "$INSTALL_DIR/apps/frontend" "$INSTALL_DIR/apps/admin"; do
    if [[ -f "$d/package.json" ]]; then
      (cd "$d" && npm run clean >/dev/null 2>&1 || true)
    fi
  done
}

function clean_docker_stale() {
  echo "Pruning unused Docker containers, images, volumes, and networks..."
  docker container prune -f
  docker image prune -af
  docker volume prune -f
  docker network prune -f
  clean_failed_build_history
}

function list_build_history_refs() {
  if ! docker buildx history ls >/dev/null 2>&1; then
    return 0
  fi

  docker buildx history ls --format '{{json .}}' 2>/dev/null \
    | sed -nE 's/.*"ref":"([^"]+)".*/\1/p' \
    | awk 'NF' \
    | sort -u || true
}

function clean_failed_build_history() {
  if ! docker buildx history ls >/dev/null 2>&1; then
    return 0
  fi

  # Buildx output shape can vary by Docker version. Try common fields and
  # only remove clearly failed/canceled records.
  mapfile -t failed_refs < <(
    docker buildx history ls --format '{{json .}}' 2>/dev/null \
      | awk '
        {
          ref = ""
          status = ""

          if (match($0, /"ref":"[^"]+"/)) {
            ref = substr($0, RSTART + 7, RLENGTH - 8)
          }

          if (match($0, /"status":"[^"]+"/)) {
            status = substr($0, RSTART + 10, RLENGTH - 11)
          } else if (match($0, /"result":"[^"]+"/)) {
            status = substr($0, RSTART + 10, RLENGTH - 11)
          } else if (match($0, /"state":"[^"]+"/)) {
            status = substr($0, RSTART + 9, RLENGTH - 10)
          }

          lower_status = tolower(status)
          if (ref != "" && (lower_status ~ /fail|error|cancel/)) {
            print ref
          }
        }
      ' \
      | sort -u
  )

  if [[ ${#failed_refs[@]} -gt 0 ]]; then
    docker buildx history rm "${failed_refs[@]}" >/dev/null 2>&1 || true
  fi
}

function list_build_history_refs_older_than() {
  local cutoff_epoch="$1"
  local keep_recent="$2"
  local tmp_file
  tmp_file=$(mktemp)

  docker buildx history ls --format '{{json .}}' 2>/dev/null \
    | sed -nE 's/.*"created_at":"([^"]+)".*"ref":"([^"]+)".*/\1|\2/p' \
    | awk 'NF' \
    | sort -r >"$tmp_file" || true

  local line_index=0
  local row
  while IFS= read -r row; do
    [[ -z "$row" ]] && continue
    ((line_index += 1))

    if (( line_index <= keep_recent )); then
      continue
    fi

    local created_at
    local ref
    local created_epoch
    created_at="${row%%|*}"
    ref="${row#*|}"
    created_epoch=$(date -u -d "$created_at" +%s 2>/dev/null || echo 0)

    if (( created_epoch < cutoff_epoch )); then
      echo "$ref"
    fi
  done <"$tmp_file"

  rm -f "$tmp_file"
}

function count_lines_in_file() {
  local file_path="$1"
  awk 'NF { count += 1 } END { print count + 0 }' "$file_path"
}

function count_removed_between_snapshots() {
  local before_file="$1"
  local after_file="$2"

  comm -23 "$before_file" "$after_file" | awk 'NF { count += 1 } END { print count + 0 }'
}

function clean_docker_build_history() {
  if ! docker buildx history ls >/dev/null 2>&1; then
    return 0
  fi

  mapfile -t build_history_refs < <(list_build_history_refs)
  if [[ ${#build_history_refs[@]} -gt 0 ]]; then
    docker buildx history rm "${build_history_refs[@]}" >/dev/null 2>&1 || true
  fi

  # Clear BuildKit cache records that also surface in Desktop build metadata.
  docker buildx prune -af >/dev/null 2>&1 || true
  docker builder prune -af >/dev/null 2>&1 || true
}

function clean_docker_build_history_old_records() {
  PROD_CLEAN_DETECTED_BUILD_RECORDS=0
  PROD_CLEAN_REMOVED_BUILD_RECORDS=0
  PROD_CLEAN_RETAINED_BUILD_RECORDS=0

  if ! docker buildx history ls >/dev/null 2>&1; then
    return 0
  fi

  local retention_days
  local keep_recent
  local cutoff_epoch
  retention_days="${PROD_BUILDX_HISTORY_RETENTION_DAYS:-7}"
  keep_recent="${PROD_BUILDX_HISTORY_KEEP_RECENT:-3}"
  cutoff_epoch=$(date -u -d "${retention_days} days ago" +%s)

  mapfile -t before_refs < <(list_build_history_refs)
  PROD_CLEAN_DETECTED_BUILD_RECORDS=${#before_refs[@]}

  mapfile -t old_refs < <(list_build_history_refs_older_than "$cutoff_epoch" "$keep_recent")
  if [[ ${#old_refs[@]} -gt 0 ]]; then
    docker buildx history rm "${old_refs[@]}" >/dev/null 2>&1 || true
  fi

  clean_failed_build_history

  mapfile -t after_refs < <(list_build_history_refs)
  PROD_CLEAN_RETAINED_BUILD_RECORDS=${#after_refs[@]}
  PROD_CLEAN_REMOVED_BUILD_RECORDS=$((PROD_CLEAN_DETECTED_BUILD_RECORDS - PROD_CLEAN_RETAINED_BUILD_RECORDS))
  if (( PROD_CLEAN_REMOVED_BUILD_RECORDS < 0 )); then
    PROD_CLEAN_REMOVED_BUILD_RECORDS=0
  fi

  # Prune cache records older than retained current history entries.
  docker buildx prune -af >/dev/null 2>&1 || true
  docker builder prune -af >/dev/null 2>&1 || true
}

function list_dev_container_ids() {
  docker ps -a --format '{{.ID}}|{{.Names}}' | grep -E "$(get_dev_container_name_regex)" | cut -d'|' -f1 | sort -u || true
}

function list_dev_image_ids() {
  {
    docker ps -a --format '{{.Image}}|{{.Names}}' | grep -E "$(get_dev_container_name_regex)" | cut -d'|' -f1 | xargs -r docker image inspect --format '{{.Id}}' 2>/dev/null || true
    docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' | grep -E 'vttchat-.*-dev' | awk '{print $2}' || true
  } | sort -u
}

function list_dev_volume_names() {
  docker volume ls --format '{{.Name}}' | grep -E '(vttchat_.*_dev|postgres_data_dev|backend_node_modules|frontend_node_modules|admin_node_modules)$' | sort -u || true
}

function count_missing_container_ids() {
  local count=0
  local container_id
  for container_id in "$@"; do
    [[ -z "$container_id" ]] && continue
    if ! docker container inspect "$container_id" >/dev/null 2>&1; then
      ((count += 1))
    fi
  done
  echo "$count"
}

function count_missing_image_ids() {
  local count=0
  local image_id
  for image_id in "$@"; do
    [[ -z "$image_id" ]] && continue
    if ! docker image inspect "$image_id" >/dev/null 2>&1; then
      ((count += 1))
    fi
  done
  echo "$count"
}

function count_missing_volume_names() {
  local count=0
  local volume_name
  for volume_name in "$@"; do
    [[ -z "$volume_name" ]] && continue
    if ! docker volume inspect "$volume_name" >/dev/null 2>&1; then
      ((count += 1))
    fi
  done
  echo "$count"
}

function clean_dev_compose_resources() {
  local compose_file
  compose_file="$(get_compose_file)"

  if [[ -f "$compose_file" ]]; then
    # Compose-native cleanup is the most reliable way to remove named volumes and images
    # for the selected DEV stack regardless of current running state.
    dc -f "$compose_file" down --volumes --rmi all --remove-orphans || true
  fi
}

function clean_docker_dev_full() {
  echo "Stopping and removing all DEV containers, images, volumes, and logs..."

  local -a before_container_ids=()
  local -a before_image_ids=()
  local -a before_volume_names=()
  local before_build_history_file
  local after_build_history_file

  before_build_history_file=$(mktemp)
  after_build_history_file=$(mktemp)

  mapfile -t before_container_ids < <(list_dev_container_ids)
  mapfile -t before_image_ids < <(list_dev_image_ids)
  mapfile -t before_volume_names < <(list_dev_volume_names)
  list_build_history_refs >"$before_build_history_file"

  DEV_FULL_CLEAN_DETECTED_CONTAINERS=${#before_container_ids[@]}
  DEV_FULL_CLEAN_DETECTED_IMAGES=${#before_image_ids[@]}
  DEV_FULL_CLEAN_DETECTED_VOLUMES=${#before_volume_names[@]}
  DEV_FULL_CLEAN_DETECTED_BUILD_RECORDS=$(count_lines_in_file "$before_build_history_file")

  clean_dev_compose_resources

  local regex
  regex=$(get_dev_container_name_regex)

  # Remove any lingering resources that are still using DEV naming.
  docker ps -a --format '{{.Names}}' | grep -E "$regex" | xargs -r docker rm -f || true
  docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' | grep -E 'vttchat-.*-dev' | awk '{print $2}' | xargs -r docker rmi -f || true
  docker volume ls --format '{{.Name}}' | grep -E '(vttchat_.*_dev|postgres_data_dev|backend_node_modules|frontend_node_modules|admin_node_modules)$' | xargs -r docker volume rm -f || true
  docker network ls --format '{{.Name}}' | grep -E 'vttchat-.*-dev' | xargs -r docker network rm -f || true

  clean_logs_and_artifacts
  clean_docker_build_history

  list_build_history_refs >"$after_build_history_file"

  DEV_FULL_CLEAN_REMOVED_CONTAINERS=$(count_missing_container_ids "${before_container_ids[@]}")
  DEV_FULL_CLEAN_REMOVED_IMAGES=$(count_missing_image_ids "${before_image_ids[@]}")
  DEV_FULL_CLEAN_REMOVED_VOLUMES=$(count_missing_volume_names "${before_volume_names[@]}")
  DEV_FULL_CLEAN_REMOVED_BUILD_RECORDS=$(count_removed_between_snapshots "$before_build_history_file" "$after_build_history_file")

  rm -f "$before_build_history_file" "$after_build_history_file"
}

function clean_command() {
  local full_clean=false
  for arg in "$@"; do
    if [[ "$arg" == "--full" ]]; then
      full_clean=true
    fi
  done

  if [[ "$DEV_MODE" == "true" ]]; then
    if [[ "$full_clean" == "true" ]]; then
      echo -e "\n\033[1;31mWARNING: This will STOP and REMOVE ALL DEV containers, images, volumes, networks, and logs. ALL DEV DATA WILL BE DESTROYED.\033[0m"
      if is_interactive_shell; then
        if ! prompt_user "Are you sure you want to FULLY CLEAN DEV Docker and workspace? This cannot be undone."; then
          echo "Aborted."
          exit 1
        fi
      fi
      clean_docker_dev_full
      echo -e "\033[1;32mDEV Docker and workspace fully cleaned.\033[0m"
      echo "DEV full clean before -> removed: containers ${DEV_FULL_CLEAN_DETECTED_CONTAINERS} -> ${DEV_FULL_CLEAN_REMOVED_CONTAINERS}, images ${DEV_FULL_CLEAN_DETECTED_IMAGES} -> ${DEV_FULL_CLEAN_REMOVED_IMAGES}, volumes ${DEV_FULL_CLEAN_DETECTED_VOLUMES} -> ${DEV_FULL_CLEAN_REMOVED_VOLUMES}, build records ${DEV_FULL_CLEAN_DETECTED_BUILD_RECORDS} -> ${DEV_FULL_CLEAN_REMOVED_BUILD_RECORDS}."
      echo "DEV full clean summary: removed ${DEV_FULL_CLEAN_REMOVED_CONTAINERS} containers, ${DEV_FULL_CLEAN_REMOVED_IMAGES} images, ${DEV_FULL_CLEAN_REMOVED_VOLUMES} volumes, ${DEV_FULL_CLEAN_REMOVED_BUILD_RECORDS} build records."
    else
      clean_docker_stale
      clean_docker_build_history
      clean_logs_and_artifacts
      echo -e "\033[1;32mStale Docker artifacts and logs cleaned (DEV).\033[0m"
    fi
  else
    # PROD: only allow stale prune, never destructive
    echo -e "\033[1;33mPROD mode: Only cleaning stale Docker images, containers, volumes, and logs. No data or running containers will be destroyed.\033[0m"
    clean_docker_stale
    clean_docker_build_history_old_records
    clean_logs_and_artifacts
    echo "PROD build history cleanup: detected ${PROD_CLEAN_DETECTED_BUILD_RECORDS} records, removed ${PROD_CLEAN_REMOVED_BUILD_RECORDS} old records, retained ${PROD_CLEAN_RETAINED_BUILD_RECORDS} current records."
    echo -e "\033[1;32mStale Docker artifacts and logs cleaned (PROD).\033[0m"
  fi
}

function is_interactive_shell() {
  [[ -t 0 && -t 1 ]]
}

function backup_file() {
  local file_path="$1"
  local timestamp
  timestamp=$(date +%Y%m%d%H%M%S)
  cp "$file_path" "${file_path}.bak.${timestamp}"
}

function should_overwrite_file() {
  local file_path="$1"
  local label="$2"

  if [[ ! -f "$file_path" ]]; then
    return 0
  fi

  if [[ "$FORCE_OVERWRITE" == "true" ]]; then
    return 0
  fi

  if [[ "$PROMPT_OVERWRITE" == "true" ]]; then
    if is_interactive_shell && prompt_user "$label exists at $file_path. Overwrite it?"; then
      return 0
    fi
  fi

  echo "Skipping existing $label at $file_path (use --force or --prompt-overwrite to replace it)."
  return 1
}

function write_file_guarded() {
  local file_path="$1"
  local label="$2"
  local content="$3"

  mkdir -p "$(dirname "$file_path")"

  if should_overwrite_file "$file_path" "$label"; then
    if [[ -f "$file_path" ]]; then
      backup_file "$file_path"
    fi
    printf '%s\n' "$content" >"$file_path"
  fi
}

function ensure_env_key_value() {
  local file_path="$1"
  local key="$2"
  local value="$3"

  mkdir -p "$(dirname "$file_path")"
  touch "$file_path"

  if grep -qE "^${key}=" "$file_path"; then
    return
  fi

  printf '%s=%s\n' "$key" "$value" >>"$file_path"
  echo "Added missing $key to $file_path"
}

function get_compose_file() {
  if [[ "$DEV_MODE" == "true" ]]; then
    echo "$INSTALL_DIR/infra/docker-compose.dev.yml"
  else
    echo "$INSTALL_DIR/infra/docker-compose.yml"
  fi
}

function get_stack_name() {
  if [[ "$DEV_MODE" == "true" ]]; then
    echo "DEV"
  else
    echo "PROD"
  fi
}

function get_dev_container_name_regex() {
  # DEV containers follow the `vttchat-<service>-dev` pattern.
  echo '^vttchat-.*-dev(\||$)'
}

function get_prod_container_name_regex() {
  # PROD containers follow the `vttchat-<service>` pattern.
  echo '^vttchat-(admin|backend|caddy|frontend|livekit|postgres|redis)(\||$)'
}

function get_stack_container_name_regex() {
  if [[ "$DEV_MODE" == "true" ]]; then
    get_dev_container_name_regex
  else
    get_prod_container_name_regex
  fi
}

function get_container_rows_for_regex() {
  local regex="$1"
  docker ps -a --format '{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}' | grep -E "$regex" || true
}

function get_running_container_rows_for_regex() {
  local regex="$1"
  docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}' | grep -E "$regex" || true
}

function check_dev_running() {
  local rows
  rows=$(get_running_container_rows_for_regex "$(get_dev_container_name_regex)")
  if [[ -n "$rows" ]]; then
    return 0
  fi
  return 1
}

function check_prod_running() {
  local rows
  rows=$(get_running_container_rows_for_regex "$(get_prod_container_name_regex)")
  if [[ -n "$rows" ]]; then
    return 0
  fi
  return 1
}

function prompt_user() {
  local question="$1"
  local response
  read -p "$question (y/n): " response
  [[ "$response" == "y" || "$response" == "Y" ]]
}

function check_conflicts() {
  local stack_name=$(get_stack_name)

  if [[ "$DEV_MODE" == "true" ]]; then
    # Running DEV mode - check if PROD is running
    if check_prod_running; then
      echo "⚠️  ERROR: PROD environment is currently running."
      echo "PROD should be stopped before running a DEV instance."
      echo ""
      echo "To stop PROD:"
      echo "  server stop"
      echo ""
      exit 1
    fi
  else
    # Running PROD mode - check if DEV is running
    if check_dev_running; then
      echo "⚠️  WARNING: DEV environment is currently running."
      echo ""
      if ! prompt_user "Did you mean to use DEV mode (--dev)?"; then
        echo "Aborting. Use 'server --dev' if you intended to run DEV commands."
        exit 1
      fi
      echo "Proceeding with DEV mode..."
      DEV_MODE=true
    fi
  fi
}

function parse_yaml_value() {
  local key="$1"
  local value
  value=$(grep -E "^[[:space:]]*${key}:" "$CONFIG_FILE" | head -n1 | cut -d':' -f2-)
  value="${value#${value%%[![:space:]]*}}"
  value="${value%${value##*[![:space:]]}}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "$value"
}

function ensure_config_exists() {
  if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "Error: $CONFIG_FILE is missing. Edit it before running this command."
    exit 1
  fi
}

function load_config() {
  ensure_config_exists

  HTTPS_PORT=$(parse_yaml_value https_port)
  BACKEND_PORT=$(parse_yaml_value backend_port)
  FRONTEND_PORT=$(parse_yaml_value frontend_port)
  POSTGRES_PORT=$(parse_yaml_value postgres_port)
  REDIS_PORT=$(parse_yaml_value redis_port)
  POSTGRES_PASSWORD=$(parse_yaml_value postgres_password)
  REDIS_PASSWORD=$(parse_yaml_value redis_password)
  LIVEKIT_PORT=$(parse_yaml_value livekit_port)
  LIVEKIT_UDP_START=$(parse_yaml_value livekit_udp_start)
  LIVEKIT_UDP_END=$(parse_yaml_value livekit_udp_end)
  LIVEKIT_API_KEY=$(parse_yaml_value livekit_api_key)
  LIVEKIT_API_SECRET=$(parse_yaml_value livekit_api_secret)
  JWT_SECRET=$(parse_yaml_value jwt_secret)
  DOMAIN=$(parse_yaml_value domain)
  DNS_PROVIDER=$(parse_yaml_value dns_provider)
  DNS_TOKEN=$(parse_yaml_value dns_token)
  USE_SELF_SIGNED=$(parse_yaml_value use_self_signed)

  LIVEKIT_API_KEY=${LIVEKIT_API_KEY:-devkey}
  LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET:-auto}
  JWT_SECRET=${JWT_SECRET:-auto}
  POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-auto}
  REDIS_PASSWORD=${REDIS_PASSWORD:-auto}
  USE_SELF_SIGNED=${USE_SELF_SIGNED:-true}
}

function generate_secrets() {
  if [[ -z "$LIVEKIT_API_SECRET" || "$LIVEKIT_API_SECRET" == "auto" ]]; then
    LIVEKIT_API_SECRET=$(openssl rand -hex 32)
  fi
  if [[ -z "$JWT_SECRET" || "$JWT_SECRET" == "auto" ]]; then
    JWT_SECRET=$(openssl rand -hex 32)
  fi
  if [[ -z "$POSTGRES_PASSWORD" || "$POSTGRES_PASSWORD" == "auto" ]]; then
    POSTGRES_PASSWORD=$(openssl rand -hex 24)
  fi
  if [[ -z "$REDIS_PASSWORD" || "$REDIS_PASSWORD" == "auto" ]]; then
    REDIS_PASSWORD=$(openssl rand -hex 24)
  fi
}

function generate_root_env_file() {
  local env_file="$INSTALL_DIR/.env"
  ensure_env_key_value "$env_file" "POSTGRES_PASSWORD" "$POSTGRES_PASSWORD"
  ensure_env_key_value "$env_file" "REDIS_PASSWORD" "$REDIS_PASSWORD"
  ensure_env_key_value "$env_file" "LIVEKIT_API_KEY" "$LIVEKIT_API_KEY"
  ensure_env_key_value "$env_file" "LIVEKIT_API_SECRET" "$LIVEKIT_API_SECRET"
}

function generate_env_files() {
  local backend_env
  local frontend_env

  backend_env=$(cat <<EOF
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
REDIS_PASSWORD=${REDIS_PASSWORD}
JWT_SECRET=${JWT_SECRET}
LIVEKIT_API_KEY=${LIVEKIT_API_KEY}
LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}
FRONTEND_URL=https://127.0.0.1:${HTTPS_PORT}
EOF
)

  frontend_env=$(cat <<EOF
VITE_API_URL=/api
VITE_LIVEKIT_URL=/livekit
VITE_ENV=production
EOF
)

  write_file_guarded "$INSTALL_DIR/apps/backend/.env" "backend env file" "$backend_env"
  write_file_guarded "$INSTALL_DIR/apps/frontend/.env" "frontend env file" "$frontend_env"
}

function ensure_mode_standard_files() {
  local compose_file
  local caddy_file
  local livekit_file

  if [[ "$DEV_MODE" == "true" ]]; then
    compose_file="$INSTALL_DIR/infra/docker-compose.dev.yml"
    caddy_file="$INSTALL_DIR/infra/caddy/Caddyfile.dev"
    livekit_file="$INSTALL_DIR/infra/livekit/livekit.dev.yaml"
  else
    compose_file="$INSTALL_DIR/infra/docker-compose.yml"
    caddy_file="$INSTALL_DIR/infra/caddy/Caddyfile"
    livekit_file="$INSTALL_DIR/infra/livekit/livekit.yaml"
  fi

  if [[ ! -f "$compose_file" ]]; then
    echo "Error: missing required compose file for selected mode: $compose_file"
    exit 1
  fi
  if [[ ! -f "$caddy_file" ]]; then
    echo "Error: missing required Caddy config for selected mode: $caddy_file"
    exit 1
  fi
  if [[ ! -f "$livekit_file" ]]; then
    echo "Error: missing required LiveKit config for selected mode: $livekit_file"
    exit 1
  fi
}

function get_mode_file_relpaths() {
  if [[ "$DEV_MODE" == "true" ]]; then
    echo "infra/docker-compose.dev.yml"
    echo "infra/caddy/Caddyfile.dev"
    echo "infra/livekit/livekit.dev.yaml"
  else
    echo "infra/docker-compose.yml"
    echo "infra/caddy/Caddyfile"
    echo "infra/livekit/livekit.yaml"
  fi
}

function resolve_install_path() {
  local rel_path="$1"
  echo "$INSTALL_DIR/$rel_path"
}

function write_repo_baseline_file() {
  local rel_path="$1"
  local label="$2"
  local target_path
  local content

  target_path=$(resolve_install_path "$rel_path")

  if ! git -C "$INSTALL_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Skipping baseline restore for $label ($target_path): install is not a git checkout."
    return
  fi

  if ! git -C "$INSTALL_DIR" ls-files --error-unmatch "$rel_path" >/dev/null 2>&1; then
    echo "Skipping baseline restore for $label ($target_path): file is not tracked in repo baseline."
    return
  fi

  content=$(git -C "$INSTALL_DIR" show "HEAD:$rel_path")
  write_file_guarded "$target_path" "$label" "$content"
}

function print_doctor_result() {
  local ok="$1"
  local message="$2"
  local GREEN='\033[0;32m'
  local RED='\033[0;31m'
  local NC='\033[0m'
  if [[ "$ok" == "true" ]]; then
    echo -e "  [${GREEN}OK${NC}] $message"
  else
    echo -e "  [${RED}FAIL${NC}] $message"
  fi
}

function env_file_has_key() {
  local file_path="$1"
  local key="$2"
  [[ -f "$file_path" ]] && grep -qE "^${key}=" "$file_path"
}

function doctor_check_mode_files() {
  local issues=0
  local rel_path

  echo "[1/3] Mode files"
  while IFS= read -r rel_path; do
    local full_path
    full_path=$(resolve_install_path "$rel_path")
    if [[ -f "$full_path" ]]; then
      print_doctor_result "true" "Found $rel_path"
    else
      print_doctor_result "false" "Missing $rel_path"
      issues=1
    fi
  done < <(get_mode_file_relpaths)

  return $issues
}

function doctor_check_env_keys_for_file() {
  local rel_path="$1"
  shift
  local file_path
  local issues=0
  local key

  file_path=$(resolve_install_path "$rel_path")

  if [[ ! -f "$file_path" ]]; then
    print_doctor_result "false" "Missing $rel_path"
    return 1
  fi

  print_doctor_result "true" "Found $rel_path"
  for key in "$@"; do
    if env_file_has_key "$file_path" "$key"; then
      print_doctor_result "true" "$rel_path has $key"
    else
      print_doctor_result "false" "$rel_path missing $key"
      issues=1
    fi
  done

  return $issues
}

function doctor_check_env_keys() {
  local issues=0

  echo "[2/3] Required .env keys"
  doctor_check_env_keys_for_file ".env" \
    "POSTGRES_PASSWORD" \
    "REDIS_PASSWORD" \
    "LIVEKIT_API_KEY" \
    "LIVEKIT_API_SECRET" || issues=1

  doctor_check_env_keys_for_file "backend/.env" \
    "POSTGRES_PASSWORD" \
    "REDIS_PASSWORD" \
    "JWT_SECRET" \
    "LIVEKIT_API_KEY" \
    "LIVEKIT_API_SECRET" \
    "FRONTEND_URL" || issues=1

  doctor_check_env_keys_for_file "frontend/.env" \
    "VITE_API_URL" \
    "VITE_LIVEKIT_URL" \
    "VITE_ENV" || issues=1

  return $issues
}

function doctor_check_repo_baseline_diff() {
  local issues=0
  local rel_path

  echo "[3/3] Mode file drift vs repo baseline"

  if ! git -C "$INSTALL_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    print_doctor_result "false" "Cannot compare with repo baseline (not a git checkout in $INSTALL_DIR)"
    return 1
  fi

  while IFS= read -r rel_path; do
    local full_path
    full_path=$(resolve_install_path "$rel_path")

    if [[ ! -f "$full_path" ]]; then
      print_doctor_result "false" "$rel_path missing locally"
      issues=1
      continue
    fi

    if ! git -C "$INSTALL_DIR" ls-files --error-unmatch "$rel_path" >/dev/null 2>&1; then
      print_doctor_result "false" "$rel_path is not tracked in repo baseline"
      issues=1
      continue
    fi

    if git -C "$INSTALL_DIR" diff --quiet -- "$rel_path" && git -C "$INSTALL_DIR" diff --cached --quiet -- "$rel_path"; then
      print_doctor_result "true" "$rel_path matches repo baseline"
    else
      print_doctor_result "false" "$rel_path differs from repo baseline"
      issues=1
    fi
  done < <(get_mode_file_relpaths)

  return $issues
}

function generate_caddyfile() {
  if [[ "$DEV_MODE" == "true" ]]; then
    write_repo_baseline_file "infra/caddy/Caddyfile.dev" "dev caddy config"
  else
    write_repo_baseline_file "infra/caddy/Caddyfile" "prod caddy config"
  fi
}

function generate_docker_compose() {
  if [[ "$DEV_MODE" == "true" ]]; then
    write_repo_baseline_file "infra/docker-compose.dev.yml" "dev compose file"
  else
    write_repo_baseline_file "infra/docker-compose.yml" "prod compose file"
  fi
}

function detect_distro_family() {
  local id=""
  local id_like=""

  if [[ -f /etc/os-release ]]; then
    id=$(grep -E "^ID=" /etc/os-release | cut -d= -f2 | tr -d '"' | tr '[:upper:]' '[:lower:]')
    id_like=$(grep -E "^ID_LIKE=" /etc/os-release | cut -d= -f2 | tr -d '"' | tr '[:upper:]' '[:lower:]')
  fi

  if [[ "$id" == "debian" || "$id" == "ubuntu" || "$id_like" == *"debian"* || "$id_like" == *"ubuntu"* ]]; then
    echo "debian"
  elif [[ "$id" == "arch" || "$id_like" == *"arch"* ]]; then
    echo "arch"
  elif [[ "$id" == "fedora" || "$id_like" == *"fedora"* || "$id_like" == *"rhel"* || "$id_like" == *"centos"* ]]; then
    echo "fedora"
  else
    echo "unknown"
  fi
}

function _configure_firewall_ufw() {
  local enable_now="$1"

  function _ufw_allow_ssh() {
    if sudo ufw allow OpenSSH >/dev/null 2>&1; then
      return 0
    fi
    echo "  WARNING: UFW profile 'OpenSSH' not found; skipping SSH firewall rule."
    return 1
  }

  echo "  Firewall: UFW (Debian-based)"
  if ! command -v ufw &>/dev/null; then
    echo "  WARNING: ufw not found. Skipping firewall configuration."
    echo "  Install ufw to enable automatic port management."
    return
  fi
  _ufw_allow_ssh || true
  sudo ufw allow "${HTTPS_PORT}/tcp"
  sudo ufw allow "${LIVEKIT_PORT}/tcp"
  sudo ufw allow "${LIVEKIT_UDP_START}:${LIVEKIT_UDP_END}/udp"
  if [[ "$enable_now" == "true" ]]; then
    sudo ufw --force enable
  elif sudo ufw status 2>/dev/null | grep -qi '^Status: active'; then
    echo "  UFW is already active; leaving it enabled."
  else
    echo "  DEV mode: UFW rules added but firewall not auto-enabled."
  fi
}

function _configure_firewall_firewalld() {
  local distro_label="$1"
  local enable_now="$2"

  function _firewalld_allow_ssh() {
    if sudo firewall-cmd --permanent --add-service=ssh >/dev/null 2>&1; then
      return 0
    fi
    echo "  WARNING: firewalld service 'ssh' not found; skipping SSH firewall rule."
    return 1
  }

  function _firewalld_offline_allow_ssh() {
    if sudo firewall-offline-cmd --add-service=ssh >/dev/null 2>&1; then
      return 0
    fi
    echo "  WARNING: firewall-offline service 'ssh' not found; skipping SSH firewall rule."
    return 1
  }

  echo "  Firewall: firewalld (${distro_label}-based)"
  if ! command -v firewall-cmd &>/dev/null; then
    echo "  WARNING: firewall-cmd not found. Skipping firewall configuration."
    echo "  Install firewalld to enable automatic port management."
    return
  fi

  if [[ "$enable_now" == "true" ]]; then
    if ! sudo systemctl is-active --quiet firewalld; then
      echo "  Starting firewalld service..."
      sudo systemctl enable --now firewalld
    fi
    _firewalld_allow_ssh || true
    sudo firewall-cmd --permanent --add-port="${HTTPS_PORT}/tcp"
    sudo firewall-cmd --permanent --add-port="${LIVEKIT_PORT}/tcp"
    sudo firewall-cmd --permanent --add-port="${LIVEKIT_UDP_START}-${LIVEKIT_UDP_END}/udp"
    sudo firewall-cmd --reload
    return
  fi

  if sudo systemctl is-active --quiet firewalld; then
    _firewalld_allow_ssh || true
    sudo firewall-cmd --permanent --add-port="${HTTPS_PORT}/tcp"
    sudo firewall-cmd --permanent --add-port="${LIVEKIT_PORT}/tcp"
    sudo firewall-cmd --permanent --add-port="${LIVEKIT_UDP_START}-${LIVEKIT_UDP_END}/udp"
    sudo firewall-cmd --reload
    echo "  firewalld is already active; rules updated."
  elif command -v firewall-offline-cmd &>/dev/null; then
    _firewalld_offline_allow_ssh || true
    sudo firewall-offline-cmd --add-port="${HTTPS_PORT}/tcp"
    sudo firewall-offline-cmd --add-port="${LIVEKIT_PORT}/tcp"
    sudo firewall-offline-cmd --add-port="${LIVEKIT_UDP_START}-${LIVEKIT_UDP_END}/udp"
    echo "  DEV mode: firewalld offline rules added; service not auto-enabled."
  else
    echo "  WARNING: firewalld is installed but not active, and firewall-offline-cmd is unavailable."
    echo "  Rules were not applied."
  fi
}

function configure_firewall() {
  echo "Configuring firewall for current install ports..."
  local distro_family
  local enable_now="true"
  distro_family=$(detect_distro_family)

  if [[ "$DEV_MODE" == "true" ]]; then
    enable_now="false"
  fi

  case "$distro_family" in
    debian)
      _configure_firewall_ufw "$enable_now"
      ;;
    arch)
      _configure_firewall_firewalld "Arch" "$enable_now"
      ;;
    fedora)
      _configure_firewall_firewalld "Fedora" "$enable_now"
      ;;
    *)
      echo "  WARNING: Unknown distro family. Skipping automatic firewall configuration."
      echo "  Manually open ports: ${HTTPS_PORT}/tcp, ${LIVEKIT_PORT}/tcp, ${LIVEKIT_UDP_START}-${LIVEKIT_UDP_END}/udp, SSH."
      ;;
  esac
}

function get_local_server_ip() {
  local ip_addr=""

  # Prefer the source address chosen for default routing.
  if command -v ip >/dev/null 2>&1; then
    ip_addr=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}')
  fi

  # Fallback: first non-loopback address reported by hostname.
  if [[ -z "$ip_addr" ]] && command -v hostname >/dev/null 2>&1; then
    ip_addr=$(hostname -I 2>/dev/null | awk '{print $1}')
  fi

  # Final fallback keeps output usable in minimal environments.
  if [[ -z "$ip_addr" ]]; then
    ip_addr="127.0.0.1"
  fi

  echo "$ip_addr"
}

function get_caddy_access_url_from_compose() {
  local compose_file
  local host_ip
  local mapped
  local port

  compose_file="$(get_compose_file)"
  host_ip="$(get_local_server_ip)"

  # Prefer HTTPS when exposed.
  mapped=$(dc -f "$compose_file" port caddy 8443 2>/dev/null | head -n1 || true)
  if [[ -n "$mapped" ]]; then
    port=$(printf '%s' "$mapped" | awk -F: '{print $NF}')
    echo "https://${host_ip}:${port}"
    return 0
  fi

  # Fall back to HTTP for dev/local setups.
  mapped=$(dc -f "$compose_file" port caddy 8080 2>/dev/null | head -n1 || true)
  if [[ -n "$mapped" ]]; then
    port=$(printf '%s' "$mapped" | awk -F: '{print $NF}')
    echo "http://${host_ip}:${port}"
    return 0
  fi

  return 1
}

function get_stack_access_url() {
  local access_url
  local host_ip

  access_url=$(get_caddy_access_url_from_compose || true)
  if [[ -n "$access_url" ]]; then
    echo "$access_url"
    return 0
  fi

  host_ip="$(get_local_server_ip)"

  # Fallback for cases where Docker cannot report published ports yet.
  if [[ "$DEV_MODE" == "true" ]]; then
    echo "http://${host_ip}:8080"
  else
    echo "https://${host_ip}:${HTTPS_PORT}"
  fi
}

function build() {
  load_config
  generate_secrets
  ensure_mode_standard_files
  generate_env_files
  generate_root_env_file
  configure_firewall
  cd "$INSTALL_DIR"
  local compose_file
  compose_file="$(get_compose_file)"
  echo "Building Docker images..."
  dc -f "$compose_file" pull || true
  dc -f "$compose_file" build --pull
  echo "Build complete. Run '$0 start' to start the server."
}

function sync_dev_workspace_dependencies() {
  if [[ "$DEV_MODE" != "true" ]]; then
    return
  fi

  if [[ "${SKIP_DEV_NPM_INSTALL:-0}" == "1" ]]; then
    echo "Skipping DEV dependency sync (SKIP_DEV_NPM_INSTALL=1)."
    return
  fi

  local compose_file
  compose_file="$(get_compose_file)"

  echo "Syncing DEV workspace npm dependencies (backend, frontend, admin)..."

  # DEV uses persistent node_modules volumes. Reinstalling on start/restart keeps
  # workspace volumes aligned with newly added packages.
  dc -f "$compose_file" run --rm --no-deps backend npm install
  dc -f "$compose_file" run --rm --no-deps frontend npm install
  dc -f "$compose_file" run --rm --no-deps admin npm install

  echo "DEV dependency sync complete."
}

function start() {
  check_conflicts
  local stack_name=$(get_stack_name)
  cd "$INSTALL_DIR"
  sync_dev_workspace_dependencies
  dc -f "$(get_compose_file)" up -d --build
  load_config
  echo "VTT-Chat $stack_name stack started. Access the app at $(get_stack_access_url)"
}

function restart() {
  check_conflicts
  local stack_name=$(get_stack_name)
  cd "$INSTALL_DIR"
  sync_dev_workspace_dependencies
  dc -f "$(get_compose_file)" up -d --build
  load_config
  echo "VTT-Chat $stack_name stack restarted. Access the app at $(get_stack_access_url)"
}

function stop() {
  local stack_name=$(get_stack_name)
  cd "$INSTALL_DIR"
  dc -f "$(get_compose_file)" down --remove-orphans
  echo "VTT-Chat $stack_name stack stopped."
}

function status() {
  local stack_name=$(get_stack_name)
  local access_url
  local stack_regex
  stack_regex=$(get_stack_container_name_regex)
  local all_rows
  local running_rows
  all_rows=$(get_container_rows_for_regex "$stack_regex")
  running_rows=$(get_running_container_rows_for_regex "$stack_regex")
  access_url=$(get_stack_access_url)
  cd "$INSTALL_DIR"

  # Color codes
  local GREEN='\033[0;32m'
  local RED='\033[0;31m'
  local YELLOW='\033[1;33m'
  local BLUE='\033[0;34m'
  local NC='\033[0m' # No Color

  # Check if current stack is running
  local stack_running=false
  local has_unhealthy=false
  local has_paused=false

  if [[ -n "$running_rows" ]]; then
    stack_running=true
  fi

  # Determine aggregate health from known containers for this stack.
  if [[ -n "$all_rows" ]]; then
    if echo "$all_rows" | grep -qE 'Paused|pause'; then
      has_paused=true
    fi
    if echo "$all_rows" | grep -qE 'unhealthy|Exited|Dead|Created'; then
      has_unhealthy=true
    fi
  fi

  # Determine overall status display
  local status_text="UP"
  local status_symbol="✓"
  local status_color="$GREEN"
  if [[ "$stack_running" == "false" ]]; then
    status_text="DOWN"
    status_symbol="⊘"
    status_color="$YELLOW"
  elif [[ "$has_paused" == "true" ]]; then
    status_text="PAUSED"
    status_symbol="⊘"
    status_color="$YELLOW"
  elif [[ "$has_unhealthy" == "true" ]]; then
    status_text="UNHEALTHY"
    status_symbol="✗"
    status_color="$RED"
  fi

  # Shared border definitions keep header and table widths identical.
  local table_top="┌──────────────┬────────────────────────────┬──────────────┬────────────────────────────────────────────────────────┐"
  local table_mid="├──────────────┼────────────────────────────┼──────────────┼────────────────────────────────────────────────────────┤"
  local table_bottom="└──────────────┴────────────────────────────┴──────────────┴────────────────────────────────────────────────────────┘"

  # Print header with status on same line, sized to match the table exactly.
  echo ""
  local table_total_width=${#table_top}
  local header_inner_width=$((table_total_width - 2))
  local header_prefix="VTT-Chat "
  local header_suffix=" Stack Status"
  local env_color="$BLUE"
  if [[ "$stack_name" == "DEV" ]]; then
    env_color="$YELLOW"
  fi
  local header_left_visible_len=$(( ${#header_prefix} + ${#stack_name} + ${#header_suffix} ))
  local header_right="${status_symbol} ${status_text}"
  local header_padding_width=$((header_inner_width - 2 - header_left_visible_len - ${#header_right}))
  if [[ $header_padding_width -lt 1 ]]; then
    header_padding_width=1
  fi
  local header_rule
  printf -v header_rule '%*s' "$header_inner_width" ''
  header_rule=${header_rule// /─}
  local header_padding
  printf -v header_padding '%*s' "$header_padding_width" ''

  echo -e "${BLUE}┌${header_rule}┐${NC}"
  echo -e "${BLUE}│${NC} ${header_prefix}${env_color}${stack_name}${NC}${header_suffix}${header_padding}${status_color}${header_right}${NC} ${BLUE}│${NC}"
  echo -e "${BLUE}└${header_rule}┘${NC}"
  echo ""

  # Display services table if stack is running
  if [[ "$stack_running" == "true" ]]; then
    echo -e "${BLUE}${table_top}${NC}"
    echo -e "${BLUE}│ SERVICE      │ IMAGE                      │ STATUS       │ PORTS                                                  │${NC}"
    echo -e "${BLUE}${table_mid}${NC}"

    while IFS='|' read -r name image status ports; do
      local service="$name"
      service="${service#vttchat-}"
      service="${service%-dev}"

      # Determine status with color
      local status_color="$GREEN"
      local status_display="UP"

      if [[ "$status" == *"healthy"* ]]; then
        status_color="$GREEN"
        status_display="HEALTHY"
      elif [[ "$status" == *"unhealthy"* ]]; then
        status_color="$RED"
        status_display="UNHEALTHY"
      elif [[ "$status" == *"Exit"* ]] || [[ "$status" == *"exited"* ]]; then
        status_color="$RED"
        status_display="DOWN"
      elif [[ "$status" == *"pause"* ]] || [[ "$status" == *"Paused"* ]]; then
        status_color="$YELLOW"
        status_display="PAUSED"
      fi

      # Show the ports as reported by Docker Compose.
      local port_display=""
      if [[ -n "$ports" ]]; then
        port_display="$ports"
      fi

      mapfile -t port_lines < <(printf '%s' "$port_display" | fold -s -w 54)
      if [[ ${#port_lines[@]} -eq 0 ]]; then
        port_lines=("")
      fi

      # Print the first row line.
      printf "${BLUE}│${NC} %-12s ${BLUE}│${NC} %-26s ${BLUE}│${NC} ${status_color}%-12s${NC} ${BLUE}│${NC} %-54s ${BLUE}│${NC}\n" \
        "$service" \
        "$(echo "$image" | cut -c1-26)" \
        "$status_display" \
        "${port_lines[0]}"

      # Print continuation lines for wrapped ports.
      local i
      for ((i = 1; i < ${#port_lines[@]}; i++)); do
        printf "${BLUE}│${NC} %-12s ${BLUE}│${NC} %-26s ${BLUE}│${NC} %-12s ${BLUE}│${NC} %-54s ${BLUE}│${NC}\n" \
          "" \
          "" \
          "" \
          "${port_lines[i]}"
      done
    done <<< "$all_rows"

    echo -e "${BLUE}${table_bottom}${NC}"
  else
    echo -e "${YELLOW}Requested ${stack_name} instance is not running.${NC}"
  fi

  # Check if other stack is running (only warn if actually running)
  local other_running=false
  if [[ "$DEV_MODE" == "true" ]]; then
    if check_prod_running; then
      other_running=true
    fi
  else
    if check_dev_running; then
      other_running=true
    fi
  fi

  if [[ "$other_running" == "true" ]]; then
    echo ""
    if [[ "$DEV_MODE" == "true" ]]; then
      echo -e "${YELLOW}⚠ PROD instance is running${NC}"
    else
      echo -e "${YELLOW}⚠ DEV instance is running${NC}"
    fi
  fi

  if [[ "$stack_running" == "true" ]]; then
    echo "Access URL: $access_url"
  fi

  echo ""
}

function doctor() {
  local stack_name
  local issues=0
  local GREEN='\033[0;32m'
  local RED='\033[0;31m'
  local NC='\033[0m'

  stack_name=$(get_stack_name)
  echo "Running doctor for ${stack_name} mode"
  echo ""

  doctor_check_mode_files || issues=1
  echo ""
  doctor_check_env_keys || issues=1
  echo ""
  doctor_check_repo_baseline_diff || issues=1
  echo ""

  if [[ $issues -eq 0 ]]; then
    echo -e "Doctor result: ${GREEN}PASS${NC}"
    return 0
  fi

  echo -e "Doctor result: ${RED}FAIL${NC}"
  return 1
}

function update() {
  cd "$INSTALL_DIR"
  if [[ -d .git ]]; then
    echo "Updating from git repository..."
    git pull --ff-only
  else
    echo "Updating by downloading the latest archive..."
    local tmpdir
    tmpdir=$(mktemp -d)
    trap 'rm -rf "$tmpdir"' EXIT
    curl -fsSL "$REPO_ARCHIVE_URL" | tar -xz --strip-components=1 -C "$tmpdir"
    rsync -a --delete \
      --exclude 'infra/install-config.yml' \
      --exclude '.env' \
      --exclude 'infra/caddy/Caddyfile' \
      --exclude 'caddy/certs' \
      --exclude 'backend/.env' \
      --exclude 'frontend/.env' \
      --exclude 'config.yml' \
      "$tmpdir/" "$INSTALL_DIR/"
  fi

  echo "Rebuilding after update..."
  build
  start
}

# Parse arguments to extract --dev, --force, --prompt-overwrite, and --full flags
COMMAND=""
EXTRA_ARGS=()
for arg in "$@"; do
  if [[ "$arg" == "--dev" ]]; then
    DEV_MODE=true
  elif [[ "$arg" == "--force" ]]; then
    FORCE_OVERWRITE=true
  elif [[ "$arg" == "--prompt-overwrite" ]]; then
    PROMPT_OVERWRITE=true
  elif [[ -z "$COMMAND" && "$arg" != -* ]]; then
    COMMAND="$arg"
  else
    EXTRA_ARGS+=("$arg")
  fi
done

# Default to help if no command provided
COMMAND="${COMMAND:-help}"

case "$COMMAND" in
  build)
    build
    ;;
  start)
    start
    ;;
  restart)
    restart
    ;;
  stop)
    stop
    ;;
  update)
    update
    ;;
  doctor)
    doctor
    ;;
  status)
    status
    ;;
  clean|CLEAN)
    clean_command "${EXTRA_ARGS[@]}"
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

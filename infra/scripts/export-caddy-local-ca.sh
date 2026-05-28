#!/usr/bin/env sh

set -eu

compose_file="${COMPOSE_FILE:-docker-compose.dev.yml}"
output_path="${1:-./tmp/caddy-local-root.crt}"
output_dir=$(dirname "$output_path")

mkdir -p "$output_dir"

container_id=$(docker compose -f "$compose_file" ps -q caddy)

if [ -z "$container_id" ]; then
  echo "Caddy container is not running. Start the dev stack first." >&2
  exit 1
fi

docker compose -f "$compose_file" exec -T caddy sh -c 'cat /data/caddy/pki/authorities/local/root.crt' > "$output_path"

echo "Exported Caddy local root CA to $output_path"
echo "Linux system trust: sudo cp $output_path /usr/local/share/ca-certificates/vtt-chat-caddy-local.crt && sudo update-ca-certificates"
echo "Firefox on Linux may still need a manual import, or enable security.enterprise_roots.enabled."

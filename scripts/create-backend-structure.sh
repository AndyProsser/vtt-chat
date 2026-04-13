#!/usr/bin/env bash
set -e

# ============================================================
# VTT-Chat Backend Structure Generator
# Creates the full backend folder skeleton with placeholder files
# ============================================================

BASE_DIR="backend"

echo "Creating backend folder structure under: $BASE_DIR"

# -----------------------------
# Helper: create file with header
# -----------------------------
create_placeholder() {
  local file="$1"
  mkdir -p "$(dirname "$file")"
  cat <<EOF > "$file"
/**
 * Placeholder file for VTT-Chat backend.
 * This file will be implemented in future development stages.
 */
EOF
}

# -----------------------------
# Directory structure
# -----------------------------
DIRS=(
  "$BASE_DIR/src/api"
  "$BASE_DIR/src/ws/events"
  "$BASE_DIR/src/ws/handlers"
  "$BASE_DIR/src/core/audio"
  "$BASE_DIR/src/core/chat"
  "$BASE_DIR/src/core/metadata"
  "$BASE_DIR/src/core/notes"
  "$BASE_DIR/src/core/rooms"
  "$BASE_DIR/src/core/users"
  "$BASE_DIR/src/core/export"
  "$BASE_DIR/src/core/admin"
  "$BASE_DIR/src/infra/db/prisma"
  "$BASE_DIR/src/infra/redis"
  "$BASE_DIR/src/infra/livekit"
  "$BASE_DIR/src/infra/logging"
  "$BASE_DIR/src/infra/security"
  "$BASE_DIR/src/infra/config"
  "$BASE_DIR/src/infra/http"
  "$BASE_DIR/src/types"
  "$BASE_DIR/prisma"
)

for dir in "${DIRS[@]}"; do
  mkdir -p "$dir"
done

# -----------------------------
# Placeholder .ts files
# -----------------------------
FILES=(
  # API
  "$BASE_DIR/src/api/index.ts"
  "$BASE_DIR/src/api/auth.routes.ts"
  "$BASE_DIR/src/api/campaign.routes.ts"
  "$BASE_DIR/src/api/notes.routes.ts"
  "$BASE_DIR/src/api/metadata.routes.ts"
  "$BASE_DIR/src/api/export.routes.ts"
  "$BASE_DIR/src/api/health.routes.ts"
  "$BASE_DIR/src/api/admin.routes.ts"

  # WebSocket
  "$BASE_DIR/src/ws/index.ts"
  "$BASE_DIR/src/ws/ws.types.ts"
  "$BASE_DIR/src/ws/events/client-events.ts"
  "$BASE_DIR/src/ws/events/server-events.ts"
  "$BASE_DIR/src/ws/handlers/chat.handler.ts"
  "$BASE_DIR/src/ws/handlers/room.handler.ts"
  "$BASE_DIR/src/ws/handlers/audio.handler.ts"
  "$BASE_DIR/src/ws/handlers/conditions.handler.ts"
  "$BASE_DIR/src/ws/handlers/environment.handler.ts"
  "$BASE_DIR/src/ws/handlers/metadata.handler.ts"
  "$BASE_DIR/src/ws/handlers/notes.handler.ts"
  "$BASE_DIR/src/ws/handlers/session.handler.ts"
  "$BASE_DIR/src/ws/handlers/presence.handler.ts"

  # Core
  "$BASE_DIR/src/core/audio/conditions.ts"
  "$BASE_DIR/src/core/audio/environments.ts"
  "$BASE_DIR/src/core/audio/dm-voice.ts"
  "$BASE_DIR/src/core/audio/audio-state.ts"
  "$BASE_DIR/src/core/chat/chat.service.ts"
  "$BASE_DIR/src/core/chat/system-messages.ts"
  "$BASE_DIR/src/core/chat/session-boundaries.ts"
  "$BASE_DIR/src/core/metadata/metadata.service.ts"
  "$BASE_DIR/src/core/metadata/metadata.templates.ts"
  "$BASE_DIR/src/core/metadata/metadata.types.ts"
  "$BASE_DIR/src/core/notes/notes.service.ts"
  "$BASE_DIR/src/core/notes/notes.types.ts"
  "$BASE_DIR/src/core/rooms/room.service.ts"
  "$BASE_DIR/src/core/rooms/room.visibility.ts"
  "$BASE_DIR/src/core/rooms/room.types.ts"
  "$BASE_DIR/src/core/users/user.service.ts"
  "$BASE_DIR/src/core/users/player-settings.ts"
  "$BASE_DIR/src/core/users/dm-settings.ts"
  "$BASE_DIR/src/core/export/export.service.ts"
  "$BASE_DIR/src/core/export/export.formatters.ts"
  "$BASE_DIR/src/core/admin/admin.service.ts"
  "$BASE_DIR/src/core/admin/audit-log.ts"

  # Infra
  "$BASE_DIR/src/infra/db/index.ts"
  "$BASE_DIR/src/infra/db/prisma/schema.prisma"
  "$BASE_DIR/src/infra/redis/index.ts"
  "$BASE_DIR/src/infra/redis/presence.store.ts"
  "$BASE_DIR/src/infra/redis/rate-limit.store.ts"
  "$BASE_DIR/src/infra/livekit/token.service.ts"
  "$BASE_DIR/src/infra/livekit/livekit.types.ts"
  "$BASE_DIR/src/infra/logging/logger.ts"
  "$BASE_DIR/src/infra/logging/request-logger.ts"
  "$BASE_DIR/src/infra/security/auth.middleware.ts"
  "$BASE_DIR/src/infra/security/jwt.ts"
  "$BASE_DIR/src/infra/security/sanitize.ts"
  "$BASE_DIR/src/infra/config/env.ts"
  "$BASE_DIR/src/infra/config/constants.ts"
  "$BASE_DIR/src/infra/http/server.ts"
  "$BASE_DIR/src/infra/http/router.ts"

  # Types
  "$BASE_DIR/src/types/system-message.types.ts"
  "$BASE_DIR/src/types/metadata.types.ts"
  "$BASE_DIR/src/types/notes.types.ts"
  "$BASE_DIR/src/types/audio.types.ts"
  "$BASE_DIR/src/types/room.types.ts"
  "$BASE_DIR/src/types/user.types.ts"
  "$BASE_DIR/src/types/session.types.ts"
  "$BASE_DIR/src/types/export.types.ts"

  # Entrypoints
  "$BASE_DIR/src/index.ts"
  "$BASE_DIR/src/bootstrap.ts"
)

for file in "${FILES[@]}"; do
  create_placeholder "$file"
done

# -----------------------------
# package.json
# -----------------------------
cat <<EOF > "$BASE_DIR/package.json"
{
  "name": "vtt-chat-backend",
  "version": "0.1.0",
  "description": "Backend service for VTT-Chat: a DM-grade, session-aware tabletop voice & chat platform.",
  "main": "dist/index.js",
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@prisma/client": "^5.0.0",
    "cors": "^2.8.5",
    "dotenv": "^16.0.0",
    "express": "^4.18.2",
    "jsonwebtoken": "^9.0.0",
    "redis": "^4.6.7",
    "ws": "^8.13.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.0.0",
    "@types/ws": "^8.5.10",
    "prisma": "^5.0.0",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.0.0"
  }
}
EOF

# -----------------------------
# tsconfig.json
# -----------------------------
cat <<EOF > "$BASE_DIR/tsconfig.json"
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "CommonJS",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
EOF

# -----------------------------
# Dockerfile
# -----------------------------
cat <<EOF > "$BASE_DIR/Dockerfile"
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/index.js"]
EOF

# -----------------------------
# .gitignore
# -----------------------------
cat <<EOF > "$BASE_DIR/.gitignore"
node_modules/
dist/
.env
*.log
logs/
prisma/*.db
EOF

# -----------------------------
# README.md
# -----------------------------
cat <<EOF > "$BASE_DIR/README.md"
# VTT-Chat Backend

This is the backend service for **VTT-Chat**, a DM-grade, session-aware tabletop voice & chat platform.

Technologies:
- Node.js + Express
- WebSocket (ws)
- TypeScript
- Prisma ORM
- PostgreSQL
- Redis
- LiveKit token service

This backend provides:
- WebSocket realtime events
- REST API endpoints
- Session boundaries & chat persistence
- Metadata cards
- Notes system
- Player/DM settings
- Audio state management
- Export system

Part of the larger VTT-Chat project.
EOF

echo "Backend structure created successfully!"

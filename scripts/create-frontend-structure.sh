#!/usr/bin/env bash
set -e

# ============================================================
# VTT-Chat Frontend Structure Generator
# Creates the full frontend folder skeleton with placeholder files
# ============================================================

BASE_DIR="frontend"

echo "Creating frontend folder structure under: $BASE_DIR"

# -----------------------------
# Helper: create file with header
# -----------------------------
create_placeholder() {
  local file="$1"
  mkdir -p "$(dirname "$file")"
  cat <<EOF > "$file"
/**
 * Placeholder file for VTT-Chat frontend.
 * This file will be implemented in future development stages.
 */
EOF
}

# -----------------------------
# Directory structure
# -----------------------------
DIRS=(
  "$BASE_DIR/src/components/chat"
  "$BASE_DIR/src/components/metadata"
  "$BASE_DIR/src/components/notes"
  "$BASE_DIR/src/components/audio"
  "$BASE_DIR/src/components/rooms"
  "$BASE_DIR/src/components/ui"
  "$BASE_DIR/src/hooks"
  "$BASE_DIR/src/state"
  "$BASE_DIR/src/utils"
  "$BASE_DIR/src/types"
  "$BASE_DIR/public"
)

for dir in "${DIRS[@]}"; do
  mkdir -p "$dir"
done

# -----------------------------
# Placeholder .tsx / .ts files
# -----------------------------
FILES=(
  # Root
  "$BASE_DIR/src/main.tsx"
  "$BASE_DIR/src/App.tsx"

  # Components
  "$BASE_DIR/src/components/chat/ChatWindow.tsx"
  "$BASE_DIR/src/components/chat/MessageList.tsx"
  "$BASE_DIR/src/components/chat/MessageInput.tsx"

  "$BASE_DIR/src/components/metadata/MetadataCard.tsx"
  "$BASE_DIR/src/components/metadata/MetadataTimeline.tsx"

  "$BASE_DIR/src/components/notes/NotesPanel.tsx"
  "$BASE_DIR/src/components/notes/NoteCard.tsx"

  "$BASE_DIR/src/components/audio/AudioPanel.tsx"
  "$BASE_DIR/src/components/audio/AudioStateSlideout.tsx"
  "$BASE_DIR/src/components/audio/DMVoicePanel.tsx"
  "$BASE_DIR/src/components/audio/EnvironmentPanel.tsx"
  "$BASE_DIR/src/components/audio/ConditionsPanel.tsx"

  "$BASE_DIR/src/components/rooms/RoomSelector.tsx"
  "$BASE_DIR/src/components/rooms/AvatarOverlay.tsx"

  "$BASE_DIR/src/components/ui/Button.tsx"
  "$BASE_DIR/src/components/ui/Panel.tsx"
  "$BASE_DIR/src/components/ui/Icon.tsx"

  # Hooks
  "$BASE_DIR/src/hooks/useWebSocket.ts"
  "$BASE_DIR/src/hooks/useLiveKit.ts"
  "$BASE_DIR/src/hooks/useAudioEngine.ts"
  "$BASE_DIR/src/hooks/useStore.ts"

  # State
  "$BASE_DIR/src/state/store.ts"
  "$BASE_DIR/src/state/chatSlice.ts"
  "$BASE_DIR/src/state/audioSlice.ts"
  "$BASE_DIR/src/state/roomSlice.ts"
  "$BASE_DIR/src/state/metadataSlice.ts"
  "$BASE_DIR/src/state/notesSlice.ts"

  # Utils
  "$BASE_DIR/src/utils/api.ts"
  "$BASE_DIR/src/utils/ws-events.ts"
  "$BASE_DIR/src/utils/format.ts"

  # Types
  "$BASE_DIR/src/types/chat.types.ts"
  "$BASE_DIR/src/types/metadata.types.ts"
  "$BASE_DIR/src/types/notes.types.ts"
  "$BASE_DIR/src/types/audio.types.ts"
  "$BASE_DIR/src/types/room.types.ts"
  "$BASE_DIR/src/types/user.types.ts"
)

for file in "${FILES[@]}"; do
  create_placeholder "$file"
done

# -----------------------------
# index.html
# -----------------------------
cat <<EOF > "$BASE_DIR/index.html"
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>VTT-Chat</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF

# -----------------------------
# package.json
# -----------------------------
cat <<EOF > "$BASE_DIR/package.json"
{
  "name": "vtt-chat-frontend",
  "version": "0.1.0",
  "private": true,
  "description": "Frontend SPA for VTT-Chat: a DM-grade, session-aware tabletop voice & chat platform.",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@livekit/components-react": "^1.6.0",
    "@livekit/components-styles": "^1.6.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zustand": "^4.4.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0"
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
    "lib": ["DOM", "DOM.Iterable", "ES2021"],
    "module": "ESNext",
    "jsx": "react-jsx",
    "moduleResolution": "Node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true
  },
  "include": ["src"]
}
EOF

# -----------------------------
# vite.config.ts
# -----------------------------
cat <<EOF > "$BASE_DIR/vite.config.ts"
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173
  }
});
EOF

# -----------------------------
# Dockerfile
# -----------------------------
cat <<EOF > "$BASE_DIR/Dockerfile"
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

EXPOSE 5173

CMD ["npm", "run", "preview"]
EOF

# -----------------------------
# .gitignore
# -----------------------------
cat <<EOF > "$BASE_DIR/.gitignore"
node_modules/
dist/
.env
*.log
.DS_Store
EOF

# -----------------------------
# README.md
# -----------------------------
cat <<EOF > "$BASE_DIR/README.md"
# VTT-Chat Frontend

This is the frontend SPA for **VTT-Chat**, a DM-grade, session-aware tabletop voice & chat platform.

Technologies:
- React + TypeScript
- Vite
- Zustand state management
- LiveKit client SDK
- WebSocket realtime events
- Web Audio API

This SPA provides:
- Chat UI
- Metadata timeline
- Notes panel
- DM audio controls
- Player audio controls
- Room management
- Avatar overlays
- Session boundary UI

Part of the larger VTT-Chat project.
EOF

echo "Frontend structure created successfully!"

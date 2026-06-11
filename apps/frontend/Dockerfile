FROM node:26-alpine AS builder
# Context is the project root so packages/shared/ is accessible alongside apps/frontend/
WORKDIR /workspace

# Copy shared types (referenced via @shared alias in tsconfig)
COPY packages/shared ./packages/shared

# Install frontend dependencies
COPY apps/frontend/package.json apps/frontend/package-lock.json* ./apps/frontend/
WORKDIR /workspace/apps/frontend
RUN npm ci

# VITE_* vars must be declared as ARGs so docker-compose build.args can inject them.
# They are baked into the static bundle at build time by Vite.
ARG VITE_API_URL
ARG VITE_WS_URL
ARG VITE_LIVEKIT_URL
ARG VITE_LOG_LEVEL
ARG VITE_DEBUG_BUILD=false
ENV VITE_API_URL=$VITE_API_URL \
  VITE_WS_URL=$VITE_WS_URL \
  VITE_LIVEKIT_URL=$VITE_LIVEKIT_URL \
  VITE_LOG_LEVEL=$VITE_LOG_LEVEL \
  VITE_DEBUG_BUILD=$VITE_DEBUG_BUILD

COPY apps/frontend/tsconfig.json ./
COPY apps/frontend/index.html ./
COPY apps/frontend/vite.config.ts ./
COPY apps/frontend/public ./public
COPY apps/frontend/src ./src
RUN npm run build

FROM node:26-alpine
WORKDIR /app
RUN npm install -g serve

COPY --from=builder /workspace/apps/frontend/dist ./dist
EXPOSE 5173

CMD ["serve", "-s", "dist", "-l", "5173"]

FROM node:25-alpine AS builder
# Context is the project root so shared/ is accessible alongside frontend/
WORKDIR /workspace

# Copy shared types (referenced via @shared alias in tsconfig)
COPY shared ./shared

# Install frontend dependencies
COPY frontend/package.json frontend/package-lock.json* ./frontend/
WORKDIR /workspace/frontend
RUN npm ci

# VITE_* vars must be declared as ARGs so docker-compose build.args can inject them.
# They are baked into the static bundle at build time by Vite.
ARG VITE_API_URL
ARG VITE_WS_URL
ARG VITE_LIVEKIT_URL
ARG VITE_DEBUG_BUILD=false
ENV VITE_API_URL=$VITE_API_URL \
  VITE_WS_URL=$VITE_WS_URL \
  VITE_LIVEKIT_URL=$VITE_LIVEKIT_URL \
  VITE_DEBUG_BUILD=$VITE_DEBUG_BUILD

COPY frontend/tsconfig.json ./
COPY frontend/index.html ./
COPY frontend/vite.config.ts ./
COPY frontend/public ./public
COPY frontend/src ./src
RUN npm run build

FROM node:25-alpine
WORKDIR /app
RUN npm install -g serve

COPY --from=builder /workspace/frontend/dist ./dist
EXPOSE 5173

CMD ["serve", "-s", "dist", "-l", "5173"]

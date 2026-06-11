FROM node:26-alpine AS builder
# Context is the project root so shared/ is accessible alongside backend/
WORKDIR /workspace

# Copy shared types (referenced via @shared alias in tsconfig)
COPY shared ./shared

# Install backend dependencies
COPY backend/package.json backend/package-lock.json* ./backend/
COPY backend/prisma ./backend/prisma
COPY backend/prisma.config.ts ./backend/
COPY backend/scripts ./backend/scripts
WORKDIR /workspace/backend
RUN npm install
RUN npx prisma generate

# Build TypeScript (rootDir is .., so the compiler sees /workspace as root)
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

FROM node:26-alpine
WORKDIR /app

COPY --from=builder /workspace/backend/package.json /workspace/backend/package-lock.json* ./
COPY --from=builder /workspace/backend/prisma ./prisma
COPY --from=builder /workspace/backend/prisma.config.ts ./prisma.config.ts
COPY --from=builder /workspace/backend/scripts ./scripts
RUN npm install
RUN npx prisma generate

# Copy built JS
COPY --from=builder /workspace/backend/dist ./dist

# Copy entrypoint script
COPY --from=builder /workspace/backend/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

CMD ["sh", "-c", "node scripts/container-startup.mjs && node dist/backend/src/index.js"]

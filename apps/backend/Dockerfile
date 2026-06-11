FROM node:26-alpine AS builder
# Context is the project root so packages/shared/ is accessible alongside apps/backend/
WORKDIR /workspace

# Copy shared types (referenced via @shared alias in tsconfig)
COPY packages/shared ./packages/shared

# Install backend dependencies
COPY apps/backend/package.json apps/backend/package-lock.json* ./apps/backend/
COPY apps/backend/prisma ./apps/backend/prisma
COPY apps/backend/prisma.config.ts ./apps/backend/
COPY apps/backend/scripts ./apps/backend/scripts
WORKDIR /workspace/apps/backend
RUN npm install
RUN npx prisma generate

# Build TypeScript (rootDir is ../.., so the compiler sees /workspace as root)
COPY apps/backend/tsconfig.json ./
COPY apps/backend/src ./src
RUN npm run build

FROM node:26-alpine
WORKDIR /app

COPY --from=builder /workspace/apps/backend/package.json /workspace/apps/backend/package-lock.json* ./
COPY --from=builder /workspace/apps/backend/prisma ./prisma
COPY --from=builder /workspace/apps/backend/prisma.config.ts ./prisma.config.ts
COPY --from=builder /workspace/apps/backend/scripts ./scripts
RUN npm install
RUN npx prisma generate

# Copy built JS
COPY --from=builder /workspace/apps/backend/dist ./dist

# Copy entrypoint script
COPY --from=builder /workspace/apps/backend/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

CMD ["sh", "-c", "node scripts/container-startup.mjs && node dist/apps/backend/src/index.js"]

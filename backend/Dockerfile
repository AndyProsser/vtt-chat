FROM node:25-alpine AS builder
# Context is the project root so shared/ is accessible alongside backend/
WORKDIR /workspace

# Copy shared types (referenced via @shared alias in tsconfig)
COPY shared ./shared

# Install backend dependencies
COPY backend/package.json backend/package-lock.json* ./backend/
COPY backend/prisma ./backend/prisma
COPY backend/prisma.config.ts ./backend/
WORKDIR /workspace/backend
RUN npm install
RUN npx prisma generate

# Build TypeScript (rootDir is .., so the compiler sees /workspace as root)
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

FROM node:25-alpine
WORKDIR /app

COPY --from=builder /workspace/backend/package.json /workspace/backend/package-lock.json* ./
COPY --from=builder /workspace/backend/prisma ./prisma
COPY --from=builder /workspace/backend/prisma.config.ts ./prisma.config.ts
RUN npm install
RUN npx prisma generate

COPY --from=builder /workspace/backend/dist ./dist

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy --config prisma.config.ts && node dist/backend/src/index.js"]

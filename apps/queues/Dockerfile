FROM node:26-alpine AS builder
# Build context is the project root so packages/shared/ is accessible alongside apps/queues/
WORKDIR /workspace

COPY packages/shared ./packages/shared

COPY apps/queues/package.json apps/queues/package-lock.json* ./apps/queues/
WORKDIR /workspace/apps/queues
RUN npm install

COPY apps/queues/tsconfig.json ./
COPY apps/queues/src ./src
RUN npm run build

FROM node:26-alpine
WORKDIR /app

COPY --from=builder /workspace/apps/queues/package.json /workspace/apps/queues/package-lock.json* ./
RUN npm install --omit=dev

COPY --from=builder /workspace/apps/queues/dist ./dist

EXPOSE 3001

CMD ["node", "dist/apps/queues/src/index.js"]

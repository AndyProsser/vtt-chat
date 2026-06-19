FROM node:26-alpine AS builder
# Context is the project root so packages/shared/ is accessible alongside apps/admin/
WORKDIR /workspace

# Copy shared package because admin uses @shared aliases
COPY packages/shared ./packages/shared

# Install shared package dependencies so Vite can resolve them from the shared source path
RUN cd packages/shared && npm install

# Install admin dependencies
COPY apps/admin/package.json apps/admin/package-lock.json* ./apps/admin/
WORKDIR /workspace/apps/admin
RUN npm install

COPY apps/admin/tsconfig.json ./
COPY apps/admin/index.html ./
COPY apps/admin/vite.config.ts ./
COPY apps/admin/src ./src
RUN npm run build

FROM node:26-alpine
WORKDIR /app

RUN npm install -g http-server

COPY --from=builder /workspace/apps/admin/dist ./dist

EXPOSE 5174

CMD ["http-server", "dist", "-p", "5174", "-c-1", "--spa"]

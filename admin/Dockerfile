FROM node:25-alpine AS builder
# Context is the project root so shared/ is accessible alongside admin/
WORKDIR /workspace

# Copy shared package because admin uses @shared aliases
COPY shared ./shared

# Install admin dependencies
COPY admin/package.json admin/package-lock.json* ./admin/
WORKDIR /workspace/admin
RUN npm ci

COPY admin/tsconfig.json ./
COPY admin/index.html ./
COPY admin/vite.config.ts ./
COPY admin/src ./src
RUN npm run build

FROM node:25-alpine
WORKDIR /app

RUN npm install -g http-server

COPY --from=builder /workspace/admin/dist ./dist

EXPOSE 5174

CMD ["http-server", "dist", "-p", "5174", "-c-1", "--spa"]

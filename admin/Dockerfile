# Build stage
FROM node:25-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Runtime stage
FROM node:25-alpine

WORKDIR /app

# Install a simple HTTP server to serve the static files
RUN npm install -g http-server

COPY --from=builder /app/dist ./dist

EXPOSE 5174

CMD ["http-server", "dist", "-p", "5174", "-c-1", "--spa"]

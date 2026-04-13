FROM node:25-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

FROM node:25-alpine
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

EXPOSE 5173

CMD ["npm", "run", "preview"]

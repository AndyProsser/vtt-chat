#!/bin/sh
set -e

# -----------------------------------------
# 1. Wait for Postgres to be reachable
# -----------------------------------------
echo "Checking database availability at $DATABASE_HOST:$DATABASE_PORT..."

until nc -z "$DATABASE_HOST" "$DATABASE_PORT"; do
  echo "Database is unavailable - sleeping"
  sleep 1
done

echo "Database is up."

# -----------------------------------------
# 2. Run Prisma migrations (safe + idempotent)
# -----------------------------------------
echo "Applying Prisma migrations..."
npx prisma migrate deploy

# -----------------------------------------
# 3. Generate Prisma client (safe to run repeatedly)
# -----------------------------------------
echo "Generating Prisma client..."
npx prisma generate

# -----------------------------------------
# 4. Start the Node.js application
# -----------------------------------------
echo "Starting application..."
exec node dist/backend/src/index.js

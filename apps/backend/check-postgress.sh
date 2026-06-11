#!/bin/sh
set -e

# Default to dev values if not provided
DATABASE_HOST=${DATABASE_HOST:-postgres}
DATABASE_PORT=${DATABASE_PORT:-5432}

echo "Checking database availability at $DATABASE_HOST:$DATABASE_PORT..."

until nc -z "$DATABASE_HOST" "$DATABASE_PORT"; do
  echo "Database is unavailable - sleeping"
  sleep 1
done

echo "Database is up."

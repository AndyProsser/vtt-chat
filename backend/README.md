# VTT-Chat Backend

This is the backend service for **VTT-Chat**, a DM-grade, session-aware tabletop voice & chat platform.

Technologies:

- Node.js + Express
- WebSocket (ws)
- TypeScript
- Prisma ORM
- PostgreSQL
- Redis
- LiveKit token service

This backend provides:

- WebSocket realtime events
- REST API endpoints
- Session boundaries & chat persistence
- Metadata cards
- Notes system
- Player/DM settings
- Audio state management
- Export system

Part of the larger VTT-Chat project.

## Container Startup: DB Wait, Schema Sync, and Failure Behavior

When the backend container starts, it runs a startup preparation step before launching the app process.

Startup sequence:

1. Wait for PostgreSQL to accept connections (`SELECT 1` check).
2. Run Prisma schema sync.
3. Start the backend server.

The startup script used is `scripts/container-startup.mjs`.

### Schema Sync Mode

Use `PRISMA_SCHEMA_SYNC_MODE` to control Prisma behavior:

- `push`: Runs `npx prisma db push --config prisma.config.ts`.
- `deploy`: Runs `npx prisma migrate deploy --config prisma.config.ts`.

Defaults if not set:

- `NODE_ENV=production` -> `deploy`
- any other `NODE_ENV` -> `push`

Recommended usage:

- Development: `PRISMA_SCHEMA_SYNC_MODE=push`
- Production: `PRISMA_SCHEMA_SYNC_MODE=deploy`

### DB Wait/Retry Knobs

You can tune startup retry behavior with these environment variables:

- `DB_WAIT_MAX_ATTEMPTS` (default: `60`)
- `DB_WAIT_DELAY_MS` (default: `2000`)

Total wait budget is approximately:

`DB_WAIT_MAX_ATTEMPTS * DB_WAIT_DELAY_MS`

With defaults, that is about 120 seconds.

### Failure Behavior

- If `DATABASE_URL` is missing, startup fails immediately.
- If PostgreSQL is not reachable before retries are exhausted, startup exits with code `1`.
- If Prisma schema sync fails, startup exits with code `1`.

In Docker Compose with `restart: unless-stopped`, the container will be restarted automatically after failure.

### Data Safety Notes

- Production should use `migrate deploy` to apply committed migrations safely.
- Development `db push` is convenient for iteration and does not auto-accept destructive changes.

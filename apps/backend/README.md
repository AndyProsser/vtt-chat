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

## Container Healthcheck

The backend container includes a healthcheck that verifies the app is running and responding to requests.

**Healthcheck endpoint:** `GET http://127.0.0.1:3000/health`

**Expected response:**

```json
{
  "status": "healthy",
  "mode": "standard",
  "timestamp": "2026-05-07T12:34:56.789Z",
  "message": "Backend is running with auth, session, and websocket support"
}
```

**What it checks:**

- The Express server is running on the configured port (default 3000).
- The `/api/health` route is responsive and returns HTTP 200.
- This confirms the app process is alive and the event loop is not blocked.

**Timing:**

- `start_period: 45s` — grace period before first check (allows DB wait + Prisma sync).
- `interval: 10s` — recheck every 10 seconds.
- `timeout: 5s` — fail if no response within 5 seconds.
- `retries: 12` — mark unhealthy after 12 consecutive failures (~2 minutes).

**Troubleshooting:**

If the backend shows `unhealthy`:

1. Check if database startup succeeded:

   ```bash
   docker compose logs backend | grep "startup"
   ```

2. Verify Prisma sync ran without error:

   ```bash
   docker compose logs backend | grep -E "(Running schema sync|failed|error)"
   ```

3. Check app startup logs:

   ```bash
   docker compose logs backend | tail -50
   ```

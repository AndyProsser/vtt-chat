# Queue Service Operations Guide

This document is the operator reference for the `vtt-chat-queues` service.

Architecture overview: `docs/architecture/QUEUE-JOB-MANAGER.md`

---

## 1. What the Queue Service Does

The queues service (`apps/queues`, container `vttchat-queues`) is a standalone BullMQ worker process that runs alongside the backend. It owns:

- **Durable job scheduling** — repeatable cron jobs survive service restarts because state lives in Redis
- **Session lifecycle sweeps** — fires every 5 minutes; calls the backend to run COOLDOWN→ENDED and ENDED→CLEANUP transitions
- **Email delivery** — outbound emails (e.g. password resets) are enqueued by the backend and delivered by this service via SMTP
- **Retry and dead-letter handling** — failed jobs are retried with exponential backoff; exhausted jobs land in the DLQ for operator review
- **Admin API** — inspect queues, retry or discard failed jobs, clear the DLQ

The backend retains an in-process cleanup scheduler as a safety fallback by default. Both run in parallel unless `DISABLE_INTERNAL_CLEANUP_SCHEDULER=1` is set.

---

## 2. Environment Variables

### Required

| Variable              | Service | Description                                                                                  |
| --------------------- | ------- | -------------------------------------------------------------------------------------------- |
| `REDIS_URL`           | queues  | Redis connection URL, e.g. `redis://:pass@redis:6379`                                        |
| `INTERNAL_JOB_SECRET` | both    | Shared secret for worker→backend and backend→queues HTTP calls. Must match in both services. |

### Backend integration

| Variable                             | Service | Description                                                                                                   |
| ------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------- |
| `QUEUES_URL`                         | backend | Base URL of queues service, e.g. `http://queues:3001`. When set, emails are enqueued rather than sent inline. |
| `BACKEND_INTERNAL_URL`               | queues  | Base URL of backend service, e.g. `http://backend:3000`.                                                      |
| `DISABLE_INTERNAL_CLEANUP_SCHEDULER` | backend | Set to `1` to disable the backend's in-process cleanup scheduler (BullMQ owns the schedule). Default: `0`.    |

### Queue tuning

| Variable              | Default          | Description                                    |
| --------------------- | ---------------- | ---------------------------------------------- |
| `QUEUES_PORT`         | `3001`           | HTTP port for admin + enqueue API              |
| `QUEUE_ADMIN_SECRET`  | _(empty = open)_ | Bearer token for admin API. Set in production. |
| `QUEUE_MAX_ATTEMPTS`  | `5`              | Retry attempts before DLQ promotion            |
| `QUEUE_BASE_DELAY_MS` | `5000`           | Initial exponential backoff delay (ms)         |
| `QUEUE_CLEANUP_CRON`  | `*/5 * * * *`    | Cron for the repeatable lifecycle sweep        |

### SMTP (email worker)

Two configuration styles are supported. **Well-known service** (simpler) takes priority when `SMTP_SERVICE` is set.

#### Option A — Well-known service (Gmail, Outlook, etc.)

```env
SMTP_SERVICE=Gmail           # nodemailer service name (case-sensitive)
SMTP_USER=you@gmail.com
SMTP_PASS=app-specific-password
SMTP_FROM_EMAIL=you@gmail.com
SMTP_FROM_NAME=VTT-Chat
```

When `SMTP_SERVICE` is set, `SMTP_HOST`, `SMTP_PORT`, and `SMTP_SECURE` are ignored — nodemailer fills in the correct server settings automatically.

Full list of supported service names: https://nodemailer.com/smtp/well-known-services

> **Gmail note:** Google handles DKIM signing internally — no DNS changes required. Use an App Password, not your main Gmail password (requires 2FA to be enabled on the account).

#### Option B — Manual SMTP server

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=0               # 1 for TLS port 465, 0 for STARTTLS
SMTP_USER=you@example.com
SMTP_PASS=yourpassword
SMTP_FROM_EMAIL=you@example.com
SMTP_FROM_NAME=VTT-Chat
```

#### Variable reference

| Variable          | Used by          | Description                                                   |
| ----------------- | ---------------- | ------------------------------------------------------------- |
| `SMTP_SERVICE`    | Option A         | Nodemailer well-known service name, e.g. `Gmail`, `Outlook365` |
| `SMTP_HOST`       | Option B         | SMTP server hostname                                          |
| `SMTP_PORT`       | Option B         | SMTP port (default: 587)                                      |
| `SMTP_SECURE`     | Option B         | `1` for TLS, `0` for STARTTLS                                 |
| `SMTP_USER`       | both             | SMTP auth username                                            |
| `SMTP_PASS`       | both             | SMTP auth password / app-specific password                    |
| `SMTP_FROM_EMAIL` | both             | Sender address                                                |
| `SMTP_FROM_NAME`  | both             | Sender display name (default: VTT-Chat)                       |

Without SMTP config in non-production, email jobs succeed silently (logged as skipped).
In production with no SMTP config (`SMTP_SERVICE` or `SMTP_HOST` missing), email jobs fail and retry.

#### DKIM and email deliverability

DKIM (DomainKeys Identified Mail) is a DNS-level signature that proves an email legitimately originated from your domain. Whether you need to configure it depends on how you're sending:

| Sending method                 | DKIM required?                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `SMTP_SERVICE=Gmail` (personal `@gmail.com` sender) | No — Google signs outbound mail automatically. No DNS changes needed. |
| `SMTP_SERVICE=Gmail` (Google Workspace / custom domain) | Recommended — enable via Google Workspace Admin → Apps → Gmail → Authenticate email. Google provides the public key; you add a `TXT` record to your domain's DNS. |
| `SMTP_SERVICE=Outlook365` (Microsoft 365)           | Recommended — enable via Microsoft 365 Admin Center → Settings → Email authentication. Same DNS `TXT` record approach. |
| Option B (your own SMTP server or third-party relay) | Required for good deliverability. Your mail server or relay (e.g. SendGrid, Mailgun, Postmark) will provide the public key and DNS record to add. |

**Without DKIM**, messages from a custom domain are more likely to land in spam, especially for new or low-volume senders. For a `@gmail.com` sender address it doesn't matter — Google's own DKIM covers it.

**SPF** is the companion record (`v=spf1 include:... ~all`). Most well-known service providers include SPF setup in their onboarding; check your provider's docs.

For VTT-Chat's current use case (password reset emails to registered players), a `@gmail.com` sender with no extra DNS config is completely fine to start. Move to a custom domain + DKIM/SPF if you want branded sender addresses or are sending at volume.

### Optional downstream services

Set these to activate the corresponding workers. When unset, jobs succeed silently — safe to enqueue before the service is deployed.

| Variable                  | Activates        | Expected interface                               |
| ------------------------- | ---------------- | ------------------------------------------------ |
| `LLM_SUMMARY_URL`         | Summary worker   | `POST <url>` with `GenerateSummaryPayload` body  |
| `RECORDING_PROCESSOR_URL` | Recording worker | `POST <url>` with `ProcessRecordingPayload` body |

---

## 3. Queues Reference

| Queue name                  | Purpose                               | Scheduled?        |
| --------------------------- | ------------------------------------- | ----------------- |
| `vttchat:session-lifecycle` | Session state transitions (lifecycle) | Yes — every 5 min |
| `vttchat:cleanup`           | Archive verification, greenroom purge | No — on-demand    |
| `vttchat:email`             | SMTP email delivery                   | No — on-demand    |
| `vttchat:summary`           | LLM post-session summary              | No — on-demand    |
| `vttchat:recording`         | Recording file processing             | No — on-demand    |
| `vttchat:dlq`               | Terminal failures from all queues     | No — automatic    |

---

## 4. Admin API

The admin API is available to the admin application via the backend proxy at `/api/admin/queues/*` (requires admin JWT). It is also reachable directly at `http://queues:3001/queues/*` from within the Docker network (requires `QUEUE_ADMIN_SECRET` Bearer token).

### Endpoints

#### List all queues with job counts

```
GET /api/admin/queues
```

Response:

```json
{
  "queues": [
    {
      "name": "session-lifecycle",
      "counts": { "active": 0, "waiting": 0, "delayed": 0, "completed": 120, "failed": 0, "paused": 0 }
    },
    ...
  ]
}
```

#### List jobs in a queue

```
GET /api/admin/queues/:queue/jobs?state=failed&start=0&end=24
```

`state` options: `active`, `waiting`, `waiting-children`, `delayed`, `completed`, `failed`, `paused`

#### Retry a failed job

```
POST /api/admin/queues/:queue/jobs/:id/retry
```

Moves the job back to `waiting` state for immediate reprocessing.

#### Remove a job

```
DELETE /api/admin/queues/:queue/jobs/:id
```

Permanently removes the job from its queue.

#### Obliterate a queue (danger — clears all jobs)

```
POST /api/admin/queues/:queue/obliterate
```

Removes all jobs from a queue regardless of state. Use to drain the DLQ after investigating failures.

---

## 5. How Jobs Flow

### Session lifecycle sweep (scheduled)

1. BullMQ scheduler fires `cleanup-old-sessions` every 5 minutes (configurable via `QUEUE_CLEANUP_CRON`).
2. `session-lifecycle` worker calls `POST backend:3000/api/internal/jobs/trigger/lifecycle-sweep`.
3. Backend runs `SessionCleanupJobService.runLifecycleWorkerOnce()` — handles COOLDOWN→ENDED and ENDED→CLEANUP transitions, WS broadcasts, greenroom purge.
4. Job marked complete.

If the backend is unreachable, the job fails and retries with exponential backoff. After max retries it lands in the DLQ.

### Password reset email

1. User requests a password reset via the frontend.
2. Backend calls `enqueuePasswordResetEmail()` which POSTs to `http://queues:3001/queues/email/enqueue`.
3. BullMQ enqueues a `send-email` job with template `password-reset`.
4. `email` worker picks it up, renders the template, and delivers via SMTP.
5. On SMTP failure, the job retries with exponential backoff.

If `QUEUES_URL` is not set, the backend falls back to direct inline SMTP delivery.

### Summary generation (optional)

1. Backend enqueues a `generate-summary` job to `vttchat:summary`.
2. `summary` worker checks `LLM_SUMMARY_URL`.
   - If unset: job completes silently (logged as skipped).
   - If set: worker POSTs the payload to the LLM service and waits for `2xx` response.

### Recording processing (optional)

Same pattern as summary, using `vttchat:recording` queue and `RECORDING_PROCESSOR_URL`.

---

## 6. Dead-Letter Queue (DLQ)

When a job exceeds `QUEUE_MAX_ATTEMPTS` retries, the worker manually moves it to `vttchat:dlq` as a `dlq-entry` job with a `DlqEntryPayload`:

```json
{
  "originalQueue": "vttchat:email",
  "originalJobId": "42",
  "originalJobType": "send-email",
  "originalPayload": { ... },
  "failureReason": "SMTP connection refused",
  "attemptsMade": 5,
  "failedAt": 1749984000000
}
```

**DLQ investigation workflow:**

1. Check DLQ: `GET /api/admin/queues/dlq/jobs?state=waiting`
2. Read `failureReason` and `originalPayload` to diagnose root cause.
3. Fix the underlying problem (e.g. restore SMTP credentials, restart the LLM service).
4. Re-enqueue: `POST /api/admin/queues/dlq/jobs/:id/retry` (re-fires the dlq-entry job, which is a no-op — re-enqueue the original job manually if needed).
5. Or clear: `POST /api/admin/queues/dlq/obliterate` to discard all DLQ entries once resolved.

---

## 7. Disabling the Backend's Internal Scheduler

By default the backend runs its own in-process `SessionCleanupJobService` alongside BullMQ.

To hand full ownership to BullMQ:

```env
# In backend .env or compose environment
DISABLE_INTERNAL_CLEANUP_SCHEDULER=1
```

Do this only after confirming the queues service is healthy and the BullMQ scheduler is firing reliably. Verify by checking:

```
GET /api/admin/queues/session-lifecycle/jobs?state=completed
```

---

## 8. Deploying Optional Integrations

### Activating LLM summary generation

1. Deploy your LLM service.
2. Add to queues service env: `LLM_SUMMARY_URL=http://llm-service:PORT/summarise`
3. Restart the queues container.
4. Enqueue a test job via the enqueue API or via backend code.
5. Monitor: `GET /api/admin/queues/summary/jobs?state=completed`

The LLM service must accept `POST` with a `GenerateSummaryPayload` JSON body and return `2xx` on success.

### Activating recording processing

Same pattern with `RECORDING_PROCESSOR_URL`. The recording processor must accept `POST` with a `ProcessRecordingPayload` JSON body.

---

## 9. Restarting the Queues Service

The queues service is stateless at the process level — all job state lives in Redis. Restart is safe at any time.

```bash
# Production
docker compose -f infra/docker-compose.yml restart queues

# Development
docker compose -f infra/docker-compose.dev.yml restart queues
```

In-flight jobs that were interrupted resume from the beginning on next pick-up (handlers are idempotent).

---

## 10. Adding a New Job Type

1. Add the queue name to `packages/shared/jobs/names.ts` (if a new queue is needed).
2. Add the payload interface to `packages/shared/jobs/types.ts`.
3. Create a new worker file in `apps/queues/src/workers/`.
4. Register the worker in `apps/queues/src/workers/index.ts`.
5. If a new queue: add to `apps/queues/src/queues/index.ts` (registry + `createQueues`).
6. Update the queue map in `jobs.routes.ts` and `enqueue.routes.ts`.
7. If the job has a trigger in the backend: add a call to `enqueuePasswordResetEmail` pattern.
8. Add a unit test in `apps/queues/src/workers/` and `apps/backend/tests/` as appropriate.

---

## 11. Troubleshooting

### Queue service won't start

- Check Redis is healthy: `docker compose ps redis`
- Verify `REDIS_URL` is set and the password is correct.
- Check service logs: `docker compose logs queues`

### Lifecycle sweep jobs are failing

- Check backend is healthy: `GET /api/health`
- Verify `BACKEND_INTERNAL_URL` points to the correct host/port.
- Verify `INTERNAL_JOB_SECRET` matches in both services.
- Check backend logs for `/api/internal/jobs/trigger/lifecycle-sweep` errors.

### Emails not being delivered

- Verify SMTP vars are set in the queues service env (`SMTP_SERVICE` or `SMTP_HOST`, plus `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL`).
- Check the `vttchat:email` queue for failed jobs: `GET /api/admin/queues/email/jobs?state=failed`
- For Gmail: ensure you are using an App Password, not your account password, and that 2FA is enabled.
- In dev without SMTP config, email jobs succeed silently — this is expected.

### Jobs accumulating in DLQ

- Use the admin API to inspect DLQ entries: `GET /api/admin/queues/dlq/jobs?state=waiting`
- Fix root cause, then obliterate or retry as appropriate.

### Admin API returns 503

- `QUEUES_URL` is not set in the backend — the proxy has no target.
- Add `QUEUES_URL=http://queues:3001` to the backend's env and restart.

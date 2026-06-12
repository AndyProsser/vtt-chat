# Queue Job Manager

Status: Implemented (Phase 1–3 complete). Phase 3 optional integrations (LLM summarisation, recording processor) activate via env var — safe to deploy without them.

See `docs/operations/QUEUES.md` for operator reference (env vars, admin API, runbook).

---

## 1. Why This Exists

In-process interval jobs tied to the backend process cannot survive a backend restart mid-run. Long-running operations (transcription staging, email delivery, post-session summaries) must be durable: survive restarts, retry on failure, and provide operator visibility.

The queue manager guarantees:

- Job durability across backend and queues service restarts (state lives in Redis)
- Exponential-backoff retry per job type
- Dead-letter queue (DLQ) after max retries exhausted
- Idempotent execution at handler boundaries
- Operator API for inspect / retry / clear

---

## 2. Scope

**In scope:**

- Session lifecycle scheduling (COOLDOWN→ENDED, ENDED→CLEANUP)
- Archive verification (CLEANUP age check + greenroom purge)
- Outbound email delivery
- Post-session summary generation (activates when `LLM_SUMMARY_URL` is set)
- Recording processing (activates when `RECORDING_PROCESSOR_URL` is set)
- Progress checkpointing for long-running jobs (planned for LLM/recording phase)

**Out of scope:**

- Replacing real-time WS/event-bus flow for sub-second user-facing actions
- Replacing PostgreSQL as source of truth for campaign/session state

---

## 3. Architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│ apps/queues container (port 3001, internal network only)             │
│                                                                       │
│  BullMQ Scheduler                                                    │
│    └─ repeatable: cleanup-old-sessions every 5 min (cron)           │
│                                                                       │
│  Workers                                                             │
│    session-lifecycle  ──► POST backend:3000/api/internal/jobs/...   │
│    cleanup            ──► POST backend:3000/api/internal/jobs/...   │
│    email              ──► SMTP (nodemailer, own config)              │
│    summary            ──► POST LLM_SUMMARY_URL (when set)           │
│    recording          ──► POST RECORDING_PROCESSOR_URL (when set)   │
│                                                                       │
│  Admin HTTP API (secured by QUEUE_ADMIN_SECRET)                     │
│    GET/POST/DELETE /queues/*                                         │
│  Enqueue API (secured by INTERNAL_JOB_SECRET)                       │
│    POST /queues/:queue/enqueue                                       │
└─────────────────────────────────────────────────────────────────────┘
           ▲ POST /api/internal/jobs/trigger/*        ▲ enqueue
           │  (INTERNAL_JOB_SECRET)                   │
┌──────────┴──────────────┐          ┌────────────────┴─────────────┐
│ apps/backend (3000)      │          │ backend (producer)            │
│  SessionCleanupJob       │          │  enqueuePasswordResetEmail()  │
│  archiveWorker           │          │  (+ future: recording, summ.) │
│  WS broadcast            │          └──────────────────────────────┘
└─────────────────────────┘
           ▼ /api/admin/queues/* (adminAuthMiddleware proxy)
┌─────────────────────────┐
│ Admin app / operator     │
└─────────────────────────┘
```

### Communication pattern

**Queues → Backend (lifecycle, cleanup):**  
Workers call `POST /api/internal/jobs/trigger/lifecycle-sweep` and `/archive-verify`. The backend runs the actual session state transitions (DB writes, WS broadcast). Workers own scheduling, retry, and DLQ.

**Backend → Queues (email, future recording/summary):**  
Backend calls `POST http://queues:3001/queues/:queue/enqueue`. Both directions are secured with a shared `INTERNAL_JOB_SECRET` bearer token.

**Admin app → Queues (inspection):**  
Admin frontend calls `/api/admin/queues/*`, which the backend proxies to the queues service after verifying the admin JWT. The queues service never needs to be directly reachable by the browser.

**Queues → External service (summary, recording):**  
Workers call `LLM_SUMMARY_URL` / `RECORDING_PROCESSOR_URL` directly. When the env var is unset the job completes silently — safe to enqueue ahead of the service being deployed.

---

## 4. Queues and Job Types

| Queue name                  | Job type               | Trigger                   | Worker action                    |
|-----------------------------|------------------------|---------------------------|----------------------------------|
| `vttchat:session-lifecycle` | `cleanup-old-sessions` | Scheduler (cron, 5 min)   | POST backend lifecycle-sweep     |
| `vttchat:cleanup`           | _(future types)_       | On-demand                 | POST backend archive-verify      |
| `vttchat:email`             | `send-email`           | Backend enqueue           | SMTP delivery via nodemailer     |
| `vttchat:summary`           | `generate-summary`     | Backend enqueue (future)  | POST LLM_SUMMARY_URL             |
| `vttchat:recording`         | `process-recording`    | Backend enqueue (future)  | POST RECORDING_PROCESSOR_URL     |
| `vttchat:dlq`               | `dlq-entry`            | Automatic on exhaustion   | Holds failed job metadata        |

Job type constants: `packages/shared/jobs/names.ts`  
Payload interfaces: `packages/shared/jobs/types.ts`

---

## 5. Durability Contract

- A queued job survives backend or queues service restart (BullMQ state persisted in Redis).
- A running job interrupted by restart is automatically retried from the beginning by BullMQ.
- Job handlers must be idempotent — calling `runLifecycleWorkerOnce()` twice is safe.
- After `QUEUE_MAX_ATTEMPTS` failures the job is moved to `vttchat:dlq` with a full `DlqEntryPayload`.
- DLQ jobs are never retried automatically; operator must retry or clear them.

---

## 6. Retry Policy

Default (all queues except DLQ):

| Setting          | Default  | Env override          |
|------------------|----------|-----------------------|
| Max attempts     | 5        | `QUEUE_MAX_ATTEMPTS`  |
| Backoff type     | exponential | —                  |
| Initial delay    | 5 000 ms | `QUEUE_BASE_DELAY_MS` |
| Completed kept   | 500 jobs or 7 days | —         |
| Failed kept      | indefinite (for DLQ promotion) | — |

---

## 7. Long-Running Job Checkpointing

Not yet implemented. Planned for the LLM summarisation and recording processing workers once those integrations are live.

Minimum checkpoint fields (to be persisted in PostgreSQL):

- `lastCompletedStage`
- `lastProcessedOffset`
- `updatedAt`
- `recoveryHint`

---

## 8. Relationship to Backend's In-Process Scheduler

The backend runs its own in-process `SessionCleanupJobService` in parallel with BullMQ by default. This belt-and-suspenders approach ensures cleanup is never lost if the queues service is temporarily unavailable.

Once BullMQ is proven stable, set `DISABLE_INTERNAL_CLEANUP_SCHEDULER=1` in the backend's env to let BullMQ own the schedule exclusively.

---

## 9. Security

- `INTERNAL_JOB_SECRET` secures worker→backend trigger calls and backend→queues enqueue calls.
- `QUEUE_ADMIN_SECRET` secures direct calls to the queues admin API.
- Admin app inspection goes through the backend's `adminAuthMiddleware` — `QUEUE_ADMIN_SECRET` never reaches the browser.
- Job payloads must not contain raw secrets, passwords, or session tokens.
- Whisper content is excluded from all transcription and summary job payloads by policy.

---

## 10. Related Documents

- [docs/operations/QUEUES.md](../operations/QUEUES.md) — operator reference
- [docs/architecture/SESSION-LIFECYCLE.md](SESSION-LIFECYCLE.md)
- [docs/architecture/STATE-RECOVERY.md](STATE-RECOVERY.md)
- [docs/architecture/TRANSCRIPTION-RECORDING-SYSTEM.md](TRANSCRIPTION-RECORDING-SYSTEM.md)

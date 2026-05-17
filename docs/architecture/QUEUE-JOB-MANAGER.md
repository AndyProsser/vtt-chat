# Queue Job Manager

Status: Planned architecture and implementation blueprint.

This document defines the durable queue and worker model for backend scheduled and long-running tasks.

## 1. Why This Exists

The current in-process interval jobs are useful for small, frequent work, but they do not provide restart durability for long-running tasks.

We need a queue manager that guarantees:

- Job durability across backend restarts
- Retry and dead-letter handling for transient failures
- Idempotent execution for state-transition tasks
- Progress checkpointing for multi-hour jobs
- Operator visibility into queued/running/failed work

## 2. Scope

In scope:

- Scheduled lifecycle jobs (for example session cleanup scans)
- Session transition jobs (for example ENDED -> CLEANUP work units)
- Post-session processing jobs (transcription, summarization)
- Any future asynchronous backend workflows that can exceed request/response lifetimes

Out of scope:

- Replacing realtime websocket/event-bus flow for user-facing sub-second actions
- Replacing PostgreSQL as source of truth for campaign/session state

## 3. Target Architecture

```text
Scheduler (repeatable jobs)
  -> Redis queue (durable job envelopes)
  -> Worker pool (concurrency-limited processors)
  -> Result + progress persistence (Postgres)
  -> WS/API status projection (operator + user visibility)
```

Core components:

1. Queue adapter

- Enqueue, retry, backoff, dead-letter operations
- Queue namespacing by domain (`session-lifecycle`, `cleanup`, `transcription`, `summary`)

2. Scheduler

- Registers repeatable scans (for example ended-session scans)
- Emits per-session work items instead of doing all work inline

3. Workers

- Independent processes; safe to restart without losing queued work
- Concurrency and rate limits per queue
- Idempotent handlers

4. Job status store

- Persistent status and checkpoints in Postgres
- Stable status transitions for operations visibility

## 4. Durability Contract

Durability requirements:

- A queued job survives backend process restart.
- A running job interrupted by restart is either resumed from checkpoint or safely retried.
- Jobs are idempotent at handler boundaries.
- Every retry preserves correlation identifiers and attempt counters.

Recommended status model:

- `QUEUED`
- `RUNNING`
- `SUCCEEDED`
- `FAILED_RETRYABLE`
- `FAILED_TERMINAL`
- `CANCELLED`

## 5. Idempotency and Safety

Each job must include:

- `jobType`
- `dedupeKey` (for example `session:{id}:cleanup-transition:{window}`)
- `correlationId`
- `attempt`
- `payloadVersion`

Rules:

- Duplicate enqueues with same `dedupeKey` should no-op or coalesce.
- Handlers must read authoritative backend state before mutating.
- State transitions must be valid even if the same job runs more than once.

## 6. Long-Running Job Checkpointing

For jobs that may run for many minutes/hours (transcription, summaries):

- Persist checkpoint progress every bounded interval or stage completion.
- On retry/restart, resume from latest checkpoint.
- Store artifact references (file IDs, chunk offsets, model run IDs) in checkpoint payload.

Checkpoint minimums:

- `lastCompletedStage`
- `lastProcessedOffset`
- `updatedAt`
- `recoveryHint`

## 7. Operational Policies

Retry policy defaults:

- Retryable failures: exponential backoff with jitter
- Terminal failures: move to DLQ with error taxonomy
- Max retry attempts configurable per queue

Observability:

- Queue depth, throughput, active workers, retry counts, DLQ counts
- Job latency percentiles by job type
- Stalled job detector
- Admin/operator API for requeue/cancel/inspect

## 8. Relationship to Current Cleanup Workers

Current cleanup behavior remains the contract baseline:

- Lifecycle worker handles `COOLDOWN -> ENDED` and `ENDED -> CLEANUP`
- Archive worker handles cleanup verification

Queue migration path:

1. Keep scans in scheduler, enqueue per-session transition jobs.
2. Move transition logic into dedicated queue workers.
3. Keep current grace and state-validation rules unchanged.

## 9. Security and Privacy

- Job payloads must avoid raw sensitive content unless required.
- Secrets are never serialized into queue payloads.
- Recording/transcription jobs must honor off-the-record policies:
  - Whisper content excluded
  - Pause runtime content excluded by default
  - Boundary markers allowed

See [TRANSCRIPTION-RECORDING-SYSTEM.md](docs/architecture/TRANSCRIPTION-RECORDING-SYSTEM.md).

## 10. Rollout Plan

Phase 1:

- Queue adapter and one durable queue (`session-cleanup-transition`)
- Scheduler emits jobs; worker performs transition + purge unit

Phase 2:

- Move archive verification to queue worker
- Add operator status endpoints and DLQ tooling

Phase 3:

- Add transcription and summary workers with checkpoint resume
- Add admin observability screens and rerun controls

## 11. Related Documents

- [SESSION-LIFECYCLE.md](docs/architecture/SESSION-LIFECYCLE.md)
- [STATE-RECOVERY.md](docs/architecture/STATE-RECOVERY.md)
- [RUNTIME-STATE-AND-AUDIT-CONTRACT.md](docs/architecture/RUNTIME-STATE-AND-AUDIT-CONTRACT.md)
- [TRANSCRIPTION-RECORDING-SYSTEM.md](docs/architecture/TRANSCRIPTION-RECORDING-SYSTEM.md)

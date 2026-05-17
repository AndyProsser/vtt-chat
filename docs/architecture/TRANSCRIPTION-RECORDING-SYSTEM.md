# Transcription and Recording System

Status: Planned architecture and policy contract.

This document defines the backend recording, transcription, and summary processing model and its integration with the durable queue manager.

## 1. Goals

- Produce reliable session transcripts and summaries for long-running campaigns.
- Preserve privacy boundaries and off-the-record rules.
- Support restart-safe processing for multi-hour jobs.
- Keep user-facing session controls responsive while background processing runs asynchronously.

## 2. Policy Contract (Privacy First)

Recording/transcription must enforce these rules:

1. Whisper bubble (`PRIVATE`) is always off-the-record.

- Never record
- Never transcribe
- Never persist transcript text

2. Paused runtime content is off-the-record by default.

- Runtime pause voice/chat excluded from transcript by default
- Configurable campaign policy may allow pause transcript inclusion if explicitly enabled

3. Boundary markers are always retained.

- `[Session Started]`
- `[Session Paused]`
- `[Session Resumed]`
- `[Session Ended]`

4. Spectator-only cooldown chatter follows cooldown persistence policy.

- If cooldown runtime is ephemeral for campaign policy, transcript artifacts exclude it.

## 3. High-Level Pipeline

```text
Session boundary reaches ENDED
  -> enqueue recording-finalize job
  -> enqueue transcription job
  -> enqueue summarization job
  -> persist artifact references
  -> surface status to DM/admin
```

All jobs are queue-managed and restart-safe.

## 4. Job Types

1. `recording.finalize`

- Closes ingest streams and seals runtime media segments

2. `transcription.generate`

- Converts eligible audio segments into text
- Emits checkpoint progress by segment/chunk

3. `summary.generate`

- Produces chapter/session summaries from transcript windows and boundary markers

4. `artifact.publish`

- Stores and indexes generated transcript/summary outputs

## 5. Data Model Expectations

Minimum durable entities:

- `RecordingArtifact`
- `TranscriptArtifact`
- `SummaryArtifact`
- `ProcessingJobStatus`

Minimum fields per artifact:

- `sessionId`
- `campaignId`
- `status`
- `storageLocation`
- `createdAt`
- `updatedAt`

Minimum fields per processing job status:

- `jobId`
- `jobType`
- `sessionId`
- `state`
- `attempt`
- `checkpoint`
- `lastError`

## 6. Restart and Resume Rules

- Every long-running job persists checkpoints.
- Worker crash/restart resumes from latest checkpoint.
- If checkpoint is unavailable, restart from last safe stage boundary.
- Failed jobs move to retry or terminal-failed state with explicit operator action path.

## 7. State and UX Integration

- Session lifecycle transitions remain authoritative and fast.
- Transcription/summarization runs asynchronously after lifecycle transitions.
- UI shows processing state from persisted job status, not in-memory worker state.
- Reconnect/refresh must recover artifact/job status from backend APIs.

## 8. Ordering and Dependencies

Required ordering:

1. `recording.finalize` succeeds before transcript generation.
2. `transcription.generate` succeeds before summary generation.
3. `artifact.publish` runs after summary generation completes.

If dependency fails:

- Downstream jobs remain blocked
- Status reflects blocked dependency reason
- Operator can retry upstream job

## 9. Queue Integration

This pipeline depends on the durable queue manager.

Queue requirements:

- Durable enqueue + restart-safe retry
- Idempotency keys by session + stage
- DLQ for terminal failures
- Progress and duration telemetry

See [QUEUE-JOB-MANAGER.md](docs/architecture/QUEUE-JOB-MANAGER.md).

## 10. Acceptance Criteria

- Restarting backend during transcription does not lose work.
- Transcript excludes whisper and off-the-record pause content by default.
- Boundary markers remain present and ordered.
- Operator can inspect job progress and retry failures.
- Session UI remains responsive while processing occurs in background.

## 11. Related Documents

- [SESSION-LIFECYCLE.md](docs/architecture/SESSION-LIFECYCLE.md)
- [STATE-RECOVERY.md](docs/architecture/STATE-RECOVERY.md)
- [QUEUE-JOB-MANAGER.md](docs/architecture/QUEUE-JOB-MANAGER.md)
- [RUNTIME-STATE-AND-AUDIT-CONTRACT.md](docs/architecture/RUNTIME-STATE-AND-AUDIT-CONTRACT.md)

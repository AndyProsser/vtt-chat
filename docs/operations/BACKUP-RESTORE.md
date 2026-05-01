# Backup & Restore

_A resilient, multi‑layered backup strategy for campaigns, sessions, notes, chat, recordings, and presence snapshots._

---

## Overview

The platform uses a **multi‑tier backup strategy** designed for:

- Long‑term campaign preservation
- Disaster recovery
- Migration between environments
- User‑initiated export/import
- Recording & transcript retention
- Redis recovery after crash
- Session history integrity

This document defines:

- Backup layers
- What is backed up
- How often
- Restore flows
- User‑initiated export/import
- Admin‑level disaster recovery
- Redis presence recovery
- Recording storage strategy

---

## 1. Backup Layers Overview

The system uses **four independent backup layers**:

| Layer                            | Purpose                          |
| -------------------------------- | -------------------------------- |
| **Postgres Backups**             | Authoritative long‑term data     |
| **Redis Snapshots**              | Presence recovery & analytics    |
| **Object Storage Backups**       | Recordings, attachments, exports |
| **User‑Initiated Export/Import** | Campaign‑level portability       |

Each layer is documented below.

---

## 2. Postgres Backups (Authoritative)

Postgres is the **source of truth** for:

- Campaigns
- Characters
- Sessions
- Notes
- Chat history
- Journals
- Telemetry
- Presence snapshots
- Metadata cards
- Import/export logs
- Recording metadata

### Backup Strategy

| Type             | Frequency    | Retention  |
| ---------------- | ------------ | ---------- |
| Full backup      | Daily        | 30–90 days |
| WAL archiving    | Continuous   | 7–30 days  |
| Schema snapshots | On migration | Forever    |

### Recommended Tools

- `pg_dump` for full backups
- WAL archiving for point‑in‑time recovery
- `pgBackRest` or `wal-g` for automated retention

### Restore Strategy

1. Provision new Postgres instance
2. Restore latest full backup
3. Replay WAL logs to desired timestamp
4. Run schema migrations (if needed)
5. Rebuild Redis presence from snapshots
6. Reconnect backend services

---

## 3. Redis Backups (Presence Recovery)

Redis is **not** authoritative — it stores:

- Live presence
- Room membership
- Private room state
- DM overrides
- Audio effects
- Activity tracking
- Assistant DM roles (session‑scoped)

### Backup Strategy

Redis uses:

- **RDB snapshots** every 30–60 seconds
- **AOF** optional (disabled by default)
- **PresenceSnapshot** table in Postgres for recovery

### Restore Strategy

If Redis crashes:

1. Load latest RDB snapshot
2. Load presence snapshots from Postgres
3. Rebuild:
   - `presence:campaign:*`
   - `room:*:members`
   - `roles`
4. Mark all users as `DISCONNECTED_RECOVERABLE`
5. Clients reconnect and restore state

This ensures **no session is lost**.

---

## 4. Object Storage Backups (Recordings & Attachments)

Object storage (S3, MinIO, etc.) stores:

- Audio recordings
- Transcripts
- Note attachments
- Metadata card images
- Exported campaign ZIPs

### Backup Strategy

| Type             | Frequency    | Retention            |
| ---------------- | ------------ | -------------------- |
| Versioned bucket | Continuous   | Forever or 90 days   |
| Lifecycle rules  | Auto‑archive | Glacier/Deep Archive |
| Replication      | Optional     | Cross‑region         |

### Restore Strategy

1. Restore object from versioned bucket
2. Rebuild metadata in Postgres if needed
3. Re‑link to session or note

---

## 5. User‑Initiated Export / Import

Current shipped admin workflows:

- `GET /api/admin/campaigns/:campaignId/export`
- `POST /api/admin/campaigns/import`
- `GET /api/admin/campaigns/:campaignId/recordings`
- `POST /api/admin/campaigns/:campaignId/recordings`
- `GET /api/admin/settings/backup/export`

Users can export:

- Entire campaign
- Notes
- Chat history
- Characters
- Sessions
- Journals
- Metadata cards
- Recording metadata (not audio files)

### Export Format

```json
{
  "version": 1,
  "exportedAt": "2026-04-29T00:00:00.000Z",
  "sourceCampaignId": "...",
  "campaign": { ... },
  "members": [ ... ],
  "characters": [ ... ],
  "sessions": [ ... ],
  "recordings": [ ... ]
}
```

### Import Strategy

1. Validate version
2. Validate schema
3. Create new campaign
4. Insert characters
5. Insert notes
6. Insert chat
7. Insert sessions
8. Insert journals
9. Insert metadata cards
10. Insert recording metadata
11. Persist portability artifact + admin audit entry

Import never overwrites existing campaigns.

---

## 6. Disaster Recovery (Admin-Level)

### Full Disaster Scenario

If the entire cluster is lost:

1. Provision new infrastructure
2. Restore Postgres from full backup + WAL
3. Restore Redis from RDB snapshot
4. Restore object storage from versioned bucket
5. Rebuild presence from Postgres snapshots
6. Restart backend services
7. Restart LiveKit
8. Clients reconnect and restore state

### Recovery Time Objective (RTO)

- Redis: seconds
- Postgres: minutes
- Object storage: minutes
- Full cluster: < 1 hour

### Recovery Point Objective (RPO)

- Postgres: seconds (WAL)
- Redis: < 60 seconds
- Object storage: zero (versioned)

---

## 7. Testing Backup Integrity

### Automated Tests

- Nightly restore test
- WAL replay test
- Redis snapshot load test
- Object storage version retrieval test
- Import/export round‑trip test

### Manual Tests

- Restore campaign from export
- Restore session journal
- Restore recording metadata
- Rebuild presence from snapshots

---

## 8. Presence Snapshot System

Presence snapshots are stored in Postgres every 30–60 seconds.

### Snapshot Schema

```ts
interface PresenceSnapshot {
  campaignId: string
  userId: string
  sessionId: string | null
  primaryRoomId: string | null
  privateRoomId: string | null
  state: string
  lastSeenAt: number
}
```

### Snapshot Uses

- Redis crash recovery
- Analytics
- Session history
- DM playback tools

---

## 9. Design Principles

### 1. Postgres is authoritative

Everything important lives here.

### 2. Redis is ephemeral

Snapshots + Postgres restore live state.

### 3. Object storage is versioned

Recordings and attachments are never lost.

### 4. Export/import is portable

Campaigns can be moved between servers.

### 5. Backups are automated

No manual steps required.

### 6. Restore is deterministic

Every layer has a clear recovery path.

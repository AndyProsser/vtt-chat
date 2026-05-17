# VTT-Chat Message Storage Architecture Report

**Date:** 17 May 2026
**Scope:** Chat message persistence, querying, and visibility filtering across backend and frontend

---

## 1. Prisma Schema (`backend/prisma/schema.prisma`)

### ChatMessage Model

```prisma
model ChatMessage {
  id             String      @id @default(uuid()) @db.Uuid
  sessionId      String      @db.Uuid
  session        Session     @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  authorId       String      @db.Uuid
  authorUsername String
  content        String      @db.Text
  type           MessageType
  isDmOnly       Boolean     @default(false)
  isOffTheRecord Boolean     @default(false)
  visibleTo      Json?
  createdAt      DateTime    @default(now())
  editedAt       DateTime?
  deletedAt      DateTime?
  deletedBy      String?     @db.Uuid

  @@index([sessionId])
  @@index([createdAt])
  @@index([type])
}

enum MessageType {
  IC
  OOC
  WHISPER
  SYSTEM
}
```

### Key Relationships

| Field       | Association      | Scope          | Behavior on Delete                              |
| ----------- | ---------------- | -------------- | ----------------------------------------------- |
| `sessionId` | Session (FK)     | Session-scoped | Cascade (delete all messages when session ends) |
| `authorId`  | User ID (string) | User reference | No FK constraint                                |
| `visibleTo` | JSON array       | Audience list  | Used for filtering                              |

### Key Fields Explained

- **`sessionId`**: All messages are **session-scoped**. Messages do not have a campaign-level FK; they belong to a session.
- **`type`**: One of `IC`, `OOC`, `WHISPER`, `SYSTEM` — controls visibility and persistence rules.
- **`isDmOnly`**: Boolean flag; set for WHISPER messages and some system messages (DM-only audit).
- **`isOffTheRecord`**: Flag for messages sent during pause/intermission or inside Whisper groups; excluded from most queries unless requester is DM.
- **`visibleTo`**: JSON field storing `{ visibleTo?: UUID[], roomId?: UUID, targetIds?: UUID[] }` — controls which users see the message.
- **`deletedAt` / `deletedBy`**: Soft-delete support; messages are marked deleted but not removed.
- **Indexes**: Queries by `sessionId` (most common), `createdAt` (pagination), and `type` (filtering).

---

## 2. Chat Repository (`backend/src/repositories/chat.repository.ts`)

### Core Query Patterns

#### Single Session Queries

**`listSessionMessages(sessionId: string)`**

- Returns all messages in a session, ordered by `createdAt ASC`.
- No filtering for visibility; raw rows returned to caller.
- Used by service layer which applies role-based visibility filtering.

**`listSessionMessagesPage({ sessionId, before?, limit })`**

- Paginated query: fetch up to `limit` messages before a given timestamp.
- Returns `{ rows, hasMore }`.
- Query limit clamped to `[1, 100]`.
- Orders by `createdAt DESC`, then reverses to maintain chronological order.

#### Multi-Session Queries (Campaign Greenroom)

**`listMessagesBySessionIds(sessionIds: string[])`**

- Fetch all messages across multiple sessions (used for campaign greenroom).
- Returns unsorted array ordered by `createdAt ASC`.
- Used to merge greenroom chats across all sessions of a campaign.

**`listMessagesBySessionIdsPage({ sessionIds, before?, limit })`**

- Paginated version of multi-session query.
- Same pagination semantics as single-session version.

#### Single Message Queries

**`findMessageById(messageId: string)`**

- Retrieve one message by ID; returns null if not found.
- Used for edit/delete operations, WS event enrichment.

#### Create, Update, Delete

**`createChatMessageRecord({ id, sessionId, authorId, content, type, isOffTheRecord, visibleTo, ... })`**

- Persist a new message to PostgreSQL.
- `visibleTo` parameter accepts `{ visibleTo?: UUID[], roomId?: UUID, targetIds?: UUID[] }` JSON object.

**`updateMessageRecord({ messageId, content, editedAt })`**

- Soft-update: change content and set `editedAt` timestamp.

**`softDeleteMessageRecord({ messageId, deletedAt, deletedBy })`**

- Soft-delete: set `deletedAt` and `deletedBy` without removing the row.

**`deleteMessageRecord(messageId: string)`**

- Hard-delete (rarely used); removes the row entirely.

**`deleteSessionMessages(sessionId: string)`**

- Cascade delete for cleanup; removes all messages for a session.
- Used during session cleanup or if explicitly required.

#### Summary

- **No explicit campaign-level table**: Messages live at session scope; campaign greenroom queries join across multiple sessions.
- **Pagination uses cursor (timestamp)**: `before` timestamp, not offset-based.
- **JSON visibility field**: Avoids separate join tables; embedded in the message row.

---

## 3. Chat Service (`backend/src/services/chat.service.ts`)

### Visibility Parsing & Computation

**`parseVisibility(value: unknown): ChatVisibilityPayload`**

- Parses JSON visibility field into `{ visibleTo?: UUID[], roomId?: UUID, targetIds?: UUID[] }`.
- Defensive: returns empty object if value is null/undefined/malformed.

**`computeVisibility(...): ChatVisibilityPayload`**

- Determines who should see a message based on type, author, and DM.
- **IC/OOC**: inherit `roomId` if provided; use `visibleAudience` param if supplied.
- **WHISPER**: always visible to `[authorId, dmId, recipientId]`; sets `targetIds` for UI highlighting.
- **SYSTEM**: uses provided `visibleAudience` or empty (typically all).

**`canSeeMessage(message, requesterId, requesterRole, requestedRoomId?): boolean`**

- Checks if a requester can view a message.
- **DM**: can see all (audit trail).
- **Other users**: cannot see deleted or off-the-record messages; checked against `visibleTo` list.
- **RoomId check**: if both message and requested room have roomIds, they must match.

### Message Querying with Filtering

**`getMessages(sessionId, requesterId, requesterRole, roomId?): StoredMessage[]`**

- Fetch all session messages and apply role-based visibility filter.
- **DM**: sees all messages (including off-the-record).
- **Non-DM**: excludes off-the-record messages; respects `visibleTo`.

**`getMessagesPage(sessionId, requesterId, requesterRole, roomId?, options?): ChatHistoryPageResult`**

- Paginated version of `getMessages`.
- If `limit` is undefined, returns all non-deleted messages (simple fetch).
- Otherwise, uses pagination cursor (`before` timestamp).
- Normalizes limit to `[1, 100]`.

### Campaign Greenroom Message Merging

**`getCampaignGreenroomMessages(sessionId, requesterId, requesterRole, roomId): StoredMessage[]`**

```typescript
export async function getCampaignGreenroomMessages(
  sessionId: UUID,
  requesterId: UUID,
  requesterRole: string,
  roomId: UUID
): Promise<StoredMessage[]>
```

**Algorithm:**

1. Load the session; if it has no `campaignId`, fall back to session-only query.
2. Fetch all sessions for the campaign + all GROUP rooms in the campaign.
3. Filter rooms to find "Green Room" by name (case-insensitive, normalizes spaces).
4. If the requested `roomId` is NOT a greenroom, return session-only messages.
5. Otherwise, fetch messages from ALL campaign sessions, filter to those in greenroom rooms.
6. Apply role-based visibility (same as `getMessages`).

**Key behavior:**

- **Greenroom is campaign-scoped, not session-scoped**: Messages persist across session boundaries.
- **Name-based detection**: Rooms named "green room" or "green-room" (case-insensitive) are treated as greenroom.
- **Only GROUP type rooms are included**: MAIN, PRIVATE rooms are never greenroom.

**`getCampaignGreenroomMessagesPage(...)`**

- Paginated version of the above.
- Same merging + visibility filtering applied.

### Message Sending

**`sendMessage({ sessionId, roomId?, authorId, content, type, recipientId?, visibleTo?, isOffTheRecord? }): StoredMessage`**

**Flow:**

1. Resolve author (replace with SYSTEM user if `type === SYSTEM`).
2. Compute visibility using `computeVisibility()`.
3. Build message object with all metadata.
4. Persist to PostgreSQL via `createChatMessageRecord()`.
5. Return `StoredMessage` for WS broadcast.

**Note:** Does NOT check session state or authorization; done by API route layer.

### Message Editing & Deletion

**`editMessage(messageId, requesterId, requesterRole, content): StoredMessage | null`**

- Finds message, checks if requester is author or DM.
- Updates `content` and sets `editedAt` timestamp.
- Returns updated message or null if unauthorized.

**`deleteMessage(messageId, requesterId, requesterRole): StoredMessage | null`**

- Soft-delete: sets `deletedAt` and `deletedBy`.
- Only author or DM can delete.

### Data Mapping

**`mapStoredMessage(row): StoredMessage`**

- Transforms Prisma row into frontend-compatible `StoredMessage` type.
- Parses `visibleTo` JSON field.
- Converts `createdAt` (Date) to epoch timestamp (number).

---

## 4. API Routes (`backend/src/api/chat.routes.ts`)

### Endpoints

#### `POST /api/chat/message`

**Send a message to a room.**

```typescript
{
  sessionId: UUID,
  roomId: UUID,
  content: string,        // 1–4000 chars
  type: MessageType,      // IC, OOC, WHISPER, SYSTEM
  recipientId?: UUID      // For WHISPER; optional but recommended
}
```

**Validations & Rules:**

- Session must exist and requestor must be a member.
- **Spectators** cannot send IC or WHISPER; can send OOC.
- **Greenroom messages** must be OOC (no IC/WHISPER in greenroom).
- **Greenroom chat** available outside ACTIVE sessions (IDLE, PAUSED) or in explicit greenroom rooms.
- **Session state gating**: Chat blocked if session is not ACTIVE or in allowable greenroom state.
- **PRIVATE room check**: Attempting to send to a PRIVATE room returns error.

**Visibility Computation:**

- **IC/OOC in room**: author + room occupants (computed via `resolveRoomAudience`).
- **WHISPER**: author + DM + recipient; marked `isDmOnly: true`.
- **SYSTEM (DM only)**: provided `visibleAudience` or defaults.

**Response:**

- `201 Created` with stored message.
- WS event `CHAT:MESSAGE_SENT` broadcast to all affected clients after persistence.

#### `GET /api/chat/messages/:sessionId`

**Retrieve message history for a room in a session.**

```typescript
GET /api/chat/messages/{sessionId}?roomId={roomId}&includeCampaignGreenroom={0|1}&limit={1-100}&before={timestamp}
```

**Parameters:**

- `roomId` (optional): Filter to one room only. If not provided, returns all room messages.
- `includeCampaignGreenroom` (optional, `0` or `1`): If `1`, merge greenroom messages across campaign.
- `limit` (optional): Pagination limit; clamped to `[1, 100]`.
- `before` (optional): Pagination cursor (timestamp).

**Validations:**

- Session must exist and requestor must be a member.
- If `roomId` is provided: room must exist in that session.
- **Non-DM requestors** can only view messages in their current room (`primaryRoomId`).
- **PRIVATE room handling**: If room is PRIVATE, returns empty array `[]` (no chat history for Whisper).
- **Authorization**: Visibility filtering applied per `canSeeMessage()`.

**Response:**

```typescript
{
  messages: StoredMessage[],
  pagination: {
    hasMore: boolean,
    nextBefore?: number
  }
}
```

#### `PUT /api/chat/message/:id`

**Edit a message.**

```typescript
{
  content: string // 1–4000 chars
}
```

**Authorization:** Author or DM only.
**Response:** Updated message or `403 Forbidden`.

#### `DELETE /api/chat/message/:id`

**Delete a message (soft-delete).**

**Authorization:** Author or DM only.
**Response:** `204 No Content` or `403 Forbidden`.

### Greenroom Message Fetching Flow

1. Client calls `GET /api/chat/messages/:sessionId?roomId=...&includeCampaignGreenroom=1`.
2. API resolves session and room; validates requestor's role.
3. If room is a "Green Room":
   - Calls `getCampaignGreenroomMessagesPage()`.
   - Service fetches all campaign sessions + filters to greenroom rooms.
   - Returns merged message history across all sessions.
4. If room is not greenroom (MAIN, GROUP other):
   - Calls `getMessagesPage()` (session-scoped only).
5. All messages filtered by requester's role and visibility.

### WS Events

After persistence, API broadcasts:

**`CHAT:MESSAGE_SENT`**

```typescript
{
  type: 'CHAT:MESSAGE_SENT',
  sessionId: UUID,
  roomId: UUID | null,
  payload: {
    messageId: UUID,
    roomId?: UUID,
    authorId: UUID,
    authorUsername: string,
    content: string,
    type: MessageType,
    isDmOnly: boolean,
    isOffTheRecord: boolean,
    visibleTo?: UUID[],
    targetIds?: UUID[]
  }
}
```

Broadcast scope: `wsManager.broadcastEventToSession(sessionId, event, stored.visibleTo)` — respects visibility list.

**`CHAT:MESSAGE_EDITED`** and **`CHAT:MESSAGE_DELETED`** events follow similar patterns.

---

## 5. Frontend Chat State (`frontend/src/state/chatSlice.ts`)

### Zustand ChatSlice Structure

```typescript
export interface ChatSlice {
  // State
  messages: Record<UUID, Record<UUID, Message>> // keyed [sessionId][messageId]
  typingIndicators: Record<UUID, TypingIndicator[]> // keyed [sessionId]
  outgoingQueue: Record<UUID, OutgoingChatMessage[]> // keyed [sessionId]
  isLoading: boolean

  // Actions
  addMessage: (sessionId: UUID, message: Message) => void
  updateMessage: (sessionId: UUID, messageId: UUID, updates: Partial<Message>) => void
  deleteMessage: (sessionId: UUID, messageId: UUID) => void
  clearMessages: (sessionId?: UUID) => void
  clearRoomMessages: (sessionId: UUID, roomId: UUID) => void

  // Event handlers
  handleMessageSent: (event: EventEnvelope) => void
  handleMessageEdited: (event: EventEnvelope) => void
  handleMessageDeleted: (event: EventEnvelope) => void
  handleRoomContextCleared: (event: EventEnvelope) => void
  handleTypingStarted: (event: EventEnvelope) => void
  handleTypingStopped: (event: EventEnvelope) => void
}
```

### Data Structure

**`messages: Record<UUID, Record<UUID, Message>>`**

- Organized as nested objects keyed by `sessionId` then `messageId`.
- Example: `state.messages['session-123']['msg-456']`.
- Allows quick lookups and per-session isolation.
- On session end, entire session entry can be cleared.

**`outgoingQueue: Record<UUID, OutgoingChatMessage[]>`**

```typescript
export interface OutgoingChatMessage {
  id: UUID
  roomId: UUID
  content: string
  type: MessageType
  recipientId?: UUID
  createdAt: number
  status: 'queued' | 'sending' | 'failed'
  error?: string
}
```

- Local optimistic queue for messages awaiting acknowledgement.
- Status transitions: `queued` → `sending` → (success = remove) or `failed`.
- On failure, retains error message for user feedback.

### Session Bookend Deduplication

**`isDuplicateSessionBookend(existing, incoming): boolean`**

- Detects duplicate session boundary markers (e.g., two "[Session Started]" messages within 10 seconds).
- Compares: `roomId`, `type`, `content`, and `createdAt` (within 10s window).
- Prevents duplicate bookends when:
  - Server persists a boundary.
  - WS event arrives (double-counted without dedup).
  - Frontend fallback renders a local bookend.

**Session Bookend Prefixes:**

```
"Session Start:", "Session End:",
"[Session Started]", "[Session Ended]",
"[Session Paused]", "[Session Resumed]"
```

### Event Handlers

**`handleMessageSent(event: EventEnvelope)`**

- Extracts message from event payload.
- Checks for duplicate session bookends.
- Calls `addMessage()` to store in Zustand.
- Also removes message from `outgoingQueue` if present (server ack).

**`handleMessageEdited(event)`** / **`handleMessageDeleted(event)`**

- Updates or removes message in the nested state structure.

**`handleRoomContextCleared(event)`**

- Clears all messages for a room when room is deleted/reset.

### Key Behaviors

**Per-Session Isolation**

- Messages are scoped by `sessionId`; clearing one session doesn't affect others.
- On `ENDED` or `CLEANUP` transitions, `clearMessages(sessionId)` is called.

**Outgoing Message Queue**

- Implements local optimistic rendering: message appears immediately, status shows "sending".
- On `CHAT:MESSAGE_SENT` WS event, matching outgoing message is removed (server ack).
- If timeout or error, status changes to `failed` with error message.
- User can retry or discard.

**Typing Indicators**

- Ephemeral list per session, no persistence.
- Expire after a timeout (UI layer responsibility).

---

## 6. Summary: Current Architecture

### Message Association Model

| Scope               | Storage Location                                 | Key Association               | Lifecycle                                             |
| ------------------- | ------------------------------------------------ | ----------------------------- | ----------------------------------------------------- |
| **Session-scoped**  | PostgreSQL `ChatMessage` (FK `sessionId`)        | Session                       | Cascade delete when session ENDED                     |
| **Greenroom**       | PostgreSQL `ChatMessage` + filter by room name   | Campaign (multi-session join) | Persists across sessions (GROUP rooms survive)        |
| **Whisper/Private** | PostgreSQL `ChatMessage` (JSON `visibleTo` list) | Session                       | Soft-deleted on session cleanup or explicit DM action |
| **Frontend cache**  | Zustand `messages[sessionId][messageId]`         | Session                       | Cleared on session transition/CLEANUP                 |
| **Outgoing queue**  | Zustand `outgoingQueue[sessionId]`               | Session                       | Drained on WS acks or explicit clear                  |

### Table Relationships

```
Session
├── campaignId? (FK → Campaign)
├── Messages (1-N, FK sessionId) → ChatMessage
├── Rooms (1-N, FK sessionId) → Room
└── SessionMembers (1-N, FK sessionId)

Campaign
├── currentDmId (FK → User)
└── Sessions (1-N, FK campaignId)
   └── [Messages queried across all sessions for greenroom]

ChatMessage
├── sessionId (FK → Session, Cascade)
├── authorId (not FK, string UUID)
├── type (enum: IC, OOC, WHISPER, SYSTEM)
├── visibleTo (JSON: { visibleTo?: UUID[], roomId?: UUID, targetIds?: UUID[] })
├── isOffTheRecord (boolean, excludes from non-DM queries)
├── isDmOnly (boolean, set for WHISPER)
└── deletedAt / deletedBy (soft-delete)
```

### Query Patterns

| Query                                               | Scope    | Use Case                          |
| --------------------------------------------------- | -------- | --------------------------------- |
| `listSessionMessages(sessionId)`                    | Session  | Full history fetch for DM audit   |
| `listSessionMessagesPage(sessionId, before, limit)` | Session  | Paginated history for active room |
| `listMessagesBySessionIds(sessionIds)`              | Campaign | Greenroom merge across sessions   |
| `listMessagesBySessionIdsPage(...)`                 | Campaign | Paginated greenroom merge         |
| `findMessageById(id)`                               | Any      | Edit/delete/WS enrichment         |

### Greenroom vs. Session Chat Separation

**Session Chat:**

- Scoped to a single session.
- Room-aware: messages filtered to room membership.
- Standard visibility: `visibleTo` list or role-based.
- Deleted when session ends (cascade).

**Greenroom Chat:**

- **Multi-session, campaign-scoped**: merged queries across all sessions.
- **Room-name based**: rooms matching "Green Room" (case-insensitive).
- **GROUP type only**: PRIVATE and MAIN rooms excluded.
- **Persists across sessions**: greenroom GROUP rooms survive session boundaries.
- **Access gated by flag**: `includeCampaignGreenroom=1` parameter on API.
- **Same visibility filtering**: off-the-record still hidden from non-DM users.

**Off-the-Record Messages:**

- Marked with `isOffTheRecord: boolean`.
- Set for messages during PAUSED/IDLE sessions OR in Whisper.
- **DM can see them** (audit).
- **Other users excluded** unless requester is DM.
- Not persisted to session archive (excluded from history queries for non-DM).

**Whisper/Private Room Handling:**

- Whisper messages set `isDmOnly: true` and `visibleTo: [authorId, dmId, recipientId]`.
- PRIVATE room chat requests return empty array `[]` (no persistent chat for Whisper).
- Whisper content is never recorded or persisted beyond session.

---

## 7. Key Findings

### ✅ Current Strengths

1. **Clear Session Scoping**: Messages FK'd to sessions; cleanup is straightforward (cascade delete).
2. **Flexible Visibility Model**: JSON `visibleTo` field avoids heavy join tables; supports complex audiences.
3. **Greenroom Cross-Session Support**: Already implemented; merges messages across campaign sessions.
4. **Role-Based Filtering**: Consistent `canSeeMessage()` logic; DM audit trails preserved.
5. **Soft Deletes**: Messages marked deleted, not removed; allows recovery/audit.
6. **Pagination with Cursor**: Uses timestamp cursor, not offset; suitable for append-only streams.
7. **WS Event Broadcast**: All clients informed immediately; no polling required.

### ⚠️ Current Limitations / Considerations

1. **No Campaign-Level FK**: Messages live at session scope; greenroom queries require multi-session joins. If campaigns have many sessions, this could become expensive. Consider adding a campaign-level message table or denormalizing campaign visibility.

2. **Soft-Delete Row Accumulation**: `deletedAt` rows remain in the table. Over time, this could inflate table size. Consider periodic hard-delete cleanup or archiving deleted messages.

3. **JSON Visibility Field**: While flexible, `visibleTo` is unindexed. Queries cannot filter by "show me messages visible to user X" without full table scans. If needed, consider a separate `ChatMessageVisibility` join table.

4. **No Explicit Timestamp Tracking**: `editedAt` and `deletedAt` exist, but there's no `createdAt` tracking for the visibility JSON changes. Auditing who changed visibility is not directly supported.

5. **PRIVATE Room Messages**: Currently returns empty array for PRIVATE room queries. This is correct per spec (Whisper is off-the-record), but consider adding a warning or explicit error response instead of silently returning empty to prevent confusion.

6. **Greenroom Room Detection**: Uses string name matching ("green room" / "green-room" case-insensitive). If DMs rename greenroom rooms or create similarly-named rooms, this could break. Consider adding a flag or explicit room type enum value.

---

## 8. Recommendations

### Short Term

1. **Add Campaign Denormalization** (if greenroom queries become slow):
   - Consider a materialized view or denormalized campaign message summary table.
   - Cache greenroom message counts per campaign session.

2. **Document Greenroom Naming Convention**:
   - Enforce or document the "Green Room" naming convention more explicitly.
   - Consider adding a migration to standardize existing greenroom names.

3. **Add Soft-Delete TTL**:
   - Implement a background job to hard-delete `deletedAt` messages older than N days.
   - Keeps table lean while preserving audit trail for recent messages.

### Medium Term

1. **Separate Visibility Table** (if complex audience queries needed):
   - Create `ChatMessageVisibility(messageId, visibleToUserId)` join table.
   - Enables efficient queries like "show me all messages visible to user X".

2. **Add Explicit Off-The-Record Behavior**:
   - Consider a migration: add `recordingStatus` enum (RECORDED, NOT_RECORDED, PURGED) to ChatMessage.
   - Clarify recording policy per message type at schema level.

3. **Greenroom Type Enum**:
   - Add a `isGreenroom: boolean` flag or `roomPurpose` enum to Room model.
   - Eliminates name-based detection; more robust.

### Long Term

1. **Message Archive / Partitioning**:
   - Partition ChatMessage by date range (e.g., monthly).
   - Archive old messages to separate storage for compliance/audit.

2. **Campaign Message Rollups**:
   - Pre-compute campaign message summaries at session end.
   - Support "session recap" / "chapter summary" features for long-running campaigns.

---

## Appendix: File References

- **Schema Definition**: [backend/prisma/schema.prisma](backend/prisma/schema.prisma) (ChatMessage model, line ~250)
- **Repository Layer**: [backend/src/repositories/chat.repository.ts](backend/src/repositories/chat.repository.ts) (~300 lines)
- **Service Layer**: [backend/src/services/chat.service.ts](backend/src/services/chat.service.ts) (~450 lines, includes greenroom logic)
- **API Routes**: [backend/src/api/chat.routes.ts](backend/src/api/chat.routes.ts) (~500+ lines, message send/fetch/edit endpoints)
- **Frontend State**: [frontend/src/state/chatSlice.ts](frontend/src/state/chatSlice.ts) (~250 lines, Zustand chat slice)
- **Shared Types**: [shared/types/entities.ts](shared/types/entities.ts) (MessageEntity interface)

---

**End of Report**

# **VTT-Chat: Session and History Architecture**

## **1. Overview**

The session and history system manages the lifecycle of campaign messages across multiple play sessions. The core principle is **persistent experience with session boundaries**: all messages a player experiences in a session persist to campaign history, but messages are grouped by session for clarity and archival.

---

## **2. Core Concepts**

### **2.1 Session**

A **session** is a contiguous play period:

- Starts when the campaign transitions to `ACTIVE` state
- Continues through potential PAUSE/RESUME cycles (same session)
- Ends when the campaign transitions to `ENDED` or `IDLE`
- Has a unique `sessionId` (UUID or timestamp-based)

**Session scope:**

- All IC, OOC, Whisper, and System messages belong to a session
- Greenroom messages belong to a session (but are ephemeral and purged at cleanup)
- Whisper Group messages are ephemeral (deleted on exit, unless persistence enabled)

### **2.2 Campaign History**

**Campaign history** is the persistent archive of all sessions' messages:

- Stored in PostgreSQL under the campaign record
- Includes: IC, OOC, Whisper, System, and (optionally) Greenroom messages
- Searchable, tagged by session, queryable by date/player/group
- Players can view prior sessions in read-only mode
- Spectators do **not** have access to campaign history

### **2.3 Session Boundaries**

Session boundaries are marked by **system messages**:

- `[Session Started]` — persisted at session start, visible to all
- `[Session Paused]` — persisted when pausing (if applicable)
- `[Session Resumed]` — persisted when resuming (if applicable)
- `[Session Ended]` — persisted at session end, visible to all

These boundary markers persist to campaign history and serve as timeline anchors.

---

## **3. Message Lifecycle**

### **3.1 Message Creation & Broadcasting**

1. **Player sends message** (e.g., IC in Party A group)
2. **Frontend validates** visibility scope (DM, group members, etc.)
3. **Backend validates** and persists to volatile session store (Redis or in-memory)
4. **WS broadcast** sent to all connected clients; they validate and render if visible
5. **Message appears** in player stream immediately

### **3.2 Session-to-Archive Transition**

When a session ends (`ENDED` or `IDLE` state):

1. **DM triggers cleanup** or cleanup runs automatically
2. **Persistent messages** (IC, OOC, Whisper, System) are queued for archival
3. **Ephemeral messages** are purged:
   - Whisper Group messages deleted (unless persistence toggle enabled)
   - Greenroom messages deleted (unless DM manually archived)
4. **Batch write** to PostgreSQL: all persistent messages inserted into `CampaignMessageArchive` table
5. **Vacuum** session state; volatile memory cleared
6. **New session** begins fresh with no messages initially

### **3.3 Message State Flags**

Each message carries flags to control its lifecycle:

| Flag           | Type    | Meaning                                                           |
| -------------- | ------- | ----------------------------------------------------------------- |
| `isPersistent` | boolean | Does this message survive session end and go to campaign history? |
| `isEphemeral`  | boolean | Should this message be deleted on exit (Whisper Group context)?   |
| `sessionId`    | string  | Which session does this belong to?                                |
| `campaignId`   | string  | Which campaign archive should this belong to?                     |

**Default flags by message type:**

| Type          | isPersistent          | isEphemeral | Notes                                      |
| ------------- | --------------------- | ----------- | ------------------------------------------ |
| IC            | true                  | false       | Survives to campaign history               |
| OOC           | true                  | false       | Survives to campaign history               |
| Whisper       | true                  | false       | Survives to campaign history               |
| System        | true                  | false       | Survives to campaign history               |
| Greenroom     | false (until CLEANUP) | false       | Purged at cleanup unless manually archived |
| Whisper Group | false (configurable)  | true        | Deleted on exit; DM can toggle persistence |

---

## **4. User Session Context**

Each connected user maintains a **session context** that tracks their experience:

```ts
interface UserSessionContext {
  userId: string
  sessionId: string

  // Current position
  currentGroupId?: string | null
  currentContextType: 'GROUP' | 'GREENROOM' | 'WHISPER_GROUP' | null

  // Session history (never cleared during session)
  sessionGroupHistory: Set<string>

  // Flags
  isInWhisperGroup: boolean
  isInGreenroom: boolean

  // Archive access (for DM/players, not spectators)
  campaignHistoryAccess: boolean
}
```

**Key points:**

- `sessionGroupHistory` is **never cleared** during a session. Once a player visits a group, that group remains in their history for the entire session.
- This enables the **no trapped messages** guarantee: all messages from groups in `sessionGroupHistory` remain visible.
- On session end, the context is cleared; a new session starts with a fresh context.

---

## **5. Filtering & Visibility Logic**

### **5.1 Real-Time Filtering (During Session)**

When a message is received or rendered, the client checks visibility:

```
function shouldShowMessage(message, user, context) {
  if (user.isDM) return true  // DM sees everything

  if (user.isSpectator) {
    // Spectators see IC, OOC, global system only
    return message.type in ['IC', 'OOC'] ||
           (message.type === 'System' && message.isGlobal)
  }

  // Player logic
  switch (message.type) {
    case 'IC':
      return context.sessionGroupHistory.has(message.groupId)

    case 'OOC':
      return globalOOCEnabled ||
             context.sessionGroupHistory.has(message.groupId)

    case 'Whisper':
      return user.id === message.senderId ||
             message.targets.includes(user.id)

    case 'System':
      return message.isGlobal ||
             context.sessionGroupHistory.has(message.groupId)

    case 'Greenroom':
      return context.currentContextType === 'GREENROOM'

    case 'WhisperGroup':
      return context.currentContextType === 'WHISPER_GROUP'

    default:
      return false
  }
}
```

### **5.2 Archive Query Filtering (History View)**

When viewing campaign history, the client queries prior sessions:

```
function getArchivedMessages(campaignId, sessionId, userId, filter?) {
  query = CampaignMessageArchive.where({
    campaignId,
    sessionId,
    isPersistent: true
  })

  // Apply user's visibility rules to archived messages
  if (!user.isDM) {
    query.where(message =>
      shouldShowMessage(message, user, historicalContext)
    )
  }

  // Apply optional filters
  if (filter?.type) query.where({ type: filter.type })
  if (filter?.groupId) query.where({ groupId: filter.groupId })
  if (filter?.search) query.where(message =>
    message.payload.includes(filter.search)
  )

  return query.orderBy('timestamp').fetch()
}
```

---

## **6. Spectator Ephemeral Model**

Spectators have a **special, ephemeral-only** message model:

### **Visibility**

- See IC, OOC, global System messages
- See only the current session
- **Do not** have campaign history access

### **Storage**

- Spectator messages are **not persisted** to campaign archive
- On disconnect, spectator state is cleared
- If a spectator rejoins a later session, they see only that session (no cross-session memory)

### **Rationale**

Spectators are observers, not participants. They should not create persistent records of the campaign. Their view is session-scoped and ephemeral by design.

---

## **7. Greenroom Message Handling**

Greenroom messages have a special lifecycle:

### **During Greenroom**

- Visible to greenroom occupants only
- Persisted to volatile session store
- Not logged or recorded

### **At Session Boundary (CLEANUP)**

- Marked with `isPersistent: false` flag
- Purged from volatile store
- **Not** written to campaign history (unless DM manually archives)

### **Visual Feedback**

- When leaving greenroom, greenroom messages fade to 30% opacity
- Then slide down and collapse
- Then removed from DOM
- But remain in session memory briefly (in case player returns)

---

## **8. Whisper Group Message Handling**

Whisper Group messages are intentionally ephemeral:

### **During Whisper Group**

- Visible to Whisper Group occupants only
- Stored in volatile memory only (not persisted to session store initially)
- Off-the-record: not logged

### **On Whisper Group Exit**

- Default: **messages deleted immediately**
- If DM campaign setting enabled persistence:
  - Messages moved to persistent session store
  - Persisted to campaign history on session end
- This is DM-configurable per campaign

### **Rationale**

Whisper Groups are meant for private, off-the-record side conversations (e.g., DM-player secret negotiations). By default, they leave no trace. The persistence toggle is for DMs who want to keep records (e.g., for campaign narrative purposes).

---

## **9. Session Cleanup & Archival**

### **9.1 Automatic Cleanup (Session End)**

When a session ends:

1. **Mark session as ENDED**
2. **Insert system boundary message** `[Session Ended]`
3. **Batch query** all persistent messages in session
4. **Write to PostgreSQL** `CampaignMessageArchive` table
5. **Clear volatile session state**
6. **Purge ephemeral messages**:
   - Greenroom (if not manually archived)
   - Whisper Group (if persistence not enabled)

### **9.2 Manual Archival (DM Action)**

DM can manually archive messages:

- Export a session as JSON/PDF
- Tag messages for special treatment
- Purge greenroom/whisper group selectively
- Create campaign summaries or session recaps

---

## **10. Campaign History Panel UI**

### **10.1 Access**

- Players: access via Header Bar "History" button
- DM: access via Header Bar "History" button
- Spectators: **no access**

### **10.2 Session List**

Shows prior sessions with:

- Session date/time
- Duration
- Player count
- Optional DM notes/title

### **10.3 Message Search & Filter**

Within a session view:

- Full-text search
- Filter by type (IC, OOC, Whisper, System)
- Filter by group/context
- Filter by sender
- Sort by date

### **10.4 Read-Only View**

Archived messages show:

- "Archived" badge (visual indicator)
- Original timestamp
- Full message context (group, type, visibility)
- Sender and targets (for whispers)
- **No composer** (read-only)

---

## **11. Data Structures**

### **11.1 Campaign Message Archive (PostgreSQL)**

```ts
interface CampaignMessageArchive {
  id: string // Auto-PK
  campaignId: string
  sessionId: string

  // Message data
  messages: ChatMessage[] // JSON array

  // Session metadata
  startedAt: Date
  endedAt: Date

  // Participants
  playerIds: string[]
  dmId: string
  spectatorIds?: string[]

  // Archival info
  archivedAt: Date
  archivedBy?: string // DM ID if manually archived
  notes?: string // DM notes

  // Indexes for fast queries
  createdAt: Date
  updatedAt: Date
}
```

### **11.2 Chat Message (with session context)**

```ts
interface ChatMessage {
  id: string
  sessionId: string // Which session
  campaignId: string // Which campaign

  timestamp: number
  senderId: string
  type: 'IC' | 'OOC' | 'Whisper' | 'System' | 'Greenroom' | 'WhisperGroup'

  groupId?: string | null
  targets?: string[]
  isGlobal?: boolean

  isPersistent: boolean // Archive this?
  isEphemeral?: boolean // Delete on exit?

  styleTag: string
  payload: string

  createdAt: Date
}
```

---

## **12. Implementation Checklist**

- [ ] Add `sessionId` and `campaignId` to ChatMessage model
- [ ] Add `isPersistent` and `isEphemeral` flags to ChatMessage
- [ ] Create `UserSessionContext` store in Zustand
- [ ] Implement `sessionGroupHistory: Set<string>` in Zustand
- [ ] Update filtering algorithm in frontend to use `sessionGroupHistory`
- [ ] Create `CampaignMessageArchive` table in Prisma schema
- [ ] Implement batch archival endpoint (`POST /api/campaigns/:id/sessions/:sessionId/archive`)
- [ ] Implement history query endpoint (`GET /api/campaigns/:id/history/sessions`)
- [ ] Build History panel UI component
- [ ] Add session boundary system messages on session state transitions
- [ ] Implement Greenroom message fade animation
- [ ] Implement Whisper Group message deletion on exit
- [ ] Add DM toggle for Whisper Group persistence
- [ ] Test message retention across group moves
- [ ] Test archive query filtering by user visibility rules
- [ ] Test spectator ephemeral model (no history access)

---

## **13. Key Principles Summary**

1. **Experience Persistence:** Players retain all messages they've witnessed in a session.
2. **Session Isolation:** New sessions start fresh; prior sessions in history panel.
3. **No Trapped Messages:** `sessionGroupHistory` ensures messages don't disappear when players move groups.
4. **Ephemeral Defaults:** Whisper Groups and Greenroom are off-the-record by design.
5. **Spectator Separation:** Spectators have session-only, ephemeral views; no campaign history.
6. **DM Transparency:** DM sees all messages and can review/export sessions.
7. **Boundary Markers:** System bookends (`[Session Started]`, `[Session Ended]`) anchor campaign timeline.

# **Developer Quick‑Reference Sheet**

## Core Architecture (At a Glance)

- **Unidirectional flow:**
  `UI → Event → Reducer → Store → UI`

- **Reducers:**
  Pure, deterministic, no side effects, no async, no DOM access.

- **Stores:**
  Zustand. Selector‑driven. No derived state. No UI‑only state.

- **Events:**
  Namespaced, validated, permission‑checked, privacy‑checked.

- **Transport:**
  WebSocket or Extension Bridge — both treated identically by reducers.

- **Hydration:**
  Full state snapshot replaces local state on reconnect.

---

## Event Design Rules

### **Event Naming**

```text
<domain>.<subdomain>.<action>
```

Examples:

- `chat.message.send`
- `notes.shared.update`
- `audio.effect.trigger`
- `session.pause`

### **Event Payload Rules**

- Minimal, explicit, validated.
- No derived data.
- No UI hints.
- No role‑dependent fields.

### **Event Lifecycle**

1. UI dispatches event
2. Validator checks schema + permissions
3. Reducer applies state change
4. Store updates
5. UI re-renders

---

## Reducer Rules

- Must be **pure**
- Must be **deterministic**
- Must **never throw**
- Must **never mutate** state
- Must **never**:
  - Access DOM
  - Access browser APIs
  - Perform async work
  - Read global state outside reducer inputs

Reducers compute the next state _only_ from `(state, event)`.

---

## Store Rules (Zustand)

- Use selectors everywhere.
- No deep nesting.
- No derived state (compute via selectors).
- No UI‑only state (keep that in React).
- No cross‑store mutation.

---

## Privacy & Permissions (Critical)

### **Privacy**

- Private notes → creator only
- Whispers → sender, recipient, DM
- DM notes → DM only
- No implicit visibility
- Extension cannot access private or DM‑only data

### **Permissions**

- DM controls session
- Players cannot modify others’ notes
- Spectators are read‑only
- Validators enforce all role boundaries

---

## UI Rules

- Role‑aware (DM/Player/Spectator)
- Non‑blocking (never interfere with VTT)
- Motion reinforces meaning (subtle, fast)
- Panels are modular, dockable, collapsible
- No hidden behaviours or surprises

Responsive shell modes:

- `<=767px`: Minimalist Mobile (chat-first, compact left column, bottom-docked tool icons)
- `768px-1279px`: Balanced Player (primary target around `~900px`)
- `>=1280px`: DM Desktop Command (one right panel pinned open; DM auto-enabled, others opt-in)

### Connection Status Canonical Names

Use roadmap-defined canonical names across frontend/backend/admin:

- `coreWsState`: `CONNECTED | CONNECTING | ERROR`
- `livekitState`: `CONNECTED | CONNECTING | ERROR | NOT_APPLICABLE`
- `statusContext`: `OUTSIDE_CAMPAIGN | INSIDE_CAMPAIGN`
- `statusIconState`: `OK | OK_PARTIAL | CONNECTING | DEGRADED_AUDIO | ERROR`
- `statusColorKey`: `GREEN | PALE_GREEN | YELLOW | ORANGE | RED`

Implementation boundaries:

- Put shared enums/types in `shared/`.
- Keep admin presentation constants in admin-local constants, but map to shared enum names.

### **UI Modernization Guardrails**

- Frontend core UI target: Radix UI + Tailwind + token-backed CSS variables
- Admin UI target: MUI with `admin/src/theme.ts`
- Frontend and admin remain separate apps; do not create a shared frontend `src/admin/`
- Use current stable package releases only for framework adoption
- Remove legacy CSS only after the replacement surface is verified
- Keep persona logic out of shared primitive components

### Workspace Panel Scroll Containment Guardrails

- Internal scrolling requires a definite ancestor height (`height: <px>` or `height: calc(100dvh - <offset>)`).
- Do not depend on `height: 100%` or `flex: 1` alone for scroll containment.
- Apply `min-height: 0` on intermediate flex/grid wrappers.
- Put `overflow-y: auto` only on the intended inner scroller; parent wrappers should generally use `overflow: hidden`.
- Verify that overflowing content scrolls inside the panel and does not make document/html scroll.

### Workspace Error Presentation Guardrails

- Transient runtime failures (save/upload/network/submit) must use shared toast dispatch (`useToast` / toast center).
- Avoid adding inline transient error blocks that change panel height and can perturb scroll behavior.
- Keep user-facing messages deterministic and brief.

---

## Extension Rules

- Overlay‑first
- Non‑destructive
- VTT‑agnostic
- DOM‑safe (read‑only unless explicitly allowed)
- Role‑aware
- Cannot access private data

---

## State Recovery (Rehydration)

Triggered on:

- Reconnect
- Refresh
- Extension bridge reconnect
- Local inconsistency

Hydration event:

```text
system.state.hydrate
```

Rules:

- Full state snapshot
- Replace, don’t merge
- Atomic
- Pure reducer

---

## Testing Checklist (Manual or Automated)

Before submitting a PR:

- Does the feature follow event → reducer → store flow?
- Are reducers pure and deterministic?
- Are permissions enforced?
- Are privacy rules respected?
- Does the UI behave correctly for all roles?
- Does the extension remain non‑blocking?
- Does hydration restore correct state?
- Are docs updated?
- If UI was migrated, does it meet the current work-package acceptance criteria in `docs/changes/DESIGN-SYSTEM-CHANGES.md`?

---

## Runtime Freeze / Churn Triage (Frontend)

Use this flow when the app appears frozen or GC/CC pressure spikes during active sessions.

### 1) Enable Opt-In Churn Diagnostics

Two toggles are supported (both are off by default):

- Env toggle:

```bash
VITE_DEBUG_CHURN_METRICS=1
```

- Runtime toggle (browser console):

```js
window.__VTT_DEBUG_CHURN__ = true
```

Related legacy store update debug toggle (still supported):

```bash
VITE_DEBUG_STORE_UPDATES=1
```

### 2) Capture Signal

- Reproduce the freeze path (usually ACTIVE session with heavy WS churn).
- Collect Firefox Performance profile (or equivalent).
- Correlate with `store.churn` logs from frontend logger output.

`store.churn` snapshots report totals + deltas for:

- session messages
- outgoing queue size
- typing indicators
- WS speaking set size
- LiveKit speaking set size
- room member totals
- LiveKit connection totals

### 3) Prioritize Likely Hot Paths

These reducers were hardened to reduce no-op writes and transient allocations:

- `frontend/src/state/chatSlice.ts`
- `frontend/src/state/presenceSlice.ts`
- `frontend/src/state/greenroomSlice.ts`
- `frontend/src/state/livekitSlice.ts`
- `frontend/src/state/roomSlice.ts`

If regressions reappear, inspect those files first for:

- unnecessary object/array reconstruction on no-op events
- duplicate event paths that still write state
- per-event `Object.entries/Object.values/filter/map` pipelines in hot loops

### 4) Success Criteria

- Lower frequency/duration of `GCMinor` pauses in profiler captures
- Lower `eventDelay` peak during stress windows
- Stable or slower-growing `store.churn` deltas for typing/speaking/message totals
- No functional regressions in session lifecycle, chat, or room transitions

### 5) Leaf-Isolation Check for Per-User Transient UI

If the regression involves freeze under speaking/presence/mute/ghost churn, verify the
leaf-isolation pattern is intact:

- Per-user transient bits (speaking, online/offline, ghost, mic mute) must be rendered
  via the memoized leaves under `frontend/src/components/workspaces/session/rooms/`:
  `SpeakingIndicator`, `PresenceIndicator`, `GhostIndicator`, `MicMutedIndicator`.
- Each leaf must `useStore` a **single primitive** selector for that user's bit.
- Parent participant shapes (`GroupParticipantStatus`, `MockPartyMember`, etc.) must
  **not** carry `presenceState` / `ghost` / `isMuted` / `speaking` fields. Any field
  leaking back in re-invalidates every participant on any flip and rebuilds every Radix
  Tooltip/Popover subtree.
- `AvatarOverlay` should only receive `presence={{sessionId, userId, isSelf?, roomType?}}`.
- For list-of-cards (e.g. `PartyPanel.PartyMemberCard`), the card must be `React.memo`
  and the parent must merge with a reference-preserving helper so unchanged cards keep
  their identity.
- Cascading visual styles must use CSS `:has(.leaf-class)`, not parent className threading.

Full contract: `.github/copilot-instructions.md` → "Leaf-Isolation Pattern for
High-Frequency Per-User UI Bits".

---

## Prisma Local Recovery (Copy-Paste)

Use this when local Prisma migrations fail with `P1010` (access denied) or `P3018` (failed migration / drift).

Warning:

- Local/dev only.
- This will drop and recreate local DB `vtt-chat`.
- All local DB data is lost.

1. Verify local postgres login:

   ```bash
   export PGPASSWORD='<postgres-password>'
   psql -h localhost -U postgres -d postgres -c "select current_user, current_database();"
   ```

2. Ensure Prisma CLI reads env:

   ```ts
   // backend/prisma.config.ts
   import 'dotenv/config'
   ```

3. Set backend DB URL:

   ```dotenv
   # backend/.env
   DATABASE_URL=postgresql://postgres:<postgres-password>@localhost:5432/vtt-chat?schema=public
   ```

4. Reset local DB:

   ```bash
   dropdb -h localhost -U postgres --if-exists vtt-chat
   createdb -h localhost -U postgres -O postgres vtt-chat
   ```

5. Apply migrations:

   ```bash
   cd backend
   npx prisma migrate dev --name stage6_rooms_presence_snapshots
   ```

6. Verify:

   ```bash
   npx prisma migrate status
   npm run build
   npm test -- --run
   ```

---

## DEV Diagnostics: Postgres + Prisma Studio

Use this quick path when debugging data issues in the Docker DEV stack.

Assumptions:

- `docker-compose.dev.yml` is running.
- DEV Postgres is exposed on host port `${DEV_POSTGRES_PORT:-5432}`.

1. Connect with `psql` (host machine):

```bash
export PGPASSWORD='<postgres-password>'
psql -h localhost -p "${DEV_POSTGRES_PORT:-5432}" -U postgres -d vttchat
```

1. Quick sanity check query:

```sql
SELECT id, name, "postSessionChatEnabled", "postSessionChatDurationMs"
FROM "Campaign"
ORDER BY "createdAt" DESC
LIMIT 5;
```

1. Open Prisma Studio against DEV DB:

```bash
cd backend
DATABASE_URL="postgresql://postgres:<postgres-password>@localhost:${DEV_POSTGRES_PORT:-5432}/vttchat?schema=public" \
  npx prisma studio --schema prisma/schema.prisma --port 5555
```

1. Open Studio in browser:

```text
http://localhost:5555
```

---

## File & Folder Conventions

### **Events**

```text
src/subsystems/<name>/events.ts
```

### **Reducers**

```text
src/subsystems/<name>/reducers.ts
```

### **Stores**

```text
src/subsystems/<name>/store.ts
```

### **Selectors**

```text
src/subsystems/<name>/selectors.ts
```

### **UI Components**

```text
src/ui/<domain>/<Component>.tsx
```

### **Docs**

```text
docs/<domain>/<DOCUMENT>.md
```

---

## When Adding a New Feature

1. Define events
2. Define reducer logic
3. Define store shape
4. Add selectors
5. Build UI components
6. Update docs
7. Validate privacy & permissions
8. Test reconnection/hydration
9. Test extension overlay behaviour

---

## Things You Must Never Do

- Mutate state
- Add side effects to reducers
- Add derived state to stores
- Bypass the event system
- Expose private data
- Add role‑dependent logic to reducers
- Block VTT interaction
- Modify VTT DOM directly
- Add undocumented features

---

## Things You Should Always Do

- Use selectors
- Keep reducers pure
- Keep events minimal
- Follow naming conventions
- Respect privacy boundaries
- Respect role boundaries
- Update documentation
- Test reconnection
- Test extension behaviour

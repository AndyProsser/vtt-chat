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

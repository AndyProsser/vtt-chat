# W6: Refactor and Simplification - Detailed Execution Plan

## Executive Summary

W6 focuses on normalizing naming conventions, consolidating code organization, and establishing single-source-of-truth for shared state. This prevents data sync bugs and prepares the codebase for production deployment.

**Critical Constraint:** Breaking changes are acceptable in pre-release. Once auto-deploy is enabled, refactors become risky. This work must complete before release.

## Progress Snapshot (2026-05-05)

- Completed:
  - v1 mounts active for auth, session, presence, rooms, audio, livekit, integrations.
  - Session route aliases implemented (`/members`, `/members/join`, `/members/leave`) without duplicating business logic.
  - Rooms and audio families now expose normalized aliases while retaining legacy paths.
  - Guest auth facade split into role-oriented services (`extension`, `player`, `spectator`, `account-upgrade`) behind a single `guest-auth.service.ts` facade.
  - Centralized v1 mount contract test added at API index level.
  - Frontend livekit token usage moved to v1 path.
  - Admin integrations usage moved to v1 path.
  - Frontend auth/session/rooms/audio/presence path usage migrated to v1 aliases for active runtime surfaces.
  - Legacy cutoff flag coverage added to assert legacy livekit/integrations 404 behavior when disabled.
  - Legacy milestone-labeled backend telemetry test filename removed in favor of behavior-based naming.
- In progress:
  - Session recovery-hardening validation remains pending in later phases.
  - Dedicated `uiSlice` extracted; `commandCenterSlice` now serves as a compatibility shim.
  - Presence ownership extraction completed: `roomSlice` now delegates `sessionPresence` mutations to `presenceSlice` actions.
- Completed since last update:
  - Backend audio consolidation completed with dedicated modules under `backend/src/services/audio/` (`presets.service.ts`, `effects.service.ts`) plus compatibility exports.
  - Frontend audio concern split completed into device/presets/overrides modules while preserving existing store API.
  - AudioPanel refactor completed into a 5-part suite with focused subcomponents and targeted component tests.
- Reference map:
  - See `docs/operations/API-V1-DEPRECATION-MAP.md` for explicit old-to-v1 mappings.

---

## 1. Backend Refactoring

### 1.1 API Route Path Normalization

**Current State:** Mixed naming patterns across auth routes

```
POST /api/auth/extension/guest-login  ← extension-specific
POST /api/auth/player/precheck        ← player-specific
POST /api/auth/player/guest-join      ← player guest flow
POST /api/auth/spectator/guest-join   ← spectator guest flow
POST /api/auth/login                  ← full account
```

**Target State:** Clear semantic versioning with consistent patterns

```
# Auth flows (versioned)
POST /api/v1/auth/join/guest/player        (replaces player guest-join)
POST /api/v1/auth/join/guest/spectator     (replaces spectator guest-join)
POST /api/v1/auth/join/full/player         (replaces player full-join)
POST /api/v1/auth/validate/player          (replaces player/precheck)
POST /api/v1/auth/login                    (unchanged, full-account login)
POST /api/v1/auth/upgrade                  (guest → full account)
POST /api/v1/auth/handoff/admin            (admin token handoff)
POST /api/v1/auth/handoff/exchange         (accept admin handoff)

# Extension bridge (legacy, keep for now with redirect)
POST /api/auth/extension/guest-login       → /api/v1/auth/join/guest/player (302 redirect)
```

**Rationale:**

- Remove "extension" qualifier (bridge is implementation detail)
- Standardize `{flow}/{role}` pattern
- Version API for future evolution
- Session recovery routes stay unversioned (internal)

### 1.2 Service Consolidation

**Auth services** (currently fragmented):

- `auth.service.ts` ← keep as core
- `auth-user-context.service.ts` ← merge into auth.service
- `guest-auth.service.ts` ← rename to guest-auth/player.service
- `guest-auth.spectator.service.ts` ← rename to guest-auth/spectator.service
- `handoff.service.ts` ← rename to auth/handoff.service

**Session services** (currently fragmented):

- `session.service.ts` ← keep as core
- `session-access.service.ts` ← merge into session.service (smaller file)
- `session-authz.service.ts` ← keep separate (authorization logic)
- `session-boundaries.service.ts` ← merge into session-authz
- `session-logs.service.ts` ← keep separate (audit trail)

**Audio services** (unclear ownership):

- `audio-state.service.ts` ← rename to audio/state.service
- Create `audio/presets.service.ts` ← for preset CRUD
- Create `audio/effects.service.ts` ← for effect application

---

## 2. Frontend Refactoring

### 2.1 Zustand Store Restructuring

**Current Problem:**

- `roomSlice` owns `rooms`, `roomMembers`, `sessionPresence` (unclear boundaries)
- `audioSlice` owns device + presets + overrides + effects (too broad)
- `livekitSlice` isolated (should integrate with audio state)

**Target Architecture:**

```
Store structure (Zustand slices):

sessionSlice
  ├─ sessions (server-canonical)
  ├─ currentSessionId (UI state)
  └─ handlers (CRUD + event dispatch)

roomSlice
  ├─ rooms (server-canonical: organized by session)
  ├─ sessionTopology (derived: rooms + presence joined)
  └─ handlers (room CRUD, membership)

presenceSlice (NEW - separate concern)
  ├─ presence (server-canonical: currentUser presence)
  ├─ sessionPresence (server-canonical: all users in session)
  └─ handlers (presence update, recovery sync)

audioSlice
  ├─ device (user preference: mic on/off, gain, volume)
  ├─ presets (session-active: current environment, distance, condition)
  ├─ dmOverrides (session-active: DM mute/filter per user)
  ├─ broadcastState (session-active: broadcast mode flag + room)
  └─ handlers (preset load, override apply, broadcast toggle)

livekitSlice
  ├─ connections (transient: active WebRTC connections by session)
  ├─ localTrackId (transient: current microphone track)
  ├─ remoteTrackIds (transient: subscribed participant tracks)
  └─ handlers (connection lifecycle)

uiSlice
  ├─ toolbarCenterPaneView (UI only: which tab is open)
  ├─ toolbarRightRailOpen (UI only: right rail collapsed/expanded)
  └─ handlers (toggle actions)

chatSlice (unchanged core)
notesSlice (unchanged core)
metadataSlice (unchanged core)
commandCenterSlice (compat shim during migration)
```

**Key Distinctions:**

- **Server-canonical**: Synced from API, single source of truth
- **Session-active**: Created when session starts, cleared when session ends
- **User preference**: Persisted across sessions (device settings)
- **Transient**: Created at runtime, lost on disconnect (tracks, connections)
- **UI only**: Local to component tree, never synced to server

### 2.2 Component File Organization

**Current State:** Large components in `frontend/src/components/session/`

**Target State:**

- Move oversized files (>300 LOC) to subdirectories
- Extract reusable sub-components
- Keep prop interfaces clear and documented

Example for `AudioPanel.tsx` (currently ~430 LOC):

```
frontend/src/components/audio/
  ├─ AudioPanel.tsx (150 LOC - orchestrator)
  ├─ AudioDevicePanel.tsx (100 LOC - device settings)
  ├─ AudioPresetsPanel.tsx (80 LOC - preset picker)
  ├─ AudioEffectsPanel.tsx (70 LOC - effect toggles)
  ├─ AudioDMOverridesPanel.tsx (100 LOC - DM mute/filter UI)
  └─ AudioPanel.css
```

---

## 3. Data Consistency Fixes

### 3.1 Role/Membership State

**Problem:** User role stored in JWT (global), but player membership role stored in campaign context (scoped).

**Solution:**

- Frontend stores: `user.role` (from JWT, global), `campaignMembershipRole` (from API, scoped)
- Components always check scoped role for campaign-specific authorization
- Added validation tests: ensure JWT role ≠ membership role doesn't allow privilege escalation

### 3.2 Audio Connection State

**Problem:** Split between audioSlice (presets), livekitSlice (connections), useLiveKit hook (management).

**Solution:**

- `audioSlice` owns: device settings, presets, DM overrides (state)
- `livekitSlice` owns: active connections, tracks (transient)
- `useLiveKit` hook: orchestrates lifecycle (effect only, no state ownership)
- Session recovery: rehydrate presets from API, reinitialize livekitSlice as empty

### 3.3 Session Recovery Flow

**Problem:** No explicit documentation of recovery sequence.

**Solution:**

1. User reconnects
2. Frontend calls `GET /api/v1/session/:sessionId` → rehydrates sessionSlice
3. Frontend calls `GET /api/v1/rooms/:sessionId` → rehydrates roomSlice
4. Frontend calls `GET /api/v1/presence/:sessionId` → rehydrates presenceSlice
5. Frontend calls `POST /api/v1/presence/:sessionId/recover` → gets audio state + broadcast state
6. Frontend populates audioSlice with presets + overrides from step 5
7. Frontend calls `GET /api/v1/livekit/token` + reinitializes WebRTC connections

---

## 4. Execution Phases

### Phase 1: Backend API Routes (1-2 days)

- [x] Add `/api/v1/auth/*` routes alongside current routes
- [x] Keep current routes compatible while v1 is active
- [x] Update frontend/admin API clients to use v1
- [x] Tests still pass during transition
- [x] Deploy-ready with both route sets active

### Phase 2: Backend Service Consolidation (1-2 days)

- [x] Merge auth-user-context into auth.service (compat shim retained)
- [x] Split guest-auth flow into role-oriented services behind a single facade
- [x] Consolidate session-access/boundaries into session.service
- [x] Consolidate audio services into audio/ subdirectory
- [x] Run tests; validate exports

### Phase 3: Frontend Zustand Restructuring (2-3 days)

- [x] Create presenceSlice (extract from roomSlice)
- [x] Split audioSlice concerns (device/presets/overrides)
- [x] Extract uiSlice (toolbar state)
- [x] Update store.ts to new composition
- [x] Run tests; validate selectors (targeted state/UI suites)

### Phase 4: Frontend Component Refactoring (1-2 days)

- [x] Split AudioPanel into 5-component suite
- [x] Identify other oversized components (DMAudioControls, SessionInit)
- [x] Extract sub-components with clear interfaces
- [x] Add component-level tests if coverage gaps

### Phase 5: Data Consistency & Recovery (1-2 days)

- [x] Add `campaignMembershipRole` to frontend user type
- [x] Update SessionInit recovery flow
- [x] Add integration tests for recovery sequence
- [x] Document recovery flow in architecture docs

### Phase 6: Validation & Cleanup (1 day)

- [x] Full suite tests (backend + frontend)
- [x] Coverage reports; confirm no regression
- [x] Remove deprecated route handlers
- [x] Update CHANGELOG.md with migration notes

---

## 5. Testing Strategy

### Phase 1-2: Backend Tests

- Existing backend tests should pass with routes redirecting
- Add tests for v1 routes alongside old tests
- Validate redirect chain (old → v1)

### Phase 3-4: Frontend Tests

- Existing component tests updated to new prop interfaces
- New presenceSlice tests (slice actions + selectors)
- Zustand store composition tests
- Selector stability tests (avoid render loops)

### Phase 5: Integration Tests

- Full auth → session → presence recovery flow
- Room state sync after reconnect
- Audio preset recovery after reconnect
- Multi-user presence updates

---

## 6. Rollback Strategy

If issues are discovered during phases:

- **Phase 1-2:** Keep old routes active, redeploy without v1
- **Phase 3-4:** Revert Zustand to old shape, existing components still work
- **Phase 5-6:** Revert to last stable tag

---

## 7. Success Criteria

- ✓ All tests pass (backend + frontend + integration)
- ✓ Coverage metrics stable or improved
- ✓ API routes documented in OPENAPI or equivalent
- ✓ Zustand slices documented with clear state ownership
- ✓ Component interfaces documented
- ✓ Session recovery flow tested and reproducible
- ✓ No data loss or sync bugs during reconnect
- ✓ CHANGELOG updated with migration notes

---

## 8. Timeline

- **Start:** Day 1 (now)
- **Phase 1-2:** Days 1-4 (backend routes + services)
- **Phase 3-4:** Days 5-7 (frontend slices + components)
- **Phase 5:** Days 8-9 (data consistency + recovery)
- **Phase 6:** Day 10 (validation + cleanup)
- **Expected Completion:** 2 weeks (with testing + validation)

---

## 9. Reference Documents

- [Architecture - Event Bus](../architecture/EVENT-BUS.md)
- [Architecture - Session Lifecycle](../architecture/SESSION-LIFECYCLE.md)
- [Subsystems - Audio Engine](../subsystems/AUDIO-ENGINE.md)
- [AI Guidelines](../ai/AI-GUIDELINES.md)

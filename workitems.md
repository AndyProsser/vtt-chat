# Work items

---

## Executive Summary

**Current State:** Stages 0–12 complete; **Stage 13 (Guest Auth + Extension Integration) 60–70% complete** with critical gaps in frontend testing, backend test assertions, and documentation alignment.

**Testing Readiness Gaps:** The platform is **functionally feature-complete** for Stages 0–12, but **Stage 13 needs hardening** before production testing. The biggest gaps are:

1. ✅ Backend guest auth routes exist but lack comprehensive endpoint test coverage
2. ✅ Frontend guest auth components exist but need integrated e2e test scenarios
3. ⚠️ Waitlist auto-promotion logic needs verification for edge cases
4. ⚠️ Browse/campaign discovery filtering logic incomplete in backend
5. ⚠️ Extension preflight → guest-login contract needs verification
6. ⚠️ Permission boundaries not fully validated across Stage 13 endpoints

---

## Stage 13 Completion Status (Detailed)

### Stage 13.1: Backend Guest Auth & Invite Flow

**Completed:**

- ✅ `POST /api/auth/extension/preflight` — account pre-check with four status variants
- ✅ `POST /api/auth/extension/guest-login` — guest player/DM creation and resumption
- ✅ `POST /api/auth/upgrade` — guest → full account upgrade with password validation
- ✅ `POST /api/auth/spectator/guest-join` — spectator guest join with slot availability
- ✅ `GET /api/campaigns/invite/:code/validate` — player invite validation
- ✅ `GET /api/campaigns/watch/:code/validate` — spectator invite validation
- ✅ `GET /api/platform/status` — public platform status endpoint
- ✅ External system authorization guards on all guest endpoints
- ✅ Prisma schema with `User.authType`, `ExternalIdentity`, `SpectatorWaitlist`

**Partially Complete / Needs Hardening:**

- ⚠️ Spectator waitlist logic exists but edge cases unverified (e.g., concurrent joins at capacity, grace period expiry)
- ⚠️ Campaign bootstrap logic implemented but not fully tested for external campaign packet merge conflicts
- ⚠️ Email-based identity matching works but data uniqueness constraints need validation

**Not Started / Gaps:**

- ❌ Backend tests for `POST /api/auth/extension/guest-login` lack assertions for:
  - Existing guest account resumption and data update per sync policy
  - DM role assignment from external campaign packet
  - First-campaign bootstrap atomicity (multi-user concurrent joins)
  - Sync policy enforcement (NONE, DM_ONLY, DM_AND_PLAYERS)
  - Error handling for blocked external systems
- ❌ Spectator waitlist tests incomplete:
  - Waitlist auto-promotion on disconnection + grace period
  - Concurrent join behavior at capacity
  - Position tracking and polling correctness
- ❌ Integration tests missing for complete pre-flight → guest-login → session join flow

---

### Stage 13.2: External Identity & Campaign Linking

**Completed:**

- ✅ `POST /api/integrations/external/sync` — character/campaign update with policy enforcement
- ✅ `GET /api/campaigns/:campaignId/external-links` — DM-only retrieval
- ✅ `POST /api/campaigns/:campaignId/external-links` — DM-only link creation/update
- ✅ Audit logging for all sync and link actions

**Needs Hardening:**

- ⚠️ Sync policy enforcement works but integration tests only cover basic happy path
- ⚠️ Campaign-level field protection (DM-only) not explicitly tested

---

### Stage 13.3: Frontend Guest Auth UX

**Completed:**

- ✅ `/join/:code` route with preflight → extension guest-login flow
- ✅ `/watch/:code` spectator invite page with slot availability and waitlist UX
- ✅ `/browse` campaign discovery for full-account users with privacy enforcement
- ✅ Guest account upgrade prompt in app header
- ✅ Account upgrade form with password validation feedback
- ✅ Spectator waitlist polling with auto-promotion token adoption

**Tests Exist:**

- ✅ Component tests for `/join` preflight and guest-login branch (test line 1–100)
- ✅ Component tests for `/watch` spectator direct join (test line 111–167)
- ✅ Component tests for `/watch` waitlist polling promotion with fake timers (test line 175–310)
- ✅ Component tests for `/browse` with privacy filtering (test line 325–366)

**Gaps / Needs Verification:**

- ⚠️ `/join/:code` full flow test needs explicit extension data packet passing
- ⚠️ Guest upgrade token swap not fully validated (upgrade prompt → upgrade endpoint → new token in auth store)
- ⚠️ Guest account rejection from DM invite link generation not tested
- ⚠️ Spectator → player account transition via re-authenticate path not implemented or tested

---

### Stage 13.4 & 13.5: Extension Integration & VTT Bridges

**Status:** Extension repo exists but integration testing is **deferred** until Stage 13.1–13.3 hardening complete.

- ❌ Extension pre-flight → guest-login contract validation (backend + extension handshake)
- ❌ Silent guest token renewal behavior
- ❌ Roll20 and Foundry as additional external systems (currently DNDBEYOND only in tests)

---

## Critical Items for Testing Readiness

### 1. Backend Test Completeness (HIGH PRIORITY)

**File:** guest-auth-routes.test.ts

Add test coverage for:

```plaintext
❌ POST /api/auth/extension/guest-login
   • New guest account creation (no existing user)
   • Returning guest account with profile update per sync policy
   • DM role assignment from external campaign packet
   • First-campaign bootstrap with concurrent users
   • Error: invite expired / campaign link mismatch
   • Error: full account exists for email
   • Error: external system blocked/unrecognized

❌ POST /api/auth/spectator/guest-join
   • Slot available → immediate token issuance
   • At capacity + waitlist enabled → waitlist entry
   • At capacity + waitlist disabled → 409 error
   • Spectator policy = USERS → 403 for guest
   • Spectator policy = NONE → 403
   • Concurrent joins at boundary (race condition)

❌ Spectator waitlist auto-promotion
   • Disconnection + grace period expiry → promotion
   • Concurrent join after promotion (no double-issue)
   • Position tracking correctness
   • Promoted user can enter session immediately

❌ POST /api/integrations/external/sync
   • Sync policy NONE → no update
   • Sync policy DM_ONLY → DM update allowed, player blocked
   • Sync policy DM_AND_PLAYERS → both allowed
   • Campaign-level fields only updated by DM
   • Audit logging for each variant
```

**Estimated Effort:** 200–300 lines of test code

---

### 2. Frontend Test Completeness (MEDIUM PRIORITY)

**File:** GuestAuthRoutes.test.tsx

Add coverage for:

```plaintext
❌ Extension guest-login with full campaign packet
   • First-connect bootstrap of campaign data
   • Character roster creation from packet members
   • DM assignment from packet.dmExternalUserId
   • Profile update on returning guest
   • Sync policy enforcement in update behavior

❌ Guest account upgrade token swap
   • Upgrade endpoint called with correct password
   • New token returned and stored in auth state
   • Authstate.authType changed from GUEST → FULL
   • Old guest token invalidated

❌ Guest player rejection from restricted flows
   • DM invite-link generation blocked for guest DMs
   • Campaign browse unavailable to guest players

❌ Spectator → full account registration path
   • Registration form with pre-filled email (read-only)
   • Email verification flow
   • Account upgrade with preserved spectator history
   • Re-authentication as player/DM
```

**Estimated Effort:** 150–200 lines of test code

---

### 3. Backend Endpoint Validation (HIGH PRIORITY)

**Items:**

```plaintext
❌ GET /api/campaigns/browse
   • Filtering by spectatorPolicy + discoverable flags
   • Guest player accounts rejected
   • Slot availability shown correctly
   • Private campaigns in results but disabled

❌ GET /api/campaigns/:campaignId/spectator/waitlist-status
   • Status transitions: WAITLISTED → PROMOTED
   • Correct position tracking
   • Token validity check
   • Expired tokens rejected

❌ Campaign external-links authorization
   • DM-only read/write enforcement
   • Non-DM players return 403
   • Audit logging verified
```

**Where:** external-integration.test.ts or new file `campaign-browse.test.ts`

---

### 4. End-to-End Flow Validation (MEDIUM PRIORITY)

Test complete multi-step journeys:

```plaintext
❌ Player invite path (extension required)
   1. Extension runs GET /api/platform/status → online
   2. Extension runs GET /api/campaigns/invite/:code/validate → valid
   3. Extension runs POST /api/auth/extension/preflight → accountStatus=none
   4. User authorizes extension → runs guest-login with campaign packet
   5. Backend bootstrap campaign, create user, assign Player role
   6. SPA receives token, user sees session list

❌ Spectator invite path (no extension)
   1. User opens /watch/:code
   2. GET /api/campaigns/watch/:code/validate → valid, slots available
   3. User enters displayName + email
   4. POST /api/auth/spectator/guest-join → token issued
   5. User enters spectator session view (read-only)
   6. Session ends → spectator slot released

❌ Guest → Full account upgrade
   1. Guest user sees upgrade prompt
   2. Clicks upgrade
   3. Enters password (validated 12+ chars, uppercase, lowercase, number, special)
   4. POST /api/auth/upgrade → token reissued with authType=FULL
   5. Upgrade prompt hidden; full-account features available

❌ DM invite-link management (Campaign Settings)
   1. DM opens Campaign Settings
   2. Sees controls: player invite policy, spectator policy (NONE/GUESTS/USERS)
   3. Can regenerate player invite code (revokes old)
   4. Can generate spectator invite code (separate from player)
   5. Spectator max slots, waitlist toggle, discoverable toggle visible
   6. All changes persist and gate API calls
```

**Where:** New file `backend/tests/integration/stage-13-flows.test.ts`

**Estimated Effort:** 400–500 lines of integration test code

---

### 5. Documentation Updates (MEDIUM PRIORITY)

**Files to update:**

```plaintext
❌ ROADMAP.md
   • Update Stage 13 completion % (currently shows "started" 🟨)
   • Add sub-milestone completion markers
     - Stage 13.1: 70% (need: backend test coverage, edge cases)
     - Stage 13.2: 80% (need: integration test scenarios)
     - Stage 13.3: 85% (need: full flow e2e tests)
     - Stage 13.4: 0% (blocked: waiting for 13.1–13.3 hardening)
   • List critical test gaps explicitly

❌ docs/operations/TESTING-READINESS.md (new file)
   • Pre-production testing checklist
   • Test coverage targets by stage
   • Known limitations before hardening
   • Rollout strategy recommendations

❌ docs/extension/GUEST-AUTH.md
   • Add explicit "Test Coverage Status" section
   • Link to test files for each flow
   • Document expected error codes and retry logic
```

---

## Recommended Testing Roadmap for Production Readiness

### Phase 1: Backend Hardening (1–2 weeks)

**Priority:** HIGH

1. **Expand guest-auth-routes.test.ts**
   - Add 300+ lines of comprehensive endpoint tests
   - Target: 90%+ coverage of guest-login, preflight, spectator-join flows
   - Include error paths and edge cases

2. **Create `backend/tests/api/campaign-browse.test.ts`**
   - Browse endpoint filtering and privacy enforcement
   - Spectator policy variants (NONE, GUESTS, USERS)
   - Discoverable flag and slot availability logic

3. **Verify spectator waitlist atomicity**
   - Concurrent join race conditions
   - Grace period expiry + auto-promotion
   - Position tracking across multiple polls

**Success Criteria:**

- All Stage 13.1–13.3 backend endpoints have >85% line coverage
- Edge cases and error paths documented in tests
- No regressions in Stages 0–12 tests

---

### Phase 2: Frontend Integration Testing (1 week)

**Priority:** MEDIUM-HIGH

1. **Expand existing `/join` and `/watch` component tests**
   - Add campaign packet bootstrap scenarios
   - Token swap verification on upgrade
   - Guest account rejection flows

2. **Create cross-component guest auth flow test**
   - App.tsx routing to guest component flows
   - Auth state transitions (unauthenticated → guest → full)
   - Session entry after guest upgrade

**Success Criteria:**

- All guest auth routes have dedicated test coverage
- Full upgrade and token swap paths tested
- No flakiness with async state updates

---

### Phase 3: End-to-End Integration Testing (1–2 weeks)

**Priority:** MEDIUM

1. **Create `backend/tests/integration/stage-13-flows.test.ts`**
   - Multi-step journeys (invite → join → session)
   - Database state verification after each step
   - Audit log assertions for moderation actions

2. **Test against live/staging backend + frontend**
   - Pre-flight → guest-login → spectator mode
   - Waitlist polling with real timers
   - Spectator → upgrade → player role transition

**Success Criteria:**

- Complete guest flows working end-to-end
- Audit trails and state consistency verified
- Documented known limitations for beta/RC phase

---

### Phase 4: Documentation Alignment (1 week)

**Priority:** MEDIUM

1. **Update ROADMAP.md**
   - Mark Stage 13 milestones with actual test completion %
   - List critical gaps remaining before production launch

2. **Create TESTING-READINESS.md**
   - Test coverage checklist
   - Known limitations and workarounds
   - Rollout strategy (beta → candidate → general availability)

---

## Key Risk Areas & Mitigations

| Risk                                         | Impact                                      | Mitigation                                                |
| -------------------------------------------- | ------------------------------------------- | --------------------------------------------------------- |
| **Concurrent spectator joins at capacity**   | Slot oversell or duplicate promotions       | Add atomic transaction tests; verify pg lock behavior     |
| **Email-based user matching (multi-system)** | Identity confusion or merge errors          | Unit tests for email collision scenarios                  |
| **Campaign bootstrap with first-user race**  | Incomplete campaign data                    | Pessimistic lock or upsert-with-constraint tests          |
| **DM role loss on package mismatch**         | Unexpected role downgrade                   | Explicit permission boundary tests                        |
| **Guest token lifetime and renewal**         | Silent auth failures or over-renewal        | Test guest token expiry and refresh edge cases            |
| **Spectator policy enforcement gaps**        | Unauthorized access to restricted campaigns | Test all policy variants (NONE/GUESTS/USERS) per endpoint |

---

## Summary: What's Ready for Testing?

### ✅ Ready Now (Stages 0–12, Stage 13.1–13.3 basic paths)

- Core chat, notes, presence, rooms, audio infrastructure
- Session lifecycle and DM controls
- Admin console and moderation workflows
- Basic guest auth flows (happy path)
- Spectator invite and join (basic)

### ⚠️ Needs Hardening (Stage 13 edge cases)

- Concurrent spectator join race conditions
- Waitlist auto-promotion and position tracking
- Campaign external data packet bootstrap
- Guest account data sync across external systems
- Extension pre-flight → guest-login contract

### ❌ Not Ready (Stage 13.4–13.5)

- Extension integration (D&D Beyond handshake)
- Roll20 / Foundry external system bridges
- Multi-VTT identity merging

---

## Actionable Next Steps

1. **This week:** Create test spec doc (copy items above to JIRA/GitHub issues)
2. **Week 1–2:** Expand backend guest auth test suite (300+ lines)
3. **Week 2:** Add frontend guest flow integration tests (200+ lines)
4. **Week 3:** Build end-to-end flow tests (400+ lines)
5. **Week 4:** Update ROADMAP.md + create TESTING-READINESS.md
6. **Week 5:** Run full test suite, fix regressions, document known limitations
7. **By Week 6:** Ready for alpha/beta testing with comprehensive coverage

Would you like me to:

1. **Create the test spec file** with detailed test cases for each endpoint?
2. **Write the actual test code** for backend endpoint coverage?
3. **Create the TESTING-READINESS documentation** template?
4. **Generate the ROADMAP.md update** with Stage 13 hardening targets?

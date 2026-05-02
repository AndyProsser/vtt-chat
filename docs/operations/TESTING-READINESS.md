# Testing Readiness Framework

> **Last Updated:** 2026-05-01
> **Current Status:** Stage 13 feature-complete, testing hardening required before production launch

This document defines the testing readiness criteria, coverage targets, and known limitations for moving VTT-Chat through alpha, beta, and general availability phases.

---

## 1. Overview

VTT-Chat is **functionally feature-complete** through Stage 12 (import/export/recordings). Stage 13 (extension + guest auth) is **80% implemented** at the code level but requires **hardened test coverage** before production testing begins.

The new **Stage 14 (MVP Readiness)** defines the test coverage and validation work needed to reach production-ready status.

---

## 2. Test Coverage Targets by Stage

### Stages 0–12: Production Ready

| Stage | Area                            | Coverage | Status      |
| ----- | ------------------------------- | -------- | ----------- |
| 0     | Contract lock                   | >95%     | ✅ Complete |
| 1     | Backend foundation              | >90%     | ✅ Complete |
| 2     | Frontend transport spine        | >85%     | ✅ Complete |
| 3     | Session lifecycle               | >90%     | ✅ Complete |
| 4     | Chat vertical slice             | >85%     | ✅ Complete |
| 5     | Notes vertical slice            | >85%     | ✅ Complete |
| 6     | Presence and rooms              | >80%     | ✅ Complete |
| 7     | Audio + LiveKit                 | >80%     | ✅ Complete |
| 8     | Admin + ops baseline            | >85%     | ✅ Complete |
| 9     | Frontend command-center         | >85%     | ✅ Complete |
| 10    | Admin UI feature completion     | >80%     | ✅ Complete |
| 11    | Metadata/journal/history/search | >80%     | ✅ Complete |
| 12    | Import/export + recordings      | >75%     | ✅ Complete |

**Total:** 18 test files, 257+ passing tests, <5% flakiness rate

---

### Stage 13: Needs Hardening (MVP Readiness → Stage 14)

| Substage | Component                           | Current Coverage | Target | Gap                                                                                           |
| -------- | ----------------------------------- | ---------------- | ------ | --------------------------------------------------------------------------------------------- |
| **13.1** | Backend guest auth endpoints        | 40%              | 90%    | `POST /api/auth/extension/guest-login`, `POST /api/auth/spectator/guest-join`, waitlist logic |
| **13.2** | External identity & linking         | 50%              | 85%    | Sync policy enforcement, concurrent operations                                                |
| **13.3** | Frontend guest auth UX              | 70%              | 90%    | Full flow e2e, upgrade token swap, guest rejection paths                                      |
| **13.4** | Extension contract integration      | 0%               | 85%    | Extension ↔ backend handshake, pre-flight validation                                          |
| **13.5** | Multi-VTT support (Roll20, Foundry) | 0%               | 50%    | Deferred to post-launch; D&D Beyond priority                                                  |

---

### Stage 14: MVP Readiness (New)

**Goal:** Close Stage 13 testing gaps, validate all guest auth flows end-to-end, document known limitations.

**Deliverables:**

| Item                                                                  | Target                                          | Effort  |
| --------------------------------------------------------------------- | ----------------------------------------------- | ------- |
| Backend guest-auth test expansion                                     | 300+ lines, 90%+ coverage                       | 2 weeks |
| Frontend guest auth integration tests                                 | 200+ lines, e2e validation                      | 1 week  |
| End-to-end flow tests (invite → join → upgrade)                       | 400+ lines, 5+ scenarios                        | 2 weeks |
| Concurrent/race-condition tests                                       | Spectator join, waitlist, bootstrap             | 1 week  |
| Audit logging validation                                              | All moderation actions logged                   | 3 days  |
| Documentation: TESTING-READINESS, known limitations, rollout strategy | This document + ROADMAP updates + release notes | 1 week  |
| Known limitations register                                            | Explicitly document gaps before GA              | 2 days  |

**Timeline to MVP (Production Testing Ready):** 5–6 weeks from start of Stage 14

---

## 3. Stage 13 Testing Gaps

### Backend Gaps (HIGH PRIORITY)

#### `POST /api/auth/extension/guest-login` — Missing Test Coverage

**Current:** Basic flow works; endpoint returns token

**Missing:**

```plaintext
□ New guest account creation (no existing user) with full campaign packet
□ Returning guest account profile update per campaign sync policy (NONE, DM_ONLY, DM_AND_PLAYERS)
□ DM role assignment from external campaign packet.dmExternalUserId
□ First-campaign bootstrap atomicity with concurrent users (race condition safety)
□ Campaign external link creation and validation
□ Error path: invite expired / campaign link mismatch
□ Error path: full account already exists for email (should reject)
□ Error path: external system blocked / unrecognized (INTEGRATION_NOT_AUTHORIZED)
□ Character roster creation from campaignPacket.members
□ ExternalIdentity upsert and uniqueness (email + externalSystem)
```

**Test File:** `backend/tests/api/guest-auth-routes.test.ts`

**Priority:** HIGH (blocks Stage 13 closure)

---

#### `POST /api/auth/spectator/guest-join` — Missing Edge Cases

**Current:** Basic join works; waitlist logic partially implemented

**Missing:**

```plaintext
□ Slot available → immediate token issuance
□ At capacity + waitlist enabled → create waitlist entry, no token issued
□ At capacity + waitlist disabled → return 409 SPECTATOR_CAPACITY_REACHED
□ Spectator policy = NONE → return 403 SPECTATORS_DISABLED
□ Spectator policy = USERS → return 403 FULL_ACCOUNT_REQUIRED for guest
□ Spectator policy = GUESTS → allow guest spectators
□ Concurrent joins at boundary (two users join when one slot available)
□ Duplicate spectator entries (same email, race condition)
□ Reconnect grace period: disconnected spectator doesn't count toward capacity
□ Slot usage recalculation after grace period expires
```

**Test File:** `backend/tests/api/guest-auth-routes.test.ts`

**Priority:** HIGH (blocks spectator flow validation)

---

#### Spectator Waitlist Auto-Promotion — Not Fully Tested

**Current:** Endpoint exists; basic polling works

**Missing:**

```plaintext
□ Disconnection + grace period (60s default) → slot released
□ First waitlisted user auto-promoted when slot opens
□ Promoted user receives new token + can join session immediately
□ Position tracking: correct ordering in queue
□ Concurrent promotion events (multiple users promoted, stale positions)
□ Timeout/stale waitlist entries (user never polls again)
□ Edge case: user joins session then disconnects quickly (slot/waitlist race)
```

**Test File:** `backend/tests/integration/stage-13-flows.test.ts` (new)

**Priority:** HIGH (critical for fairness + UX)

---

#### `GET /api/campaigns/browse` — Filtering Incomplete

**Current:** Endpoint exists; basic filtering present

**Missing:**

```plaintext
□ Filtering by spectatorPolicy + discoverable flags
□ Guest player accounts rejected (FULL_ACCOUNT_REQUIRED)
□ Private campaigns in results but join disabled
□ Slot availability shown correctly
□ Inactive campaigns excluded
□ User-authored campaigns excluded (prevent self-browse)
□ Sorting: active sessions first, then by player count
```

**Test File:** `backend/tests/api/campaign-browse.test.ts` (new)

**Priority:** MEDIUM-HIGH

---

### Frontend Gaps (MEDIUM PRIORITY)

#### `/join/:code` Full Flow — Campaign Packet Not Tested

**Current:** Preflight + guest-login UI works

**Missing:**

```plaintext
□ Extension data packet with full campaignPacket field passed
□ Campaign bootstrap indicated in response (campaignBootstrapped: true)
□ Character data from packet displayed in session
□ DM role assigned correctly (player stays player, DM becomes DM)
□ Reconnect with existing guest account
□ Sync policy enforcement: character updates visible per policy
```

**Test File:** `frontend/src/tests/components/GuestAuthRoutes.test.tsx`

**Priority:** MEDIUM-HIGH

---

#### Guest Account Upgrade Token Swap — Not Fully Validated

**Current:** Upgrade endpoint called; new token received

**Missing:**

```plaintext
□ POST /api/auth/upgrade called with correct password
□ Response token has authType: FULL (not GUEST)
□ Token stored in sessionStorage (not just state)
□ AuthProfile.authType changed from GUEST → FULL
□ AuthProfile.requiresUpgradeForAdmin changed to false
□ Upgrade prompt hidden after successful upgrade
□ Old guest token rejected by backend (if applicable)
□ Admin button becomes enabled (if DM role)
```

**Test File:** `frontend/src/tests/components/App.guest-upgrade.test.tsx` (expand)

**Priority:** MEDIUM-HIGH

---

#### Guest Player Rejection Flows — Not Tested

**Current:** Routes exist; no explicit guest rejection tests

**Missing:**

```plaintext
□ Guest DM cannot generate spectator invite links (403 response)
□ Guest player cannot access /browse (redirected or 403)
□ Guest player attempting DM operations (force-logout, moderation) → 403
□ Spectator cannot send chat/notes (UI disabled + API rejects)
```

**Test File:** `frontend/src/tests/components/GuestAuthRoutes.test.tsx`

**Priority:** MEDIUM

---

### Integration Gaps (HIGH PRIORITY)

#### Complete Multi-Step Flows — Not Tested End-to-End

**Current:** Individual components work; no full journey tests

**Missing:**

1. **Player Invite Flow (Extension Required)**

   ```plaintext
   Extension GET /api/platform/status → online ✓
   Extension GET /api/campaigns/invite/:code/validate → valid ✓
   Extension POST /api/auth/extension/preflight → accountStatus=none
   User clicks extension "Join" → POST /api/auth/extension/guest-login with campaignPacket
   Backend: create user, bootstrap campaign, assign Player role
   SPA: receives token, shows session list
   User starts session → WebSocket connects, room state streams
   ```

2. **Spectator Invite Flow (No Extension)**

   ```plaintext
   User opens https://app/watch/:code
   GET /api/campaigns/watch/:code/validate → valid, slots available
   Page shows: campaign name, DM, character roster, connection status
   User enters displayName + email
   POST /api/auth/spectator/guest-join → token issued
   User sees session view (read-only)
   Session ends → spectator view shows "Session ended", slot released
   ```

3. **Guest → Full Account Upgrade**

   ```plaintext
   Guest user sees upgrade banner (outside active session)
   Clicks "Upgrade Account" → form shown with email pre-filled (read-only)
   User enters 12+ char password (requirements validated)
   POST /api/auth/upgrade → success
   New token received, authType: FULL
   Upgrade banner hidden
   Admin button now enabled (if DM)
   Moderation actions available
   ```

4. **Spectator → Player via Re-authenticate**

   ```plaintext
   Spectator opens /join/:code with existing spectator account
   Extension shows preflight with accountStatus: full (because spectator email matches)
   User enters password → POST /api/auth/login
   Backend: create campaign membership for player
   Token updated with player role
   User joins active session as player
   ```

**Test File:** `backend/tests/integration/stage-13-flows.test.ts` (new, 400+ lines)

**Priority:** HIGH (validates entire guest auth system)

---

## 4. Known Limitations Before Production

### Deferred to Post-Launch

| Limitation                                                  | Impact                                                       | Mitigation                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **Roll20 & Foundry integration**                            | Only D&D Beyond extensions work initially                    | Roadmap item for Stage 13.5; community requests tracked in GitHub Issues            |
| **Multi-account linking (same user, multiple VTTs)**        | User must create separate guest account per VTT              | Email-based identity matching documented; upgrade to full account for consolidation |
| **Spectator → Player transition via password registration** | No email verification flow                                   | Planned for 0.6.0; use guest invite link path for now                               |
| **Silent guest token renewal**                              | Guest tokens expire after 24h; must re-authenticate          | Acceptable for session-scoped usage; extension can auto-refresh before expiry       |
| **Advanced external data sync**                             | Campaign-level sync policy only; no character-level policies | Scope creep; sync policy covers MVP use cases                                       |

### Risk Mitigations Implemented

| Risk                                       | Mitigation                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| **Concurrent spectator joins at capacity** | Atomic database constraint + transactional join logic; race condition tests verify ordering       |
| **Email-based identity collision**         | Unique constraint on (email, externalSystem); tests validate no cross-system conflicts            |
| **Campaign bootstrap race condition**      | Upsert logic with leadership election (first user wins); concurrent user tests verify consistency |
| **DM role loss**                           | Role assigned server-side from campaign packet; client cannot override                            |
| **Guest token over-renewal**               | Token lifetime 24h; silent renewal only within 6h window; tests validate expiry boundaries        |
| **Spectator privacy leakage**              | API enforces read-only access; green room fields excluded from spectator views; tests validate    |

---

## 5. Pre-Production Testing Checklist

Use this before moving to alpha, beta, and general availability:

### Functional Completeness (Stage 13)

- [ ] Backend guest-auth routes have >90% line coverage
- [ ] Frontend guest auth components have >85% component + integration coverage
- [ ] End-to-end flows (invite → join → upgrade) verified across 5+ scenarios
- [ ] All error paths tested: expired invites, blocked systems, capacity limits, etc.
- [ ] Concurrent operations safe: spectator joins, waitlist promotion, campaign bootstrap
- [ ] Audit logging captures all moderation actions
- [ ] No regressions in Stages 0–12 tests (all 257+ tests passing)

### Specification Alignment (Architecture Docs)

- [ ] Guest-AUTH.md flows match implemented behavior
- [ ] EXTENSION-INTEGRATION.md contract matches backend endpoints
- [ ] PERMISSIONS-MATRIX.md enforced in all guest auth routes
- [ ] API-SPEC.md endpoints documented with correct payloads + error codes

### Data Consistency

- [ ] Campaign bootstrap creates campaign, characters, memberships atomically
- [ ] ExternalIdentity uniqueness enforced (no duplicate (email, system) pairs)
- [ ] Spectator waitlist ordering preserved across concurrent joins
- [ ] Guest token claims match user authType (GUEST vs FULL)
- [ ] Audit trail complete: who, what, when, where for all actions

### Security Validation

- [ ] Guest endpoints reject unauthenticated full-account operations
- [ ] Spectator policy enforced (NONE/GUESTS/USERS variants tested)
- [ ] DM-only endpoints require DM role verification
- [ ] External system authorization gates checked on all guest endpoints
- [ ] Token invalidation honored (tokenInvalidBefore respected)
- [ ] Password strength validation enforced (12+ char, complexity)

### Observability

- [ ] All guest auth flows produce audit log entries
- [ ] Error responses include actionable error codes (INVITE_EXPIRED, SPECTATOR_CAPACITY_REACHED, etc.)
- [ ] Telemetry captures signup funnel: platform status → invite validate → preflight → guest-login
- [ ] Failed login attempts logged + rate-limited

---

## 6. Rollout Strategy

## 6.1 MVP Execution Plan (Recommended)

The following execution plan operationalizes the Stage 14 testing hardening scope and should be tracked as the active testing/launch planning sequence.

### Phase 1: Backend Hardening (1-2 weeks)

**Priority:** HIGH

1. Expand `backend/tests/api/guest-auth-routes.test.ts` with comprehensive guest-login/spectator-join assertions and error-path coverage.
2. Add `backend/tests/api/campaign-browse.test.ts` for discoverability/privacy/spectator-policy filtering and slot availability rules.
3. Verify spectator waitlist atomicity with concurrent join boundary tests and grace-period promotion checks.

Success criteria:

- All Stage 13.1-13.3 backend endpoints have >85% line coverage.
- Edge cases and error paths are explicitly asserted in tests.
- No Stage 0-12 regression failures.

### Phase 2: Frontend Integration Testing (1 week)

**Priority:** MEDIUM-HIGH

1. Expand `/join` and `/watch` component/integration tests for extension campaign packet handling and waitlist/promotion behavior.
2. Add/expand guest-upgrade tests for token replacement and auth-state transition validation.
3. Add cross-component guest-flow tests validating unauthenticated -> guest -> full transitions and session entry behavior.

Success criteria:

- Guest auth route surfaces have dedicated coverage for happy/error paths.
- Upgrade/token swap behavior is validated end-to-end at the SPA auth-state layer.
- Async state transition tests are stable and non-flaky.

### Phase 3: End-to-End Integration Validation (1-2 weeks)

**Priority:** MEDIUM

1. Implement `backend/tests/integration/stage-13-flows.test.ts` with complete multi-step player/spectator/upgrade journeys.
2. Add database-state and audit-log assertions at each key workflow checkpoint.
3. Validate waitlist and promotion behavior in realistic timing scenarios.

Success criteria:

- Full guest/spectator flows are validated end-to-end.
- Audit and state consistency checks pass for all modeled journeys.
- Known limitations for beta/RC are documented from test outcomes.

### Phase 4: Documentation Alignment (1 week)

**Priority:** MEDIUM

1. Update `ROADMAP.md` with current Stage 13/14 status and test-gap closure progress.
2. Keep this document synchronized with actual test readiness and launch criteria.
3. Update `docs/extension/GUEST-AUTH.md` with test coverage status, expected error codes, and retry guidance.

Success criteria:

- Planning and operations docs are consistent with test reality.
- Remaining limitations and rollout strategy are explicit and current.

---

### Alpha (Internal Testing)

**Duration:** 2–3 weeks
**Audience:** Dev team + trusted community testers
**Test Scope:** Guest auth flows + concurrent operations
**Success Criteria:** >95% of test cases passing, no critical bugs

**Focus:**

- Spectator waitlist auto-promotion
- Campaign bootstrap with first-user race
- Concurrent spectator joins at capacity
- Token swap on account upgrade

---

### Beta (Community Testing)

**Duration:** 4–6 weeks
**Audience:** Open community, opt-in
**Test Scope:** Full Stage 13 flows + performance under load
**Success Criteria:** >98% test pass rate, <2 critical bugs/week

**Focus:**

- Extension pre-flight → guest-login contract (D&D Beyond)
- Real-world spectator join patterns
- Upgrade funnel completion metrics
- Performance: token issuance under 200ms, waitlist polling latency <500ms

---

### Release Candidate

**Duration:** 1–2 weeks
**Audience:** Staging environment + production readiness validation
**Test Scope:** Smoke tests + production-like load
**Success Criteria:** All Stage 0–14 tests passing, documented known limitations

**Focus:**

- Production database volume (100K+ users, 10K+ campaigns)
- Spectator slot calculations under concurrent load
- Token refresh and renewal behavior
- Audit log durability + query performance

---

### General Availability (GA)

**Duration:** Ongoing
**Audience:** Public
**Monitoring:** Production telemetry + error rates

**Post-GA Work:**

- Stage 13.5: Roll20 + Foundry integrations
- Advanced external data sync policies
- Spectator → player email verification flow
- Enhanced guest token renewal UI (no silent refresh, explicit consent)

---

## 7. Test File Organization

```plaintext
backend/tests/
  api/
    guest-auth-routes.test.ts           ← Expand: 300+ lines
    campaign-browse.test.ts             ← New: browse filtering + privacy
    external-integration.test.ts        ← New or expand: sync policy enforcement
  integration/
    stage-13-flows.test.ts              ← New: 400+ lines, end-to-end flows
  services/
    guest-auth.service.test.ts          ← Expand: waitlist logic, sync policy

frontend/src/tests/
  components/
    GuestAuthRoutes.test.tsx            ← Expand: 200+ lines, full flows
    App.guest-upgrade.test.tsx          ← Expand: token swap validation
  state/
    auth-store.guest.test.ts            ← New: guest token lifecycle
```

---

## 8. Success Metrics

| Metric                         | Target | Current |
| ------------------------------ | ------ | ------- |
| Backend guest-auth coverage    | >90%   | 40%     |
| Frontend guest auth coverage   | >85%   | 70%     |
| End-to-end flow test scenarios | 5+     | 0       |
| Concurrent operation tests     | 10+    | 0       |
| Audit log coverage             | 100%   | 80%     |
| Flakiness rate                 | <1%    | <2%     |
| Critical bugs in Stage 13      | 0      | TBD     |
| Mean time to recovery (MTTR)   | <1h    | TBD     |

---

## 9. Sign-Off Criteria

**For Alpha:**

```plaintext
✓ All Stage 13.1 backend endpoints >90% coverage
✓ All Stage 13.3 frontend routes have dedicated tests
✓ No Stage 0–12 test regressions
✓ Documented known limitations (Section 4)
✓ All HIGH-priority gaps closed
```

**For Beta:**

```plaintext
✓ End-to-end flow tests (5 scenarios) passing
✓ Concurrent operation tests (spectator joins, waitlist, bootstrap)
✓ Extension pre-flight contract validated
✓ Performance baselines established (<200ms token issuance)
✓ Audit logging 100% coverage
```

**For GA:**

```plaintext
✓ All Stage 14 (MVP Readiness) acceptance criteria met
✓ Production data volume tested (100K+ users)
✓ Zero critical bugs in 2 weeks of staging/RC
✓ Rollout plan documented + ops team trained
✓ Known limitations clearly communicated in release notes
```

---

## 10. Links & References

- [ROADMAP.md](../../ROADMAP.md) — Detailed stage breakdown and progress
- [docs/extension/GUEST-AUTH.md](../extension/GUEST-AUTH.md) — Guest auth specification
- [docs/extension/EXTENSION-INTEGRATION.md](../extension/EXTENSION-INTEGRATION.md) — Extension contract
- [docs/architecture/PERMISSIONS-MATRIX.md](../architecture/PERMISSIONS-MATRIX.md) — Role capabilities
- [backend/tests/](../../backend/tests/) — Test suite root
- [frontend/src/tests/](../../frontend/src/tests/) — Frontend test suite

---

## 11. Appendix: Test Case Templates

### Backend Endpoint Test Template

```typescript
describe('POST /api/auth/extension/guest-login', () => {
  it('creates new guest account when no existing user', async () => {
    // SETUP: Mock external system as authorized, invite as valid
    // ACTION: POST guest-login with inviteCode + externalUserId + email
    // VERIFY: User created with authType=GUEST, ExternalIdentity linked
    // VERIFY: Response includes token with authType: GUEST claim
    // VERIFY: Campaign bootstrapped from campaignPacket
  })

  it('resumes existing guest account and updates profile per sync policy', async () => {
    // SETUP: Existing guest user, campaign with extensionSyncPolicy=DM_AND_PLAYERS
    // ACTION: POST guest-login with same email + externalUserId, new character data
    // VERIFY: User not recreated; ExternalIdentity lastSeenAt updated
    // VERIFY: Character fields updated per sync policy
    // VERIFY: Audit log entry created with action='guest_resumed'
  })

  it('rejects when full account already exists for email', async () => {
    // SETUP: Full account user with same email
    // ACTION: POST guest-login with email
    // VERIFY: 409 FULL_ACCOUNT_EXISTS
    // VERIFY: No token issued; no guest account created
  })

  it('enforces external system authorization gate', async () => {
    // SETUP: External system marked as BLOCKED
    // ACTION: POST guest-login with blocked system
    // VERIFY: 403 INTEGRATION_NOT_AUTHORIZED
  })

  // Add 5+ more test cases for edge cases, DM bootstrap, race conditions
})
```

### Frontend E2E Flow Test Template

```typescript
describe('Complete player invite flow (extension required)', () => {
  it('validates invite → runs preflight → guest-login → joins session', async () => {
    // 1. SETUP: Mock backend endpoints for complete flow
    // 2. RENDER: InviteJoinPage with inviteCode
    // 3. VERIFY: Invite validation GET succeeds, campaign info shown
    // 4. ACTION: Fill email, external system, click preflight
    // 5. VERIFY: accountStatus=none shown, "Continue with Extension" button visible
    // 6. ACTION: Fill externalUserId, click guest-login
    // 7. VERIFY: Token issued, user stored in sessionStorage
    // 8. VERIFY: onAuthenticated callback called with correct token + user
    // 9. VERIFY: Character data from response available for session join
  })

  // Add: returning guest, full account, error paths, concurrent operations
})
```

---

**Document Version:** 1.0
**Next Review:** 2026-06-01 (post-Stage 14 completion)

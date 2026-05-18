# W0/W11 Next-Cycle Deferrals (2026-05-18)

## Context

This pass prioritized backend coverage threshold closure and backend test stability hardening. To keep scope controlled and avoid partial rollout risk, the following W0 and W11 items are explicitly deferred to the next cycle.

## Deferred W0 Items

1. Right-panel completion follow-through for remaining high-use DM/operator surfaces that are still tracked as in-progress under W0.
2. Topbar Settings and Information panel finish work requiring additional persona-permission and usability pass coverage.
3. Session settings popover final polish and consistency pass where remaining acceptance checks are still open.
4. W0-linked UI interaction hardening that depends on broader runtime contract finalization in W11.

Reason for deferral:

- Current cycle scope was backend-first test and reliability closure, and frontend completion work was intentionally held to avoid cross-surface churn while branch-threshold fixes were landing.

## Deferred W11 Items

1. Complete route/event Class A/B/C matrix coverage for all websocket-visible families still marked in progress.
2. Finish Redis-first mutation-order rollout for remaining families not yet fully migrated.
3. Complete per-family durability mode and retry/idempotency semantics where still in progress.
4. Complete session-audit taxonomy enforcement and integration coverage for all in-scope control-plane actions.
5. Finish state-machine residual items still in progress:
   - ENDED transition asynchronous recording shutdown plus summary/close-out orchestration.
   - Room-change environment-sync enforcement validation pass.

Reason for deferral:

- This cycle targeted branch-threshold closure and test-noise reduction. Remaining W11 items are cross-cutting contract work that should ship as a cohesive implementation + integration-test package rather than piecemeal changes.

## Entry Criteria for Next Cycle

1. Backend coverage gate remains stable at or above configured thresholds across two consecutive CI runs.
2. W11 implementation sequencing is approved for matrix completion, mutation-order enforcement, and audit coverage in one coordinated pass.
3. W0 follow-through is scheduled after W11 sequencing confirmation to avoid frontend behavior drift while runtime contracts are still changing.

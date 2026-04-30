# Work Item Priorities

---

## **Backend**

- Replace all placeholder modules (logging, Redis presence/rate-limit, LiveKit, HTTP router, security middleware, core services).
- Complete durable audio-state recovery and LiveKit reconnect/e2e flows.
- Implement all WebSocket event/handler modules (especially for rooms and metadata).
- Finish all backend test TODOs and skipped tests.
- Ensure all API endpoints are implemented and not just metadata placeholders.

## **Frontend**

- Finalize guest/spectator flows (Stage 13): `/join/:code`, `/watch/:code`, `/browse`, and guest upgrade UX.
- Remove placeholder UI/actions (e.g., ToolbarPlaceholderAction, CommandCenterFrame placeholders).
- Harden audio/LiveKit reconnect and error handling.
- Ensure robust error handling and full e2e test coverage.

## **Admin**

- Replace telemetry metrics placeholders with real data.
- Implement missing admin SPA interaction and route integration/e2e test suites.
- Finalize all UI/UX flows and remove placeholder elements.

## **Shared**

- Ensure all shared types, events, and validators are complete and aligned with backend/frontend.

## **Infra**

- Implement all infra modules (logging, Redis, LiveKit, HTTP, security).
- Remove any default/placeholder secrets and credentials.
- Validate environment/config for production.

## **Docs**

- Update all docs to match the final implementation, especially for audio, extension, and deployment.
- Remove references to stubs/placeholders.
- Ensure deployment/configuration documentation is complete.

---

## **Critical Blockers:**

- Placeholder backend/infra modules.
- Incomplete audio/LiveKit and websocket flows.
- Missing admin e2e/integration tests.
- Any remaining placeholder UI or error handling.
- Outdated/incomplete deployment documentation.

---

## **Next Steps:**

- Prioritize backend infra and service completion.
- Finish Stage 13 guest/extension flows.
- Harden audio/LiveKit and websocket event handling.
- Finalize admin telemetry and e2e test suites.
- Audit and update all documentation.

Let me know if you want a breakdown for a specific area or a checklist for production readiness!

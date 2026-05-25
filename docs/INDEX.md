# VTT-Chat Documentation Index

Welcome to VTT-Chat documentation. Choose your path below:

## For Players & End Users

### [Groups Panel User Guide](guides/user/groups-panel.md)

Learn how to use the Groups panel to see who's speaking, manage your mute status, and understand what badges mean.

**Topics:**

- Understanding speaking indicators (glow animation)
- Using your mute button
- DM muting effects (Silenced spell, whispers, environmental effects)
- Troubleshooting audio issues

---

## For Campaign Admins & DMs

### [Audio Configuration & Mute System](guides/admin/audio-configuration.md)

Comprehensive admin guide for configuring audio, managing mute states, and troubleshooting.

**Topics:**

- Mute system architecture (user mute vs. DM override)
- Session lifecycle and audio state persistence
- DM muting use cases (Silenced spell, off-the-record whispers)
- Configuring room environments
- Troubleshooting common audio issues
- Performance and scalability
- Compliance and privacy

---

## For Developers & Testers

### [Developer Quick Reference](DEV-QUICK-REFERENCE.md)

Fast operational checklist for architecture rules, test flow, and runtime freeze/churn triage.

**Topics:**

- Event/reducer/store rules at a glance
- Runtime freeze/churn triage flow
- Opt-in store churn diagnostics toggles
- Fast recovery and troubleshooting checklists

### [State Stores Architecture](subsystems/STATE-STORES.md)

State-store boundaries, responsibilities, and runtime diagnostics for Zustand slices.

**Topics:**

- Store ownership boundaries
- Action-driven integration model
- Runtime churn diagnostics (`store.churn`) for freeze triage

### [Mock Players Guide](guides/dev/mock-players.md)

Complete guide to using mock players for testing multi-player scenarios without multiple browser instances.

**Topics:**

- Core contract (frontend parity, backend-only mock awareness)
- Persistence parity rules
- Takeover mode lifecycle
- DEV usage checklist and validation flow

### [Mute & Speaking Indicator Architecture](guides/dev/mute-speaking-architecture.md)

Deep technical reference for the entire audio state system.

**Topics:**

- System architecture and state layers (Zustand, Redis, DB)
- Complete data flow diagrams (user mute, DM override)
- Speaking indicator calculation logic
- Mock player simulator implementation
- Avatar animation CSS and wiring
- WS event contracts and API endpoints
- Testing strategy and performance considerations
- Known limitations and future work

### [Mock Player Simulation Engine](guides/dev/mock-simulation-engine.md)

Backend-driven mock player simulation system that makes mocks indistinguishable from real players.

**Topics:**

- Canonical event strategy
- Backend internal state and takeover mapping
- Takeover API surface and authorization rules
- Persistence and reconnect/recovery behavior
- Test matrix for parity and identity switching

### [Mock Testing Panel](guides/dev/mock-control-panel.md)

DEV-only settings interface for configuring mock behavior in real-time.

**Topics:**

- Simulation controls and roster actions
- Take Over Player entry from context menu
- Return to My User control flow
- Active takeover PLAYER pill state
- Accessibility and error-state expectations

### [DMDX Authoring Guide](guides/dev/dmdx-authoring.md)

Developer guide for D&D markdown blocks in Notes/Journal with AI-assisted generation and VS Code workflows.

**Topics:**

- DMDX block authoring flow
- AI prompt templates for all block types
- Validation and repair prompts
- VS Code fenced-language setup and snippets

### [Queue Job Manager Architecture](architecture/QUEUE-JOB-MANAGER.md)

Durable queue and worker blueprint for scheduled and long-running backend tasks.

**Topics:**

- Durable queue model and worker lifecycle
- Retry/backoff, DLQ, idempotency, and checkpoint resume
- Migration path from in-process schedulers
- Operational visibility and job-state policy

### [Transcription and Recording System](architecture/TRANSCRIPTION-RECORDING-SYSTEM.md)

Policy and pipeline contract for post-session recording, transcription, and summary generation.

**Topics:**

- Off-the-record and privacy enforcement
- Queue-managed long-running processing stages
- Restart-safe checkpoint/resume rules
- Artifact/status model and dependency ordering

### [Session State Machine Contract](changes/STATE-MACHINE.md)

Canonical lifecycle and transition contract for `IDLE`, `ACTIVE`, `PAUSED`, `COOLDOWN`, `ENDED`, and `CLEANUP`.

**Topics:**

- Session transition graph and invalid-transition behavior
- Spectator/cooldown lifecycle rules
- State authority and reconnect expectations

### [Operator Runbook](operations/RUNBOOK.md)

Phase 0 operational procedures for restart, backup/restore, incident triage, and log analysis.

### [Telemetry Matrix](operations/TELEMETRY-MATRIX.md)

Phase 0 telemetry coverage matrix mapping signal families to owners, consumers, and alert priorities.

---

## Quick Reference

### For a Quick Test Session

1. Start backend: `npm run dev` (backend folder)
2. Start frontend: `npm run dev` (frontend folder)
3. Open <http://localhost:5173>
4. Mock players automatically seed (5–9 random D&D characters)
5. Create a session → observe mock avatars in Groups panel
6. Test features:
   - Click own mute button → see mute badge appear on your avatar
   - Watch avatars pulse with speaking glow (every 1.2–2.5s, simulated)
   - Mute yourself → speaking glow stops, badge appears
   - Refresh page → mute state persists (recovers from Redis)
   - End session → mute states clear (session-scoped cleanup)

### For API Reference

See endpoints in [Mute & Speaking Indicator Architecture](guides/dev/mute-speaking-architecture.md#api-endpoints-reference):

- `POST /api/audio/mute`
- `POST /api/audio/unmute`
- `GET /api/audio/state/:sessionId`
- `POST /dev/mock-players/*` (DEV only)

### For Troubleshooting

**Players see no speaking glows?**
→ Check [Groups Panel User Guide](guides/user/groups-panel.md#troubleshooting) or [Mock Players Guide](guides/dev/mock-players.md#troubleshooting)

**Mute doesn't persist after refresh?**
→ See [Admin Guide Troubleshooting](guides/admin/audio-configuration.md#troubleshooting-audio-issues)

**Mock player simulator not running?**
→ See [Mock Players Guide Troubleshooting](guides/dev/mock-players.md#troubleshooting)

---

## Document Structure

```text
docs/
├── guides/
│   ├── admin/
│   │   └── audio-configuration.md         # Admin & DM reference
│   ├── dev/
│   │   ├── mock-players.md                # Testing with mock players
│   │   ├── mute-speaking-architecture.md  # Technical deep dive
│   │   └── dmdx-authoring.md              # DMDX workflow and AI prompts
│   └── user/
│       └── groups-panel.md                # End-user guide
└── INDEX.md (this file)
```

---

## Contributing to Documentation

When adding new features to the audio system:

1. **Update the appropriate guide:**
   - New player-facing feature? → `guides/user/groups-panel.md`
   - New admin/DM feature? → `guides/admin/audio-configuration.md`
   - New DEV tool or mock feature? → `guides/dev/mock-players.md`
   - New technical component or API? → `guides/dev/mute-speaking-architecture.md`

2. **Keep examples fresh:**
   - Copy exact code snippets from source (don't paraphrase)
   - Include file paths and line numbers where helpful
   - Update endpoint examples if APIs change

3. **Cross-link related sections:**
   - Link to the tech guide from user/admin guides
   - Link to examples from the architecture guide

---

## Version History

| Date       | Changes                                                                         |
| ---------- | ------------------------------------------------------------------------------- |
| 2026-05-13 | Initial documentation structure; mock players, mute system, speaking indicators |
|            | Mock player simulator with mute awareness                                       |
|            | Avatar speaking highlights and CSS animations                                   |
|            | User/admin/dev guide split for clarity                                          |

---

## Support & Questions

For questions or clarifications:

- **Players:** Ask your DM in the campaign chat
- **DMs/Admins:** Check the troubleshooting section in the Audio Configuration guide
- **Developers:** See the architecture guide; file issues in the project tracker

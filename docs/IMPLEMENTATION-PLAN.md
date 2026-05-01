# VTT‑Chat Implementation Plan

> _A staged implementation plan for the full platform_

This roadmap outlines the complete development sequence for **VTT‑Chat**, from architecture to deployment.
It is designed to guide contributors, GitHub AI, and future maintainers through a clear, structured build process.

The roadmap is divided into **phases**, each containing **stages** that should be completed in order to avoid rework and ensure architectural consistency.

---

## Phase 1 — Foundations

### **1. Architecture Design**

- Define backend, SPA, LiveKit, database, and Redis topology
- Finalize session model, room model, audio model
- Define privacy rules (DM vs player)
- Define metadata, notes, tags, and timeline behavior
- Document all in `docs/ARCHITECTURE.md`

### **2. Repository Structure**

- Establish monorepo layout
- Create folders for backend, frontend, livekit, docker, docs, scripts
- Add initial `.env.example` files
- Add LICENSE, README, CONTRIBUTING, CODE_OF_CONDUCT

### **3. Shared Framework & Types**

- Create shared TypeScript interfaces for:
  - WebSocket events
  - System messages
  - Metadata cards
  - Notes
  - Audio state
  - Conditions & environments
  - Session boundaries
- Establish coding conventions

---

## Phase 2 — Deployment Infrastructure

### **4. Docker Build Automation**

- Backend Dockerfile
- SPA Dockerfile
- LiveKit container
- Postgres + Redis containers
- Build scripts
- GitHub Actions CI (optional)

### **5. Docker Swarm Stack (HomeLab‑friendly)**

- Compose → Swarm conversion
- Redundant backend nodes (optional)
- Postgres volume + backup strategy
- Redis persistence
- Traefik or Caddy routing (Caddy preferred)

### **6. LiveKit Server Build**

- Native LiveKit binary
- `livekit.yaml` configuration
- Token server integration
- UDP port range configuration

### **7. Firewall & NAT Configuration**

- Non‑standard HTTPS ports (e.g., 8443)
- LiveKit WS (7880)
- LiveKit UDP (7881–7980)
- Optional TURN server
- Document router port forwarding

---

## Phase 3 — Data & Realtime Layers

### **8. Database Schema**

- Users
- Campaigns
- Rooms
- Messages
- Metadata cards
- Notes
- Player settings
- DM settings
- Conditions
- Environments
- Session boundaries
- Ping cooldowns
- Admin audit logs

### **9. WebSocket Event Schema**

- Chat events
- Room events
- Audio events
- Condition events
- Environment events
- Metadata events
- Notes events
- Session events
- Presence events
- Ping events

### **10. Backend API Design**

- Auth
- Campaign join
- Room join/leave
- Message send
- Metadata create
- Notes CRUD
- Player/DM settings
- Export logs
- Export/import notes
- Health endpoints
- Admin endpoints (future)

### **11. Backend Implementation**

- Full TypeScript backend
- WebSocket server
- REST API
- LiveKit token generation
- Redis presence & rate limiting
- Error handling & logging
- Privacy enforcement
- Session boundary logic
- Lazy‑load chat history
- Audio override logic
- DM override rules
- Player privacy rules

---

## Phase 4 — Frontend Application

### **UI Modernization Track**

This track standardizes the shipped UI architecture without requiring a single big-bang rewrite.

#### **UM1. Documentation Alignment**

- Align design docs to the current multi-app repository structure
- Define stable-package policy for framework adoption
- Align roadmap and implementation docs to the same migration order

Acceptance criteria:

- Design-system docs, roadmap docs, and implementation docs describe the same migration sequence
- Frontend and admin ownership boundaries are explicit and consistent

#### **UM2. Framework Foundations**

- Add Tailwind + PostCSS to the frontend app
- Add Radix packages and wrapper utilities to the frontend app
- Add MUI packages and `admin/src/theme.ts` to the admin app

Acceptance criteria:

- Frontend and admin install/build successfully with only current stable package versions
- Framework setup lands without mandatory feature rewrites

#### **UM3. Token and Theme Normalization**

- Normalize existing frontend CSS variable tokens into the target contract
- Map Tailwind theme values to token-backed CSS variables
- Move admin visual tokens into the MUI theme

Acceptance criteria:

- Theme behavior remains correct in light and dark modes
- Token naming and ownership are documented and consistent

#### **UM4. Shell and Primitive Migration**

- Create frontend core-ui wrappers for adopted Radix primitives
- Migrate frontend shell/auth surfaces to the tokenized styling path
- Migrate admin shell and common controls to MUI

Acceptance criteria:

- Adopted Radix primitives are used via wrappers only
- Shell surfaces no longer depend on non-dynamic hardcoded inline styles

#### **UM5. Feature Surface Migration**

- Migrate frontend command center, notes, chat, audio, and room controls incrementally
- Migrate admin pages page-by-page to MUI

Acceptance criteria:

- Migrated frontend features use the new wrapper/token path
- Migrated admin pages use MUI primitives instead of custom CSS-first controls

#### **UM6. Cleanup and Enforcement**

- Remove superseded CSS/components after verification
- Update contributor docs, quick reference docs, and verification guidance

Acceptance criteria:

- Cleanup only happens after runtime and test verification
- Architecture boundaries remain enforceable in documentation and review

### **12. SPA UI/UX Design**

- DM panel
- Player panel
- Audio state slide‑out
- Notes panel
- Metadata timeline
- Chat layout
- Room layout
- Avatar overlays
- Environment icons
- Session boundary UI
- Search + tags
- Settings panel
- Effects panel
- Admin panel (optional)

### **13. SPA Core Framework**

- React + TypeScript setup
- Routing
- Global state management
- WebSocket client
- LiveKit client
- Audio engine wrapper
- Theme system
- Persistence layer

### **14. SPA UI Components**

- Chat
- Message cards
- Metadata cards
- Notes
- DM audio panel
- Player audio panel
- Effects popup
- Timeline view
- Search bar
- Tag chips
- Avatar overlays
- Environment indicators
- Right‑click menus
- Session boundary markers
- Export dialogs

### **15. CSS & Styling**

- Theme variables
- Light/dark mode
- DM vs player styling
- Metadata card styling
- Timeline styling
- Audio panel styling
- Responsive layout
- Transition frontend styling to Tailwind utilities backed by design tokens
- Reserve CSS-file removal until replacement surfaces are verified

---

## Phase 5 — Audio & Realtime Integration

### **16. LiveKit Integration**

- Token server
- Room join/leave
- Track subscription
- Audio pipeline creation
- DM voice presets
- Player conditions
- Room environments
- Gain/gate overrides
- Private chat audio rules
- Reapply effects on reconnect
- Audio state slide‑out integration

---

## Phase 6 — Platform Health & Admin

### **17. System Status / Health Page**

- Backend health
- Redis health
- Postgres health
- LiveKit health
- Active rooms
- Active users
- Audio pipeline status
- Ping latency
- Error logs
- CPU/memory usage

### **18. Documentation & User Guides**

- README
- Deployment guide
- Install script guide
- Architecture doc
- Admin app guide (future)
- Troubleshooting guide

---

## Optional Phase — Admin App

### **Admin App Features**

- Campaign management
- Archive/export/delete
- User management
- System performance dashboards
- Historical logs
- Stats from backend, SPA, LiveKit
- Secure access
- Audit logs

---

## Development Flow Summary

1. **Design first**
2. **Infrastructure second**
3. **Data + realtime third**
4. **Frontend fourth**
5. **Audio integration fifth**
6. **Health/admin last**

This order minimizes rework and ensures a stable foundation at every stage.

---

## Notes for Contributors

- Follow the architecture doc
- Respect privacy rules
- DM overrides are session‑scoped
- Player audio settings persist
- Only three system message types exist
- Metadata cards are structured messages
- Private chat is silent
- Session boundaries divide chat history
- Deployment must work on a HomeLab with non‑standard ports

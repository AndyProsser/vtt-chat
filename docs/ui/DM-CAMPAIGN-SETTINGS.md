# DM Campaign Settings: Features & Permissions

**Status**: Design/Planning — Updated 2026-05-07
**Related**: W0 Frontend Surface Completion, Voice Group Panel (UI-COMPONENT-CHANNELS.md)

---

## Overview

DM Campaign Settings provide per-campaign controls for features, permissions, and runtime behavior. These settings are scoped to the campaign level and managed by the DM (campaign owner).

Terminology note: this document uses **Group** as the user-facing label. Existing implementation identifiers may still use `Room`/`room` naming until migration is complete.

---

## 1) Settings Categories

### 1.1 Voice & Audio

**Broadcast Mode**

- **Setting**: `allowBroadcastMode` (boolean, default: `true`)
- **Effect**: If disabled, DM cannot route voice to individual groups; DM voice broadcasts to all connected players.
- **UI**: Toggle in campaign settings panel.
- **Notes**: Useful for smaller campaigns or strict narrative control.

---

### 1.2 Player Conditions (NEW)

**Allow Conditions**

- **Setting**: `allowPlayerConditions` (boolean, default: `true`)
- **Effect**: If disabled:
  - Condition option hidden from radial menu.
  - Condition badges still display for visual reference (read-only).
  - DM cannot apply/remove conditions via UI.
  - Backend may ignore condition mutations from frontend.
- **UI**: Toggle in campaign settings panel.
- **Notes**: DM may disable this to keep focus on story/roleplay without mechanical clutter.

**Condition Pool** (planned enhancement)

- **Setting**: `allowedConditions` (array of condition names, default: all)
- **Effect**: Restricts available conditions to a curated list.
- **Example**: `["Poisoned", "Bleeding", "Asleep"]` — only these can be applied.
- **UI**: Multi-select picker in campaign settings.

---

### 1.3 Group Management

**Allow Group Creation by Players** (planned)

- **Setting**: `allowPlayerRoomCreation` (boolean, default: `false`)
- **Effect**: If enabled, players can create their own breakout groups.
- **UI**: Toggle in campaign settings panel.

**Group Visibility** (planned)

- **Setting**: `roomVisibility` (enum: `public`, `dm-controlled`, `players-hidden`)
- **Effect**: Controls whether players see all groups or only groups they're in.
- **Default**: `public` (all groups visible).

**Main Group Audio Monitoring** (future W0 tail feature)

- **Setting**: `allowSecondaryGroupMainListen` (boolean, default: `false`)
- **Effect**: If enabled, DM can mark selected secondary groups (for example "In Jail") as listen-only monitors of Main group audio.
- **Behavior**: One-way audio only by default (secondary group hears Main; Main does not hear secondary group).
- **UI**: Toggle in Voice & Audio settings plus per-group checkbox in group controls.
- **Scope**: Deferred until after W0 Phase 5 hardening.

---

## 2) UI Location & Hierarchy

### Current (Pre-W0)

- Settings accessible from main campaign dashboard.
- Likely under a "Campaign Settings" or "Admin" tab.

### W0 Integration

- DM Campaign Settings panel should include a subsection for voice/conditions settings.
- Quick toggle for "Allow Conditions" in a settings/gear icon.
- Full settings panel opens from a dedicated "Settings" button.

**Proposed Layout**:

```text
Campaign Dashboard
├─ Campaign Info (name, description, members)
├─ Session Controls (Start, Pause, End)
└─ Settings (gear icon)
    ├─ Voice & Audio
    │   └─ Allow Broadcast Mode [toggle]
    ├─ Player Mechanics
    │   ├─ Allow Conditions [toggle]
    │   └─ Allowed Conditions [multi-select] (if enabled)
    ├─ Group Management
    │   ├─ Allow Player Group Creation [toggle]
    │   └─ Group Visibility [dropdown]
    └─ Notifications & Privacy
        ├─ Notify on Late Join [toggle]
        └─ Privacy Mode (hide player counts) [toggle]
```

---

## 3) Implementation Roadmap

### Phase 1 (W0, Critical)

- [ ] Create `CampaignSettings` table in Prisma schema.
  - `id` (UUID)
  - `campaignId` (UUID, FK)
  - `allowBroadcastMode` (boolean, default: `true`)
  - `allowPlayerConditions` (boolean, default: `true`)
  - `createdAt`, `updatedAt`
- [ ] Add backend API endpoints:
  - `GET /api/v1/campaigns/{id}/settings` — Fetch campaign settings.
  - `PATCH /api/v1/campaigns/{id}/settings` — Update settings (DM only).
- [ ] Create `CampaignSettingsPanel` component in frontend.
- [ ] Wire toggle for "Allow Conditions" in campaign settings.
- [ ] Pass `allowPlayerConditions` flag to RoomSelector via props.
- [ ] Hide Condition option in radial menu if disabled.

### Phase 2 (Post-W0, Nice-to-Have)

- [ ] Add `allowedConditions` array field.
- [ ] Create condition picker/multi-select in settings panel.
- [ ] Implement server-side validation of condition mutations.
- [ ] Add condition filtering on frontend based on pool.
- [ ] Add DM-managed one-way Main group audio monitoring for selected secondary groups.

### Phase 3 (Future)

- [ ] Group creation by players.
- [ ] Advanced group visibility controls.
- [ ] Fine-grained per-group audio routing policies (beyond Main-to-secondary listen-only).
- [ ] Notification and privacy settings.

---

## 4) Data Model (Prisma)

```prisma
model CampaignSettings {
  id                      String   @id @default(cuid())
  campaignId              String
  campaign                Campaign  @relation(fields: [campaignId], references: [id], onDelete: Cascade)

  // Voice & Audio
  allowBroadcastMode      Boolean  @default(true)

  // Player Mechanics
  allowPlayerConditions   Boolean  @default(true)
  allowedConditionNames   String[] @default([]) // Empty = all allowed

  // Group Management
  allowPlayerRoomCreation Boolean  @default(false)
  roomVisibility          String   @default("public") // public | dm-controlled | players-hidden

  // Future W0 tail feature
  allowSecondaryGroupMainListen Boolean @default(false)

  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  @@unique([campaignId])
  @@index([campaignId])
}
```

---

## 5) Backend API Specification

### GET `/api/v1/campaigns/{id}/settings`

**Description**: Fetch campaign settings (accessible to campaign members).

**Response** (200 OK):

```json
{
  "campaignId": "uuid-here",
  "allowBroadcastMode": true,
  "allowPlayerConditions": true,
  "allowedConditionNames": [],
  "allowPlayerRoomCreation": false,
  "roomVisibility": "public",
  "createdAt": "2026-05-01T...",
  "updatedAt": "2026-05-07T..."
}
```

**Error** (403 Forbidden):

- If user is not a member of the campaign.

---

### PATCH `/api/v1/campaigns/{id}/settings`

**Description**: Update campaign settings (DM only).

**Request**:

```json
{
  "allowBroadcastMode": false,
  "allowPlayerConditions": false,
  "allowedConditionNames": ["Poisoned", "Bleeding"]
}
```

**Response** (200 OK):

- Returns updated settings object.

**Errors**:

- 403 Forbidden: User is not the DM.
- 400 Bad Request: Invalid settings values.

---

## 6) Frontend Integration

### RoomSelector Component

**New Prop**:

```typescript
interface RoomSelectorProps {
  // ...existing props...
  campaignSettings?: {
    allowPlayerConditions: boolean
    allowBroadcastMode: boolean
    allowSecondaryGroupMainListen?: boolean
  }
}
```

**Usage**:

```tsx
// Conditionally show/hide Condition option in radial menu
if (campaignSettings?.allowPlayerConditions) {
  radialMenuItems.push({
    label: 'Condition',
    action: openConditionPicker,
    icon: 'medical',
  })
} else {
  // Show disabled state or skip entirely
}
```

### CampaignSettingsPanel Component

**Location**: Right-rail settings modal or dedicated settings screen.

**Structure**:

```tsx
function CampaignSettingsPanel({ campaignId, token, apiUrl, currentSettings, onSettingsChange }) {
  // Render toggles, multi-selects, etc.
  // Call `PATCH /api/v1/campaigns/{id}/settings` on change
}
```

---

## 7) Testing Strategy

### Unit Tests

- [ ] Settings validation (boolean, enum, array types).
- [ ] Default values applied correctly.

### Integration Tests

- [ ] Settings update reflects in API response.
- [ ] DM can update; non-DM gets 403.
- [ ] Settings affect frontend behavior (e.g., radial menu items).

### E2E Tests

- [ ] DM disables conditions; condition option hidden in radial menu.
- [ ] DM re-enables; condition option reappears.
- [ ] Players cannot update settings (403).

---

## 8) Future Expansion

### Additional Settings Ideas

- **Greenroom audio**: Enable/disable mic in greenroom.
- **Spectator audio**: Allow/disallow spectator listening to voice groups.
- **Group audio routing**: Per-group listen-only and relay policy matrix.
- **Session chat retention**: Ephemeral vs persistent (post-session access).
- **Character sheet visibility**: Players see all sheets or only own.
- **Note visibility**: DM-only notes vs shared notes.
- **Recording controls**: Auto-record, manual record, no record.

---

## Appendix: Rationale

### Why Campaign-Scoped Settings?

Different campaigns have different needs:

- Solo adventure may want conditions disabled (less mechanical overhead).
- Large group may want broadcast mode disabled (better isolation between scenes).
- DM wants full control without code changes.

### Why Condition Disabling?

- Some campaigns prioritize story/roleplay over mechanics.
- Reduces UI clutter for campaigns that don't use conditions.
- Non-breaking: condition data still stored, just not mutable via UI.

---

**Document Version**: 1.0
**Next Review**: Upon completion of W0 Phase 1 (conditions feature).

# Campaign & Character Settings: Three-Layer Architecture

**Status**: Design/Planning — Updated 2026-05-11
**Related**: W0 Frontend Surface Completion, [UI-COMPONENTS.md](UI-COMPONENTS.md#77-settingspanel-topbar), [SESSION-LIFECYCLE.md](../architecture/SESSION-LIFECYCLE.md)

---

## Overview

VTT-Chat settings are organized in three distinct layers, each with specific accessibility, editability rules, and persistence scope:

1. **Topbar Layer** (`<SettingsPanel />`) — User account and system defaults
2. **Rightbar Layer** (`<CampaignRightbarSettings />`) — Campaign, session, and character settings
3. **Feature Toggles** — Per-campaign feature flags (separate from user/campaign data)

This document covers all three layers plus feature toggle definitions.

UI implementation contract:

- Any tabbed panel/dialog in this settings surface must use Radix UI Tabs.
- This is especially required for the main/home campaign settings dialog where multiple settings sections coexist.
- Implementations must be componentized (tab shell, section forms, editors, list/detail panes) and avoid monolithic files.

Terminology note: this document uses **Group** as the user-facing label. Existing implementation identifiers may still use `Room`/`room` naming until migration is complete.

---

## Layer 1: Topbar Settings (`<SettingsPanel />`)

**Scope**: User-scoped, outside campaign context
**Accessibility**: All personas
**Editability**: User (own profile only), DM (system defaults only)
**Persistence**: User account database

### 1.1 User Profile

**Editable by**: Self only
**Always visible**: Inside and outside campaigns
**Fields**:

- User name
- Profile avatar
- Email address (outside campaigns only)
- Password reset (outside campaigns only)
- Other account-level settings (TBD)

**Notes**:

- Serves as fallback defaults for character fields if character values are blank.
- Character-scoped settings inherit user profile values unless explicitly overridden.

### 1.2 System Defaults (Templates)

**Editable by**: DM only
**Visible**: All personas (reference-only)
**Editability gate**: Only accessible when outside any campaign
**Fields**:

- Default campaign name
- Default campaign description
- Default session duration (hours:minutes)
- Default group audio auto-target toggle state
- Default character race (default: Human)
- Default character class (default: Fighter)
- Default character level (default: 1)
- Default character stats (default: 8 across STR, CON, DEX, INT, WIS, CHA)

**Effect**:

- System defaults are templates for new campaigns only.
- Never mutate existing campaigns or characters.
- DM can pre-configure defaults to speed up new campaign creation.

**Notes**:

- Character defaults are overridable by campaign-level defaults or player-specific values.
- System defaults serve as the fallback-of-last-resort if no campaign or character defaults exist.

---

## Layer 2: Rightbar Settings (`<CampaignRightbarSettings />`)

**Scope**: Campaign or session-scoped
**Accessibility**: Inside campaign context only
**Editability**: Role-gated and time-gated
**Persistence**: Backend (PostgreSQL for campaign/session/character; Redis for per-session effects)

### 2.1 Campaign Settings

**Editable by**: DM only
**Editability scope**: Anytime (inside or outside active session)
**Fields**:

- Default session duration (hours:minutes)
- Group audio auto-target toggle (boolean; affects all groups in campaign)

**Ownership boundary**:

- Campaign metadata fields (name, description, banner/poster image) are edited in Information > Campaign panel.
- Campaign stats (session count, total session duration) are read-only and shown in Information > Campaign panel.

**Effect**:

- Campaign values override system defaults for all sessions in this campaign.
- Session values may further override campaign defaults (e.g., extend session duration for special event).

**Persistence**:

- Stored in `Campaign` table.
- Restored on every session start.

---

### 2.2 Session Settings

**Editable by**: DM only
**Editability gate**: Editable only during `INACTIVE`, `ACTIVE`, or `PAUSED` session states
**Editability scope**: Locked during `ENDED` state (includes cooldown phase)
**Fields**:

- Session name
- Planned session duration (hours:minutes)
- Session description (TBD)

**Effect**:

- Session values apply to the current session and all subsequent sessions in the same campaign (unless explicitly overridden).
- Players can view but not edit session duration.
- Changing planned duration during `ACTIVE` session does NOT affect timer calculations; only affects next-session display.

**Persistence**:

- Stored in `Session` table.
- Values persist and are restored for next session in the same campaign.

**Notes**:

- Session name is distinct from session display name (which may include date/timestamp).
- Planned duration is used for display and cooldown calculations; actual elapsed time is backend-authoritative.

---

### 2.3 Character Settings

**Editable by**: Players (own character only); DM (view/override capabilities TBD)
**Editability gate**: Anytime
**Visible to**: Player (full edit), DM/other players (view with current effects), Spectators (view-only with effects)
**Fields**:

- Character name (default: user name)
- Race (default: Human)
- Class (default: Fighter)
- Level (default: 1)
- Stats (STR, CON, DEX, INT, WIS, CHA; default: 8 for each)
- Character avatar (default: user profile avatar)
- Applied conditions/effects (read-only live display)

**Effect**:

- Character values override user profile defaults when present.
- Character stats default to Fighter/Human/Level 1/8 (all stats) if left blank by player.
- DM can view and possibly override (implementation TBD).

**Persistence**:

- Stored per character per session (player data).
- Character data is re-created at session start or restored from previous session if player re-joins.

**Notes**:

- Character is a per-session projection; player can have different character profiles across campaigns.
- Stats and profile are primarily for narrative/community display; no mechanical enforcement in Phase W0.

---

## Layer 3: Feature Toggle Definitions

**Scope**: Per-campaign feature flags
**Accessibility**: Campaign-level; typically not exposed in user-facing UI (yet)
**Editability**: Backend only (API call or admin interface)
**Persistence**: `CampaignSettings` table in PostgreSQL

### 3.1 Voice & Audio

**Broadcast Mode**

- **Setting**: `allowBroadcastMode` (boolean, default: `true`)
- **Effect**: If disabled, DM cannot route voice to individual groups; DM voice broadcasts to all connected players.
- **UI**: (Deferred; may be added to rightbar settings in future phase)
- **Notes**: Useful for smaller campaigns or strict narrative control.

---

### 3.2 Player Conditions

**Allow Conditions**

- **Setting**: `allowPlayerConditions` (boolean, default: `true`)
- **Effect**: If disabled:
  - Condition option hidden from radial menu.
  - Condition badges still display for visual reference (read-only).
  - DM cannot apply/remove conditions via UI.
  - Backend may ignore condition mutations from frontend.
- **UI**: (Deferred; may be added to rightbar settings in future phase)
- **Notes**: DM may disable this to keep focus on story/roleplay without mechanical clutter.

**Condition Pool** (planned enhancement)

- **Setting**: `allowedConditions` (array of condition names, default: all)
- **Effect**: Restricts available conditions to a curated list.
- **Example**: `["Poisoned", "Bleeding", "Asleep"]` — only these can be applied.
- **UI**: (Future phase; multi-select picker in campaign settings)

---

### 3.3 Group Management

**Allow Group Creation by Players** (planned)

- **Setting**: `allowPlayerRoomCreation` (boolean, default: `false`)
- **Effect**: If enabled, players can create their own breakout groups.
- **UI**: (Future phase; toggle in rightbar settings)

**Group Visibility** (planned)

- **Setting**: `roomVisibility` (enum: `public`, `dm-controlled`, `players-hidden`)
- **Effect**: Controls whether players see all groups or only groups they're in.
- **Default**: `public` (all groups visible).
- **UI**: (Future phase)

**Main Group Audio Monitoring** (future W0 tail feature)

- **Setting**: `allowSecondaryGroupMainListen` (boolean, default: `false`)
- **Effect**: If enabled, DM can mark selected secondary groups (for example "In Jail") as listen-only monitors of Main group audio.
- **Behavior**: One-way audio only by default (secondary group hears Main; Main does not hear secondary group).
- **UI**: (Future phase; toggle in Voice & Audio settings plus per-group checkbox in group controls)
- **Scope**: Deferred until after W0 Phase 5 hardening.

---

### 3.4 Optional Summary Processing Module (Install-Time Gate)

This feature bundle includes:

- Audio recording ingest
- Offline transcription
- Timeline merge
- Session summarisation

Deployment policy:

- Controlled by platform capability, not only campaign settings.
- Default in production: disabled.
- Must be explicitly enabled during install/initialization.

Canonical capability key:

- `summaryProcessingInstalled` (from platform capability endpoint)

UI behavior when not installed:

- Summary-processing-related controls remain visible but disabled.
- Explanatory copy is required:
  - "Summary processing is not installed on this deployment. Ask your administrator to enable it during system installation."
- Campaign-level toggles for this module must be non-editable when capability is false.

---

## 4) UI Location & Hierarchy

### Pre-W0

- Settings accessible from main campaign dashboard.
- Likely under a "Campaign Settings" or "Admin" tab.

### W0 Integration

**Layer 1 - Topbar SettingsPanel**:

- Accessible from topbar gear icon.
- User Profile section: always editable.
- System Defaults section: DM only, editable outside campaigns.

**Layer 2 - Rightbar CampaignRightbarSettings**:

- Accessible from rightbar tab icon (visible when inside campaign).
- Campaign Settings section: DM editable anytime (non-metadata campaign fields only).
- Session Settings section: DM editable during `INACTIVE|ACTIVE|PAUSED`; locked during `ENDED`.
- Character Settings section: Player editable (own character), full visibility with effects.

**Information Panel - Campaign Tab**:

- DM edits campaign metadata: name, description, banner/poster image.
- All personas see compact read-only campaign stats:
  - Total campaign length (sum of active session durations only)
  - Player count
  - Session count
  - Completed session count
  - Next session ETA (when available)
- Stat explanation text is hidden in tooltip/popper help (definition only).
- Description editor is intentionally basic and supports only bold, italic, bullet lists, and numbered lists.
- Editing happens in-panel with explicit `Save` and `Cancel` actions.
- Poster controls support upload, replace, and remove.

**Feature Toggle Access**:

- Not exposed in W0 user-facing UI; managed via backend API.
- May be added to admin/DM advanced settings in future phase.

---

## 5) Implementation Roadmap

### Phase 1 (W0, Critical)

**Topbar SettingsPanel**:

- [ ] Create User Profile section (name, avatar).
- [ ] Create System Defaults templates section (editable outside campaigns only).
- [ ] Wire user profile edits to backend.
- [ ] Gate System Defaults edits to outside-campaign context.

**Rightbar CampaignRightbarSettings**:

- [ ] Create Campaign Settings section (default duration, auto-target toggle).
- [ ] Create Session Settings section (name, planned duration) with state gates.
- [ ] Create Character Settings section (name, race, class, level, stats, avatar) with defaults.
- [ ] Wire all edits to backend APIs.
- [ ] Persist session values and restore on next session.

**Information Campaign Tab**:

- [ ] Add campaign metadata editor (name, description, banner/poster) for DM.
- [ ] Add simple in-panel metadata editor with explicit Save/Cancel (no autosave).
- [ ] Restrict description formatting to basic markdown affordances: bold, italic, bullet list, numbered list.
- [ ] Add poster upload/replace/remove actions.
- [ ] Add compact read-only campaign stats cards:
  - total campaign length
  - player count
  - session count
  - completed sessions
  - next session ETA
- [ ] Add stat definition tooltip/popper copy for each campaign stat.

**Backend**:

- [ ] Add campaign-level fields: `defaultSessionDurationMinutes`, `autoTargetGroupAudio`.
- [ ] Add session-level fields: `name`, `plannedDurationMinutes`.
- [ ] Create character profile model (per user per campaign).
- [ ] Add backend APIs for all Layer 1 and Layer 2 CRUD operations.

**Feature Toggles**:

- [ ] Create `CampaignSettings` table (see section 4 data model below).
- [ ] Wire `allowPlayerConditions` to radial menu condition visibility.
- [ ] Wire `allowBroadcastMode` to broadcast controls (TBD if visible in W0).

### Phase 2 (Post-W0, Nice-to-Have)

- [ ] Add `allowedConditions` array field and condition pool picker.
- [ ] Implement server-side validation of condition mutations.
- [ ] Expose feature toggle toggles in admin/DM advanced settings UI.
- [ ] Add DM-managed one-way Main group audio monitoring for selected secondary groups.

### Phase 3 (Future)

- [ ] Group creation by players.
- [ ] Advanced group visibility controls.
- [ ] Fine-grained per-group audio routing policies (beyond Main-to-secondary listen-only).
- [ ] Notification and privacy settings.

---

## 6) Data Model (Prisma)

### Campaign Extension

```prisma
model Campaign {
  // ... existing fields
  defaultSessionDurationMinutes    Int      @default(120) // 2 hours
  autoTargetGroupAudio             Boolean  @default(true)
  campaignSettings                 CampaignSettings?
  // ... rest of model
}
```

### Session Extension

```prisma
model Session {
  // ... existing fields
  name                   String   @default("Session")
  plannedDurationMinutes Int      @default(120) // Inherits from campaign if not set
  // ... rest of model
}
```

### Character Profile

```prisma
model CharacterProfile {
  id                String   @id @default(cuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  campaignId        String
  campaign          Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)

  name              String   @default("")
  race              String   @default("Human")
  class             String   @default("Fighter")
  level             Int      @default(1)

  // Stats: each defaults to 8
  strengthStat      Int      @default(8)
  constitutionStat  Int      @default(8)
  dexterityStat     Int      @default(8)
  intelligenceStat  Int      @default(8)
  wisdomStat        Int      @default(8)
  charismastat      Int      @default(8)

  avatarUrl         String?

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([userId, campaignId])
  @@index([campaignId])
}
```

### Feature Toggles (CampaignSettings)

```prisma
model CampaignSettings {
  id                           String   @id @default(cuid())
  campaignId                   String
  campaign                     Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)

  // Voice & Audio
  allowBroadcastMode           Boolean  @default(true)

  // Player Mechanics
  allowPlayerConditions        Boolean  @default(true)
  allowedConditionNames        String[] @default([]) // Empty = all allowed

  // Group Management
  allowPlayerRoomCreation      Boolean  @default(false)
  roomVisibility               String   @default("public") // public | dm-controlled | players-hidden

  // Future W0 tail feature
  allowSecondaryGroupMainListen Boolean @default(false)

  createdAt                    DateTime @default(now())
  updatedAt                    DateTime @updatedAt

  @@unique([campaignId])
  @@index([campaignId])
}
```

---

## 7) Backend API Specification

### GET `/api/platform/capabilities`

**Description**: Returns deployment-level capability flags used by frontend/admin.

**Response** (200 OK):

```json
{
  "summaryProcessingInstalled": false
}
```

---

### GET `/api/campaigns/{id}/settings`

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

### PATCH `/api/campaigns/{id}/settings`

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

### Summary Processing Settings UX

- If `summaryProcessingInstalled=false`, show controls as disabled and render:
  - "Summary processing is not installed on this deployment. Ask your administrator to enable it during system installation."
- If `summaryProcessingInstalled=true`, campaign-level summary controls may be edited (subject to DM role checks).

### CampaignSettingsPanel Component

**Location**: Right-rail settings modal or dedicated settings screen.

**Structure**:

```tsx
function CampaignSettingsPanel({ campaignId, token, apiUrl, currentSettings, onSettingsChange }) {
  // Render toggles, multi-selects, etc.
  // Call `PATCH /api/campaigns/{id}/settings` on change
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

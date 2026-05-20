# **UI-FLOWS.md**

_Authoritative interaction flows for all personas in VTT‑Chat._

---

## 1. Overview

This document defines **moment‑to‑moment UI interaction flows** for:

- DM
- Player
- Spectator

Each flow shows:

1. **User Action (UI)**
2. **Event Emitted**
3. **Reducer Handling**
4. **Store Update**
5. **UI Reaction**

All flows follow:

```text
UI → Event → Reducer → Store → UI
```

No flow violates persona boundaries or privacy rules.

Terminology note: this document uses Group as the user-facing label. Existing implementation identifiers may still use Room or rooms naming.

---

## 2. DM Interaction Flows

DM has the most complete set of flows.

---

### **2.1 DM Moves a Player Between Groups**

**UI Action:**
DM drags a player from one group to another.

**Flow:**

1. `<PlayerList onPlayerDrag>`
   → `players/dragStart`
2. `<PlayerList onPlayerDrop>`
   → `players/dragDrop`
3. Reducer: `roomsReducer.movePlayer`
4. Store updates:
   - `presenceStore.rooms`
   - `presenceStore.players[playerId].roomId`
5. UI updates:
   - Player animates into new group
   - Chat window updates if DM is monitoring that group

---

### **2.2 DM Publishes a Note to Chat**

**UI Action:**
DM clicks “Publish Note” in `<MessageComposer />`.

**Flow:**

1. `notes/publishToChat`
2. Reducer: `chatReducer.publishNote`
3. Store updates:
   - New `ChatMessage` of type `'note'`
4. UI updates:
   - `<NoteCard />` appears in chat
   - Note card animates in (160ms accent pulse)

---

### **2.3 DM Opens a Note in Pop‑Out Viewer**

**UI Action:**
DM clicks “Open Note” on a note card.

**Flow:**

1. `notes/openPopout`
2. Reducer: `uiReducer.openNotePopout`
3. Store updates:
   - `uiStore.activeNoteId = noteId`
4. UI updates:
   - `<NotePopout />` slides in from right

---

### **2.4 DM Applies an Audio Condition**

**UI Action:**
DM opens a player context menu in the Voice Group Panel (right-click desktop / long-press mobile), then selects **Condition**.

**Flow:**

1. `audio/setCondition`
2. Reducer: `audioReducer.setCondition`
3. Store updates:
   - `audioStore.conditions[playerId] = condition`
4. UI updates:
   - Condition icon updates
   - Player item pulses (micro‑interaction)

Notes:

- Context menu actions are `Move`, `Condition`, `Mute`, `Close`.
- `Mute` and `Condition` use DM override endpoints.

---

### **2.5 DM Creates a New Group**

**UI Action:**
DM clicks the `group_add` icon in the Voice Groups panel during session.

Precondition:

- DM can create non-private groups in-session (`ACTIVE` / `PAUSED`).
- In greenroom (`IDLE` / `ENDED`), the Voice Groups panel does not show create controls.
- In greenroom, create controls exist only in the dedicated Groups rightbar management panel.
- DM cannot create **private** groups. Whisper is system-managed and not user-creatable.
- In greenroom, drag/drop movement is disabled; only the Greenroom and any pre-created groups are visible to the DM.
- In greenroom, DM group create/configure/delete actions are performed from the rightbar Groups panel to keep the staging surface pure.
- In greenroom, connected users that report `IDLE` are displayed as `ONLINE` in the panel for clarity.

**Group lifecycle:**

- `GROUP` type rooms (non-greenroom, non-main) are **campaign-persistent**: they survive the end of a session and are restored to the next session for the same campaign.
- If a DM explicitly deletes a `GROUP` room (in-session or greenroom), it is permanently removed.
- `PRIVATE` type room is a single system-managed **Whisper** bubble per started session and is deleted when the session transitions to `ENDED`.
- Greenroom and Main room are fixed per-session and are not carried forward (they are always re-created).

**Group visibility rules:**

- The DM always sees every group in both greenroom and active session.
- Players see a group only once at least one player is a member. When the last player leaves a group, it is hidden again from players.
- In greenroom, players see only the Greenroom (or their assigned group if no named Greenroom exists).

**Empty group display (DM only):**

- When a group has no participants, it collapses to a single-line card.
- The DM voice button is replaced by a red X (close/delete) button.
- Empty groups are excluded from broadcast (no participants to receive audio).
- The environment picker is still accessible on empty groups, allowing the DM to prepare environments ahead of time.

State normalization:

- On transition to `ACTIVE`: all users are moved to `MAIN`; DM condition/mute overrides are cleared; `MAIN` environment modifier is cleared.
- On transition to greenroom states (`IDLE` and paused out-of-session routing): DM condition/mute/broadcast overrides are cleared; Greenroom environment modifier is cleared. Non-group room environments are NOT cleared on transition.
- Non-main, non-greenroom room environments persist across sessions (carry-forward) and are not affected by session state transitions.
- Chat lifecycle markers must remain visible across repeated greenroom/session transitions.

Close-group behavior:

- Closing a non-main group automatically moves any remaining members to `MAIN` before deletion.
- Greenroom cannot be closed.

**Flow:**

1. `rooms/create`
2. Reducer: `roomsReducer.create`
3. Store updates:
   - New group added to `presenceStore.rooms`
4. UI updates:
   - Group appears in `<RoomsPanel />`
   - Left panel updates grouping

---

### **2.6 DM Clears All Audio Effects**

**UI Action:**
DM clicks “Clear All” in `<DMVoiceBar />`.

**Flow:**

1. `audio/clearAllConditions`
2. Reducer: `audioReducer.clearAllConditions`
3. Store updates:
   - All conditions removed
4. UI updates:
   - Red flash animation
   - All condition icons disappear

---

## 3. Player Interaction Flows

Players have a focused, minimal set of flows.

---

### **3.1 Player Sends a Chat Message**

**UI Action:**
Player types and presses Enter.

**Flow:**

1. `chat/sendMessage`
2. Reducer: `chatReducer.sendMessage`
3. Store updates:
   - New chat message added
4. UI updates:
   - Message animates in
   - Composer clears

---

### **3.2 Player Switches Between Chat and Notes**

**UI Action:**
Player clicks `[Chat ▼]` or `[Notes]`.

**Flow:**

1. `ui/toggleChatNotes`
2. Reducer: `uiReducer.setCenterView`
3. Store updates:
   - `uiStore.centerView = 'chat' | 'notes'`
4. UI updates:
   - Center pane switches
   - Slide/fade animation

---

### **3.3 Player Opens a Note in Pop‑Out Viewer**

**UI Action:**
Player clicks “Open Note”.

**Flow:**

1. `notes/openPopout`
2. Reducer: `uiReducer.openNotePopout`
3. Store updates:
   - `uiStore.activeNoteId = noteId`
4. UI updates:
   - `<NotePopout />` slides in

---

### **3.4 Player Toggles IC Mode**

**UI Action:**
Player toggles IC in composer.

**Flow:**

1. `settings/updateAudio`
2. Reducer: `settingsReducer.updateAudio`
3. Store updates:
   - `settingsStore.audio.icMode = boolean`
4. UI updates:
   - IC indicator updates

---

## 4. Spectator Interaction Flows

Spectators are show-state aware.

- During `ACTIVE`, spectators are observational-only.
- During `PAUSED` (intermission), spectators cannot view or hear the session.
- During end-of-session cooldown, spectators can use public stage voice/chat only.

---

### **4.1 Spectator Switches Between Chat and Notes**

**UI Action:**
Spectator clicks `[Chat ▼]` or `[Notes]`.

**Flow:**

1. `ui/toggleChatNotes`
2. Reducer: `uiReducer.setCenterView`
3. Store updates:
   - `uiStore.centerView = 'chat' | 'notes'`
4. UI updates:
   - Center pane switches

---

### **4.2 Spectator Opens a Global Note**

**UI Action:**
Spectator clicks “Open Note”.

**Flow:**

1. `notes/openPopout`
2. Reducer: `uiReducer.openNotePopout`
3. Store updates:
   - `uiStore.activeNoteId = noteId`
4. UI updates:
   - `<NotePopout readOnly />` slides in

---

### **4.3 Session Pauses (Intermission Curtain Down)**

**Triggered by:**
DM pauses the session.

**Flow:**

1. `session/pause`
2. Reducer: `sessionReducer.setState('PAUSED')`
3. Store updates:
   - `sessionStore.state = 'PAUSED'`
   - `presenceStore.players[*].roomId = MAIN`
   - per-session audio effects moved to suspended snapshot for potential restore
4. UI updates:
   - Spectator surfaces switch to intermission/hidden state
   - Players/DM see stage prep state in Main group with no active effects

Persistence/recording rules:

- Intermission runtime content is off-the-record (treat pause like a private room for persistence).
- Pause-period chat/voice/transcript content must not be persisted.
- Only boundary markers persist: `[Session Paused]` at pause and `[Session Resumed]` at resume.

---

### **4.4 Session Resumes (Curtain Up)**

**Triggered by:**
DM resumes the session.

**Flow:**

1. `session/resume`
2. Reducer: `sessionReducer.setState('ACTIVE')`
3. Store updates:
   - `sessionStore.state = 'ACTIVE'`
   - suspended per-session effects restored
4. UI updates:
   - Spectator audience view returns
   - Prior stage effects appear again

Persistence rule:

- Resume restores live runtime behavior, but pause-period content remains non-persistent.

---

### **4.5 Session End Cooldown (Finale Thanks)**

**Triggered by:**
DM ends a session while spectators are enabled.

**Flow:**

1. `session/endWithCooldown`
2. Reducer: `sessionReducer.startCooldown`
3. Store updates:
   - `sessionStore.state = 'ENDED_COOLDOWN'`
   - `sessionStore.cooldownEndsAt`
   - players and DM moved to `MAIN`
   - per-session active effects cleared for finale
4. UI updates:
   - Public finale banner with countdown timer
   - Spectators can interact through public voice/chat only

Boundary marker contract:

- Session boundary markers (`[Session Started]`, `[Session Paused]`, `[Session Resumed]`, `[Session Ended]`) are persisted and replayed on refresh/reconnect.
- Clients must de-duplicate boundary markers when both local fallback and server/WS events are processed.

Notes:

- Default cooldown duration is 60 seconds and campaign-configurable.
- DM can extend cooldown before expiry.
- Cooldown interactions are excluded from session recording/history and purged from logs.

---

### **4.6 Whisper Bubble Flow (DM Off-the-Record Huddle)**

Whisper is a single private bubble for quick sidebar chats.

Preconditions:

- Exactly one whisper room exists in started sessions.
- Whisper appears at the bottom of the groups list.
- DM cannot create additional private rooms.

Entry flow:

1. DM drags player into Whisper.
2. `rooms/moveMemberToWhisper`
3. Reducer/store updates:
   - target player moved to whisper room
   - DM voice target auto-switches to whisper room
   - broadcast state disabled/locked
   - whisper participant pre-state snapshot stored (room + effects + DM focus state)
4. UI updates:
   - everyone sees membership change only
   - speaking indicators suppressed for whisper participants
   - spectators can see who is in whisper, but no whisper content/audio

Runtime flow:

- DM may drag additional players into Whisper.
- While Whisper is active, DM cannot retarget voice focus or enable broadcast.
- Whisper content is non-recorded and non-persistent.

Exit flow:

1. DM taps "End Whisper".
2. `rooms/endWhisper`
3. Reducer/store restores snapshot:
   - players return to previous rooms
   - prior conditions/effects restored
   - prior DM voice focus restored
4. UI updates:
   - normal speaking indicators and controls resume
   - gameplay returns to pre-whisper state without manual cleanup

---

## 5. System Toast Flows

---

### **5.1 Toast Auto‑Dismiss**

**Triggered by:**
Timer in UI layer.

**Flow:**

1. `toast/dismiss`
2. Reducer: `uiReducer.dismissToast`
3. Store updates:
   - Toast removed
4. UI updates:
   - Toast animates out

---

### **5.2 Toast Manual Dismiss**

**UI Action:**
User clicks ×.

**Flow:**
Same as above.

---

## 6. Right Panel Flows (Buttons + Panels)

---

### **6.1 User Opens a Right‑Toolbar Button**

**UI Action:**
User clicks a right-toolbar button.

**Flow:**

1. `ui/openPanel`
2. Reducer: `uiReducer.openPanel`
3. Store updates:
   - `uiStore.activeRightPanel = tab`
4. UI updates:
   - Slide‑in panel animates in

Role guard:

- DM/player button set: `INFO`, `PARTY`, `ROOMS` (DM-only), `NOTES`, `JOURNAL`, `HISTORY`, `SETTINGS`.
- Spectator button set: `INFO`, `PARTY`, `NOTES`, `JOURNAL`, `HISTORY` (`ROOMS` and `SETTINGS` hidden).

---

### **6.2 User Opens Global Settings (In or Out of Session)**

**UI Action:**
User opens Settings from authenticated shell.

**Flow:**

1. `ui/openPanel`
2. Reducer: `uiReducer.openPanel`
3. Store updates:
   - `uiStore.activeRightPanel = 'settings'`
4. UI updates:
   - Settings panel opens in either context (inside campaign and outside campaign)
   - User profile section is available from this same settings surface

---

### **6.3 DM Updates Campaign Feature Toggles**

**UI Action:**
DM opens Settings and edits campaign-scoped toggles.

**Flow:**

1. `settings/updateCampaignToggles`
2. Reducer: `settingsReducer.updateCampaignToggles`
3. Store updates:
   - `settingsStore.campaign.allowDmVoices`
   - `settingsStore.campaign.allowEnvironments`
   - `settingsStore.campaign.allowConditions`
   - `settingsStore.campaign.allowPrivateGroupRequests`
   - `settingsStore.campaign.allowSpectators`
   - `settingsStore.campaign.spectatorLimit`
   - `settingsStore.campaign.lateJoinGraceMinutes`
   - `settingsStore.campaign.defaultSessionLimitMinutes`
   - `settingsStore.campaign.recordingEnabled` (future)
   - `settingsStore.campaign.transcriptionEnabled` (future)
   - `settingsStore.platformCapabilities.summaryProcessingInstalled`
4. UI updates:
   - Updated toggles are reflected immediately in settings UI
   - Controlled features are shown/hidden/enabled/disabled by policy
   - Summary-processing controls are editable only when `summaryProcessingInstalled=true`

---

### **6.9 User Sees Disabled Summary Processing Controls (Not Installed)**

**Triggered by:**
Capabilities fetch resolves with `summaryProcessingInstalled=false`.

**Flow:**

1. `platform/fetchCapabilities`
2. Reducer: `settingsReducer.setPlatformCapabilities`
3. Store updates:
   - `settingsStore.platformCapabilities.summaryProcessingInstalled = false`
4. UI updates:
   - Summary-processing controls render disabled in frontend/admin settings surfaces
   - Canonical message is shown:
     - "Summary processing is not installed on this deployment. Ask your administrator to enable it during system installation."

---

### **6.4 User Opens INFO Panel from Right Toolbar**

**UI Action:**
User clicks the `INFO` right-toolbar button.

**Flow:**

1. `ui/openPanel`
2. Reducer: `uiReducer.openPanel`
3. Store updates:
   - `uiStore.activeRightPanel = 'info'`
4. UI updates:
   - INFO panel opens and renders campaign overview details
   - DM sees editable campaign metadata controls

---

## 7. Lobby and Offline Campaign Workspace Flows

### **7.1 User Opens Create Campaign Dialog**

**UI Action:**
User clicks `Create Campaign` from lobby topbar.

**Flow:**

1. `ui/openCreateCampaignDialog`
2. Reducer: `uiReducer.setCreateCampaignDialog(true)`
3. Store updates:
   - Create dialog visible (top-offset, anchored near topbar)
4. UI updates:
   - Dialog shows only campaign name field
   - Action row is right-aligned: `CANCEL | EDIT | LAUNCH`

### **7.2 User Creates and Opens Offline Edit/Review**

**UI Action:**
User enters campaign name and clicks `EDIT`.

**Flow:**

1. `campaigns/create(intent='edit')`
2. API: `POST /api/campaigns`
3. Store updates:
   - Campaign inserted in lobby list
   - Campaign selected
   - Lobby mode switches to offline campaign workspace
4. UI updates:
   - Dialog closes
   - Offline workspace renders in-page (no modal), topbar preserved
   - `INFO` panel opens by default

### **7.3 User Creates and Launches Immediately**

**UI Action:**
User enters campaign name and clicks `LAUNCH`.

**Flow:**

1. `campaigns/create(intent='launch')`
2. API: `POST /api/campaigns`
3. API: enter/start session flow
4. Store updates:
   - Campaign created and selected
   - Session selection resolves
5. UI updates:
   - User enters runtime campaign screen directly

### **7.4 User Opens Join Dialog**

**UI Action:**
User clicks `Join Campaign` from lobby topbar.

**Flow:**

1. `ui/openJoinCampaignDialog`
2. Reducer: `uiReducer.setJoinCampaignDialog(true)`
3. Store updates:
   - Join dialog visible (top-offset)
4. UI updates:
   - Right-aligned actions: `CANCEL | JOIN`

### **7.5 User Switches Offline Workspace Panels**

**UI Action:**
User clicks a right-side icon in offline workspace.

**Flow:**

1. `ui/openOfflineWorkspacePanel(tab)`
2. Reducer: `uiReducer.setOfflineWorkspacePanel(tab)`
3. Store updates:
   - Active panel key changes
4. UI updates:
   - Main panel body swaps in-page (not popover)
   - Role visibility matches campaign context; `SETTINGS` hidden in offline mode

### **7.6 Lobby Scroll Behavior**

**Triggered by:**
Campaign list exceeds available vertical space.

**Flow:**

1. No event dispatch required (layout behavior)
2. UI updates:
   - Topbar remains fixed
   - Stats strip remains fixed
   - Only campaign-card list area scrolls
   - Players/spectators see read-only metadata

---

### **6.5 DM Opens Session Settings Popover**

**UI Action:**
DM clicks session-header cog icon.

**Flow:**

1. `session/openSettingsPopover`
2. Reducer: `sessionReducer.openSettingsPopover`
3. Store updates:
   - `sessionStore.settingsPopoverOpen = true`
4. UI updates:
   - Session settings popover opens with:
     - session name
     - markdown description
     - timer override

---

### **6.6 DM Saves Session Settings**

**UI Action:**
DM saves session settings popover.

**Flow:**

1. `session/updateMetadata`
2. Reducer: `sessionReducer.updateMetadata`
3. Store updates:
   - `sessionStore.name`
   - `sessionStore.descriptionMarkdown`
   - `sessionStore.timerOverrideMinutes`
4. UI updates:
   - Updated values are visible to all participants
   - If timer exceeds campaign default, warning badge/copy is shown (no hard block)

---

### **6.7 DM Updates Note Handout Permissions**

**UI Action:**
DM edits note visibility in the `NOTES` rightbar panel.

**Flow:**

1. `notes/updateVisibility`
2. Reducer: `notesReducer.updateVisibility`
3. Store updates:
   - `notesStore.items[noteId].accessLevel = 'PRIVATE' | 'PARTY' | 'SELECTED'`
   - `notesStore.items[noteId].selectedPlayerIds`
4. UI updates:
   - Notes list visibility recalculates by persona and permission scope

---

### **6.11 DM Posts Note to Group Chat**

**UI Action:**
DM clicks `Post to Chat` from a note in the `NOTES` panel and selects a target group.

**Flow:**

1. `notes/postToGroupChat`
2. Reducer: `chatReducer.publishNoteCard`
3. Store updates:
   - Chat timeline appends note card message for target group
   - Note share scope for that post is set to all players currently in the target group
4. UI updates:
   - Group chat shows the posted note card
   - Players in target group can open the note from the card

---

### **6.8 User Opens Session History Entry**

**UI Action:**
User opens one session row in the `HISTORY` rightbar panel.

**Flow:**

1. `history/openSession`
2. Reducer: `historyReducer.openSession`
3. Store updates:
   - `historyStore.activeSessionId`
   - `historyStore.activeSessionChatLog`
4. UI updates:
   - Session chat log is displayed
   - If `summaryProcessingInstalled=true` and summaries are enabled, summary content appears at the top
   - If `summaryProcessingInstalled=false`, summary content remains disabled and canonical explanatory copy is displayed

---

### **6.10 Player Jumps from PARTY Edit to Character Settings**

**UI Action:**
Player clicks `Edit` on their own row in the `PARTY` panel.

**Flow:**

1. `ui/openPanel`
2. Reducer: `uiReducer.openPanel`
3. Store updates:
   - `uiStore.activeRightPanel = 'settings'`
   - `uiStore.activeSettingsSection = 'character'`
4. UI updates:
   - Character settings form opens
   - Focus moves to the first editable character field

---

## 7. Responsive Mode Flows

### **7.1 Mode Resolution on Resize**

**Triggered by:**
Viewport resize or initial shell mount.

**Flow:**

1. `ui/resolveViewportMode`
2. Reducer: `uiReducer.setViewportMode`
3. Store updates:
   - `uiStore.viewportMode = 'MINIMALIST_MOBILE' | 'BALANCED_PLAYER' | 'DM_DESKTOP_COMMAND'`
4. UI updates:
   - Shell regions reposition according to mode
   - Right panel behavior switches between popover, popout, or pinned mode

Default breakpoints:

- `<=767px`: `MINIMALIST_MOBILE`
- `768px-1279px`: `BALANCED_PLAYER`
- `>=1280px`: `DM_DESKTOP_COMMAND`

### **7.2 DM Desktop Command Panel Switching**

**UI Action:**
User clicks a right-rail icon while in `DM_DESKTOP_COMMAND`.

**Flow:**

1. `ui/openPanel`
2. Reducer: `uiReducer.openPanel`
3. Store updates:
   - `uiStore.activeRightPanel = tab`
   - `uiStore.lastDesktopPinnedPanel = tab`
4. UI updates:
   - Existing pinned panel content swaps to selected tab
   - One panel remains open at all times

### **7.3 Minimalist Mobile Right Panel Dock**

**UI Action:**
User taps a bottom-dock icon in `MINIMALIST_MOBILE`.

**Flow:**

1. `ui/openPanel`
2. Reducer: `uiReducer.openPanel`
3. Store updates:
   - `uiStore.activeRightPanel = tab`
4. UI updates:
   - Bottom popover panel slides up from dock
   - Chat remains primary visual anchor behind panel

### **7.4 Minimalist Mobile DM Warning Banner**

**Triggered by:**
DM enters `MINIMALIST_MOBILE` for first time on device/session.

**Flow:**

1. `ui/showMobileDmWarning`
2. Reducer: `uiReducer.setMobileDmWarningVisible`
3. Store updates:
   - `uiStore.mobileDmWarningVisible = true`
   - `uiStore.mobileDmWarningDismissed = false`
4. UI updates:
   - Dismissible warning banner appears
   - Dismiss persists to local preference for future visits

---

## 8. Connection Status Icon Flows

Connection status naming and mapping must use canonical enums from the roadmap implementation checklist.

### **8.1 Outside Campaign Status Update**

**Triggered by:**
Core WS transport state change.

**Flow:**

1. `transport/coreWsStateChanged`
2. Reducer computes aggregate icon state for `statusContext=OUTSIDE_CAMPAIGN`
3. Store updates:
   - `sessionStore.coreWsState`
   - `sessionStore.statusIconState`
   - `sessionStore.statusColorKey`
4. UI updates:
   - Primary status icon maps:
     - CONNECTED -> GREEN
     - CONNECTING -> YELLOW
     - ERROR -> RED

### **8.2 Inside Campaign Status Update (Core WS + LiveKit)**

**Triggered by:**
Core WS or LiveKit transport state change.

**Flow:**

1. `transport/coreWsStateChanged` or `transport/livekitStateChanged`
2. Reducer computes aggregate icon state for `statusContext=INSIDE_CAMPAIGN`
3. Store updates:
   - `sessionStore.coreWsState`
   - `sessionStore.livekitState`
   - `sessionStore.statusIconState`
   - `sessionStore.statusColorKey`
4. UI updates:
   - Primary status icon maps:
     - Core CONNECTED + LiveKit CONNECTED -> GREEN
     - Core CONNECTED + LiveKit CONNECTING -> PALE_GREEN
     - Core CONNECTING + LiveKit CONNECTING -> YELLOW
     - Core CONNECTED + LiveKit ERROR -> ORANGE
     - Core ERROR (any LiveKit) or Core CONNECTING + LiveKit ERROR -> RED
   - LiveKit/audio indicator remains subtle except in degraded/error states.
   - Chat shifts left

---

### **6.2 User Closes a Right‑Panel Panel**

**UI Action:**
User clicks close button.

**Flow:**

1. `ui/closePanel`
2. Reducer: `uiReducer.closePanel`
3. Store updates:
   - `uiStore.activeRightPanel = null`
4. UI updates:
   - Panel slides out
   - Chat shifts back

---

## 7. Whisper Flows (DM + Player)

---

### **7.1 Player Selects Whisper Target**

**UI Action:**
Player selects whisper target in composer.

**Flow:**

1. `ui/setWhisperTarget`
2. Reducer: `uiReducer.setWhisperTarget`
3. Store updates:
   - `uiStore.whisperTarget = playerId`
4. UI updates:
   - Whisper badge appears

---

### **7.2 Player Sends Whisper**

**UI Action:**
Player sends message with whisper target.

**Flow:**

1. `chat/sendMessage` (with whisperTargetId)
2. Reducer: `chatReducer.sendMessage`
3. Store updates:
   - Whisper message added
4. UI updates:
   - Whisper appears only to sender + target + DM

---

## 8. Summary

This document defines:

- All persona‑specific UI flows
- Event → Reducer → Store → UI mapping
- No new behaviour
- No invented subsystems
- Full compliance with your architecture

It is the authoritative reference for UI interaction behaviour.

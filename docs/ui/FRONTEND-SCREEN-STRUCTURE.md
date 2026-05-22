# Frontend Screen-First Structure Map

## Goal

Organize frontend code so a developer can start from a user-visible screen and find the owning files quickly.

Primary screens:

1. Login / Auth
2. Guest Entry (Join / Watch / Browse)
3. Lobby
4. Campaign Editor
5. Campaign Runtime

## Current Screen Ownership (Normalized)

### App Shell + Route Layer

- `frontend/src/App.tsx`
- `frontend/src/components/routes/*`

Route layer responsibilities:

- Route parsing and switching
- Auth gate handoff
- Screen entry component selection

### Login / Auth Screen

- `frontend/src/components/auth/LoginForm.tsx`
- `frontend/src/components/auth/RegisterForm.tsx`
- `frontend/src/components/auth/PasswordResetRequestForm.tsx`
- `frontend/src/components/auth/PasswordResetConfirmForm.tsx`
- `frontend/src/components/auth/auth-surface.ts`

### Guest Entry Screens (Join / Watch / Browse)

- `frontend/src/components/auth/InviteJoinPage.tsx`
- `frontend/src/components/auth/SpectatorInvitePage.tsx`
- `frontend/src/components/auth/BrowseCampaignsPage.tsx`

### Lobby Screen

- `frontend/src/components/lobby/SessionLobbyView.tsx`
- `frontend/src/components/lobby/SessionLobbyView.CampaignCard.tsx`
- `frontend/src/components/lobby/LobbyCampaignWorkspaceView.tsx`
- `frontend/src/components/lobby/LobbyCampaignWorkspaceView.tabs.ts`
- `frontend/src/components/lobby/LobbyCampaignSettingsPanel.tsx`
- `frontend/src/components/lobby/LobbyCampaignSettingsPanel.Policy.tsx`
- `frontend/src/components/lobby/LobbyCampaignSettingsPanel.Invites.tsx`
- `frontend/src/components/lobby/LobbyCampaignSettingsPanel.types.ts`

### Campaign Editor Screen

- `frontend/src/components/editor/CampaignSettingsPage.tsx`
- `frontend/src/components/editor/CampaignRightbarSettings.tsx`

### Campaign Runtime Screen

- `frontend/src/components/session/SessionInit.tsx`
- `frontend/src/components/session/SessionInitCommandCenter.tsx`
- `frontend/src/components/session/SessionInitLobbyWorkspaceBranch.tsx`
- `frontend/src/components/session/SessionInitModals.tsx`
- `frontend/src/components/session/CommandCenterFrame.tsx`
- `frontend/src/components/session/SessionToolbar.tsx`
- `frontend/src/components/session/SessionLeftRailPanel.tsx`
- `frontend/src/components/session/SessionRightRailContent.tsx`
- `frontend/src/components/session/*` (remaining runtime panels)
- `frontend/src/hooks/session/*` (runtime orchestration hooks)

### Shared Campaign Surfaces (Editor + Runtime)

- `frontend/src/components/shared/CampaignInformationPanel.tsx`
- `frontend/src/components/shared/CampaignPartyPanel.tsx`
- `frontend/src/components/shared/CampaignPartyPanel.mockData.ts`
- `frontend/src/components/shared/CampaignScaffoldPanel.tsx`
- `frontend/src/components/shared/InvitePopoverWidget.tsx`
- `frontend/src/components/shared/CampaignInfo.tsx`

### Centralized Non-UI Modules

- `frontend/src/hooks/session/*` for SessionInit orchestration hooks.
- `frontend/src/types/session/campaign.ts` and `frontend/src/types/session/session-init.ts` for session/campaign types.
- `frontend/src/utils/session/sessionController.ts`, `frontend/src/utils/session/sessionInit.ts`, and `frontend/src/utils/session/sessionSettings.ts` for runtime/session utility logic.

## Placement Rules (How to Decide Where a New File Belongs)

Use this order:

1. Which screen owns this behavior first?
2. Is it used by exactly one screen or many?
3. Is it visual UI, orchestration logic, or platform utility?

Rules:

- Single-screen UI: place in that screen folder (`lobby`, `editor`, `session`, `auth`).
- Multi-screen campaign UI: place in `shared`.
- Cross-domain primitives: place in `components/ui`.
- Data/state/transport logic that is not UI: keep in `hooks`, `state`, `utils`, `types`, `ws`.

## Recommended Naming Conventions

- Screen roots use noun-based names: `session`, `editor`, `lobby`, `shared`.
- Subcomponents use `ScreenName.Part.tsx` when tightly coupled.
- Hooks should live in `src/hooks/*` (screen-specific hooks under `src/hooks/session/*`).
- Keep route wrappers thin and avoid embedding screen logic into `components/routes/*`.

## Suggested Next Cleanup Passes

1. Split `session` internals into subfolders:
   - `session/layout`
   - `session/panels`
   - `session/modals`
2. Add a typed re-export barrel for `src/types/session/*`.
3. Add a typed re-export barrel for `src/utils/session/*`.
4. Add folder-level `index.ts` barrels for each screen folder.
5. Add one short owner/intent `README.md` in each screen folder.

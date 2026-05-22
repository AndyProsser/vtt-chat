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

- `frontend/src/components/campaign-editor/CampaignSettingsPage.tsx`
- `frontend/src/components/campaign-editor/CampaignRightbarSettings.tsx`

### Campaign Runtime Screen

- `frontend/src/components/campaign-runtime/SessionInit.tsx`
- `frontend/src/components/campaign-runtime/SessionInitCommandCenter.tsx`
- `frontend/src/components/campaign-runtime/SessionInitLobbyWorkspaceBranch.tsx`
- `frontend/src/components/campaign-runtime/SessionInitModals.tsx`
- `frontend/src/components/campaign-runtime/CommandCenterFrame.tsx`
- `frontend/src/components/campaign-runtime/SessionToolbar.tsx`
- `frontend/src/components/campaign-runtime/SessionLeftRailPanel.tsx`
- `frontend/src/components/campaign-runtime/SessionRightRailContent.tsx`
- `frontend/src/components/campaign-runtime/*` (remaining runtime panels, hooks, and orchestration helpers)

### Shared Campaign Surfaces (Editor + Runtime)

- `frontend/src/components/campaign-shared/CampaignInformationPanel.tsx`
- `frontend/src/components/campaign-shared/CampaignPartyPanel.tsx`
- `frontend/src/components/campaign-shared/CampaignPartyPanel.mockData.ts`
- `frontend/src/components/campaign-shared/CampaignScaffoldPanel.tsx`
- `frontend/src/components/campaign-shared/InvitePopoverWidget.tsx`
- `frontend/src/components/campaign-shared/CampaignInfo.tsx`

## Placement Rules (How to Decide Where a New File Belongs)

Use this order:

1. Which screen owns this behavior first?
2. Is it used by exactly one screen or many?
3. Is it visual UI, orchestration logic, or platform utility?

Rules:

- Single-screen UI: place in that screen folder (`lobby`, `campaign-editor`, `campaign-runtime`, `auth`).
- Multi-screen campaign UI: place in `campaign-shared`.
- Cross-domain primitives: place in `components/ui` or `core-ui`.
- Data/state/transport logic that is not UI: keep in `hooks`, `state`, `utils`, `types`, `ws`.

## Recommended Naming Conventions

- Screen roots use noun-based names: `campaign-runtime`, `campaign-editor`, `lobby`.
- Subcomponents use `ScreenName.Part.tsx` when tightly coupled.
- Hooks in screen folders should be prefixed by screen context, for example: `useRuntime...`, `useLobby...`.
- Keep route wrappers thin and avoid embedding screen logic into `components/routes/*`.

## Suggested Next Cleanup Passes

1. Split `campaign-runtime` internals into subfolders:
   - `campaign-runtime/layout`
   - `campaign-runtime/panels`
   - `campaign-runtime/modals`
   - `campaign-runtime/hooks`
   - `campaign-runtime/model`
2. Move runtime-only CSS under `styles/components/campaign-runtime/*` and keep temporary imports for compatibility.
3. Add folder-level `index.ts` barrels for each screen folder.
4. Add one short owner/intent `README.md` in each screen folder.

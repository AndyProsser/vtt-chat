import { useState } from 'react'
import { CampaignSettingsPanel } from '@/components/workspaces/shared/panels/CampaignSettingsPanel'
import {
  CampaignSessionSettingsPanel,
  type CampaignSessionSettingsPanelProps,
} from '@/components/workspaces/shared/panels/CampaignSessionSettingsPanel'
import {
  PlayerSettingsPanel,
  type PlayerSettingsPanelProps,
} from '@/components/workspaces/shared/panels/PlayerSettingsPanel'
import type { CampaignSettingsPanelProps } from '@/types/campaignSettingsPanel'

export type WorkspaceSettingsRole = 'DM' | 'PLAYER' | 'SPECTATOR'

export interface WorkspaceSettingsPanelProps {
  role: WorkspaceSettingsRole
  campaignSettings?: CampaignSettingsPanelProps
  sessionSettings?: CampaignSessionSettingsPanelProps
  playerSettings?: PlayerSettingsPanelProps
}

export function WorkspaceSettingsPanel(props: WorkspaceSettingsPanelProps) {
  const [devShowAsPlayer, setDevShowAsPlayer] = useState(false)
  const effectiveRole = import.meta.env.DEV && devShowAsPlayer ? 'PLAYER' : props.role

  const devBanner = import.meta.env.DEV ? (
    <div className="csp-dev-role-banner" role="status" aria-label="Dev role switcher">
      <span className="csp-dev-badge">DEV</span>
      <span className="csp-dev-label">View as:</span>
      <button
        type="button"
        className={`csp-dev-role-pill ${!devShowAsPlayer ? 'is-active' : ''}`}
        onClick={() => setDevShowAsPlayer(false)}
      >
        DM
      </button>
      <button
        type="button"
        className={`csp-dev-role-pill ${devShowAsPlayer ? 'is-active' : ''}`}
        onClick={() => setDevShowAsPlayer(true)}
      >
        Player
      </button>
    </div>
  ) : null

  if (effectiveRole === 'PLAYER') {
    if (!props.playerSettings) {
      return (
        <>
          {devBanner}
          <div className="workspaces-status-message">
            Player settings are unavailable right now.
          </div>
        </>
      )
    }

    return (
      <>
        {devBanner}
        <PlayerSettingsPanel {...props.playerSettings} />
      </>
    )
  }

  if (effectiveRole === 'DM') {
    if (props.campaignSettings) {
      return (
        <>
          {devBanner}
          <CampaignSettingsPanel
            {...props.campaignSettings}
            sessionSettingsPanel={
              props.sessionSettings ? (
                <CampaignSessionSettingsPanel {...props.sessionSettings} />
              ) : null
            }
          />
        </>
      )
    }

    if (props.sessionSettings) {
      return (
        <>
          {devBanner}
          <CampaignSessionSettingsPanel {...props.sessionSettings} standalone />
        </>
      )
    }

    return (
      <>
        {devBanner}
        <div className="workspaces-status-message">Campaign settings are unavailable.</div>
      </>
    )
  }

  return (
    <div className="workspaces-status-message">
      Spectators do not have editable campaign settings in offline mode.
    </div>
  )
}

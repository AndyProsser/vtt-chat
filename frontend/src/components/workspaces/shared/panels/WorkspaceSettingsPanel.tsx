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
  if (props.role === 'PLAYER') {
    if (!props.playerSettings) {
      return (
        <div className="workspaces-status-message">Player settings are unavailable right now.</div>
      )
    }

    return <PlayerSettingsPanel {...props.playerSettings} />
  }

  if (props.role === 'DM') {
    if (props.campaignSettings) {
      return (
        <CampaignSettingsPanel
          {...props.campaignSettings}
          sessionSettingsPanel={
            props.sessionSettings ? (
              <CampaignSessionSettingsPanel {...props.sessionSettings} />
            ) : null
          }
        />
      )
    }

    if (props.sessionSettings) {
      return <CampaignSessionSettingsPanel {...props.sessionSettings} standalone />
    }

    return <div className="workspaces-status-message">Campaign settings are unavailable.</div>
  }

  return (
    <div className="workspaces-status-message">
      Spectators do not have editable campaign settings in offline mode.
    </div>
  )
}

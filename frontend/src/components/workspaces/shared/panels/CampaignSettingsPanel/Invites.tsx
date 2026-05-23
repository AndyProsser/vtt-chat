import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import type { CampaignSettingsPanelInvitesProps } from '@/types/campaignSettingsPanel'

export function CampaignSettingsPanelInvites(props: CampaignSettingsPanelInvitesProps) {
  return (
    <section
      className="session-campaign-settings-panel session-campaign-invite-panel"
      aria-label="Invite links"
    >
      <h5 className="session-inline-form-title">Invite Links</h5>
      <div className="session-invite-link-row">
        <div className="session-invite-link-row__label">Player</div>
        <div className="session-invite-link-row__input-wrap">
          <input
            className="session-invite-link-row__input"
            type="text"
            readOnly
            value={props.playerInviteUrl}
            aria-label="Player invite URL"
          />
        </div>
        <div className="session-invite-link-row__actions">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="session-icon-action"
                aria-label="Copy player invite URL"
                onClick={() => props.onCopyInviteUrl('PLAYER')}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  content_copy
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Copy player invite URL</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="session-icon-action"
                aria-label="Refresh player invite URL"
                disabled={props.isInviteReissuing}
                onClick={() => props.onReissueInvite('PLAYER')}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  refresh
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Refresh player invite URL</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="session-invite-link-row">
        <div className="session-invite-link-row__label">Spectator</div>
        <div className="session-invite-link-row__input-wrap">
          <input
            className="session-invite-link-row__input"
            type="text"
            readOnly
            value={props.spectatorInviteUrl}
            aria-label="Spectator invite URL"
            disabled={!props.settingsSpectatorsEnabled}
          />
        </div>
        <div className="session-invite-link-row__actions">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="session-icon-action"
                aria-label="Copy spectator invite URL"
                disabled={!props.settingsSpectatorsEnabled || !props.hasSpectatorInviteCode}
                onClick={() => props.onCopyInviteUrl('SPECTATOR')}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  content_copy
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Copy spectator invite URL</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="session-icon-action"
                aria-label="Refresh spectator invite URL"
                disabled={!props.settingsSpectatorsEnabled || props.isInviteReissuing}
                onClick={() => props.onReissueInvite('SPECTATOR')}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  refresh
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Refresh spectator invite URL</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </section>
  )
}

import { useMemo } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'

type UseCampaignWorkspaceTopbarActionsParams = {
  isCreatingCampaign: boolean
  isJoiningCampaign: boolean
  onCreateCampaign: () => void
  onJoinCampaign: () => void
  coreWsState: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED'
}

export function useCampaignWorkspaceTopbarActions({
  isCreatingCampaign,
  isJoiningCampaign,
  onCreateCampaign,
  onJoinCampaign,
  coreWsState,
}: UseCampaignWorkspaceTopbarActionsParams) {
  const coreStateToneClass =
    coreWsState === 'CONNECTED' ? 'is-green' : coreWsState === 'CONNECTING' ? 'is-yellow' : 'is-red'

  const topbarActions = useMemo(
    () => (
      <>
        <Tooltip>
          <TooltipTrigger
            type="button"
            className="session-toolbar__icon-btn"
            onClick={onCreateCampaign}
            disabled={isCreatingCampaign}
            aria-label="Create campaign"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              add_circle
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="end">
            Create Campaign
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            type="button"
            className="session-toolbar__icon-btn"
            onClick={onJoinCampaign}
            disabled={isJoiningCampaign}
            aria-label="Join campaign"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              group_add
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="end">
            Join Campaign
          </TooltipContent>
        </Tooltip>
      </>
    ),
    [isCreatingCampaign, isJoiningCampaign, onCreateCampaign, onJoinCampaign]
  )

  return {
    coreStateToneClass,
    topbarActions,
  }
}

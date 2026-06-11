import { useCallback, useMemo, useRef } from 'react'
import { type CoreWsState } from '@shared'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import type { CampaignExportBundle } from '@/types/session/campaign'

function isValidExportBundle(raw: unknown): raw is CampaignExportBundle {
  if (!raw || typeof raw !== 'object') return false
  const b = raw as Record<string, unknown>
  return (
    b.version === 1 &&
    typeof b.sourceCampaignId === 'string' &&
    typeof b.campaign === 'object' &&
    b.campaign !== null &&
    typeof (b.campaign as Record<string, unknown>).name === 'string' &&
    Array.isArray(b.members) &&
    Array.isArray(b.sessions) &&
    Array.isArray(b.recordings)
  )
}

type UseCampaignWorkspaceToolbarActionsParams = {
  isCreatingCampaign: boolean
  isJoiningCampaign: boolean
  isGuest: boolean
  onCreateCampaign: () => void
  onJoinCampaign: () => void
  onImportCampaign: (bundle: CampaignExportBundle) => void
  coreWsState: CoreWsState
}

export function useCampaignWorkspaceToolbarActions({
  isCreatingCampaign,
  isJoiningCampaign,
  isGuest,
  onCreateCampaign,
  onJoinCampaign,
  onImportCampaign,
  coreWsState,
}: UseCampaignWorkspaceToolbarActionsParams) {
  const coreStateToneClass =
    coreWsState === 'CONNECTED' ? 'is-green' : coreWsState === 'CONNECTING' ? 'is-yellow' : 'is-red'

  const importFileRef = useRef<HTMLInputElement>(null)

  const handleImportFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const raw = JSON.parse(e.target?.result as string)
          if (!isValidExportBundle(raw)) return
          onImportCampaign(raw)
        } catch {
          // invalid JSON — silently ignored; the Create modal shows its own error
        }
      }
      reader.readAsText(file)
    },
    [onImportCampaign]
  )

  const toolbarActions = useMemo(
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

        {!isGuest && (
          <Tooltip>
            <TooltipTrigger
              type="button"
              className="session-toolbar__icon-btn"
              onClick={() => importFileRef.current?.click()}
              disabled={isCreatingCampaign}
              aria-label="Import campaign"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                upload_file
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">
              Import Campaign
            </TooltipContent>
          </Tooltip>
        )}

        <input
          ref={importFileRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleImportFileChange}
          aria-hidden="true"
        />
      </>
    ),
    [
      isCreatingCampaign,
      isJoiningCampaign,
      isGuest,
      onCreateCampaign,
      onJoinCampaign,
      handleImportFileChange,
    ]
  )

  return {
    coreStateToneClass,
    toolbarActions,
  }
}

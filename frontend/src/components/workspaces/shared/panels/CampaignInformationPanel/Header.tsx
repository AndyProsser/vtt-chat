import { Icon } from '@/components/ui/Icon'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import { InvitePopoverWidget } from '@/components/workspaces/shared/toolbar/InvitePopoverWidget'
import type { CampaignInformationHeaderProps } from '@/types/campaignInformationPanel'

/**
 * Header row for campaign information with title and edit action controls.
 */
export function CampaignInformationHeader({
  canEdit,
  isEditing,
  isSaving,
  isDirty,
  nameDraft,
  onSave,
  onCancel,
  onStartEditing,
  joinUrl,
  watchUrl,
  spectatorsEnabled,
  canRefreshInvites,
  isInviteReissuing,
  onCopyInviteUrl,
  onReissueInvite,
}: CampaignInformationHeaderProps) {
  return (
    <div className="cip-header-row">
      <h3 className="cip-heading">
        <Icon name="panel" />
        Campaign Information
      </h3>
      {canEdit && isEditing ? (
        <div className="cip-inline-actions" aria-label="Campaign information actions">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="session-icon-action session-icon-action--icon"
                aria-label={isSaving ? 'Saving campaign information' : 'Save campaign information'}
                onClick={onSave}
                disabled={isSaving || !isDirty || !nameDraft.trim()}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {isSaving ? 'hourglass_top' : 'save'}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Save changes</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="session-icon-action session-icon-action--icon"
                aria-label="Cancel editing campaign information"
                onClick={onCancel}
                disabled={isSaving}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  undo
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Cancel editing</TooltipContent>
          </Tooltip>
        </div>
      ) : canEdit && !isEditing ? (
        <div className="cip-inline-actions" aria-label="Campaign information actions">
          <InvitePopoverWidget
            show={Boolean(joinUrl && onCopyInviteUrl)}
            joinUrl={joinUrl ?? ''}
            watchUrl={watchUrl ?? ''}
            spectatorsEnabled={spectatorsEnabled ?? false}
            canRefreshInvites={canRefreshInvites}
            isInviteReissuing={isInviteReissuing}
            onCopyInviteUrl={onCopyInviteUrl ?? (() => {})}
            onReissueInvite={onReissueInvite ?? (() => {})}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="session-icon-action session-icon-action--icon"
                aria-label="Edit campaign information"
                onClick={onStartEditing}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  edit
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Edit</TooltipContent>
          </Tooltip>
        </div>
      ) : null}
    </div>
  )
}

import type { CampaignInformationFooterActionsProps } from '@/types/campaignInformationPanel'

/**
 * Footer actions for entering edit mode or showing role-based read-only notice.
 */
export function CampaignInformationFooterActions({
  workspaceMode,
  canEdit,
  isEditing,
  onStartEditing,
}: CampaignInformationFooterActionsProps) {
  if (!workspaceMode && canEdit && !isEditing) {
    return (
      <button
        type="button"
        className="session-button session-button-brand"
        onClick={onStartEditing}
      >
        Edit campaign information
      </button>
    )
  }

  if (!canEdit) {
    return <p className="cip-muted">Campaign metadata is read-only for your role.</p>
  }

  return null
}

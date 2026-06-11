import type { CampaignInformationFooterActionsProps } from '@/types/campaignInformationPanel'

/**
 * Footer actions for entering edit mode or showing role-based read-only notice.
 */
export function CampaignInformationFooterActions({
  canEdit,
  isEditing,
}: CampaignInformationFooterActionsProps) {
  if (!canEdit && !isEditing) {
    return <p className="cip-muted">Campaign metadata is read-only for your role.</p>
  }

  return null
}

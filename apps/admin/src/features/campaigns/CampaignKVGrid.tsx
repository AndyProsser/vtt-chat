import type { CampaignSummary } from '@/types/campaigns'

interface CampaignKVGridProps {
  campaign: CampaignSummary
}

export function CampaignKVGrid({ campaign }: CampaignKVGridProps) {
  return (
    <div className="kv-grid campaign-kv-grid">
      <div>
        <strong>Campaign:</strong> {campaign.name}
      </div>
      <div>
        <strong>Invite Code:</strong> {campaign.inviteCode}
      </div>
      <div>
        <strong>Members:</strong> {campaign.memberCount}
      </div>
      <div>
        <strong>Total Sessions:</strong> {campaign.sessionCount}
      </div>
      <div>
        <strong>Lifecycle:</strong> {campaign.isArchived ? 'Archived' : 'Active'}
      </div>
    </div>
  )
}

import type { UUID } from '@shared'
import { CampaignSettingsPage } from '@/components/workspaces/editor/CampaignSettingsPage'

type CampaignSettingsRouteViewProps = {
  apiUrl: string
  token: string
  campaignId: UUID
}

export function CampaignSettingsRouteView(props: CampaignSettingsRouteViewProps) {
  return (
    <CampaignSettingsPage apiUrl={props.apiUrl} token={props.token} campaignId={props.campaignId} />
  )
}

import { lazy, Suspense } from 'react'
import type { UUID } from '@shared'

const CampaignSettingsPage = lazy(async () => {
  const module = await import('@/components/session/CampaignSettingsPage')
  return { default: module.CampaignSettingsPage }
})

type CampaignSettingsRouteViewProps = {
  apiUrl: string
  token: string
  campaignId: UUID
}

export function CampaignSettingsRouteView(props: CampaignSettingsRouteViewProps) {
  return (
    <Suspense
      fallback={
        <div className="rounded-ui-md border border-ui-border bg-ui-surface p-4">
          Loading campaign settings...
        </div>
      }
    >
      <CampaignSettingsPage
        apiUrl={props.apiUrl}
        token={props.token}
        campaignId={props.campaignId}
      />
    </Suspense>
  )
}

import { BrowseCampaignsPage } from '@/components/guest/BrowseCampaignsPage'

type BrowseRouteViewProps = {
  apiUrl: string
  authToken: string | null
}

export function BrowseRouteView(props: BrowseRouteViewProps) {
  return <BrowseCampaignsPage apiUrl={props.apiUrl} authToken={props.authToken} />
}

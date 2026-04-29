import { SessionState } from '@shared'

interface CampaignInfoProps {
  campaignName: string
  sessionName: string
  sessionState: SessionState
}

export function CampaignInfo({ campaignName, sessionName, sessionState }: CampaignInfoProps) {
  return (
    <div className="space-y-1">
      <h4 className="mb-2 mt-0 text-base font-semibold text-ui-primary">Campaign Info</h4>
      <p className="m-0 text-xs text-ui-secondary">
        Campaign: <strong>{campaignName}</strong>
      </p>
      <p className="m-0 text-xs text-ui-secondary">
        Session: <strong>{sessionName}</strong>
      </p>
      <p className="m-0 text-xs text-ui-secondary">
        State: <strong>{sessionState}</strong>
      </p>
    </div>
  )
}

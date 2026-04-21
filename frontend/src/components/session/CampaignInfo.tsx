import { SessionState } from '@shared'

interface CampaignInfoProps {
  campaignName: string
  sessionName: string
  sessionState: SessionState
}

export function CampaignInfo({ campaignName, sessionName, sessionState }: CampaignInfoProps) {
  return (
    <div>
      <h4 style={{ margin: '0 0 0.5rem 0' }}>Campaign Info</h4>
      <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
        Campaign: <strong>{campaignName}</strong>
      </p>
      <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
        Session: <strong>{sessionName}</strong>
      </p>
      <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
        State: <strong>{sessionState}</strong>
      </p>
    </div>
  )
}

import type { CampaignSummary } from './types'
import { prettyState, statusClass } from './types'

interface CampaignTableProps {
  campaigns: CampaignSummary[]
  loading: boolean
  selectedCampaignId: string | null
  endingSessionId: string | null
  archivingCampaignId: string | null
  onSelectCampaign: (campaignId: string) => void
  onEndSession: (campaign: CampaignSummary) => void
  onToggleArchive: (campaign: CampaignSummary, shouldArchive: boolean) => void
}

export function CampaignTable({
  campaigns,
  loading,
  selectedCampaignId,
  endingSessionId,
  archivingCampaignId,
  onSelectCampaign,
  onEndSession,
  onToggleArchive,
}: CampaignTableProps) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Campaign</th>
            <th>DM</th>
            <th>Members</th>
            <th>Latest Session</th>
            <th>State</th>
            <th>Rooms</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={7}>Loading campaigns...</td>
            </tr>
          ) : campaigns.length === 0 ? (
            <tr>
              <td colSpan={7}>No campaigns matched the current filter.</td>
            </tr>
          ) : (
            campaigns.map((campaign) => {
              const latestState = campaign.latestSession?.state || 'NO_SESSION'
              const isBusy = endingSessionId === campaign.latestSession?.id
              const isArchiveBusy = archivingCampaignId === campaign.id

              return (
                <tr
                  key={campaign.id}
                  className={selectedCampaignId === campaign.id ? 'campaign-row-selected' : ''}
                >
                  <td>
                    <div className="campaign-name">{campaign.name}</div>
                    <div className="campaign-meta">Invite: {campaign.inviteCode}</div>
                  </td>
                  <td>{campaign.currentDm.username}</td>
                  <td>{campaign.memberCount}</td>
                  <td>{campaign.latestSession?.name || '—'}</td>
                  <td>
                    {campaign.isArchived ? <span className="archived-pill">Archived</span> : null}
                    <span className={`status-pill ${statusClass(latestState)}`}>
                      {latestState === 'NO_SESSION' ? 'No Session' : prettyState(latestState)}
                    </span>
                  </td>
                  <td>{campaign.latestSession?._count.rooms || 0}</td>
                  <td>
                    <div className="cell-actions">
                      <button className="admin-btn admin-btn-ghost" onClick={() => onSelectCampaign(campaign.id)}>
                        View
                      </button>
                      <button
                        className="admin-btn admin-btn-ghost"
                        onClick={() => onEndSession(campaign)}
                        disabled={!campaign.latestSession || campaign.latestSession.state === 'ENDED' || isBusy}
                      >
                        {isBusy ? 'Ending...' : 'End Session'}
                      </button>
                      <button
                        className="admin-btn admin-btn-ghost"
                        onClick={() => onToggleArchive(campaign, !campaign.isArchived)}
                        disabled={isArchiveBusy}
                      >
                        {isArchiveBusy
                          ? campaign.isArchived
                            ? 'Restoring...'
                            : 'Archiving...'
                          : campaign.isArchived
                            ? 'Restore'
                            : 'Archive'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

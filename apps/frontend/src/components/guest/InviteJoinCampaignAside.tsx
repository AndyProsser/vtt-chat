import type { InviteCampaign } from '@/types/invite'
import { getStateLabel } from '@/utils/inviteJoin'

interface InviteJoinCampaignAsideProps {
  campaign: InviteCampaign | null
  inviteCode: string
}

export function InviteJoinCampaignAside({ campaign, inviteCode }: InviteJoinCampaignAsideProps) {
  return (
    <aside
      className={`invite-join-campaign ${campaign?.posterUrl ? 'has-poster' : ''}`}
      style={
        campaign?.posterUrl
          ? {
              backgroundImage: `linear-gradient(120deg, rgba(8, 16, 28, 0.84), rgba(8, 16, 28, 0.66)), url(${campaign.posterUrl})`,
            }
          : undefined
      }
    >
      <div className="invite-join-campaign__chip">Player Invite</div>
      <h1 className="invite-join-campaign__title">{campaign?.name || 'Campaign Invite'}</h1>
      <p className="invite-join-campaign__subtitle">Invite code {inviteCode}</p>

      {campaign ? (
        <>
          <div className="invite-join-campaign__stats" aria-label="Campaign activity stats">
            <span className="invite-join-campaign__stat">
              Players {campaign.connectedPlayersLabel}
            </span>
            <span className="invite-join-campaign__stat">
              Spectators {campaign.connectedSpectatorsLabel}
            </span>
            <span className="invite-join-campaign__stat">
              {getStateLabel(campaign.displayState)}
            </span>
          </div>
          <div className="invite-join-campaign__meta">
            <span>DM</span>
            <strong>{campaign.dmDisplayName}</strong>
            <span
              className={`invite-join-campaign__presence ${campaign.dmOnline ? 'online' : 'offline'}`}
            >
              {campaign.dmOnline ? 'Online' : 'Offline'}
            </span>
          </div>
          {campaign.description ? (
            <p className="invite-join-campaign__description">{campaign.description}</p>
          ) : null}
        </>
      ) : (
        <p className="invite-join-campaign__description">Validating campaign invite.</p>
      )}
    </aside>
  )
}

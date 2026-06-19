import { memo } from 'react'
import type { ModalsProps } from '@/types/modals'

type JoinCampaignModalProps = Pick<
  ModalsProps,
  | 'showJoinCampaignModal'
  | 'joinInviteInput'
  | 'isJoiningCampaign'
  | 'onJoinCampaignSubmit'
  | 'onJoinInviteInputChange'
  | 'onCloseJoinCampaign'
>

export const JoinCampaignModal = memo(function JoinCampaignModal(props: JoinCampaignModalProps) {
  if (!props.showJoinCampaignModal) {
    return null
  }

  return (
    <div className="session-modal-backdrop session-modal-backdrop--top-offset" role="presentation">
      <div className="session-modal" role="dialog" aria-modal="true" aria-label="Join campaign">
        <h4 className="session-inline-form-title">Join Campaign</h4>
        <form onSubmit={props.onJoinCampaignSubmit}>
          <input
            type="text"
            value={props.joinInviteInput}
            onChange={(event) => props.onJoinInviteInputChange(event.target.value)}
            placeholder="Invite code or /join link"
            className="session-input"
            disabled={props.isJoiningCampaign}
            required
          />
          <div className="session-action-row session-action-row--right">
            <button
              type="button"
              className="session-button session-button-neutral"
              onClick={props.onCloseJoinCampaign}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={props.isJoiningCampaign || !props.joinInviteInput.trim()}
              className="session-button session-button-indigo"
            >
              {props.isJoiningCampaign ? 'Joining...' : 'Join'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
})

import type { ModalsProps } from '@/types/modals'

type CreateCampaignModalProps = Pick<
  ModalsProps,
  | 'showCreateCampaignModal'
  | 'user'
  | 'newCampaignName'
  | 'isCreatingCampaign'
  | 'onCloseCreateCampaign'
  | 'onCreateCampaignSubmit'
  | 'onNewCampaignNameChange'
>

export function CreateCampaignModal(props: CreateCampaignModalProps) {
  if (!props.showCreateCampaignModal) {
    return null
  }

  return (
    <div className="session-modal-backdrop session-modal-backdrop--top-offset" role="presentation">
      <div className="session-modal" role="dialog" aria-modal="true" aria-label="Create campaign">
        <h4 className="session-inline-form-title">Create Campaign</h4>
        <p className="session-card-subtitle">
          Create the campaign and either open offline edit/review mode or launch directly.
        </p>
        {props.user.authType === 'GUEST' ? (
          <p className="session-card-subtitle session-card-subtitle--warn">
            Guest access is campaign-scoped. Upgrade to a full account to create a new campaign.
          </p>
        ) : null}
        <form
          onSubmit={(event) => {
            event.preventDefault()
          }}
        >
          <label className="session-label" htmlFor="create-campaign-name">
            Campaign name
          </label>
          <input
            id="create-campaign-name"
            type="text"
            value={props.newCampaignName}
            onChange={(event) => props.onNewCampaignNameChange(event.target.value)}
            placeholder="The Emerald Crown"
            className="session-input"
            disabled={props.isCreatingCampaign}
            required
          />
          <div className="session-create-campaign-note" aria-label="Create campaign next steps">
            <p className="session-create-campaign-note__title">What happens next</p>
            <ul className="session-create-campaign-note__list">
              <li>You become the campaign DM.</li>
              <li>The new campaign appears selected in your lobby.</li>
              <li>You can open edit/review mode immediately or launch right away.</li>
            </ul>
          </div>
          <div className="session-action-row session-action-row--right">
            <button
              type="button"
              className="session-button session-button-neutral"
              onClick={props.onCloseCreateCampaign}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={
                props.isCreatingCampaign ||
                !props.newCampaignName.trim() ||
                props.user.authType === 'GUEST'
              }
              className="session-button session-button-brand"
              onClick={() => props.onCreateCampaignSubmit('edit')}
            >
              {props.isCreatingCampaign ? 'Saving...' : 'Edit'}
            </button>
            <button
              type="button"
              disabled={
                props.isCreatingCampaign ||
                !props.newCampaignName.trim() ||
                props.user.authType === 'GUEST'
              }
              className="session-button session-button-indigo"
              onClick={() => props.onCreateCampaignSubmit('launch')}
            >
              {props.isCreatingCampaign ? 'Saving...' : 'Launch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

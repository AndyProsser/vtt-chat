import { memo, useEffect, useState } from 'react'
import type { ModalsProps } from '@/types/modals'
import type { CampaignExportBundle } from '@/types/session/campaign'

type CreateCampaignModalProps = Pick<
  ModalsProps,
  | 'showCreateCampaignModal'
  | 'user'
  | 'newCampaignName'
  | 'isCreatingCampaign'
  | 'onCloseCreateCampaign'
  | 'onCreateCampaignSubmit'
  | 'onNewCampaignNameChange'
  | 'pendingImportBundle'
  | 'conflictCampaign'
>

export const CreateCampaignModal = memo(function CreateCampaignModal(
  props: CreateCampaignModalProps
) {
  const [importedBundle, setImportedBundle] = useState<CampaignExportBundle | null>(null)
  const [importConflictMode, setImportConflictMode] = useState<'replace' | 'duplicate'>('replace')

  useEffect(() => {
    if (props.showCreateCampaignModal && props.pendingImportBundle) {
      setImportedBundle(props.pendingImportBundle)
    }
    if (!props.showCreateCampaignModal) {
      setImportedBundle(null)
    }
  }, [props.showCreateCampaignModal, props.pendingImportBundle])

  useEffect(() => {
    setImportConflictMode('replace')
  }, [props.conflictCampaign])

  if (!props.showCreateCampaignModal) {
    return null
  }

  const isGuest = props.user.authType === 'GUEST'

  const conflictInfo =
    importedBundle && props.conflictCampaign
      ? { mode: importConflictMode, conflictCampaignId: props.conflictCampaign.id }
      : undefined

  return (
    <div className="session-modal-backdrop session-modal-backdrop--top-offset" role="presentation">
      <div className="session-modal" role="dialog" aria-modal="true" aria-label="Create campaign">
        <h4 className="session-inline-form-title">
          {importedBundle ? 'Import Campaign' : 'Create Campaign'}
        </h4>
        <p className="session-card-subtitle">
          {importedBundle
            ? 'Review the name below and choose how to import.'
            : 'Create the campaign and either open offline edit/review mode or launch directly.'}
        </p>
        {isGuest ? (
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
          {importedBundle ? (
            <p className="session-card-subtitle">
              Loaded export from <strong>{importedBundle.campaign.name}</strong>. Edit the name
              above to rename.
            </p>
          ) : null}

          {importedBundle && props.conflictCampaign ? (
            <div className="session-conflict-choice" role="group" aria-label="Import mode">
              <p className="session-conflict-choice__title">
                A campaign named <strong>{props.conflictCampaign.name}</strong> already exists from
                this export. What would you like to do?
              </p>
              <label className="session-conflict-choice__option">
                <input
                  type="radio"
                  name="importConflictMode"
                  value="replace"
                  checked={importConflictMode === 'replace'}
                  onChange={() => setImportConflictMode('replace')}
                  disabled={props.isCreatingCampaign}
                />
                <span>
                  <strong>Replace</strong> — restore from backup. The existing campaign and all its
                  data will be permanently deleted.
                </span>
              </label>
              <label className="session-conflict-choice__option">
                <input
                  type="radio"
                  name="importConflictMode"
                  value="duplicate"
                  checked={importConflictMode === 'duplicate'}
                  onChange={() => setImportConflictMode('duplicate')}
                  disabled={props.isCreatingCampaign}
                />
                <span>
                  <strong>Duplicate</strong> — create a new campaign alongside the existing one.
                </span>
              </label>
            </div>
          ) : null}

          {!importedBundle ? (
            <div className="session-create-campaign-note" aria-label="Create campaign next steps">
              <p className="session-create-campaign-note__title">What happens next</p>
              <ul className="session-create-campaign-note__list">
                <li>You become the campaign DM.</li>
                <li>The new campaign appears selected in your lobby.</li>
                <li>You can open edit/review mode immediately or launch right away.</li>
              </ul>
            </div>
          ) : null}

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
              disabled={props.isCreatingCampaign || !props.newCampaignName.trim() || isGuest}
              className="session-button session-button-brand"
              onClick={() =>
                props.onCreateCampaignSubmit('edit', importedBundle ?? undefined, conflictInfo)
              }
            >
              {props.isCreatingCampaign ? 'Saving...' : 'Edit'}
            </button>
            <button
              type="button"
              disabled={props.isCreatingCampaign || !props.newCampaignName.trim() || isGuest}
              className="session-button session-button-indigo"
              onClick={() =>
                props.onCreateCampaignSubmit('launch', importedBundle ?? undefined, conflictInfo)
              }
            >
              {props.isCreatingCampaign ? 'Saving...' : 'Launch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
})

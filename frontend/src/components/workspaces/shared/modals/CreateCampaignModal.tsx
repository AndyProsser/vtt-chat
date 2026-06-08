import { useRef, useState } from 'react'
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
>

function isValidExportBundle(raw: unknown): raw is CampaignExportBundle {
  if (!raw || typeof raw !== 'object') return false
  const b = raw as Record<string, unknown>
  return (
    b.version === 1 &&
    typeof b.sourceCampaignId === 'string' &&
    typeof b.campaign === 'object' &&
    b.campaign !== null &&
    typeof (b.campaign as Record<string, unknown>).name === 'string' &&
    Array.isArray(b.members) &&
    Array.isArray(b.sessions) &&
    Array.isArray(b.recordings)
  )
}

export function CreateCampaignModal(props: CreateCampaignModalProps) {
  const [importedBundle, setImportedBundle] = useState<CampaignExportBundle | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!props.showCreateCampaignModal) {
    return null
  }

  function handleImportClick() {
    setImportError(null)
    fileInputRef.current?.click()
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const raw = JSON.parse(e.target?.result as string)
        if (!isValidExportBundle(raw)) {
          setImportError('File is not a valid VTT-Chat campaign export.')
          return
        }
        setImportedBundle(raw)
        setImportError(null)
        props.onNewCampaignNameChange(raw.campaign.name)
      } catch {
        setImportError('Could not read the file. Make sure it is a valid JSON export.')
      }
    }
    reader.readAsText(file)
  }

  const isGuest = props.user.authType === 'GUEST'

  return (
    <div className="session-modal-backdrop session-modal-backdrop--top-offset" role="presentation">
      <div className="session-modal" role="dialog" aria-modal="true" aria-label="Create campaign">
        <h4 className="session-inline-form-title">Create Campaign</h4>
        <p className="session-card-subtitle">
          Create the campaign and either open offline edit/review mode or launch directly.
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
          {importError ? (
            <p className="session-card-subtitle session-card-subtitle--warn">{importError}</p>
          ) : null}
          <div className="session-create-campaign-note" aria-label="Create campaign next steps">
            <p className="session-create-campaign-note__title">What happens next</p>
            <ul className="session-create-campaign-note__list">
              <li>You become the campaign DM.</li>
              <li>The new campaign appears selected in your lobby.</li>
              <li>You can open edit/review mode immediately or launch right away.</li>
            </ul>
          </div>
          <div className="session-action-row session-action-row--right">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <button
              type="button"
              className="session-button session-button-neutral"
              style={{ marginRight: 'auto' }}
              disabled={props.isCreatingCampaign || isGuest}
              onClick={handleImportClick}
            >
              Import
            </button>
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
              onClick={() => props.onCreateCampaignSubmit('edit', importedBundle ?? undefined)}
            >
              {props.isCreatingCampaign ? 'Saving...' : 'Edit'}
            </button>
            <button
              type="button"
              disabled={props.isCreatingCampaign || !props.newCampaignName.trim() || isGuest}
              className="session-button session-button-indigo"
              onClick={() => props.onCreateCampaignSubmit('launch', importedBundle ?? undefined)}
            >
              {props.isCreatingCampaign ? 'Saving...' : 'Launch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import { MarkdownEditor } from '@/components/workspaces/shared/panels/MarkdownEditor'
import type { CampaignInformationEditBodyProps } from '@/types/campaignInformationPanel'
import { Icon } from '@/components/ui/Icon'

/**
 * Editable campaign metadata body (name/description/poster) with status summary.
 */
export function CampaignInformationEditBody({
  nameDraft,
  descriptionDraft,
  isSaving,
  onNameChange,
  onDescriptionChange,
  currentPoster,
  campaignName,
  posterUrlDraft,
  onClearPoster,
  onPosterUpload,
  statusLine,
}: CampaignInformationEditBodyProps) {
  return (
    <>
      <label className="cip-field-label" htmlFor="cip-name">
        Name
      </label>
      <input
        id="cip-name"
        className="cip-input"
        type="text"
        value={nameDraft}
        onChange={(event) => onNameChange(event.target.value)}
        disabled={isSaving}
      />
      <label className="cip-field-label" htmlFor="cip-description">
        Description
      </label>
      <div id="cip-description">
        <MarkdownEditor
          value={descriptionDraft}
          onChange={onDescriptionChange}
          readOnly={isSaving}
          variant="full"
          className="cip-markdown-editor"
          placeholder="Describe the campaign, current arc, tone, and prep notes…"
        />
      </div>

      {statusLine}

      <div className="cip-poster-controls">
        <label className="cip-field-label" htmlFor="cip-poster-file">
          Poster image
        </label>
        <div
          className={`cip-poster-surface cip-poster-surface--editable ${currentPoster ? 'has-image' : ''}`}
          style={currentPoster ? { backgroundImage: `url(${currentPoster})` } : undefined}
          aria-label="Poster preview"
        >
          {!currentPoster ? (
            <div className="cip-poster__placeholder">{campaignName.charAt(0).toUpperCase()}</div>
          ) : null}
          <div className="cip-poster-overlay" aria-hidden="true">
            {posterUrlDraft ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="cip-poster-clear"
                    aria-label="Clear poster image"
                    onClick={onClearPoster}
                    disabled={isSaving}
                  >
                    <Icon name="close" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Remove poster image</TooltipContent>
              </Tooltip>
            ) : null}
            <label
              htmlFor="cip-poster-file"
              className="session-button session-button-neutral cip-browse-button"
            >
              Browse...
            </label>
          </div>
          <input
            id="cip-poster-file"
            type="file"
            accept="image/*"
            onChange={onPosterUpload}
            disabled={isSaving}
            className="cip-visually-hidden"
          />
        </div>
        <p className="cip-muted">External poster sync stores a local copy.</p>
      </div>
    </>
  )
}

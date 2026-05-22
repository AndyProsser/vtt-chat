import type { ReactNode, RefObject } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'

type MarkdownMode = 'bold' | 'italic' | 'ul' | 'ol'

type CampaignInformationEditBodyProps = {
  nameDraft: string
  descriptionDraft: string
  isSaving: boolean
  onNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onApplyMarkdown: (mode: MarkdownMode) => void
  descriptionInputRef: RefObject<HTMLTextAreaElement | null>
  currentPoster: string | null | undefined
  campaignName: string
  posterUrlDraft: string | null
  onClearPoster: () => void
  onPosterUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
  statusLine: ReactNode
}

/**
 * Editable campaign metadata body (name/description/poster) with status summary.
 */
export function CampaignInformationEditBody({
  nameDraft,
  descriptionDraft,
  isSaving,
  onNameChange,
  onDescriptionChange,
  onApplyMarkdown,
  descriptionInputRef,
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
      <div className="cip-toolbar" role="toolbar" aria-label="Description formatting">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="cip-toolbar__button"
              onClick={() => onApplyMarkdown('bold')}
              disabled={isSaving}
              aria-label="Bold"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                format_bold
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Bold</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="cip-toolbar__button"
              onClick={() => onApplyMarkdown('italic')}
              disabled={isSaving}
              aria-label="Italic"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                format_italic
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Italic</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="cip-toolbar__button"
              onClick={() => onApplyMarkdown('ul')}
              disabled={isSaving}
              aria-label="Bullet list"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                format_list_bulleted
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Bullet list</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="cip-toolbar__button"
              onClick={() => onApplyMarkdown('ol')}
              disabled={isSaving}
              aria-label="Numbered list"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                format_list_numbered
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Numbered list</TooltipContent>
        </Tooltip>
      </div>
      <textarea
        id="cip-description"
        ref={descriptionInputRef}
        className="cip-textarea"
        rows={7}
        value={descriptionDraft}
        onChange={(event) => onDescriptionChange(event.target.value)}
        disabled={isSaving}
      />

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
                    <span className="material-symbols-outlined" aria-hidden="true">
                      close
                    </span>
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

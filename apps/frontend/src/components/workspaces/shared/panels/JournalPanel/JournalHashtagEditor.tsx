import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { Icon } from '@/components/ui/Icon'

interface JournalHashtagEditorProps {
  isEditing: boolean
  draftHashtagsInput: string
  displayHashtags: string[]
  autocompleteHashtagSuggestions: string[]
  contentHashtagSuggestions: string[]
  onInputChange: (value: string) => void
  onInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
  onTagHelp: () => void
  onApplyHashtag: (tag: string) => void
}

/** Renders the hashtag input/autocomplete row (edit mode) or tag chip list (read mode). */
export function JournalHashtagEditor({
  isEditing,
  draftHashtagsInput,
  displayHashtags,
  autocompleteHashtagSuggestions,
  contentHashtagSuggestions,
  onInputChange,
  onInputKeyDown,
  onTagHelp,
  onApplyHashtag,
}: JournalHashtagEditorProps) {
  return (
    <div className="knowledge-panel__journal-meta">
      {isEditing ? (
        <>
          <div className="knowledge-panel__journal-tag-row-wrap">
            <input
              className="knowledge-panel__journal-tag-input knowledge-panel__journal-tag-input--wide"
              value={draftHashtagsInput}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="#recap #loot #npc"
              maxLength={160}
              aria-label="Journal hashtags"
            />
            <TooltipProvider delayDuration={140}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="knowledge-panel__journal-tag-help-btn"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={onTagHelp}
                    aria-label="Insert Recommended Tags"
                  >
                    <Icon name="sell" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Insert Recommended Tags</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="knowledge-panel__journal-tag-row">
            {autocompleteHashtagSuggestions.map((tag) => (
              <button
                key={tag}
                type="button"
                className="knowledge-panel-chip muted"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onApplyHashtag(tag)}
              >
                {tag}
              </button>
            ))}
            {contentHashtagSuggestions.slice(0, 4).map((tag) => (
              <button
                key={tag}
                type="button"
                className="knowledge-panel-chip muted"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onApplyHashtag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="knowledge-panel-chip-row">
          {displayHashtags.map((tag) => (
            <span key={tag} className="knowledge-panel-chip muted">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

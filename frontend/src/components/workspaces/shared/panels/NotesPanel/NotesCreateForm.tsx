import { useMemo } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { MarkdownEditor } from '@/components/workspaces/shared/panels/MarkdownEditor'
import { useToast } from '@/hooks/useToast'
import { createNotesImageInsertActions } from '@/utils/notesImageInsertActions'

interface NotesCreateFormProps {
  title: string
  content: string
  tagsText: string
  isCreating: boolean
  onSubmit: React.FormEventHandler<HTMLFormElement>
  onTitleChange: (value: string) => void
  onContentChange: (value: string) => void
  onTagsTextChange: (value: string) => void
}

export function NotesCreateForm(props: NotesCreateFormProps) {
  const showToast = useToast()
  const imageInsertActions = useMemo(() => createNotesImageInsertActions(showToast), [showToast])

  return (
    <form onSubmit={props.onSubmit} className="notes-create-form">
      <div className="notes-edit-header">
        <div className="notes-edit-title-wrap">
          <label className="notes-edit-label" htmlFor="notes-create-title">
            Handout title
          </label>
          <input
            id="notes-create-title"
            value={props.title}
            onChange={(event) => props.onTitleChange(event.target.value)}
            placeholder="Handout title"
            required
            className="notes-edit-input"
          />
        </div>
        <div className="notes-edit-icon-actions">
          <TooltipProvider delayDuration={140}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="submit"
                  disabled={props.isCreating}
                  className="notes-edit-icon-button"
                  aria-label="Save note"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {props.isCreating ? 'hourglass_top' : 'save'}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Save Note</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <MarkdownEditor
        value={props.content}
        onChange={props.onContentChange}
        placeholder="Write note content"
        variant="full"
        insertActions={imageInsertActions}
      />

      <div className="notes-edit-meta-row">
        <div className="notes-edit-meta-col">
          <label className="notes-edit-label" htmlFor="notes-create-tags">
            Hashtags
          </label>
          <input
            id="notes-create-tags"
            value={props.tagsText}
            onChange={(event) => props.onTagsTextChange(event.target.value)}
            placeholder="#npc, #city, #clue"
            className="notes-edit-input"
          />
        </div>
      </div>
    </form>
  )
}

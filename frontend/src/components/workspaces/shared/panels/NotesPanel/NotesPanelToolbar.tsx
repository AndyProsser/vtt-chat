import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'

export type NotesPublishFilter = 'ALL' | 'SHARED' | 'UNSHARED'

interface NotesPanelToolbarProps {
  showCreateForm: boolean
  publishFilter: NotesPublishFilter
  toolbarCountLabel: string
  activeHashtagFilter: string | null
  onToggleCreateForm: () => void
  onSetPublishFilter: (filter: NotesPublishFilter) => void
  onClearHashtagFilter: () => void
}

export function NotesPanelToolbar({
  showCreateForm,
  publishFilter,
  toolbarCountLabel,
  activeHashtagFilter,
  onToggleCreateForm,
  onSetPublishFilter,
  onClearHashtagFilter,
}: NotesPanelToolbarProps) {
  return (
    <div className="notes-workspace-toolbar">
      <TooltipProvider delayDuration={140}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="notes-toolbar-segment notes-toolbar-segment--icon"
              onClick={onToggleCreateForm}
              aria-label={showCreateForm ? 'Hide handout creator' : 'Create handout'}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {showCreateForm ? 'visibility_off' : 'note_add'}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {showCreateForm ? 'Hide handout creator' : 'Create handout'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="notes-toolbar-segmented" role="tablist" aria-label="Handout publish filter">
        {(['ALL', 'SHARED', 'UNSHARED'] as NotesPublishFilter[]).map((filter) => (
          <button
            key={filter}
            type="button"
            role="tab"
            aria-selected={publishFilter === filter}
            className={`notes-toolbar-segment ${publishFilter === filter ? 'is-selected' : ''}`}
            onClick={() => onSetPublishFilter(filter)}
          >
            {filter}
          </button>
        ))}
      </div>

      {activeHashtagFilter ? (
        <button type="button" className="notes-toolbar-filter-chip" onClick={onClearHashtagFilter}>
          {activeHashtagFilter} x
        </button>
      ) : null}

      <span className="notes-toolbar-count">{toolbarCountLabel}</span>
    </div>
  )
}

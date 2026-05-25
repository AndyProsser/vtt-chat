export type NotesPublishFilter = 'ALL' | 'SHARED' | 'UNSHARED'

interface NotesPanelToolbarProps {
  publishFilter: NotesPublishFilter
  activeHashtagFilter: string | null
  onSetPublishFilter: (filter: NotesPublishFilter) => void
  onClearHashtagFilter: () => void
}

export function NotesPanelToolbar({
  publishFilter,
  activeHashtagFilter,
  onSetPublishFilter,
  onClearHashtagFilter,
}: NotesPanelToolbarProps) {
  return (
    <div className="notes-workspace-toolbar">
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
    </div>
  )
}

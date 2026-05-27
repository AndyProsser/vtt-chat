import { useRef } from 'react'
import { Icon } from '@/components/ui/Icon'

export type NotesPublishFilter = 'ALL' | 'SHARED' | 'UNSHARED'

interface NotesPanelToolbarProps {
  publishFilter: NotesPublishFilter
  searchQuery: string
  activeHashtagFilter: string | null
  onSetPublishFilter: (filter: NotesPublishFilter) => void
  onSetSearchQuery: (query: string) => void
  onClearHashtagFilter: () => void
}

export function NotesPanelToolbar({
  publishFilter,
  searchQuery,
  activeHashtagFilter,
  onSetPublishFilter,
  onSetSearchQuery,
  onClearHashtagFilter,
}: NotesPanelToolbarProps) {
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  return (
    <div className="notes-workspace-toolbar">
      <label className="knowledge-panel-filter-field" htmlFor="notes-search-input">
        <span>Search</span>
        <div className="knowledge-panel-history__search-input-wrap">
          <input
            id="notes-search-input"
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(event) => onSetSearchQuery(event.target.value)}
            placeholder="Search titles, content, hashtags"
            autoComplete="off"
          />
          {searchQuery.length > 0 ? (
            <button
              type="button"
              className="knowledge-panel-history__search-clear"
              aria-label="Clear handout search"
              onClick={() => {
                onSetSearchQuery('')
                searchInputRef.current?.focus()
              }}
            >
              <Icon name="close" />
            </button>
          ) : null}
        </div>
      </label>

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

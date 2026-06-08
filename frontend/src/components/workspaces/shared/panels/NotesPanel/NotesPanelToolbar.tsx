import { useRef } from 'react'
import { Icon } from '@/components/ui/Icon'

interface NotesPanelToolbarProps {
  searchQuery: string
  activeHashtagFilter: string | null
  allHashtags: string[]
  onSetSearchQuery: (query: string) => void
  onSetHashtagFilter: (tag: string | null) => void
}

export function NotesPanelToolbar({
  searchQuery,
  activeHashtagFilter,
  allHashtags,
  onSetSearchQuery,
  onSetHashtagFilter,
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

      {allHashtags.length > 0 ? (
        <div className="notes-toolbar-hashtags" aria-label="Filter by hashtag">
          {allHashtags.map((tag) => {
            const isActive = activeHashtagFilter === tag
            return (
              <button
                key={tag}
                type="button"
                className={`knowledge-panel-chip muted${isActive ? ' knowledge-panel-chip--active' : ''}`}
                onClick={() => onSetHashtagFilter(isActive ? null : tag)}
                aria-pressed={isActive}
              >
                {tag}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

import type { DmdxParsed } from '@/utils/dmdx/dmdxParser'
import { dmdxArr, dmdxStr } from '@/utils/dmdx/dmdxParser'

export function DmdxSessionBlock({ parsed }: { parsed: DmdxParsed }) {
  const date = dmdxStr(parsed, 'date')
  const dm = dmdxStr(parsed, 'dm')
  const players = dmdxArr(parsed, 'players')
  const summary = dmdxStr(parsed, 'summary')
  const events = dmdxArr(parsed, 'events')

  return (
    <div className="dmdx-block dmdx-block--session">
      <div className="dmdx-block__header">
        <div className="dmdx-block__header-text">
          <span className="dmdx-block__type-label">
            <span className="material-symbols-outlined" aria-hidden="true">
              menu_book
            </span>
            Session Log
          </span>
          <div className="dmdx-block__tag-row">
            {date ? <span className="dmdx-block__tag">{date}</span> : null}
            {dm ? <span className="dmdx-block__tag">DM: {dm}</span> : null}
          </div>
        </div>
      </div>

      {players.length > 0 ? (
        <div className="dmdx-session__players">
          <p className="dmdx-block__section-label">Players</p>
          <div className="dmdx-block__tag-row">
            {players.map((p, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <span key={i} className="dmdx-block__tag">
                {p}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {summary ? <p className="dmdx-block__notes">{summary}</p> : null}

      {events.length > 0 ? (
        <div className="dmdx-session__events">
          <p className="dmdx-block__section-label">Key Events</p>
          <ul className="dmdx-block__list">
            {events.map((ev, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <li key={i}>{ev}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

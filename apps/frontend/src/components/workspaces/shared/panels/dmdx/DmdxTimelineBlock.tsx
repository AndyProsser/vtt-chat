import type { DmdxParsed } from '@/utils/dmdx/dmdxParser'
import { dmdxArr, dmdxStr } from '@/utils/dmdx/dmdxParser'
import { Icon } from '@/components/ui/Icon'

interface TimelineEvent {
  label: string
  description: string
}

function parseTimelineEvents(rawEvents: string[]): TimelineEvent[] {
  return rawEvents.map((event) => {
    const sepIdx = event.indexOf(' : ')
    if (sepIdx === -1) return { label: event.trim(), description: '' }
    return {
      label: event.slice(0, sepIdx).trim(),
      description: event.slice(sepIdx + 3).trim(),
    }
  })
}

/**
 * Renders a DMDX timeline block as a lightweight CSS vertical timeline.
 *
 * Expected format:
 *   title: Campaign Timeline   (optional)
 *   events:
 *     - Session 1 : Party met in tavern
 *     - Session 5 : Dragon defeated
 */
export function DmdxTimelineBlock({ parsed }: { parsed: DmdxParsed }) {
  const title = dmdxStr(parsed, 'title')
  const events = parseTimelineEvents(dmdxArr(parsed, 'events'))

  return (
    <div className="dmdx-block dmdx-block--timeline">
      <div className="dmdx-block__header">
        <Icon name="timeline" className="dmdx-timeline__icon" />
        <div className="dmdx-block__header-text">
          <span className="dmdx-block__type-label">Timeline</span>
          {title ? <h4 className="dmdx-block__title">{title}</h4> : null}
        </div>
      </div>

      {events.length === 0 ? (
        <p className="dmdx-block__empty">No events defined.</p>
      ) : (
        <ol className="dmdx-timeline__events">
          {events.map((event, i) => (
            <li key={i} className="dmdx-timeline__event">
              <span className="dmdx-timeline__dot" aria-hidden="true" />
              <div className="dmdx-timeline__event-body">
                <span className="dmdx-timeline__event-label">{event.label}</span>
                {event.description ? (
                  <span className="dmdx-timeline__event-desc">{event.description}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

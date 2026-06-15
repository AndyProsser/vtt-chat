import { Icon } from '@/components/ui/Icon'

interface HistoryRecapRowProps {
  recapLabel: string
  body: string
}

export function HistoryRecapRow({ recapLabel, body }: HistoryRecapRowProps) {
  return (
    <article className="session-message-list__session-recap">
      <Icon name="menu_book" className="session-message-list__session-recap-icon" />
      <div className="session-message-list__session-recap-body">
        <span className="session-message-list__session-recap-label">{recapLabel}</span>
        <p className="session-message-list__session-recap-text">{body}</p>
      </div>
    </article>
  )
}

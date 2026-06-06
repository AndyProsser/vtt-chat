interface HistoryRecapRowProps {
  recapLabel: string
  body: string
}

export function HistoryRecapRow({ recapLabel, body }: HistoryRecapRowProps) {
  return (
    <article className="session-message-list__session-recap">
      <span
        className="session-message-list__session-recap-icon material-symbols-outlined"
        aria-hidden="true"
      >
        menu_book
      </span>
      <div className="session-message-list__session-recap-body">
        <span className="session-message-list__session-recap-label">{recapLabel}</span>
        <p className="session-message-list__session-recap-text">{body}</p>
      </div>
    </article>
  )
}

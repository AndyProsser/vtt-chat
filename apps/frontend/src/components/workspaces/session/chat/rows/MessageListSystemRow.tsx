import { NoteSharedCard } from '@/components/workspaces/shared/panels/NoteSharedCard'
import type { PreparedMessage } from '../MessageList'
import { BOOKEND_META } from '../MessageList.helpers'
import { formatDuration } from '../MessageList.helpers'
import { Icon } from '@/components/ui/Icon'

interface MessageListSystemRowProps {
  prepared: PreparedMessage
}

export function MessageListSystemRow({ prepared }: MessageListSystemRowProps) {
  const {
    msg,
    isSessionBookend,
    sessionBookendState,
    isSessionNote,
    noteShared,
    recapPrefix,
    isSessionRecap,
    isSessionSummary,
    summaryStats,
    relativeTime,
    bookendTime,
  } = prepared

  if (isSessionSummary) {
    const stats = summaryStats
    if (!stats) return null
    const durationMs = stats.endedAt && stats.startedAt ? stats.endedAt - stats.startedAt : null
    const startedDisplay = stats.startedAt
      ? new Date(stats.startedAt).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : null

    return (
      <article className="session-message-list__session-summary">
        <div className="session-message-list__session-summary-header">
          <Icon name="summarize" className="session-message-list__session-summary-icon" />
          <span className="session-message-list__session-summary-title">{stats.sessionName}</span>
        </div>
        <dl className="session-message-list__session-summary-stats">
          {startedDisplay && (
            <>
              <dt>Started</dt>
              <dd>{startedDisplay}</dd>
            </>
          )}
          {durationMs !== null && (
            <>
              <dt>Session Time</dt>
              <dd>{formatDuration(durationMs)}</dd>
            </>
          )}
          <dt>Players</dt>
          <dd>{stats.playerCount}</dd>
          {(stats.cumulativePauseMs > 0 || stats.pauseCount > 0) && (
            <>
              <dt>Paused</dt>
              <dd>
                {formatDuration(stats.cumulativePauseMs)}
                {stats.pauseCount >= 1 && ` (${stats.pauseCount}×)`}
              </dd>
            </>
          )}
        </dl>
        {stats.quip && <p className="session-message-list__session-summary-quip">{stats.quip}</p>}
      </article>
    )
  }

  if (isSessionRecap) {
    const recapBody = msg.content.slice(recapPrefix.length).trim()
    const recapLabel = recapPrefix === '[Campaign Brief]' ? 'Campaign Brief' : 'Last Session'
    return (
      <article className="session-message-list__session-recap">
        <Icon name="menu_book" className="session-message-list__session-recap-icon" />
        <div className="session-message-list__session-recap-body">
          <span className="session-message-list__session-recap-label">{recapLabel}</span>
          <p className="session-message-list__session-recap-text">{recapBody}</p>
        </div>
      </article>
    )
  }

  if (isSessionBookend || isSessionNote) {
    const markerMeta = sessionBookendState ? BOOKEND_META[sessionBookendState] : null
    return (
      <article
        className={`session-message-list__session-marker ${isSessionBookend ? 'session-message-list__session-marker--bookend' : 'session-message-list__session-marker--note'} ${markerMeta?.className || ''}`}
      >
        {isSessionBookend && markerMeta ? (
          <div className="session-message-list__session-marker-content">
            <div className="session-message-list__session-marker-label-row">
              <span className="session-message-list__session-marker-line" aria-hidden="true" />
              <span className="session-message-list__session-marker-badge">
                <span
                  className="session-message-list__session-marker-icon material-symbols-outlined"
                  aria-hidden="true"
                >
                  {markerMeta.icon}
                </span>
                <span className="session-message-list__session-marker-text">
                  {markerMeta.label}
                </span>
                <span
                  className="session-message-list__session-marker-icon material-symbols-outlined"
                  aria-hidden="true"
                >
                  {markerMeta.icon}
                </span>
              </span>
              <span className="session-message-list__session-marker-line" aria-hidden="true" />
            </div>
            <time
              className="session-message-list__session-marker-time"
              dateTime={new Date(msg.createdAt).toISOString()}
            >
              {bookendTime}
            </time>
          </div>
        ) : (
          <span className="session-message-list__session-marker-text">{msg.content}</span>
        )}
      </article>
    )
  }

  if (noteShared) {
    return (
      <NoteSharedCard
        note={noteShared}
        timestampLabel={`${msg.editedAt ? 'edited · ' : ''}${relativeTime}`}
        timestampDateTime={new Date(msg.createdAt).toISOString()}
        isExcerpt={noteShared.excerptSource != null}
      />
    )
  }

  return null
}

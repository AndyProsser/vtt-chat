import type { SessionHistoryMessage } from '@/types/history'
import { getAuthorInitial, toMessageVariant, toTypeIcon } from '../HistoryPanel.helpers'

interface HistoryMessageRowProps {
  message: SessionHistoryMessage
  isSelf: boolean
  isGroupedWithPrevious: boolean
  whisperRouteEntries: string[]
  hasWhisperRoute: boolean
  isDmWhisper: boolean
}

export function HistoryMessageRow({
  message,
  isSelf,
  isGroupedWithPrevious,
  whisperRouteEntries,
  hasWhisperRoute,
  isDmWhisper,
}: HistoryMessageRowProps) {
  const variant = toMessageVariant(message.type)
  const authorLabel = message.authorCharacterName || message.authorUsername

  return (
    <article
      className={`session-message-list__message ${isSelf ? 'session-message-list__message--self' : ''} ${isGroupedWithPrevious ? 'session-message-list__message--grouped' : ''}`}
    >
      <div className="session-message-list__message-row">
        {!isSelf && !isGroupedWithPrevious ? (
          <span
            className={`session-message-list__message-avatar ${variant === 'system' ? 'session-message-list__message-avatar--system' : ''}`}
            aria-hidden="true"
          >
            {getAuthorInitial(authorLabel)}
          </span>
        ) : (
          <span
            className="session-message-list__message-avatar session-message-list__message-avatar--spacer"
            aria-hidden="true"
          />
        )}

        <div className="session-message-list__message-content">
          {!isGroupedWithPrevious ? (
            <div className="session-message-list__message-meta">
              <span className="session-message-list__message-author">{authorLabel}</span>
            </div>
          ) : null}

          <div
            className={`session-message-list__message-bubble session-message-list__message-bubble--${variant} ${isSelf ? 'session-message-list__message-bubble--self' : ''}`}
          >
            <span
              className={`session-message-list__message-type-icon session-message-list__message-type-icon--${variant} material-symbols-outlined`}
              aria-hidden="true"
            >
              {toTypeIcon(variant)}
            </span>
            <span className="session-message-list__message-bubble-text">{message.content}</span>
          </div>

          <div
            className={`session-message-list__message-footer ${hasWhisperRoute ? `session-message-list__message-footer--whisper ${isSelf ? 'session-message-list__message-footer--whisper-outgoing' : 'session-message-list__message-footer--whisper-incoming'}` : ''}`}
          >
            {hasWhisperRoute ? (
              <div
                className={`session-message-list__message-whisper-meta ${isSelf ? 'session-message-list__message-whisper-meta--outgoing' : 'session-message-list__message-whisper-meta--incoming'}`}
              >
                {!isSelf ? (
                  <div className="session-message-list__message-whisper-meta-row--incoming">
                    <div className="session-message-list__message-timestamp session-message-list__message-timestamp--whisper">
                      {new Date(message.createdAt).toLocaleTimeString()}
                    </div>
                    <div
                      className={`session-message-list__message-whisper-route session-message-list__message-whisper-route--incoming-list ${isDmWhisper ? 'session-message-list__message-whisper-route--dm' : ''}`}
                    >
                      {whisperRouteEntries.map((line, index) => (
                        <div
                          key={`${message.id}-whisper-${index}`}
                          className="session-message-list__message-whisper-route-line"
                        >
                          <span
                            className="session-message-list__message-whisper-connector"
                            aria-hidden="true"
                          >
                            <span className="material-symbols-outlined" aria-hidden="true">
                              subdirectory_arrow_right
                            </span>
                          </span>
                          <span className="session-message-list__message-whisper-route-label">
                            {line}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      className={`session-message-list__message-whisper-route session-message-list__message-whisper-route--stacked session-message-list__message-whisper-route--outgoing ${isDmWhisper ? 'session-message-list__message-whisper-route--dm' : ''}`}
                    >
                      {whisperRouteEntries.map((line, index) => (
                        <div
                          key={`${message.id}-whisper-${index}`}
                          className="session-message-list__message-whisper-route-line"
                        >
                          <span className="session-message-list__message-whisper-route-label">
                            {line}
                          </span>
                          <span
                            className="session-message-list__message-whisper-connector"
                            aria-hidden="true"
                          >
                            <span className="material-symbols-outlined" aria-hidden="true">
                              subdirectory_arrow_left
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="session-message-list__message-timestamp session-message-list__message-timestamp--whisper">
                      {new Date(message.createdAt).toLocaleTimeString()}
                    </div>
                  </>
                )}
              </div>
            ) : null}
            {!hasWhisperRoute ? (
              <span className="session-message-list__message-timestamp">
                {new Date(message.createdAt).toLocaleTimeString()}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}

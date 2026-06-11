import type { OutgoingChatMessage } from '@/state/chatSlice'

interface ChatWindowFailedQueueProps {
  items: OutgoingChatMessage[]
  sessionId: string
  onRetry: (entry: OutgoingChatMessage) => void
  onDismiss: (id: string) => void
}

/** Renders the failed-send queue with per-item retry/dismiss actions. */
export function ChatWindowFailedQueue({
  items,
  sessionId: _sessionId,
  onRetry,
  onDismiss,
}: ChatWindowFailedQueueProps) {
  if (items.length === 0) return null

  return (
    <section className="session-chat-window__queue-debug" aria-live="polite">
      <div className="session-chat-window__queue-debug-title">Failed sends ({items.length})</div>
      <div className="session-chat-window__queue-debug-list">
        {items.slice(0, 3).map((entry) => (
          <div key={entry.id} className="session-chat-window__queue-debug-item">
            <p className="session-chat-window__queue-debug-content">{entry.content}</p>
            <div className="session-chat-window__queue-debug-actions">
              <button
                type="button"
                className="session-chat-window__queue-debug-button"
                onClick={() => onRetry(entry)}
              >
                Retry
              </button>
              <button
                type="button"
                className="session-chat-window__queue-debug-button session-chat-window__queue-debug-button--quiet"
                onClick={() => onDismiss(entry.id)}
              >
                Dismiss
              </button>
            </div>
            {entry.error ? (
              <p className="session-chat-window__queue-debug-error">{entry.error}</p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * MessageListRollRow
 * Renders a /roll result card in the chat list.
 * Shows the dice expression, individual die results, modifier, and total.
 * When roll metadata is unavailable (old format), falls back to text content.
 */

import { Fragment } from 'react'
import type { PreparedMessage } from '../MessageList'
import type { RollResultMessageMetadata } from '@shared'
import { Icon } from '@/components/ui/Icon'

interface MessageListRollRowProps {
  prepared: PreparedMessage
}

export function MessageListRollRow({ prepared }: MessageListRollRowProps) {
  const {
    msg,
    isSelf,
    isGroupedWithPrevious,
    showRoomShift,
    showDaySeparator,
    dayLabel,
    relativeTime,
    roomName,
    authorName,
  } = prepared

  const rollResult = (msg.metadata as any)?.rollResult as RollResultMessageMetadata | undefined

  return (
    <Fragment>
      {showDaySeparator ? (
        <div
          className="session-message-list__day-separator"
          aria-label={`Messages from ${dayLabel}`}
        >
          <span className="session-message-list__day-separator-line" aria-hidden="true" />
          <span className="session-message-list__day-separator-pill">{dayLabel}</span>
          <span className="session-message-list__day-separator-line" aria-hidden="true" />
        </div>
      ) : null}

      {showRoomShift ? (
        <div className="session-message-list__room-shift" aria-label={`Room shift to ${roomName}`}>
          <span className="session-message-list__room-shift-line" aria-hidden="true" />
          <span className="session-message-list__room-shift-pill">{roomName}</span>
        </div>
      ) : null}

      <article
        className={`session-message-list__message session-roll-card ${isSelf ? 'session-roll-card--self' : ''} ${isGroupedWithPrevious ? 'session-message-list__message--grouped' : ''}`}
      >
        <div className="session-message-list__message-row">
          {!isGroupedWithPrevious ? (
            <span className="session-message-list__message-avatar" aria-hidden="true">
              <Icon name="casino" className="session-roll-card__dice-icon" />
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
                <span className="session-message-list__message-author">{authorName}</span>
              </div>
            ) : null}

            {rollResult ? (
              <div className="session-roll-card__body">
                <div className="session-roll-card__expression">
                  <Icon name="casino" className="session-roll-card__expression-icon" />
                  <span className="session-roll-card__expression-text">
                    {rollResult.expression}
                  </span>
                  {rollResult.advantage ? (
                    <span
                      className={`session-roll-card__advantage-badge session-roll-card__advantage-badge--${rollResult.advantage.toLowerCase()}`}
                    >
                      {rollResult.advantage}
                    </span>
                  ) : null}
                </div>

                <div className="session-roll-card__result">
                  <div className="session-roll-card__dice">
                    {rollResult.rolls.map((roll: number, i: number) => {
                      const isDropped = rollResult.advantage != null && i !== rollResult.keptIndex
                      return (
                        <span
                          key={i}
                          className={`session-roll-card__die${isDropped ? ' session-roll-card__die--dropped' : ''}`}
                          aria-label={isDropped ? `${roll} (dropped)` : String(roll)}
                        >
                          {roll}
                        </span>
                      )
                    })}
                    {rollResult.modifier !== 0 ? (
                      <span className="session-roll-card__modifier">
                        {rollResult.modifier > 0 ? '+' : ''}
                        {rollResult.modifier}
                      </span>
                    ) : null}
                  </div>
                  <span className="session-roll-card__equals" aria-hidden="true">
                    =
                  </span>
                  <span className="session-roll-card__total">{rollResult.total}</span>
                </div>
              </div>
            ) : (
              // Fallback: render content as plain text (missing metadata)
              <div className="session-message-list__message-bubble session-message-list__message-bubble--system">
                <span className="session-message-list__message-bubble-text">{msg.content}</span>
              </div>
            )}

            <div className="session-message-list__message-footer">
              <div className="session-message-list__message-timestamp">{relativeTime}</div>
            </div>
          </div>
        </div>
      </article>
    </Fragment>
  )
}

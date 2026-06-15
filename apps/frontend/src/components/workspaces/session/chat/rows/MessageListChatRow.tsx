import type { ReactNode } from 'react'
import { Fragment } from 'react'
import { MessageType, findConditionPreset, findDistancePreset } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import type { PreparedMessage } from '../MessageList'
import { TYPE_LABEL_BY_VARIANT } from '../MessageList.helpers'
import { getAuthorInitial } from '@/utils/format'
import { Icon } from '@/components/ui/Icon'

interface MessageListChatRowProps {
  prepared: PreparedMessage
  activeRoomId?: string
}

export function MessageListChatRow({ prepared, activeRoomId }: MessageListChatRowProps) {
  const {
    msg,
    variant,
    isSystem,
    isSelf,
    roomName,
    authorName,
    authorAvatarUrl,
    whisperRouteEntries,
    hasWhisperRoute,
    isDmWhisper,
    bubbleWhisperClass,
    typeIconClass,
    typeIcon,
    isGroupedWithPrevious,
    showRoomShift,
    showDaySeparator,
    dayLabel,
    relativeTime,
  } = prepared

  if (prepared.conditionMessage) {
    const { isRemoval, presetName, overrideType = 'CONDITION' } = prepared.conditionMessage
    const isDistance = overrideType === 'DISTANCE'
    const conditionPreset = !isDistance && presetName ? findConditionPreset(presetName) : undefined
    const distancePreset = isDistance && presetName ? findDistancePreset(presetName) : undefined
    const preset = conditionPreset ?? distancePreset

    let iconName: string
    let markerText: ReactNode

    if (isRemoval) {
      iconName = isDistance ? 'person' : 'check_circle'
      markerText = isDistance ? (
        <>
          <strong>{prepared.authorName}</strong> has returned to the party
        </>
      ) : (
        <>
          <strong>{prepared.authorName}</strong>
          {`'s condition was cleared`}
        </>
      )
    } else {
      iconName = preset?.icon ?? (isDistance ? 'social_distance' : 'psychology')
      const label = preset?.label ?? presetName ?? (isDistance ? 'distant' : 'affected')
      markerText = (
        <>
          {prepared.authorName} is <strong>{label}</strong>
        </>
      )
    }

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
          <div
            className="session-message-list__room-shift"
            aria-label={`Room shift to ${roomName}`}
          >
            <span className="session-message-list__room-shift-line" aria-hidden="true" />
            <span
              className={`session-message-list__room-shift-pill ${msg.roomId === activeRoomId ? 'session-message-list__room-shift-pill--active' : ''}`}
            >
              {msg.roomId === activeRoomId ? 'In ' : 'From '}
              {roomName}
            </span>
          </div>
        ) : null}

        <article
          className={`session-message-list__condition-marker ${isDistance ? 'session-message-list__condition-marker--distance' : 'session-message-list__condition-marker--condition'} ${isRemoval ? 'session-message-list__condition-marker--removal' : ''}`}
          role="status"
        >
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="session-message-list__condition-marker-icon material-symbols-outlined"
                  aria-hidden="true"
                >
                  {iconName}
                </span>
              </TooltipTrigger>
              {preset?.description ? (
                <TooltipContent side="top" className="max-w-xs">
                  {preset.description}
                </TooltipContent>
              ) : null}
            </Tooltip>
          </TooltipProvider>
          <span className="session-message-list__condition-marker-text">{markerText}</span>
          <span className="session-message-list__condition-marker-line" aria-hidden="true" />
          <time
            className="session-message-list__condition-marker-time"
            dateTime={new Date(msg.createdAt).toISOString()}
          >
            {relativeTime}
          </time>
        </article>
      </Fragment>
    )
  }

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
          <span
            className={`session-message-list__room-shift-pill ${msg.roomId === activeRoomId ? 'session-message-list__room-shift-pill--active' : ''}`}
          >
            {msg.roomId === activeRoomId ? 'In ' : 'From '}
            {roomName}
          </span>
        </div>
      ) : null}

      <article
        className={`session-message-list__message ${msg.type === MessageType.WHISPER ? 'session-message-list__message--whisper' : ''} ${isSelf ? 'session-message-list__message--self' : ''} ${isGroupedWithPrevious ? 'session-message-list__message--grouped' : ''}`}
      >
        <div className="session-message-list__message-row">
          {!isSelf && !isGroupedWithPrevious ? (
            <span
              className={`session-message-list__message-avatar ${isSystem ? 'session-message-list__message-avatar--system' : ''}`}
              aria-hidden="true"
            >
              {authorAvatarUrl ? (
                <img src={authorAvatarUrl} alt="" />
              ) : (
                getAuthorInitial(authorName)
              )}
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

            <div
              className={`session-message-list__message-bubble session-message-list__message-bubble--${variant} ${bubbleWhisperClass} ${isSelf ? 'session-message-list__message-bubble--self' : ''}`}
            >
              {msg.type !== MessageType.WHISPER ? (
                <span
                  className={`session-message-list__message-type-icon ${typeIconClass} material-symbols-outlined`}
                  aria-label={TYPE_LABEL_BY_VARIANT[variant]}
                >
                  {typeIcon}
                </span>
              ) : null}
              <span className="session-message-list__message-bubble-text">{msg.content}</span>
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
                        {msg.editedAt ? 'edited · ' : ''}
                        {relativeTime}
                      </div>
                      <div
                        className={`session-message-list__message-whisper-route session-message-list__message-whisper-route--incoming-list ${isDmWhisper ? 'session-message-list__message-whisper-route--dm' : ''}`}
                      >
                        {whisperRouteEntries.map((line, index) => (
                          <div
                            key={`${msg.id}-whisper-${index}`}
                            className="session-message-list__message-whisper-route-line"
                          >
                            <span
                              className="session-message-list__message-whisper-connector"
                              aria-hidden="true"
                            >
                              <Icon name="subdirectory_arrow_right" />
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
                            key={`${msg.id}-whisper-${index}`}
                            className="session-message-list__message-whisper-route-line"
                          >
                            <span className="session-message-list__message-whisper-route-label">
                              {line}
                            </span>
                            <span
                              className="session-message-list__message-whisper-connector"
                              aria-hidden="true"
                            >
                              <Icon name="subdirectory_arrow_left" />
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="session-message-list__message-timestamp session-message-list__message-timestamp--whisper">
                        {msg.editedAt ? 'edited · ' : ''}
                        {relativeTime}
                      </div>
                    </>
                  )}
                </div>
              ) : null}
              {!hasWhisperRoute ? (
                <div className="session-message-list__message-timestamp">
                  {msg.editedAt ? 'edited · ' : ''}
                  {relativeTime}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </article>
    </Fragment>
  )
}

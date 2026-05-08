/**
 * MessageList
 * Renders the chronological list of messages for the current session.
 * Messages arrive pre-filtered by the server (visibility-safe).
 */

import type { RefObject, UIEventHandler } from 'react'
import type { Message } from '@/types/chat'
import { MessageType } from '@shared'

interface MessageListProps {
  messages: Message[]
  currentUserId: string
  groupingWindowMs?: number
  listRef?: RefObject<HTMLDivElement | null>
  onListScroll?: UIEventHandler<HTMLDivElement>
  participantDirectory?: Record<string, { displayName?: string; avatarUrl?: string | null }>
}

const DEFAULT_GROUPING_WINDOW_MS = 5 * 60 * 1000

const TYPE_VARIANTS: Record<string, 'ic' | 'ooc' | 'whisper' | 'system'> = {
  [MessageType.IC]: 'ic',
  [MessageType.OOC]: 'ooc',
  [MessageType.WHISPER]: 'whisper',
  [MessageType.SYSTEM]: 'system',
}

const TYPE_ICONS: Record<string, string> = {
  [MessageType.IC]: 'theater_comedy',
  [MessageType.OOC]: 'forum',
  [MessageType.WHISPER]: 'record_voice_over',
  [MessageType.SYSTEM]: 'memory',
}

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000'
const SESSION_BOOKEND_PREFIXES = ['Session Start:', 'Session End:']
const SESSION_NOTE_PREFIX = 'Session Note:'
const LEGACY_SESSION_SYSTEM_PREFIXES = ['[Session Started]', '[Session Ended]']

function getAuthorInitial(username: string): string {
  return username.trim().charAt(0).toUpperCase() || '?'
}

function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts
  const seconds = Math.max(1, Math.floor(diffMs / 1000))

  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? '' : 's'} ago`
  }

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }

  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function MessageList({
  messages,
  currentUserId,
  groupingWindowMs = DEFAULT_GROUPING_WINDOW_MS,
  listRef,
  onListScroll,
  participantDirectory,
}: MessageListProps) {
  if (messages.length === 0) {
    return <div className="chat-message-list__empty">No messages yet. Say something!</div>
  }

  return (
    <div ref={listRef} onScroll={onListScroll} className="chat-message-list">
      {messages.map((msg, index) => {
        const previous = index > 0 ? messages[index - 1] : undefined
        const variant = TYPE_VARIANTS[msg.type] ?? TYPE_VARIANTS[MessageType.OOC]
        const isSystem = msg.type === MessageType.SYSTEM || msg.authorId === SYSTEM_USER_ID
        const isSessionBookend =
          isSystem && SESSION_BOOKEND_PREFIXES.some((prefix) => msg.content.startsWith(prefix))
        const isSessionNote = isSystem && msg.content.startsWith(SESSION_NOTE_PREFIX)
        const isLegacySessionSystem =
          isSystem &&
          LEGACY_SESSION_SYSTEM_PREFIXES.some((prefix) => msg.content.startsWith(prefix))
        const isSelf = !isSystem && msg.authorId === currentUserId
        const authorProfile = participantDirectory?.[msg.authorId]
        const authorName = isSystem
          ? 'SYSTEM'
          : authorProfile?.displayName || msg.authorUsername || 'Unknown'
        const authorAvatarUrl = isSystem ? null : (authorProfile?.avatarUrl ?? null)
        const isGroupedWithPrevious = Boolean(
          groupingWindowMs > 0 &&
          previous &&
          previous.authorId === msg.authorId &&
          msg.createdAt - previous.createdAt <= groupingWindowMs
        )

        if (isLegacySessionSystem) {
          return null
        }

        if (isSessionBookend || isSessionNote) {
          return (
            <article
              key={msg.id}
              className={`chat-session-marker ${isSessionBookend ? 'chat-session-marker--bookend' : 'chat-session-marker--note'}`}
            >
              <span className="chat-session-marker__text">{msg.content}</span>
            </article>
          )
        }

        return (
          <article
            key={msg.id}
            className={`chat-message ${isSelf ? 'chat-message--self' : ''} ${isGroupedWithPrevious ? 'chat-message--grouped' : ''}`}
          >
            <div className="chat-message__row">
              {!isSelf && !isGroupedWithPrevious ? (
                <span
                  className={`chat-message__avatar ${isSystem ? 'chat-message__avatar--system' : ''}`}
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
                  className="chat-message__avatar chat-message__avatar--spacer"
                  aria-hidden="true"
                />
              )}

              <div className="chat-message__content">
                {!isGroupedWithPrevious ? (
                  <div className="chat-message__meta">
                    <span className="chat-message__author">{authorName}</span>
                  </div>
                ) : null}

                <div
                  className={`chat-message__bubble ${isSelf ? 'chat-message__bubble--self' : ''}`}
                >
                  <span
                    className={`chat-message__type chat-message__type--${variant}`}
                    aria-label={msg.type}
                  >
                    <span
                      className={`material-symbols-outlined chat-message__type-icon chat-message__type-icon--${variant}`}
                      aria-hidden="true"
                    >
                      {TYPE_ICONS[msg.type] ?? 'chat'}
                    </span>
                  </span>{' '}
                  {msg.content}
                </div>

                <div className="chat-message__timestamp">
                  {msg.editedAt ? 'edited · ' : ''}
                  {formatRelativeTime(msg.createdAt)}
                </div>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

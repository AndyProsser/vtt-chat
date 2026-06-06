import { MessageType } from '@shared'
import type { SessionHistoryMessage, SessionHistoryThread } from '@/types/history'

export const HISTORY_MESSAGE_LIMIT = 180
export const HISTORY_GROUPING_WINDOW_MS = 5 * 60 * 1000
export const SESSION_RECAP_PREFIX = '[Last Session]'
export const CAMPAIGN_BRIEF_PREFIX = '[Campaign Brief]'
export const SESSION_BOOKEND_PREFIXES = [
  'Session Start:',
  'Session End:',
  '[Session Started]',
  '[Session Ended]',
  '[Session Paused]',
  '[Session Resumed]',
  '[Session Cooldown]',
]

export type HistoryMessageVariant = 'ic' | 'ooc' | 'whisper' | 'dm' | 'system'

export function toTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      return numeric
    }

    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return Date.now()
}

export function toDayLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatBoundaryDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function toSessionLabel(thread: SessionHistoryThread): string {
  const baseDate = thread.startedAt || thread.createdAt
  return `${thread.sessionName} · ${toDayLabel(baseDate)}`
}

export function matchesQuery(message: SessionHistoryMessage, query: string): boolean {
  if (!query) {
    return true
  }

  const haystack = [
    message.authorCharacterName,
    message.authorUsername,
    message.content,
    String(message.type || ''),
    message.isDmOnly ? 'dm only' : '',
  ]
    .join(' ')
    .toLowerCase()

  return haystack.includes(query)
}

export function toMessageVariant(type: string): HistoryMessageVariant {
  if (type === MessageType.IC) return 'ic'
  if (type === MessageType.WHISPER) return 'whisper'
  if (type === MessageType.DM) return 'dm'
  if (type === MessageType.SYSTEM) return 'system'
  return 'ooc'
}

export function toTypeIcon(variant: HistoryMessageVariant): string {
  if (variant === 'ic') return 'swords'
  if (variant === 'whisper') return 'visibility_off'
  if (variant === 'dm') return 'mail'
  if (variant === 'system') return 'info'
  return 'chat_bubble'
}

export function getAuthorInitial(username: string): string {
  return username.trim().charAt(0).toUpperCase() || '?'
}

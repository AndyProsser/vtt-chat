import type { UUID } from '@shared'
import { MessageType, findDistancePreset } from '@shared'
import type { SessionBookendState, SessionSummaryStats } from '@/types/chat'
import { SESSION_SUMMARY_PREFIX } from '@/constants/workspaces.constants'

export const TYPE_LABEL_BY_VARIANT: Record<'ic' | 'ooc' | 'whisper' | 'dm' | 'system' | 'roll', string> = {
  ic: 'In Character',
  ooc: 'Out of Character',
  whisper: 'Whisper',
  dm: 'DM',
  system: 'System',
  roll: 'Roll',
}

export const BOOKEND_META: Record<
  SessionBookendState,
  { label: string; icon: string; className: string }
> = {
  started: {
    label: 'STARTED',
    icon: 'play_circle',
    className: 'session-message-list__session-marker--started',
  },
  ended: {
    label: 'ENDED',
    icon: 'stop_circle',
    className: 'session-message-list__session-marker--ended',
  },
  paused: {
    label: 'PAUSED',
    icon: 'pause_circle',
    className: 'session-message-list__session-marker--paused',
  },
  resumed: {
    label: 'RESUMED',
    icon: 'play_circle',
    className: 'session-message-list__session-marker--resumed',
  },
  cooldown: {
    label: 'CLOSED',
    icon: 'theaters',
    className: 'session-message-list__session-marker--cooldown',
  },
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export const EMPTY_PARTICIPANT_DIRECTORY: Record<
  UUID,
  { displayName: string; avatarUrl?: string | null }
> = {}

export const EMPTY_SESSION_PRESENCE: Record<
  UUID,
  { username: string; avatarUrl?: string | null; characterName?: string | null }
> = {}

export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000'

export const TYPE_VARIANTS: Record<string, 'ic' | 'ooc' | 'whisper' | 'dm' | 'system' | 'roll'> = {
  [MessageType.IC]: 'ic',
  [MessageType.OOC]: 'ooc',
  [MessageType.WHISPER]: 'whisper',
  [MessageType.DM]: 'dm',
  [MessageType.SYSTEM]: 'system',
  [MessageType.ROLL]: 'roll',
}

export const TYPE_ICON_BY_VARIANT: Record<'ic' | 'ooc' | 'whisper' | 'dm' | 'system' | 'roll', string> = {
  ic: 'swords',
  ooc: 'chat_bubble',
  whisper: 'visibility_off',
  dm: 'mail',
  system: 'info',
  roll: 'casino',
}

export function countOwnKeys(record: Record<string, unknown>): number {
  let total = 0
  for (const _key in record) total += 1
  return total
}

export function parseSessionSummary(content: string): SessionSummaryStats | null {
  try {
    const json = content.slice(SESSION_SUMMARY_PREFIX.length).trim()
    return JSON.parse(json) as SessionSummaryStats
  } catch {
    return null
  }
}

export function parseConditionMessageFallback(
  content: string
): { isRemoval: boolean; presetName?: string; overrideType?: 'CONDITION' | 'DISTANCE' } | null {
  if (!content.startsWith('[') || !content.endsWith(']')) return null
  const stripped = content.slice(1, -1).trim()
  if (stripped.match(/^.+? has returned to the party$/)) {
    return { isRemoval: true, overrideType: 'DISTANCE' }
  }
  if (stripped.match(/^.+?'s condition was cleared$/)) {
    return { isRemoval: true, overrideType: 'CONDITION' }
  }
  const applyMatch = stripped.match(/^.+? is (.+)$/)
  if (applyMatch) {
    const presetName = applyMatch[1]
    const overrideType = findDistancePreset(presetName) ? 'DISTANCE' : 'CONDITION'
    return { isRemoval: false, presetName, overrideType }
  }
  return null
}

export function getSessionBookendState(content: string): SessionBookendState | null {
  if (content.startsWith('[Session Started]') || content.startsWith('Session Start:'))
    return 'started'
  if (content.startsWith('[Session Ended]') || content.startsWith('Session End:')) return 'ended'
  if (content.startsWith('[Session Paused]')) return 'paused'
  if (content.startsWith('[Session Resumed]')) return 'resumed'
  if (content.startsWith('[Session Cooldown]')) return 'cooldown'
  return null
}

export function formatBookendTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts
  const seconds = Math.max(1, Math.floor(diffMs / 1000))
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'} ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function dayKey(ts: number): string {
  const date = new Date(ts)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export function formatDayLabel(ts: number): string {
  const targetDate = new Date(ts)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfTarget = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate()
  )
  const deltaDays = Math.round(
    (startOfTarget.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000)
  )
  if (deltaDays === 0) return 'Today'
  if (deltaDays === -1) return 'Yesterday'
  return targetDate.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

import { MessageType, findDistancePreset } from '@shared'
import type { UUID } from '@shared'
import type { SessionHistoryMessage, SessionHistoryThread } from '@/types/history'
export const HISTORY_MESSAGE_LIMIT = 180
export const HISTORY_GROUPING_WINDOW_MS = 5 * 60 * 1000

export const HISTORY_LOADING_MESSAGES = [
  "Rolling for History. Natural 1. Checking anyway.",
  "Consulting the oracles. Their rates are reasonable.",
  "Bribing the bard to recall the tale.",
  "Attempting to decipher the DM's handwriting.",
  "The wizard is rifling through their spell slots.",
  "Asking the innkeeper what happened last time.",
  "Summoning memories from the Astral Plane.",
  "Your paladin is praying for faster load times. The gods are indifferent.",
  "Interrogating the tavern regulars for intel.",
  "Casting Speak with Dead on the session logs.",
  "Consulting the town crier, who has wildly inaccurate information.",
  "Rummaging through the bag of holding for last session's notes.",
  "The rogue is picking the lock on the archive.",
  "Persuasion check failed. Retrying with gold.",
  "The barbarian is impatient. Please ignore the yelling.",
  "Unrolling the campaign scroll. It is very long.",
  "Checking for traps in the records room.",
  "The monk is meditating on what transpired. This may take 1d4 minutes.",
  "Your familiar knocked something over in the archives.",
  "The cleric tried to heal the data. It didn't work.",
  "Deciphering the ranger's tracking notes from last session.",
  "The lore keeper demands payment. Negotiating.",
  "Cross-referencing with the Tome of Past Mistakes.",
  "The divination wizard is peering into the past. Their eye is twitching.",
  "Locating the transcript. Someone filed it under 'Miscellaneous'.",
  "Sending a Sending spell to the scribe. Awaiting reply.",
  "Resurrecting session logs. Material components: expensive.",
  "The beholder is reviewing the records. Don't make eye contact.",
  "Asking NPCs who were probably there. Results vary.",
  "Dispatching a messenger sprite. Estimated arrival: soon.",
] as const

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

export function resolveHistoryWhisperRouteEntries(
  message: SessionHistoryMessage,
  participantLabelsByUserId: Map<string, string>
): string[] {
  if (message.type === MessageType.DM) {
    return ['DM']
  }

  if (message.type !== MessageType.WHISPER || !Array.isArray(message.targetIds)) {
    return []
  }

  return message.targetIds
    .map((targetId) => participantLabelsByUserId.get(targetId) || 'Unknown')
    .filter((label) => label.trim().length > 0)
}

export function isHistoryDmWhisper(message: SessionHistoryMessage, sessionDmId?: UUID): boolean {
  return (
    message.type === MessageType.DM ||
    (message.type === MessageType.WHISPER &&
      Boolean(sessionDmId) &&
      message.authorId === sessionDmId)
  )
}

export function parseHistoryConditionMessage(
  content: string
): { isRemoval: boolean; overrideType: 'CONDITION' | 'DISTANCE'; presetName?: string } | null {
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
    return {
      isRemoval: false,
      presetName,
      overrideType: findDistancePreset(presetName) ? 'DISTANCE' : 'CONDITION',
    }
  }
  return null
}

export function parseConditionTargetName(content: string): string | null {
  const stripped = content.replace(/^\[|\]$/g, '').trim()
  const removalCondition = stripped.match(/^(.+?)'s condition was cleared$/)
  if (removalCondition) return removalCondition[1]
  const removalDistance = stripped.match(/^(.+?) has returned to the party$/)
  if (removalDistance) return removalDistance[1]
  const apply = stripped.match(/^(.+?) is /)
  return apply?.[1] ?? null
}

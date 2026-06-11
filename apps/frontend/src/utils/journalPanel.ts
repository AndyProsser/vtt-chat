import { SessionState, type UUID } from '@shared'
import type { Session } from '@/types/session'
import type { JournalEntry, MissingRecapCopy, RawNote } from '@/types/journalPanel'
import { JOURNAL_TAG } from '@/constants/journal.constants'

export function normalizeJournalHashtag(value: string, fallbackSeed = 'session-journal'): string {
  const stripped = value.trim().replace(/^#+/, '')
  const normalized = stripped
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')

  return `#${normalized || fallbackSeed}`
}

export function buildHashtagFallbackSeed(sessionId?: UUID): string {
  return sessionId ? `session-${String(sessionId).slice(0, 8)}` : 'session-journal'
}

export function parseJournalHashtags(value: string, fallbackSeed: string): string[] {
  const matches = value.match(/#?[a-z0-9][a-z0-9\s_-]*/gi) ?? []
  const normalized = matches
    .map((match) => normalizeJournalHashtag(match, fallbackSeed))
    .filter((tag, index, tags) => tags.indexOf(tag) === index)

  return normalized
}

export function collectJournalHashtags(value: string, fallbackSeed: string): string[] {
  const matches = value.match(/#?[a-z0-9][a-z0-9\s_-]*/gi) ?? []

  return matches
    .map((match) => normalizeJournalHashtag(match, fallbackSeed))
    .filter((tag, index, tags) => tags.indexOf(tag) === index)
}

export function getPendingJournalHashtag(value: string): string {
  const trimmed = value.trimEnd()
  if (!trimmed) {
    return ''
  }

  const segments = trimmed.split(/\s+/)
  return segments[segments.length - 1] ?? ''
}

export function appendJournalHashtagInput(
  value: string,
  nextTag: string,
  fallbackSeed: string
): string {
  const normalizedTag = normalizeJournalHashtag(nextTag, fallbackSeed)
  const existingTags = collectJournalHashtags(value, fallbackSeed)

  if (existingTags.includes(normalizedTag)) {
    return existingTags.length > 0 ? serializeJournalHashtags(existingTags) : normalizedTag
  }

  return serializeJournalHashtags([...existingTags, normalizedTag])
}

export function serializeJournalHashtags(tags: string[]): string {
  return tags.join(' ')
}

export function buildHashtagSuggestions(sessionName?: string, sessionId?: UUID): string[] {
  const sessionWords = (sessionName ?? '')
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .slice(0, 4)
    .map((token) => normalizeJournalHashtag(token, token))

  return ['#recap', '#cliffhanger', '#loot', '#npc', ...sessionWords].filter(
    (tag, index, tags) => tags.indexOf(tag) === index
  )
}

export function buildContentHashtagSuggestions(markdown: string): string[] {
  const stopWords = new Set([
    'about',
    'after',
    'again',
    'along',
    'also',
    'been',
    'before',
    'being',
    'between',
    'campaign',
    'could',
    'didnt',
    'from',
    'have',
    'into',
    'journal',
    'last',
    'next',
    'over',
    'party',
    'players',
    'recap',
    'session',
    'some',
    'that',
    'their',
    'them',
    'then',
    'there',
    'they',
    'this',
    'what',
    'when',
    'with',
    'were',
    'your',
  ])

  const counts = new Map<string, number>()
  const tokens = markdown.toLowerCase().match(/[a-z][a-z-]{2,}/g) ?? []

  for (const token of tokens) {
    const normalized = token.replace(/^-+|-+$/g, '')
    if (normalized.length < 4 || stopWords.has(normalized)) {
      continue
    }

    counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([token]) => normalizeJournalHashtag(token, token))
}

export function extractJournalHashtag(
  tags: string[] | undefined,
  sessionName?: string,
  sessionId?: UUID
): string[] {
  const fallbackSeed = buildHashtagFallbackSeed(sessionId)

  return (tags ?? [])
    .filter((tag) => tag !== JOURNAL_TAG)
    .map((tag) => normalizeJournalHashtag(tag, fallbackSeed))
    .filter((tag, index, allTags) => allTags.indexOf(tag) === index)
}

export function noteToEntry(note: RawNote, sessionName?: string, sessionId?: UUID): JournalEntry {
  return {
    id: note.id,
    hashtags: extractJournalHashtag(note.tags, sessionName, sessionId),
    markdown: note.markdown ?? note.content ?? '',
    updatedAt: note.updatedAt ?? note.createdAt ?? Date.now(),
    authorUsername: note.authorUsername,
  }
}

export function getSessionReferenceTime(session: Session): number {
  return session.endedAt ?? session.startedAt ?? session.createdAt
}

export function isSessionLive(session: Session | undefined): boolean {
  if (!session) {
    return false
  }

  return (
    session.state === SessionState.ACTIVE ||
    session.state === SessionState.PAUSED ||
    session.state === SessionState.COOLDOWN
  )
}

export function buildMissingRecapCopy(
  session: Session,
  nextSession: Session | undefined
): MissingRecapCopy {
  const hoursSinceSession = Math.floor(
    (Date.now() - getSessionReferenceTime(session)) / (60 * 60 * 1000)
  )

  if (isSessionLive(nextSession)) {
    return {
      cardBody:
        'Next session is live. The recap scroll is still missing and the summary hamsters are visibly overworked.',
    }
  }

  if (hoursSinceSession < 24) {
    return {
      cardBody:
        'No recap yet. Fair enough. The scribes or the machine spirits may still be sorting the dragonfire.',
    }
  }

  return {
    cardBody:
      'No recap yet. More than 24 hours have passed, so this now qualifies as a failed lore check.',
  }
}

export function normalizeCardHashtag(tag: string): string {
  const trimmed = tag.trim().toLowerCase()
  if (!trimmed) {
    return ''
  }

  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`
}

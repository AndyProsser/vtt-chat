import { NoteVisibility, type UUID } from '@shared'
import type { NotesShareUser } from '@/types/notesShare'

export type NoteShareAudienceMode = 'NONE' | 'EVERYONE' | 'LIMITED'

export const NOTE_SHARE_AUDIENCE_META: Record<
  NoteShareAudienceMode,
  { icon: string; label: string }
> = {
  NONE: { icon: 'visibility_off', label: 'Private' },
  EVERYONE: { icon: 'groups', label: 'Party' },
  LIMITED: { icon: 'group', label: 'Selected' },
}

export interface NoteShareStatus {
  mode: NoteShareAudienceMode
  icon: string
  label: string
  tone: 'private' | 'shared' | 'limited' | 'warning'
  tooltip: string
}

const JOURNAL_TAG = '_journal'

export function isJournalNote(note: { title: string; tags?: string[] | null }): boolean {
  const normalizedTitle = note.title.trim().toLowerCase()
  return (
    (note.tags || []).includes(JOURNAL_TAG) ||
    normalizedTitle === 'session journal' ||
    normalizedTitle.startsWith('journal - ')
  )
}

export function normalizeNoteHashtag(value: string): string {
  const normalized = value
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')

  return normalized ? `#${normalized}` : ''
}

export function parseNoteHashtags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => normalizeNoteHashtag(tag))
    .filter(Boolean)
    .filter((tag, index, tags) => tags.indexOf(tag) === index)
}

export function serializeNoteHashtags(tags: string[]): string {
  return parseNoteHashtags(tags.join(', ')).join(', ')
}

export function formatNotesShareUserLabel(userId: UUID, shareUsers: NotesShareUser[]): string {
  const matchedUser = shareUsers.find((candidate) => candidate.id === userId)

  if (!matchedUser) {
    return userId
  }

  return matchedUser.characterName
    ? `${matchedUser.username} (${matchedUser.characterName})`
    : matchedUser.username
}

export function getNoteShareStatus(
  visibility: NoteVisibility,
  allowedUsers: UUID[] = []
): NoteShareStatus {
  if (visibility === NoteVisibility.DM_ONLY) {
    return {
      mode: 'NONE',
      icon: NOTE_SHARE_AUDIENCE_META.NONE.icon,
      label: NOTE_SHARE_AUDIENCE_META.NONE.label,
      tone: 'private',
      tooltip: 'Not shared with players',
    }
  }

  if (visibility === NoteVisibility.PLAYERS_VISIBLE) {
    return {
      mode: 'EVERYONE',
      icon: NOTE_SHARE_AUDIENCE_META.EVERYONE.icon,
      label: NOTE_SHARE_AUDIENCE_META.EVERYONE.label,
      tone: 'shared',
      tooltip: 'Shared with everyone',
    }
  }

  if (allowedUsers.length === 0) {
    return {
      mode: 'LIMITED',
      icon: NOTE_SHARE_AUDIENCE_META.LIMITED.icon,
      label: NOTE_SHARE_AUDIENCE_META.LIMITED.label,
      tone: 'warning',
      tooltip: 'Limited sharing selected, but no players were chosen',
    }
  }

  return {
    mode: 'LIMITED',
    icon: NOTE_SHARE_AUDIENCE_META.LIMITED.icon,
    label: NOTE_SHARE_AUDIENCE_META.LIMITED.label,
    tone: 'limited',
    tooltip: `Shared with ${allowedUsers.length} selected player${allowedUsers.length === 1 ? '' : 's'}`,
  }
}

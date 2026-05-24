import type { UUID } from '@shared'
import type { NotesShareUser } from '@/types/notesShare'

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

import { isValidTag, isValidUUID, NoteVisibility } from '@shared'
import type { UUID } from '@shared'
import type { NotesCreateRequest, NotesUpdateRequest } from '@/types/notes-route.types'

export function sanitizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const normalizedTags: string[] = []
  const seen = new Set<string>()

  for (const rawTag of value) {
    if (typeof rawTag !== 'string') {
      continue
    }

    const trimmedTag = rawTag.trim()
    if (!trimmedTag) {
      continue
    }

    const isHashtag = trimmedTag.startsWith('#')
    const tagBody = isHashtag ? trimmedTag.replace(/^#+/, '') : trimmedTag
    if (!tagBody || !isValidTag(tagBody)) {
      continue
    }

    const normalized = isHashtag ? `#${tagBody}` : tagBody
    if (seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    normalizedTags.push(normalized)
  }

  return normalizedTags
}

export function sanitizeAllowedUsers(value: unknown): UUID[] {
  if (!Array.isArray(value)) return []
  return value.filter((id): id is UUID => isValidUUID(id))
}

export function noteVisibleTo(note: {
  authorId: UUID
  visibility: NoteVisibility
  allowedUsers?: UUID[]
  dmId: UUID
}): UUID[] | undefined {
  if (note.visibility === NoteVisibility.PLAYERS_VISIBLE) {
    return undefined
  }

  const visible = new Set<UUID>([note.authorId, note.dmId])
  if (note.visibility === NoteVisibility.CUSTOM) {
    for (const userId of note.allowedUsers || []) {
      visible.add(userId)
    }
  }

  return Array.from(visible)
}

export function parseCreateNoteRequest(body: unknown): NotesCreateRequest {
  const candidate = (body || {}) as Record<string, unknown>
  return {
    campaignId: String(candidate.campaignId || '') as UUID,
    sessionId: String(candidate.sessionId || '') as UUID,
    title: String(candidate.title || ''),
    content: String(candidate.content || ''),
    visibility: candidate.visibility as NoteVisibility,
    tags: sanitizeTags(candidate.tags),
    allowedUsers: sanitizeAllowedUsers(candidate.allowedUsers),
  }
}

export function parseUpdateNoteRequest(body: unknown): NotesUpdateRequest {
  const candidate = (body || {}) as Record<string, unknown>
  return {
    noteId: String(candidate.noteId || '') as UUID,
    title: typeof candidate.title === 'string' ? candidate.title : undefined,
    content: typeof candidate.content === 'string' ? candidate.content : undefined,
    visibility: candidate.visibility as NoteVisibility | undefined,
    tags: candidate.tags !== undefined ? sanitizeTags(candidate.tags) : undefined,
    allowedUsers:
      candidate.allowedUsers !== undefined
        ? sanitizeAllowedUsers(candidate.allowedUsers)
        : undefined,
  }
}

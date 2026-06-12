import { isValidTag, isValidUUID, NoteVisibility } from '@shared'
import type { NoteAttachmentEntity, UUID } from '@shared'
import {
  NOTE_ATTACHMENT_MAX_COUNT,
  NOTE_ATTACHMENT_MAX_NAME_LENGTH,
  NOTE_ATTACHMENT_MAX_URI_LENGTH,
} from '@/constants/notes.constants'
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

function isValidAttachmentUri(uri: string): boolean {
  return (
    uri.startsWith('data:image/') ||
    uri.startsWith('http://') ||
    uri.startsWith('https://') ||
    uri.startsWith('attachment://')
  )
}

function isValidAttachmentMime(mime: string): boolean {
  return mime.startsWith('image/')
}

export function sanitizeAttachments(value: unknown, campaignId?: UUID): NoteAttachmentEntity[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const normalized: NoteAttachmentEntity[] = []

  for (const rawItem of value) {
    if (!rawItem || typeof rawItem !== 'object') {
      continue
    }

    const candidate = rawItem as Record<string, unknown>
    const id =
      typeof candidate.id === 'string' && isValidUUID(candidate.id) ? (candidate.id as UUID) : null
    const mime = typeof candidate.mime === 'string' ? candidate.mime.trim().toLowerCase() : ''
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
    const uri = typeof candidate.uri === 'string' ? candidate.uri.trim() : ''
    const rawCreatedAt =
      typeof candidate.createdAt === 'number'
        ? candidate.createdAt
        : Number.isFinite(Number(candidate.createdAt))
          ? Number(candidate.createdAt)
          : NaN

    if (!id || !mime || !name || !uri) {
      continue
    }

    if (
      seen.has(id) ||
      !isValidAttachmentMime(mime) ||
      !isValidAttachmentUri(uri) ||
      name.length > NOTE_ATTACHMENT_MAX_NAME_LENGTH ||
      uri.length > NOTE_ATTACHMENT_MAX_URI_LENGTH
    ) {
      continue
    }

    seen.add(id)
    normalized.push({
      id,
      campaignId,
      mime,
      name,
      uri,
      createdAt: Number.isFinite(rawCreatedAt) ? Math.max(0, Math.floor(rawCreatedAt)) : Date.now(),
    })

    if (normalized.length >= NOTE_ATTACHMENT_MAX_COUNT) {
      break
    }
  }

  return normalized
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
  const campaignId = String(candidate.campaignId || '') as UUID
  return {
    campaignId,
    sessionId: String(candidate.sessionId || '') as UUID,
    title: String(candidate.title || ''),
    content: String(candidate.content || ''),
    visibility: candidate.visibility as NoteVisibility,
    tags: sanitizeTags(candidate.tags),
    allowedUsers: sanitizeAllowedUsers(candidate.allowedUsers),
    attachments: sanitizeAttachments(candidate.attachments, campaignId),
  }
}

export function parseUpdateNoteRequest(body: unknown): NotesUpdateRequest {
  const candidate = (body || {}) as Record<string, unknown>
  const campaignId =
    typeof candidate.campaignId === 'string' && isValidUUID(candidate.campaignId)
      ? (candidate.campaignId as UUID)
      : undefined
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
    attachments:
      candidate.attachments !== undefined
        ? sanitizeAttachments(candidate.attachments, campaignId)
        : undefined,
  }
}

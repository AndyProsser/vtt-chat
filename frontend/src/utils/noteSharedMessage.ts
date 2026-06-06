import type { MessageMetadataEntity } from '@shared'

const NOTE_SHARED_PREFIX = '[Note Shared]'
const SHARED_WITH_PREFIX = 'Shared with:'
const HASHTAGS_PREFIX = 'Hashtags:'

export interface ParsedNoteSharedMessage {
  noteId?: string
  title: string
  sharedWith: string | null
  hashtags: string | null
  markdown: string
  /** Present when the card was surfaced via /surface (excerpt-based). Absent for legacy /publish cards. */
  excerptSource?: 'AUTO' | 'MANUAL'
}

function parseNoteHandoutMessageMetadata(
  metadata?: MessageMetadataEntity | null
): ParsedNoteSharedMessage | null {
  const noteHandout = metadata?.noteHandout
  if (!noteHandout || noteHandout.kind !== 'NOTE_HANDOUT') {
    return null
  }

  return {
    noteId: noteHandout.noteId,
    title: noteHandout.title.trim() || 'Untitled Handout',
    sharedWith: null,
    hashtags: null,
    markdown: noteHandout.excerpt,
    excerptSource: noteHandout.excerptSource,
  }
}

function parseNoteSharedMessageMetadata(
  metadata?: MessageMetadataEntity | null
): ParsedNoteSharedMessage | null {
  const noteShared = metadata?.noteShared
  if (!noteShared || noteShared.kind !== 'NOTE_SHARED') {
    return null
  }

  return {
    noteId: noteShared.noteId,
    title: noteShared.title.trim() || 'Untitled Handout',
    sharedWith: noteShared.sharedWith?.trim() || null,
    hashtags: noteShared.hashtags?.trim() || null,
    markdown: noteShared.markdown ?? '',
  }
}

/**
 * Parses the legacy text-based note-share system message into structured card fields.
 */
function parseLegacyNoteSharedMessage(content: string): ParsedNoteSharedMessage | null {
  if (!content.startsWith(NOTE_SHARED_PREFIX)) {
    return null
  }

  const normalized = content.replace(/\r\n?/g, '\n')
  const [headerLine = '', ...restLines] = normalized.split('\n')
  const title = headerLine.slice(NOTE_SHARED_PREFIX.length).trim() || 'Untitled Handout'

  let cursor = 0
  while (cursor < restLines.length && restLines[cursor]?.trim() === '') {
    cursor += 1
  }

  let sharedWith: string | null = null
  if (restLines[cursor]?.startsWith(SHARED_WITH_PREFIX)) {
    sharedWith = restLines[cursor].slice(SHARED_WITH_PREFIX.length).trim() || null
    cursor += 1
  }

  while (cursor < restLines.length && restLines[cursor]?.trim() === '') {
    cursor += 1
  }

  let hashtags: string | null = null
  if (restLines[cursor]?.startsWith(HASHTAGS_PREFIX)) {
    hashtags = restLines[cursor].slice(HASHTAGS_PREFIX.length).trim() || null
    cursor += 1
  }

  while (cursor < restLines.length && restLines[cursor]?.trim() === '') {
    cursor += 1
  }

  return {
    title,
    sharedWith,
    hashtags,
    markdown: restLines.slice(cursor).join('\n').trim(),
  }
}

export function parseNoteSharedMessage(params: {
  content: string
  metadata?: MessageMetadataEntity | null
}): ParsedNoteSharedMessage | null {
  return (
    parseNoteHandoutMessageMetadata(params.metadata) ??
    parseNoteSharedMessageMetadata(params.metadata) ??
    parseLegacyNoteSharedMessage(params.content)
  )
}

const NOTE_SHARED_PREFIX = '[Note Shared]'
const SHARED_WITH_PREFIX = 'Shared with:'
const HASHTAGS_PREFIX = 'Hashtags:'

export interface ParsedNoteSharedMessage {
  title: string
  sharedWith: string | null
  hashtags: string | null
  markdown: string
}

/**
 * Parses the legacy text-based note-share system message into structured card fields.
 */
export function parseNoteSharedMessage(content: string): ParsedNoteSharedMessage | null {
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

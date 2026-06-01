import { NoteVisibility } from '@shared'
import type { UUID } from '@shared'
import type { StoredNote } from '@/types/notes.types'
import { listSessionNotes } from '@/repositories/notes.repository'
import { getPrismaClient } from '@/infra/db'
import { mapStoredNote } from '@/services/notes/shared'

const JOURNAL_TAG = '_journal'
const prisma = getPrismaClient()

/**
 * Get the journal for a specific session.
 * There is at most one journal per session (identified by the _journal tag).
 * Returns null if no journal exists yet.
 */
export async function getSessionJournal(sessionId: UUID): Promise<StoredNote | null> {
  const notes = await listSessionNotes(sessionId)
  const journal = notes.find((note) => {
    const tags = Array.isArray(note.tags) ? (note.tags as string[]) : []
    return tags.includes(JOURNAL_TAG) || note.title === 'Session Journal'
  })

  // Fallback for legacy rows that are session-scoped journals but lost canonical
  // tag/title markers during prior migrations/edits.
  const fallback = notes[0] || null
  return journal ? mapStoredNote(journal) : fallback ? mapStoredNote(fallback) : null
}

export interface JournalStatusEntry {
  hasJournal: boolean
  hasContent: boolean
  hashtags: string[]
  journalTitle?: string
  journalUpdatedAt?: number
  needsRecap: boolean
}

/**
 * Get journal status for multiple sessions in a single DB query.
 * Only fetches id, sessionId, tags, and content length — not the full markdown body.
 * Used by the journal browser panel to render recap status chips without loading all content.
 */
export async function getBulkJournalStatus(
  sessionIds: UUID[]
): Promise<Record<string, JournalStatusEntry>> {
  if (sessionIds.length === 0) {
    return {}
  }

  const rows = await prisma.note.findMany({
    where: {
      sessionId: { in: sessionIds },
    },
    select: {
      sessionId: true,
      tags: true,
      content: true,
      title: true,
      updatedAt: true,
    },
    orderBy: {
      updatedAt: 'desc',
    },
  })

  // Build a result entry per sessionId found, preferring explicit journal markers.
  const result: Record<string, JournalStatusEntry> = {}
  const bestScoreBySession: Record<string, number> = {}

  for (const row of rows) {
    const tags = Array.isArray(row.tags) ? (row.tags as string[]) : []
    const isExplicitJournal = tags.includes(JOURNAL_TAG) || row.title === 'Session Journal'
    const score = isExplicitJournal ? 2 : 1
    const hashtags = tags.filter((tag) => tag !== JOURNAL_TAG)
    const hasContent = (row.content ?? '').trim().length > 0
    if (row.sessionId) {
      const previousScore = bestScoreBySession[row.sessionId] ?? 0
      if (score >= previousScore) {
        result[row.sessionId] = {
          hasJournal: true,
          hasContent,
          hashtags,
          journalTitle: row.title || undefined,
          journalUpdatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
          needsRecap: !hasContent,
        }
        bestScoreBySession[row.sessionId] = score
      }
    }
  }

  // Sessions with no journal row default to empty status
  for (const id of sessionIds) {
    if (!result[id]) {
      result[id] = {
        hasJournal: false,
        hasContent: false,
        hashtags: [],
        journalTitle: undefined,
        journalUpdatedAt: undefined,
        needsRecap: true,
      }
    }
  }

  return result
}

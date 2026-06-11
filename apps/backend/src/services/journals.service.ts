/**
 * Journal service — session-level journal operations
 *
 * A journal is a special note that:
 * - Belongs to exactly ONE session
 * - There is exactly ONE journal per session
 * - Is always tagged with `_journal`
 * - Can be created/updated by the DM
 * - Is visible to all players in that session
 */

export { getSessionJournal, getBulkJournalStatus } from '@/services/journals/get-journal.service'
export type { JournalStatusEntry } from '@/services/journals/get-journal.service'
export { createOrUpdateSessionJournal } from '@/services/journals/upsert-journal.service'

export function __resetJournalsStoreForTests(): void {
  // No-op in Prisma-backed mode. Tests should mock repository calls.
}

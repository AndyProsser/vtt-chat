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

export { getSessionJournal } from '@/services/journals/get-session-journal.service'
export { createOrUpdateSessionJournal } from '@/services/journals/create-update-session-journal.service'

export function __resetJournalsStoreForTests(): void {
  // No-op in Prisma-backed mode. Tests should mock repository calls.
}

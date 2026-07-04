/** Per-skipped-section reason, included in `applied.skippedReasons` for partial-application responses. */
type SyncSkipReason = 'SYNC_POLICY_DISABLED' | 'SYNC_POLICY_PARTY_ACCESS_DENIED'

/**
 * `characterUpdate`/`campaignUpdate` are always present. Every other key is only present when its
 * corresponding request section (`inventoryUpdate`, `currencyUpdate`, `partyInventoryUpdate`,
 * `partyCurrencyUpdate`) was present in the request — see docs/extension/EXTENSION-INTEGRATION.md §5d.
 *
 * `characterUpdateApplied`: true = character was found by externalId and updated;
 * false = characterUpdate was present but the character was not found in the DB (externalId mismatch).
 * Absent when no characterUpdate was in the request.
 */
type SyncOutcome = {
  characterUpdate: boolean
  characterUpdateApplied?: boolean
  campaignUpdate: boolean
  inventoryItemsUpserted?: number
  currencyUpdated?: boolean
  partyInventoryItemsUpserted?: number
  partyCurrencyUpdated?: boolean
  pendingConflicts?: number
  skippedReasons?: Partial<
    Record<'inventory' | 'currency' | 'partyInventory' | 'partyCurrency', SyncSkipReason>
  >
}

export type ExternalSyncResult =
  | {
      ok: true
      applied: SyncOutcome
    }
  | {
      ok: false
      code:
        | 'FORBIDDEN'
        | 'SYNC_POLICY_VIOLATION'
        | 'INVALID_CHARACTER_UPDATE'
        | 'SYNC_POLICY_DISABLED'
        | 'SYNC_POLICY_PARTY_ACCESS_DENIED'
      message: string
      field?: string
    }

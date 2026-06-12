type SyncOutcome = {
  characterUpdate: boolean
  campaignUpdate: boolean
}

export type ExternalSyncResult =
  | {
      ok: true
      applied: SyncOutcome
    }
  | {
      ok: false
      code: 'FORBIDDEN' | 'SYNC_POLICY_VIOLATION' | 'INVALID_CHARACTER_UPDATE'
      message: string
      field?: string
    }

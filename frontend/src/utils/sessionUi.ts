import type { ExtensionSyncPolicy, PersistedExtensionSyncPolicy } from '@/types/sessionUi'

/**
 * Normalizes backend and UI extension-sync policy values into the editor-facing policy.
 * Use this when hydrating campaign settings or rendering payload-backed campaign metadata.
 */
export function normalizeExtensionSyncPolicy(
  policy: ExtensionSyncPolicy | PersistedExtensionSyncPolicy | null | undefined
): ExtensionSyncPolicy {
  if (policy === 'NONE' || policy === 'DM_ONLY') {
    return policy
  }

  return 'ALLOW'
}

/**
 * Converts the editor-facing extension-sync policy into the persisted backend contract.
 * Use this before sending campaign settings updates to the API.
 */
export function serializeExtensionSyncPolicy(
  policy: ExtensionSyncPolicy
): PersistedExtensionSyncPolicy {
  return policy === 'ALLOW' ? 'DM_AND_PLAYERS' : policy
}

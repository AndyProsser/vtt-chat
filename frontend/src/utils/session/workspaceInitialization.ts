import type { UUID } from '@shared'
import {
  ACTIVE_SESSION_CONTEXT_STORAGE_KEY,
  ALLOWED_CHAT_GROUPING_WINDOWS,
  CHAT_GROUPING_STORAGE_KEY,
  DEFAULT_CHAT_GROUPING_WINDOW_MS,
  LOBBY_AUTO_ENTER_CAMPAIGN_STORAGE_KEY,
} from '@/constants/workspaces.constants'
import { safeLocalStorageGetItem } from '@/utils/session/workspaces'

export function getInitialMessageGroupingWindowMs(): number {
  if (typeof window === 'undefined') {
    return DEFAULT_CHAT_GROUPING_WINDOW_MS
  }

  const localStorageApi = window.localStorage as Partial<Storage> | undefined
  if (!localStorageApi || typeof localStorageApi.getItem !== 'function') {
    return DEFAULT_CHAT_GROUPING_WINDOW_MS
  }

  const raw = localStorageApi.getItem(CHAT_GROUPING_STORAGE_KEY)
  const parsed = Number(raw)
  return ALLOWED_CHAT_GROUPING_WINDOWS.has(parsed) ? parsed : DEFAULT_CHAT_GROUPING_WINDOW_MS
}

export function getInitialCampaignRestorePending(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const sessionContext = window.sessionStorage.getItem(ACTIVE_SESSION_CONTEXT_STORAGE_KEY)
  const localContext = safeLocalStorageGetItem(ACTIVE_SESSION_CONTEXT_STORAGE_KEY)
  const pendingAutoEnter = window.sessionStorage.getItem(LOBBY_AUTO_ENTER_CAMPAIGN_STORAGE_KEY)

  return Boolean(sessionContext || localContext || pendingAutoEnter)
}

export function toNullableUuid(value: UUID | ''): UUID | null {
  return value || null
}

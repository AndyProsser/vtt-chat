import type { Role, UUID } from '@shared'
import type { HistoryControls, HistoryGroupBy, HistorySortOrder } from '@/types/history'

export const DEFAULT_HISTORY_GROUP_BY: HistoryGroupBy = 'session'
export const DEFAULT_HISTORY_SORT_ORDER: HistorySortOrder = 'newest'

export function getHistoryControlStorageKey(sessionId: UUID, role: Role, userId?: UUID): string {
  const userScope = userId || role
  return `vtt-chat:history:controls:${userScope}:${sessionId}`
}

export function parsePersistedHistoryControls(raw: string | null): HistoryControls {
  if (!raw) {
    return {
      groupBy: DEFAULT_HISTORY_GROUP_BY,
      sortOrder: DEFAULT_HISTORY_SORT_ORDER,
    }
  }

  try {
    const parsed = JSON.parse(raw) as {
      groupBy?: string
      sortOrder?: string
    }

    const groupBy: HistoryGroupBy = parsed.groupBy === 'day' ? 'day' : DEFAULT_HISTORY_GROUP_BY
    const sortOrder: HistorySortOrder =
      parsed.sortOrder === 'oldest' ? 'oldest' : DEFAULT_HISTORY_SORT_ORDER

    return { groupBy, sortOrder }
  } catch {
    return {
      groupBy: DEFAULT_HISTORY_GROUP_BY,
      sortOrder: DEFAULT_HISTORY_SORT_ORDER,
    }
  }
}

export function formatEventLabel(eventType: string): string {
  return eventType
    .toLowerCase()
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

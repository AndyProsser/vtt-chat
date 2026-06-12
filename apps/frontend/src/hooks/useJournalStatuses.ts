import { useCallback, useEffect, useState } from 'react'
import type { UUID } from '@shared'
import type { SessionJournalStatus } from '@/types/journalPanel'
import type { Session } from '@/types/session'

interface UseJournalStatusesParams {
  apiUrl: string
  token: string
  campaignId: UUID | undefined
  recentSessions: Session[]
  recentSessionsStatusKey: string
}

interface RawJournalEntry {
  hasJournal?: boolean
  hasContent?: boolean
  hashtags?: string[]
  tags?: string[]
  journalTitle?: string
  title?: string
  journalUpdatedAt?: number
  updatedAt?: number
  needsRecap?: boolean
}

function normalizeStatus(rawStatus?: RawJournalEntry): SessionJournalStatus {
  if (!rawStatus) {
    return {
      hasJournal: false,
      hasContent: false,
      hashtags: [],
      journalTitle: undefined,
      journalUpdatedAt: undefined,
      needsRecap: true,
    }
  }

  const hashtags = Array.isArray(rawStatus.hashtags)
    ? rawStatus.hashtags
    : Array.isArray(rawStatus.tags)
      ? rawStatus.tags
      : []
  const hasContent = Boolean(rawStatus.hasContent)
  const hasJournal =
    typeof rawStatus.hasJournal === 'boolean'
      ? rawStatus.hasJournal
      : hasContent || hashtags.length > 0

  return {
    hasJournal,
    hasContent,
    hashtags,
    journalTitle: rawStatus.journalTitle ?? rawStatus.title,
    journalUpdatedAt: rawStatus.journalUpdatedAt ?? rawStatus.updatedAt,
    needsRecap: typeof rawStatus.needsRecap === 'boolean' ? rawStatus.needsRecap : !hasContent,
  }
}

/** Fetches and manages journal status for a list of sessions. Re-fetches when sessions change. */
export function useJournalStatuses({
  apiUrl,
  token,
  campaignId,
  recentSessions,
  recentSessionsStatusKey,
}: UseJournalStatusesParams) {
  const [journalStatusBySession, setJournalStatusBySession] = useState<
    Record<string, SessionJournalStatus>
  >({})

  const updateJournalStatus = useCallback((sessionId: UUID, nextStatus: SessionJournalStatus) => {
    setJournalStatusBySession((current) => ({
      ...current,
      [sessionId]: nextStatus,
    }))
  }, [])

  useEffect(() => {
    let cancelled = false

    if (recentSessions.length === 0) {
      return () => {
        cancelled = true
      }
    }

    const loadStatuses = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/journals/status`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            campaignId,
            sessionIds: recentSessions.map((s) => s.id),
          }),
        })

        if (!res.ok) return

        const data = (await res.json()) as {
          statuses?: Record<string, RawJournalEntry>
          statusList?: Array<RawJournalEntry & { sessionId?: string }>
          journals?: Record<string, RawJournalEntry>
        }

        if (!cancelled) {
          const incomingStatuses = data.statuses ?? data.journals ?? {}
          const statusListMap = (data.statusList ?? []).reduce<Record<string, RawJournalEntry>>(
            (accumulator, entry) => {
              const sessionId = entry.sessionId
              if (!sessionId) return accumulator
              accumulator[sessionId] = entry
              return accumulator
            },
            {}
          )

          const resolvedIncoming = { ...incomingStatuses, ...statusListMap }

          setJournalStatusBySession((prev) => {
            const merged = { ...prev }
            for (const session of recentSessions) {
              const direct = resolvedIncoming[session.id]
              const lower = resolvedIncoming[session.id.toLowerCase()]
              const upper = resolvedIncoming[session.id.toUpperCase()]
              merged[session.id] = normalizeStatus(direct ?? lower ?? upper)
            }
            return merged
          })
        }
      } catch {
        // Non-critical: cards degrade to unknown recap status
      }
    }

    if (campaignId && recentSessions.length > 0) {
      void loadStatuses()
    }

    return () => {
      cancelled = true
    }
  }, [apiUrl, campaignId, recentSessions, recentSessionsStatusKey, token])

  return { journalStatusBySession, updateJournalStatus }
}

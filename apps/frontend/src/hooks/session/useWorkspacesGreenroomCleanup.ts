import { useEffect, useRef } from 'react'
import { PresenceState } from '@shared'
import type { UUID } from '@shared'
import type { SessionPresence as PresenceRecord } from '@/types/room'
import type { ApiSessionStats } from '@/types/session/workspaces'
import { resolveGreenroomCacheTtlMs } from '@/utils/session/workspaces'

type UseWorkspacesGreenroomCleanupParams = {
  selectedCampaignId: UUID | ''
  hasCurrentSession: boolean
  isGreenroom: boolean
  currentSessionStats: ApiSessionStats | undefined
  currentPresence: PresenceRecord[]
}

/**
 * Maintains greenroom cleanup timer semantics for idle-empty greenroom windows.
 */
export function useWorkspacesGreenroomCleanup(params: UseWorkspacesGreenroomCleanupParams) {
  const {
    selectedCampaignId,
    hasCurrentSession,
    isGreenroom,
    currentSessionStats,
    currentPresence,
  } = params
  const greenroomCleanupTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!selectedCampaignId || !hasCurrentSession) {
      if (greenroomCleanupTimerRef.current !== null) {
        window.clearTimeout(greenroomCleanupTimerRef.current)
        greenroomCleanupTimerRef.current = null
      }
      return
    }

    const connectedCount =
      currentSessionStats?.connectedTotal ??
      currentPresence.filter((presence) => presence.state !== PresenceState.OFFLINE).length

    if (!isGreenroom || connectedCount > 0) {
      if (greenroomCleanupTimerRef.current !== null) {
        window.clearTimeout(greenroomCleanupTimerRef.current)
        greenroomCleanupTimerRef.current = null
      }
      return
    }

    const ttlMs = resolveGreenroomCacheTtlMs()
    if (ttlMs <= 0) {
      return
    }

    if (greenroomCleanupTimerRef.current !== null) {
      window.clearTimeout(greenroomCleanupTimerRef.current)
    }

    // Greenroom messages are preserved in Zustand until the server emits
    // CHAT:ROOM_CONTEXT_CLEARED (only on CLEANUP). Do not evict them locally.
    greenroomCleanupTimerRef.current = null

    return () => {
      if (greenroomCleanupTimerRef.current !== null) {
        window.clearTimeout(greenroomCleanupTimerRef.current)
        greenroomCleanupTimerRef.current = null
      }
    }
  }, [currentPresence, currentSessionStats, hasCurrentSession, isGreenroom, selectedCampaignId])
}

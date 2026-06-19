/** PartyPanel — party sheet for the offline lobby workspace.
 * Renders campaign members with real, campaign-scoped presence labels.
 * Presence is fetched from backend snapshot API and refreshed periodically.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PresenceState, SessionState, type UUID } from '@shared'
import { Icon } from '@/components/ui/Icon'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import { useStore } from '@/state/store'
import type { SessionPresence } from '@/types/room'
import type { MockPartyMember } from '@/types/campaignParty'
import { generateMockParty } from '@/utils/campaignPartyMockData'
import { getUserDMOverride } from '@/utils/audioOverrides'
import '@/styles/components/workspaces/shared/panels/PartyPanel.css'
import { PartyMemberCard } from './PartyMemberCard'
import {
  AWAY_TIMEOUT_MS,
  AWAY_POLL_INTERVAL_MS,
  EMPTY_SESSION_PRESENCE,
  buildSnapshotWithLivePresence,
  extractConditionLabel,
  groupMembersByStatusAndRole,
  mergeMembersPreservingReferences,
  toMockMember,
} from './PartyPanel.helpers'
import type { PartyPresenceMemberSnapshot, PartyPresenceResponse } from './PartyPanel.helpers'

export interface PartyPanelProps {
  campaignId: UUID
  campaignName?: string
  apiUrl: string
  authToken: string
  currentSessionId: UUID | null
  currentSessionState: SessionState | null
  currentUserId: UUID
  partyPresenceRefreshVersion: number
  fetchWithAuthGuard: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  canOpenCharacterSettings?: boolean
  onOpenCharacterSettings?: () => void
}

export function PartyPanel({
  campaignId,
  campaignName,
  apiUrl,
  authToken,
  currentSessionId,
  currentSessionState,
  currentUserId,
  partyPresenceRefreshVersion,
  fetchWithAuthGuard,
  canOpenCharacterSettings = false,
  onOpenCharacterSettings,
}: PartyPanelProps) {
  const awayStorageKey = `vtt:presence:manual-away:${campaignId}:${currentUserId}:${currentSessionId || 'none'}`
  // Tracks that AWAY muted the mic so returning from AWAY can restore it.
  const awayMutedKey = `vtt:presence:muted-by-away:${currentSessionId || 'none'}`

  const [members, setMembers] = useState<MockPartyMember[]>([])
  const [snapshotMembers, setSnapshotMembers] = useState<PartyPresenceMemberSnapshot[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [isSyncingAway, setIsSyncingAway] = useState(false)
  const [manualAway, setManualAway] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return window.localStorage.getItem(awayStorageKey) === '1'
  })
  const [autoAway, setAutoAway] = useState(false)
  const lastActivityAtRef = useRef<number>(0)
  const awayRequestInFlightRef = useRef(false)
  const sessionPresenceByUserRef = useRef<Record<UUID, SessionPresence>>(EMPTY_SESSION_PRESENCE)
  const dmOverrides = useStore((state) => state.dmOverrides)
  const dmOverridesRef = useRef(dmOverrides)
  // Ref-based previous value tracker for the IDLE → ONLINE transition detection.
  const prevSelfPresenceStateRef = useRef<PresenceState | undefined>(undefined)

  const currentUserSnapshot = useMemo(
    () => snapshotMembers.find((member) => member.userId === currentUserId) || null,
    [currentUserId, snapshotMembers]
  )

  const canManageAway =
    Boolean(currentSessionId) &&
    (currentSessionState === SessionState.ACTIVE || currentSessionState === SessionState.PAUSED)

  const isCurrentUserRuntimeVisible =
    currentUserSnapshot?.status === 'HERE' || currentUserSnapshot?.status === 'AWAY'

  // Imperative subscription: presence is read via the ref inside applyMergedMembers, so we
  // don't need a reactive hook that re-renders this panel on every WS presence event
  // (including ghost flips). store.subscribe keeps the ref current without triggering renders.
  useEffect(() => {
    const sync = (state: { sessionPresence: Record<string, Record<string, SessionPresence>> }) => {
      sessionPresenceByUserRef.current = currentSessionId
        ? (state.sessionPresence[currentSessionId] ?? EMPTY_SESSION_PRESENCE)
        : EMPTY_SESSION_PRESENCE
    }
    sync(useStore.getState())
    return useStore.subscribe(sync)
  }, [currentSessionId])

  useEffect(() => {
    dmOverridesRef.current = dmOverrides
  }, [dmOverrides])

  const applyMergedMembers = useCallback(
    (baseSnapshots: PartyPresenceMemberSnapshot[]) => {
      const nextMembers = baseSnapshots.map((snapshotMember) => {
        const merged = buildSnapshotWithLivePresence(
          snapshotMember,
          sessionPresenceByUserRef.current[snapshotMember.userId]
        )
        const conditionOverride = getUserDMOverride(
          dmOverridesRef.current,
          snapshotMember.userId,
          'CONDITION'
        )
        const activeCondition = extractConditionLabel(conditionOverride?.parameters)

        return {
          ...toMockMember(merged.snapshot),
          dataSource: merged.source,
          activeCondition,
        } as MockPartyMember
      })

      setMembers((previous) => mergeMembersPreservingReferences(previous, nextMembers))
    },
    [setMembers]
  )

  const refreshSnapshot = useCallback(
    async (showLoading = false) => {
      if (showLoading) {
        setIsLoading(true)
      }

      setRefreshError(null)

      try {
        const sessionQuery = currentSessionId
          ? `?sessionId=${encodeURIComponent(currentSessionId)}`
          : ''
        const response = await fetchWithAuthGuard(
          `${apiUrl}/api/campaigns/${campaignId}/party-presence${sessionQuery}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          }
        )

        if (!response.ok) {
          const errorData = (await response.json().catch(() => ({}))) as { message?: string }
          throw new Error(errorData.message || 'Failed to load party presence')
        }

        const payload = (await response.json()) as PartyPresenceResponse
        setSnapshotMembers(payload.members)
        applyMergedMembers(payload.members)

        // Backfill sessionPresence with IDLE (AWAY) state from the authoritative backend
        // snapshot. Clients who joined after a player went AWAY will have ONLINE in their
        // sessionPresence (hardcoded by the ROOM:USER_JOINED hydration path), so the
        // SpeakingIndicator's isAway selector would return false without this sync.
        if (currentSessionId) {
          const store = useStore.getState()
          for (const member of payload.members) {
            if (member.runtimePresenceState === 'IDLE') {
              const current = store.sessionPresence[currentSessionId]?.[member.userId]
              if (current && current.state !== 'IDLE') {
                store.applySessionPresenceStateChange({
                  sessionId: currentSessionId,
                  userId: member.userId,
                  username: member.username,
                  roomId: current.primaryRoomId,
                  state: PresenceState.IDLE,
                  changedAt: member.lastSeenAt ?? Date.now(),
                })
              }
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load party presence'
        setRefreshError(message)

        if (import.meta.env.DEV) {
          const fallbackMembers = generateMockParty()
          setSnapshotMembers([])
          setMembers(fallbackMembers)
        }
      } finally {
        setIsLoading(false)
      }
    },
    [apiUrl, authToken, campaignId, currentSessionId, fetchWithAuthGuard, applyMergedMembers]
  )

  useEffect(() => {
    if (snapshotMembers.length === 0) {
      return
    }

    // sessionPresence is read from the ref (always current) — no reactive dep needed.
    applyMergedMembers(snapshotMembers)
  }, [snapshotMembers, applyMergedMembers])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refreshSnapshot(true)
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [refreshSnapshot])

  useEffect(() => {
    if (partyPresenceRefreshVersion === 0) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void refreshSnapshot()
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [partyPresenceRefreshVersion, refreshSnapshot])

  // Refresh when session state or session ID changes so the status badges
  // stay in sync with the state machine (start, pause, resume, end, new session).
  // Uses a ref to skip the initial mount — the mount effect above handles that.
  const prevSessionKeyRef = useRef(`${currentSessionId ?? ''}:${currentSessionState ?? ''}`)
  useEffect(() => {
    const key = `${currentSessionId ?? ''}:${currentSessionState ?? ''}`
    if (key === prevSessionKeyRef.current) {
      return
    }
    prevSessionKeyRef.current = key
    void refreshSnapshot()
  }, [currentSessionId, currentSessionState, refreshSnapshot])

  useEffect(() => {
    lastActivityAtRef.current = Date.now()
  }, [])

  const setPresenceState = useCallback(
    async (state: 'ONLINE' | 'IDLE') => {
      if (!currentSessionId || awayRequestInFlightRef.current) {
        return
      }

      awayRequestInFlightRef.current = true
      setIsSyncingAway(true)
      setRefreshError(null)

      try {
        const response = await fetchWithAuthGuard(
          `${apiUrl}/api/presence/${currentSessionId}/state`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({ state }),
          }
        )

        if (!response.ok) {
          const errorData = (await response.json().catch(() => ({}))) as { message?: string }
          throw new Error(errorData.message || 'Failed to update away status')
        }

        await refreshSnapshot()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update away status'
        setRefreshError(message)
      } finally {
        awayRequestInFlightRef.current = false
        setIsSyncingAway(false)
      }
    },
    [apiUrl, authToken, currentSessionId, fetchWithAuthGuard, refreshSnapshot]
  )

  const handleToggleAway = useCallback(async () => {
    if (!canManageAway || !isCurrentUserRuntimeVisible) {
      return
    }

    const nextManualAway = !manualAway
    setManualAway(nextManualAway)
    window.localStorage.setItem(awayStorageKey, nextManualAway ? '1' : '0')

    if (nextManualAway) {
      setAutoAway(false)

      // Auto-mute mic when going AWAY so the player doesn't broadcast ambient noise.
      // Save a flag so returning from AWAY can restore the live state.
      const wasMicOn = useStore.getState().device.microphoneOn
      if (wasMicOn && currentSessionId) {
        window.localStorage.setItem(awayMutedKey, '1')
        useStore.getState().setDevice({ microphoneOn: false })
        try {
          await fetch(`${apiUrl}/api/audio/mute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ sessionId: currentSessionId, muted: true }),
          })
        } catch {
          // Non-critical: mute state self-corrects on reconnect
        }
      }

      await setPresenceState('IDLE')
      return
    }

    lastActivityAtRef.current = Date.now()

    // Restore mic if AWAY had muted it.
    if (currentSessionId && window.localStorage.getItem(awayMutedKey) === '1') {
      window.localStorage.removeItem(awayMutedKey)
      useStore.getState().setDevice({ microphoneOn: true })
      try {
        await fetch(`${apiUrl}/api/audio/unmute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ sessionId: currentSessionId, muted: false }),
        })
      } catch {
        // Non-critical
      }
    }

    await setPresenceState('ONLINE')
  }, [
    awayStorageKey,
    awayMutedKey,
    apiUrl,
    authToken,
    currentSessionId,
    canManageAway,
    isCurrentUserRuntimeVisible,
    manualAway,
    setPresenceState,
  ])

  // Detect when the self-user's presence transitions IDLE → ONLINE externally
  // (e.g., Go Live in AudioPanel calls the presence API while AWAY).
  // Using a Zustand subscription (not a reactive selector) so we compare prev vs next
  // and cannot miss the transition due to React render batching edge cases.
  useEffect(() => {
    if (!currentSessionId) return

    // Seed the ref before subscribing so the first event has a valid baseline.
    prevSelfPresenceStateRef.current =
      useStore.getState().sessionPresence[currentSessionId]?.[currentUserId]?.state

    const unsub = useStore.subscribe((state) => {
      const next = state.sessionPresence[currentSessionId]?.[currentUserId]?.state
      const prev = prevSelfPresenceStateRef.current
      prevSelfPresenceStateRef.current = next

      if (prev === PresenceState.IDLE && next === PresenceState.ONLINE) {
        // AWAY cleared by an external action — sync local flags and refresh the panel.
        setManualAway(false)
        setAutoAway(false)
        window.localStorage.removeItem(awayStorageKey)
        window.localStorage.removeItem(`vtt:presence:muted-by-away:${currentSessionId}`)
        void refreshSnapshot()
      }
    })

    return unsub
  }, [currentSessionId, currentUserId, awayStorageKey, refreshSnapshot])

  const handleRefresh = useCallback(() => {
    void refreshSnapshot()
  }, [refreshSnapshot])

  useEffect(() => {
    if (!canManageAway || !isCurrentUserRuntimeVisible) {
      return
    }

    const onActivity = () => {
      lastActivityAtRef.current = Date.now()

      if (autoAway && !manualAway) {
        setAutoAway(false)
        void setPresenceState('ONLINE')
      }
    }

    const events: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'click', 'touchstart']
    events.forEach((eventName) => window.addEventListener(eventName, onActivity, { passive: true }))

    const intervalId = window.setInterval(() => {
      if (manualAway || autoAway) {
        return
      }

      const inactiveForMs = Date.now() - lastActivityAtRef.current
      if (inactiveForMs < AWAY_TIMEOUT_MS) {
        return
      }

      setAutoAway(true)
      void setPresenceState('IDLE')
    }, AWAY_POLL_INTERVAL_MS)

    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, onActivity))
      window.clearInterval(intervalId)
    }
  }, [autoAway, canManageAway, isCurrentUserRuntimeVisible, manualAway, setPresenceState])

  const connectedCount = members.filter((m) => m.status === 'here' || m.status === 'away').length
  const awayButtonLabel = manualAway ? 'Set Here' : 'Set Away'

  return (
    <section
      className="party-sheet"
      aria-label={campaignName ? `Party sheet for ${campaignName}` : 'Party sheet'}
    >
      {/* Header */}
      <header className="party-sheet__header">
        <div className="party-sheet__header-info">
          <h4 className="party-sheet__title">
            <Icon name="party" />
            Party
            {members.length > 0 && (
              <span className="party-sheet__count-badge">
                {connectedCount} connected / {members.length}
              </span>
            )}
          </h4>
        </div>

        <div className="party-sheet__header-actions">
          {canOpenCharacterSettings && onOpenCharacterSettings ? (
            <button
              type="button"
              className="party-sheet__away-btn"
              onClick={onOpenCharacterSettings}
            >
              Edit
            </button>
          ) : null}

          {canManageAway && (
            <button
              type="button"
              className="party-sheet__away-btn"
              onClick={() => {
                void handleToggleAway()
              }}
              disabled={isSyncingAway || !isCurrentUserRuntimeVisible}
            >
              {isSyncingAway ? 'Syncing...' : awayButtonLabel}
            </button>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="party-sheet__refresh-btn"
                aria-label="Refresh party presence"
                onClick={handleRefresh}
              >
                <Icon name="refresh" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">Refresh party presence</TooltipContent>
          </Tooltip>
        </div>
      </header>

      <div className="party-sheet__body">
        {refreshError && <p className="party-sheet__error">{refreshError}</p>}

        {isLoading ? (
          <p className="party-sheet__empty">Loading party status...</p>
        ) : members.length === 0 ? (
          <div className="ui-empty-panel" role="status">
            <Icon name="group" />
            <span>No party members yet.</span>
          </div>
        ) : (
          <div className="party-sheet__cards knowledge-panel-results--scroll">
            {groupMembersByStatusAndRole(members).map((group) => (
              <div key={group.groupLabel} className="party-sheet__group">
                <h5 className="party-sheet__group-header">{group.groupLabel}</h5>
                <div className="party-sheet__group-members">
                  {group.members.map((member) => (
                    <PartyMemberCard key={member.id} member={member} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

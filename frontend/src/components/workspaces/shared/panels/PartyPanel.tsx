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
import type { MockPartyMember, MockPlayerStatus } from '@/types/campaignParty'
import { formatLastSeen, generateMockParty } from '@/utils/campaignPartyMockData'
import '@/styles/components/workspaces/shared/panels/PartyPanel.css'

const AWAY_TIMEOUT_MS = 8 * 60 * 1000
const AWAY_POLL_INTERVAL_MS = 20 * 1000

type PartyPresenceStatus = 'HERE' | 'AWAY' | 'LOBBY' | 'NOT_HERE' | 'OFFLINE'

interface PartyPresenceMemberSnapshot {
  userId: UUID
  username: string
  role: 'DM' | 'PLAYER' | 'SPECTATOR' | 'SYSTEM'
  playerName: string
  avatarUrl?: string | null
  characterName?: string | null
  characterClass?: string | null
  characterSubclass?: string | null
  characterRace?: string | null
  level?: number | null
  characterStats?: Record<string, unknown> | null
  status: PartyPresenceStatus
  runtimePresenceState?: 'ONLINE' | 'TYPING' | 'SPEAKING' | 'IDLE' | 'OFFLINE' | null
  lastSeenAt?: number | null
  manualAway?: boolean
}

interface PartyPresenceResponse {
  campaignId: UUID
  sessionId: UUID | null
  members: PartyPresenceMemberSnapshot[]
  snapshotAt: number
}

// ─── Status helpers ────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<MockPlayerStatus, string> = {
  here: 'HERE',
  away: 'AWAY',
  lobby: 'LOBBY',
  'not-here': 'NOT HERE',
  offline: 'OFFLINE',
}

const STATUS_SYMBOL: Record<MockPlayerStatus, string> = {
  here: 'radio_button_checked',
  away: 'schedule',
  lobby: 'meeting_room',
  'not-here': 'swap_horiz',
  offline: 'radio_button_unchecked',
}

const API_TO_UI_STATUS: Record<PartyPresenceStatus, MockPlayerStatus> = {
  HERE: 'here',
  AWAY: 'away',
  LOBBY: 'lobby',
  NOT_HERE: 'not-here',
  OFFLINE: 'offline',
}

const EMPTY_SESSION_PRESENCE: Record<UUID, SessionPresence> = {}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function toStatValue(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(1, Math.min(30, Math.round(value)))
}

function hasString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function mapPresenceStateToUiStatus(state: PresenceState): MockPlayerStatus {
  if (state === PresenceState.IDLE) {
    return 'away'
  }

  if (state === PresenceState.OFFLINE) {
    return 'offline'
  }

  return 'here'
}

function toMockMember(member: PartyPresenceMemberSnapshot): MockPartyMember {
  const stats = (member.characterStats || {}) as Record<string, unknown>
  const characterName = member.characterName || member.playerName || member.username
  const playerName = member.playerName || member.username

  return {
    id: member.userId,
    role: member.role === 'DM' ? 'DM' : member.role === 'SPECTATOR' ? 'SPECTATOR' : 'PLAYER',
    playerName,
    characterName,
    avatarUrl: member.avatarUrl || null,
    avatarInitials: initialsFromName(characterName || playerName),
    race: member.characterRace || 'Unknown',
    characterClass: member.characterClass || 'Unknown',
    subClass: member.characterSubclass || undefined,
    level: Math.max(1, Math.min(20, Math.round(member.level || 1))),
    stats: {
      str: toStatValue(stats.str, 10),
      dex: toStatValue(stats.dex, 10),
      con: toStatValue(stats.con, 10),
      int: toStatValue(stats.int, 10),
      wis: toStatValue(stats.wis, 10),
      cha: toStatValue(stats.cha, 10),
    },
    status: API_TO_UI_STATUS[member.status],
    lastSeenMs: member.lastSeenAt || Date.now(),
  }
}

function buildSnapshotWithLivePresence(
  snapshot: PartyPresenceMemberSnapshot,
  livePresence?: SessionPresence
): { snapshot: PartyPresenceMemberSnapshot; source: 'snapshot' | 'live-merged' } {
  if (!livePresence) {
    return { snapshot, source: 'snapshot' }
  }

  let usedLivePresence = false

  const merged: PartyPresenceMemberSnapshot = {
    ...snapshot,
    playerName: hasString(livePresence.playerName)
      ? ((usedLivePresence = usedLivePresence || livePresence.playerName !== snapshot.playerName),
        livePresence.playerName)
      : snapshot.playerName,
    avatarUrl: hasString(livePresence.avatarUrl)
      ? ((usedLivePresence = usedLivePresence || livePresence.avatarUrl !== snapshot.avatarUrl),
        livePresence.avatarUrl)
      : snapshot.avatarUrl,
    characterName: hasString(livePresence.characterName)
      ? ((usedLivePresence =
          usedLivePresence || livePresence.characterName !== snapshot.characterName),
        livePresence.characterName)
      : snapshot.characterName,
    characterClass: hasString(livePresence.characterClass)
      ? ((usedLivePresence =
          usedLivePresence || livePresence.characterClass !== snapshot.characterClass),
        livePresence.characterClass)
      : snapshot.characterClass,
    characterSubclass: hasString(livePresence.characterSubclass)
      ? ((usedLivePresence =
          usedLivePresence || livePresence.characterSubclass !== snapshot.characterSubclass),
        livePresence.characterSubclass)
      : snapshot.characterSubclass,
    characterRace: hasString(livePresence.characterRace)
      ? ((usedLivePresence =
          usedLivePresence || livePresence.characterRace !== snapshot.characterRace),
        livePresence.characterRace)
      : snapshot.characterRace,
    level:
      typeof livePresence.level === 'number'
        ? ((usedLivePresence = usedLivePresence || livePresence.level !== snapshot.level),
          livePresence.level)
        : snapshot.level,
    characterStats:
      livePresence.characterStats && livePresence.characterStats !== snapshot.characterStats
        ? ((usedLivePresence = true), livePresence.characterStats)
        : snapshot.characterStats,
    lastSeenAt:
      typeof livePresence.lastSeenAt === 'number' ? livePresence.lastSeenAt : snapshot.lastSeenAt,
  }

  if (livePresence.state) {
    const nextStatus = livePresence.primaryRoomId
      ? livePresence.state === PresenceState.IDLE
        ? 'AWAY'
        : 'HERE'
      : mapPresenceStateToUiStatus(livePresence.state) === 'away'
        ? 'AWAY'
        : merged.status

    if (nextStatus !== merged.status) {
      usedLivePresence = true
      merged.status = nextStatus
    }
  }

  return { snapshot: merged, source: usedLivePresence ? 'live-merged' : 'snapshot' }
}

function membersEqual(left: MockPartyMember, right: MockPartyMember): boolean {
  return (
    left.id === right.id &&
    left.role === right.role &&
    left.playerName === right.playerName &&
    left.characterName === right.characterName &&
    left.avatarUrl === right.avatarUrl &&
    left.avatarInitials === right.avatarInitials &&
    left.dataSource === right.dataSource &&
    left.race === right.race &&
    left.characterClass === right.characterClass &&
    left.subClass === right.subClass &&
    left.level === right.level &&
    left.status === right.status &&
    left.lastSeenMs === right.lastSeenMs &&
    left.stats.str === right.stats.str &&
    left.stats.dex === right.stats.dex &&
    left.stats.con === right.stats.con &&
    left.stats.int === right.stats.int &&
    left.stats.wis === right.stats.wis &&
    left.stats.cha === right.stats.cha
  )
}

function mergeMembersPreservingReferences(
  previous: MockPartyMember[],
  next: MockPartyMember[]
): MockPartyMember[] {
  const previousById = new Map(previous.map((member) => [member.id, member]))
  let hasAnyChange = previous.length !== next.length

  const merged = next.map((member) => {
    const previousMember = previousById.get(member.id)
    if (previousMember && membersEqual(previousMember, member)) {
      return previousMember
    }

    hasAnyChange = true
    return member
  })

  return hasAnyChange ? merged : previous
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function PartyStatusBadge({ status }: { status: MockPlayerStatus }) {
  return (
    <span className={`party-status-badge party-status-badge--${status}`}>
      <span className="material-symbols-outlined party-status-badge__icon" aria-hidden="true">
        {STATUS_SYMBOL[status]}
      </span>
      {STATUS_LABELS[status]}
    </span>
  )
}

function PartyMemberCard({ member }: { member: MockPartyMember }) {
  const isDM = member.role === 'DM'
  const rolePillLabel =
    member.role === 'DM' ? 'DM' : member.role === 'SPECTATOR' ? 'SPECTATOR' : 'PLAYER'
  const rolePillClass =
    member.role === 'DM'
      ? 'party-card__role-chip party-card__role-chip--dm'
      : member.role === 'SPECTATOR'
        ? 'party-card__role-chip party-card__role-chip--spectator'
        : 'party-card__role-chip party-card__role-chip--player'
  const stats: Array<[string, number]> = [
    ['STR', member.stats.str],
    ['DEX', member.stats.dex],
    ['CON', member.stats.con],
    ['INT', member.stats.int],
    ['WIS', member.stats.wis],
    ['CHA', member.stats.cha],
  ]
  const metaParts = [
    member.characterClass,
    member.subClass,
    member.race,
    `Lv ${member.level}`,
  ].filter(Boolean) as string[]

  return (
    <div className="party-card-wrap">
      <div className={`party-card party-card--${member.status}${isDM ? ' party-card--dm' : ''}`}>
        <span
          className={`party-card__avatar party-card__avatar--${member.status}`}
          aria-hidden="true"
        >
          {member.avatarUrl ? (
            <img src={member.avatarUrl} alt="" className="party-card__avatar-image" />
          ) : (
            member.avatarInitials
          )}
        </span>
        <div className="party-card__body">
          <div className="party-card__info">
            <div className="party-card__name-row">
              <span className="party-card__char-name">{member.characterName}</span>
              {isDM && <span className={rolePillClass}>{rolePillLabel}</span>}
            </div>
            {!isDM && member.playerName !== member.characterName && (
              <span className="party-card__player-name">{member.playerName}</span>
            )}
            {!isDM && <span className="party-card__meta">{metaParts.join(' · ')}</span>}
          </div>
          {!isDM && (
            <div className="party-card__stats-column">
              <span className={`party-card__stats-role ${rolePillClass}`}>{rolePillLabel}</span>
              <div className="party-card__stats" aria-label="Ability scores">
                {stats.map(([k, v]) => (
                  <span key={k} className="party-card__stat">
                    <strong>{v}</strong>
                    <span>{k}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="party-card__footer">
            <div className="party-card__footer-left">
              <PartyStatusBadge status={member.status} />
            </div>
            <span className="party-card__seen">{formatLastSeen(member.lastSeenMs)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

interface PartyPanelProps {
  campaignId: UUID
  campaignName?: string
  apiUrl: string
  authToken: string
  currentSessionId: UUID | null
  currentSessionState: SessionState | null
  currentUserId: UUID
  partyPresenceRefreshVersion: number
  fetchWithAuthGuard: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
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
}: PartyPanelProps) {
  const awayStorageKey = `vtt:presence:manual-away:${campaignId}:${currentUserId}:${currentSessionId || 'none'}`

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
  const sessionPresenceByUser = useStore((state) => {
    if (!currentSessionId) {
      return EMPTY_SESSION_PRESENCE
    }

    return state.sessionPresence[currentSessionId] || EMPTY_SESSION_PRESENCE
  })

  const currentUserSnapshot = useMemo(
    () => snapshotMembers.find((member) => member.userId === currentUserId) || null,
    [currentUserId, snapshotMembers]
  )

  const canManageAway =
    Boolean(currentSessionId) &&
    (currentSessionState === SessionState.ACTIVE || currentSessionState === SessionState.PAUSED)

  const isCurrentUserRuntimeVisible =
    currentUserSnapshot?.status === 'HERE' || currentUserSnapshot?.status === 'AWAY'

  useEffect(() => {
    sessionPresenceByUserRef.current = sessionPresenceByUser
  }, [sessionPresenceByUser])

  const applyMergedMembers = useCallback(
    (baseSnapshots: PartyPresenceMemberSnapshot[]) => {
      const nextMembers = baseSnapshots.map((snapshotMember) => {
        const merged = buildSnapshotWithLivePresence(
          snapshotMember,
          sessionPresenceByUserRef.current[snapshotMember.userId]
        )
        return {
          ...toMockMember(merged.snapshot),
          dataSource: merged.source,
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
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load party presence'
        setRefreshError(message)

        if (IS_DEV) {
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

    applyMergedMembers(snapshotMembers)
  }, [sessionPresenceByUser, snapshotMembers, applyMergedMembers])

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
      await setPresenceState('IDLE')
      return
    }

    lastActivityAtRef.current = Date.now()
    await setPresenceState('ONLINE')
  }, [awayStorageKey, canManageAway, isCurrentUserRuntimeVisible, manualAway, setPresenceState])

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
                <span className="material-symbols-outlined" aria-hidden="true">
                  refresh
                </span>
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
            <span className="material-symbols-outlined" aria-hidden="true">
              group
            </span>
            <span>No party members yet.</span>
          </div>
        ) : (
          <div className="party-sheet__cards workspace-panel-scroll-region">
            {members.map((member) => (
              <PartyMemberCard key={member.id} member={member} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

/** PartyPanel — party sheet for the offline lobby workspace.
 * Renders campaign members with real, campaign-scoped presence labels.
 * Presence is fetched from backend snapshot API and refreshed periodically.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SessionState, type UUID } from '@shared'
import { Icon } from '@/components/ui/Icon'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import {
  type MockPartyMember,
  type MockPlayerStatus,
  formatLastSeen,
  generateMockParty,
} from '@/utils/campaignPartyMockData'
import '@/styles/components/workspaces/shared/panels/PartyPanel.css'

const IS_DEV = import.meta.env.DEV
const AWAY_TIMEOUT_MS = 8 * 60 * 1000
const AWAY_POLL_INTERVAL_MS = 20 * 1000
const SNAPSHOT_REFRESH_MS = 30 * 1000

type PartyPresenceStatus = 'HERE' | 'AWAY' | 'LOBBY' | 'NOT_HERE' | 'OFFLINE'

interface PartyPresenceMemberSnapshot {
  userId: UUID
  username: string
  role: 'DM' | 'PLAYER' | 'SPECTATOR' | 'SYSTEM'
  playerName: string
  avatarUrl?: string | null
  characterName?: string | null
  characterClass?: string | null
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

function toMockMember(member: PartyPresenceMemberSnapshot): MockPartyMember {
  const stats = (member.characterStats || {}) as Record<string, unknown>
  const characterName = member.characterName || member.playerName || member.username
  const playerName = member.playerName || member.username

  return {
    id: member.userId,
    playerName,
    characterName,
    avatarInitials: initialsFromName(characterName || playerName),
    race: member.characterRace || 'Unknown',
    characterClass: member.characterClass || 'Unknown',
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

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: MockPlayerStatus }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`party-sheet__status-icon party-sheet__status-icon--${status}`}
          aria-label={STATUS_LABELS[status]}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            {STATUS_SYMBOL[status]}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="right">{STATUS_LABELS[status]}</TooltipContent>
    </Tooltip>
  )
}

function MemberAvatar({ initials, status }: { initials: string; status: MockPlayerStatus }) {
  return (
    <span className={`party-sheet__avatar party-sheet__avatar--${status}`} aria-hidden="true">
      {initials}
    </span>
  )
}

function StatGrid({ stats }: { stats: MockPartyMember['stats'] }) {
  const entries: Array<[string, number]> = [
    ['STR', stats.str],
    ['DEX', stats.dex],
    ['CON', stats.con],
    ['INT', stats.int],
    ['WIS', stats.wis],
    ['CHA', stats.cha],
  ]

  return (
    <div className="party-sheet__stat-grid" aria-label="Ability scores">
      {entries.map(([key, value]) => (
        <span key={key} className="party-sheet__stat" aria-label={`${key} ${value}`}>
          <strong className="party-sheet__stat-value">{value}</strong>
          <span className="party-sheet__stat-label">{key}</span>
        </span>
      ))}
    </div>
  )
}

function MemberRow({ member }: { member: MockPartyMember }) {
  return (
    <tr className="party-sheet__row">
      {/* Status */}
      <td className="party-sheet__cell party-sheet__cell--status">
        <StatusIcon status={member.status} />
      </td>

      {/* Avatar */}
      <td className="party-sheet__cell party-sheet__cell--avatar">
        <MemberAvatar initials={member.avatarInitials} status={member.status} />
      </td>

      {/* Character name + player name tooltip */}
      <td className="party-sheet__cell party-sheet__cell--name">
        <div className="party-sheet__name-stack">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="party-sheet__char-name">{member.characterName}</span>
            </TooltipTrigger>
            <TooltipContent side="right">
              <span className="party-sheet__player-tooltip">
                <span className="material-symbols-outlined" aria-hidden="true">
                  person
                </span>
                {member.playerName}
              </span>
            </TooltipContent>
          </Tooltip>
        </div>
      </td>

      {/* Race */}
      <td className="party-sheet__cell party-sheet__cell--race">{member.race}</td>

      {/* Class */}
      <td className="party-sheet__cell party-sheet__cell--class">{member.characterClass}</td>

      {/* Level */}
      <td className="party-sheet__cell party-sheet__cell--level">{member.level}</td>

      {/* Stat block */}
      <td className="party-sheet__cell party-sheet__cell--stats">
        <StatGrid stats={member.stats} />
      </td>

      {/* Last seen */}
      <td className="party-sheet__cell party-sheet__cell--last-seen">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="party-sheet__last-seen">{formatLastSeen(member.lastSeenMs)}</span>
          </TooltipTrigger>
          <TooltipContent side="left">
            {new Date(member.lastSeenMs).toLocaleString()}
          </TooltipContent>
        </Tooltip>
      </td>
    </tr>
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

  const currentUserSnapshot = useMemo(
    () => snapshotMembers.find((member) => member.userId === currentUserId) || null,
    [currentUserId, snapshotMembers]
  )

  const canManageAway =
    Boolean(currentSessionId) &&
    (currentSessionState === SessionState.ACTIVE || currentSessionState === SessionState.PAUSED)

  const isCurrentUserRuntimeVisible =
    currentUserSnapshot?.status === 'HERE' || currentUserSnapshot?.status === 'AWAY'

  const refreshSnapshot = useCallback(
    async (showLoading = false) => {
      if (showLoading) {
        setIsLoading(true)
      }

      setRefreshError(null)

      try {
        const response = await fetchWithAuthGuard(
          `${apiUrl}/api/campaigns/${campaignId}/party-presence`,
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
        setMembers(payload.members.map(toMockMember))
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
    [apiUrl, authToken, campaignId, fetchWithAuthGuard]
  )

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refreshSnapshot(true)
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [refreshSnapshot])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshSnapshot()
    }, SNAPSHOT_REFRESH_MS)

    return () => {
      window.clearInterval(intervalId)
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
          <div>
            <h4 className="party-sheet__title">
              <Icon name="party" />
              Party
            </h4>
            <p className="party-sheet__subtitle">
              Track player presence, monitor away state, and keep party readiness visible.
            </p>
          </div>
          {members.length > 0 && (
            <span className="party-sheet__count-badge">
              {connectedCount} connected / {members.length}
            </span>
          )}
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

      {refreshError && <p className="party-sheet__error">{refreshError}</p>}

      {/* Table */}
      {isLoading ? (
        <p className="party-sheet__empty">Loading party status...</p>
      ) : members.length === 0 ? (
        <p className="party-sheet__empty">No party members yet.</p>
      ) : (
        <div className="party-sheet__table-wrap">
          <table className="party-sheet__table" aria-label="Party members">
            <thead>
              <tr className="party-sheet__head-row">
                <th className="party-sheet__th party-sheet__th--status" aria-label="Status" />
                <th className="party-sheet__th party-sheet__th--avatar" aria-label="Avatar" />
                <th className="party-sheet__th">Character</th>
                <th className="party-sheet__th">Race</th>
                <th className="party-sheet__th">Class</th>
                <th className="party-sheet__th party-sheet__th--level">Lvl</th>
                <th className="party-sheet__th party-sheet__th--stats">Stats</th>
                <th className="party-sheet__th party-sheet__th--last-seen">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <MemberRow key={member.id} member={member} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

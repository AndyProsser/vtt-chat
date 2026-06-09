/**
 * DmPresenceStatusLeaf
 *
 * Leaf component that renders the DM's live status badge (HERE / AWAY / LOBBY / OFFLINE).
 * Subscribes only to `sessionPresence[sessionId][userId].state` so a presence flip
 * re-renders just this badge — not the surrounding DM row or status line.
 *
 * Falls back to `fallbackOnline` (from campaign.dmOnline) when no sessionId/userId
 * is available (e.g. editor workspace, no active session).
 */
import React from 'react'
import { PresenceState, type UUID } from '@shared'
import { useStore } from '@/state/store'

type DmStatus = 'HERE' | 'AWAY' | 'LOBBY' | 'OFFLINE'

const STATUS_LABELS: Record<DmStatus, string> = {
  HERE: 'HERE',
  AWAY: 'AWAY',
  LOBBY: 'LOBBY',
  OFFLINE: 'OFFLINE',
}

const STATUS_DATA_ATTR: Record<DmStatus, string> = {
  HERE: 'here',
  AWAY: 'away',
  LOBBY: 'lobby',
  OFFLINE: 'offline',
}

function deriveDmStatus(presenceState: PresenceState | null, fallbackOnline: boolean): DmStatus {
  if (
    presenceState === PresenceState.ONLINE ||
    presenceState === PresenceState.TYPING ||
    presenceState === PresenceState.SPEAKING
  ) {
    return 'HERE'
  }
  if (presenceState === PresenceState.IDLE) {
    return 'AWAY'
  }
  return fallbackOnline ? 'LOBBY' : 'OFFLINE'
}

interface DmPresenceStatusLeafProps {
  sessionId: UUID | undefined
  userId: UUID | undefined
  fallbackOnline?: boolean
}

function DmPresenceStatusLeafImpl({
  sessionId,
  userId,
  fallbackOnline = false,
}: DmPresenceStatusLeafProps) {
  const presenceState = useStore((state) =>
    sessionId && userId ? (state.sessionPresence[sessionId]?.[userId]?.state ?? null) : null
  )

  const status = deriveDmStatus(presenceState, fallbackOnline)

  return (
    <span
      className="cip-dm-status-badge"
      data-state={STATUS_DATA_ATTR[status]}
      aria-label={`DM status: ${STATUS_LABELS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

export const DmPresenceStatusLeaf = React.memo(DmPresenceStatusLeafImpl)

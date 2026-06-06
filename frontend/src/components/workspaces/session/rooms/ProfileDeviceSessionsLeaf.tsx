import { memo } from 'react'
import type { UUID } from '@shared'
import { useStore } from '@/hooks/useStore'
import type { SessionPresence } from '@/types/room'
import { ParticipantDeviceList } from './ParticipantDeviceList'

const EMPTY_DEVICE_SESSIONS: NonNullable<SessionPresence['deviceSessions']> = []

interface ProfileDeviceSessionsLeafProps {
  sessionId: UUID
  userId: UUID
}

/**
 * Leaf-isolated device-session render path.
 * Subscribes only to this user's deviceSessions array so multi-device connect/disconnect
 * events do not invalidate room/group/list parent projections.
 */
export const ProfileDeviceSessionsLeaf = memo(function ProfileDeviceSessionsLeaf({
  sessionId,
  userId,
}: ProfileDeviceSessionsLeafProps) {
  const deviceSessions = useStore(
    (state) => state.sessionPresence[sessionId]?.[userId]?.deviceSessions ?? EMPTY_DEVICE_SESSIONS
  )

  return <ParticipantDeviceList deviceSessions={deviceSessions} />
})

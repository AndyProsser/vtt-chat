import { useMemo } from 'react'
import { useStore } from '@/hooks/useStore'
import { ROOM_PRESENCE_COPY } from '@/constants/roomPresence.constants'
import type { GroupPanelGroupWithParticipants } from '@/types/groupPanel'

interface DmVoiceTargetIndicatorProps {
  allRooms: GroupPanelGroupWithParticipants[]
}

/**
 * Leaf component that displays the DM's current voice target room name.
 * Subscribes ONLY to dmVoiceTargetGroupId to avoid cascading re-renders
 * of the parent DM card when voice target changes.
 */
export function DmVoiceTargetIndicator({ allRooms }: DmVoiceTargetIndicatorProps) {
  const dmVoiceTargetGroupId = useStore((state) => state.dmVoiceTargetGroupId)

  const targetRoomName = useMemo(() => {
    if (!dmVoiceTargetGroupId) {
      return ROOM_PRESENCE_COPY.mainGroup
    }

    const room = allRooms.find((r) => r.id === dmVoiceTargetGroupId)
    return room?.name || ROOM_PRESENCE_COPY.mainGroup
  }, [allRooms, dmVoiceTargetGroupId])

  return (
    <p className="room-selector-dm__voice-target">
      Voice target: <strong>{targetRoomName}</strong>
    </p>
  )
}

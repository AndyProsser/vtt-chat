import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { UUID } from '@shared'
import { ROOM_NAMES } from '@/constants/roomPresence.constants'

interface ChatWindowHeaderProps {
  apiUrl: string
  token: string
  sessionId: UUID
  roomName?: string
  isGreenroomMode: boolean
  isLoading: boolean
  visibleMessageCount: number
}

interface MessageCountPillProps {
  apiUrl: string
  token: string
  sessionId: UUID
  isGreenroomMode: boolean
  isLoading: boolean
  visibleMessageCount: number
}

const MessageCountPill = memo(function MessageCountPill({
  apiUrl,
  token,
  sessionId,
  isGreenroomMode,
  isLoading,
  visibleMessageCount,
}: MessageCountPillProps) {
  const [totalMessageCount, setTotalMessageCount] = useState<number | null>(null)
  const messageCountFetchedRef = useRef(false)
  const prevVisibleCountRef = useRef(0)

  useEffect(() => {
    messageCountFetchedRef.current = false
    prevVisibleCountRef.current = 0
    setTotalMessageCount(null)
  }, [isGreenroomMode, sessionId])

  useEffect(() => {
    if (isLoading || isGreenroomMode || messageCountFetchedRef.current) {
      return
    }

    messageCountFetchedRef.current = true
    prevVisibleCountRef.current = 0

    fetch(`${apiUrl}/api/chat/messages/${sessionId}/count`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { count?: number } | null) => {
        if (typeof data?.count === 'number') {
          setTotalMessageCount(data.count)
        }
      })
      .catch(() => {
        // Count is presentation-only; ignore fetch failures.
      })
  }, [apiUrl, isGreenroomMode, isLoading, sessionId, token])

  useEffect(() => {
    const previousVisibleCount = prevVisibleCountRef.current
    if (
      !isGreenroomMode &&
      totalMessageCount !== null &&
      visibleMessageCount > previousVisibleCount &&
      previousVisibleCount > 0
    ) {
      setTotalMessageCount((count) =>
        count !== null ? count + (visibleMessageCount - previousVisibleCount) : count
      )
    }
    prevVisibleCountRef.current = visibleMessageCount
  }, [isGreenroomMode, totalMessageCount, visibleMessageCount])

  const countLabel = useMemo(() => {
    if (isGreenroomMode) {
      return `${visibleMessageCount} ${visibleMessageCount === 1 ? 'entry' : 'entries'}`
    }

    if (totalMessageCount !== null) {
      return `${totalMessageCount} messages`
    }

    return `${visibleMessageCount} ${visibleMessageCount === 1 ? 'entry' : 'entries'}`
  }, [isGreenroomMode, totalMessageCount, visibleMessageCount])

  return <span className="session-chat-window__pill">{countLabel}</span>
})

export const ChatWindowHeader = memo(function ChatWindowHeader({
  apiUrl,
  token,
  sessionId,
  roomName,
  isGreenroomMode,
  isLoading,
  visibleMessageCount,
}: ChatWindowHeaderProps) {
  const headerTitle = isGreenroomMode ? 'Greenroom (OOC)' : 'Main Room'
  const resolvedRoomName =
    roomName?.trim() || (isGreenroomMode ? ROOM_NAMES.greenRoom : ROOM_NAMES.mainRoom)
  const headerSubtitle = `${headerTitle} • ${resolvedRoomName}`

  return (
    <header className="session-chat-window__header">
      <div className="session-chat-window__header-copy">
        <h3 className="session-chat-window__title">{headerTitle}</h3>
        <p className="session-chat-window__subtitle">{headerSubtitle}</p>
      </div>
      <div className="session-chat-window__header-pills" aria-label="Timeline context">
        <MessageCountPill
          apiUrl={apiUrl}
          token={token}
          sessionId={sessionId}
          isGreenroomMode={isGreenroomMode}
          isLoading={isLoading}
          visibleMessageCount={visibleMessageCount}
        />
      </div>
    </header>
  )
})

import { useMemo } from 'react'
import type { UUID } from '@shared'
import { MessageType } from '@shared'
import { useStore } from '@/hooks/useStore'
import type { Message } from '@/types/chat'
import { isGreenRoomName } from '@/constants/roomPresence.constants'

const EMPTY_ROOM_DIRECTORY: Record<string, { name: string }> = {}
const EMPTY_SESSION_ROOMS: Record<UUID, { id: UUID; name: string }> = {}
const SESSION_SUMMARY_PREFIX = '[Session Summary]'

function getBookendState(content: string, type: MessageType) {
  if (type !== MessageType.SYSTEM) {
    return null
  }

  if (content.startsWith('[Session Started]') || content.startsWith('Session Start:')) {
    return 'started'
  }
  if (content.startsWith('[Session Ended]') || content.startsWith('Session End:')) {
    return 'ended'
  }
  if (content.startsWith('[Session Paused]')) {
    return 'paused'
  }
  if (content.startsWith('[Session Resumed]')) {
    return 'resumed'
  }
  if (content.startsWith('[Session Cooldown]')) {
    return 'cooldown'
  }

  return null
}

type UseChatVisibleMessagesOptions = {
  sessionId: UUID
  roomId: UUID
  resolvedRoomName: string
  isGreenroomMode: boolean
  currentUserId: UUID
}

/**
 * Derives the room directory and visibility-filtered message list for a chat surface.
 * Runs at the chat boundary so ChatWindow stays focused on IO and scroll behavior.
 */
export function useChatVisibleMessages({
  sessionId,
  roomId,
  resolvedRoomName,
  isGreenroomMode,
  currentUserId,
}: UseChatVisibleMessagesOptions) {
  const sessionMessages = useStore(
    (state) => (state.messages as Record<UUID, Record<UUID, Message>>)[sessionId]
  )
  const sessionRooms = useStore(
    (state) =>
      ((state.rooms as Record<UUID, Record<UUID, { id: UUID; name: string }>>)[sessionId] as
        | Record<UUID, { id: UUID; name: string }>
        | undefined) ?? EMPTY_SESSION_ROOMS
  )

  const roomDirectory = useMemo(() => {
    const entries = Object.values(sessionRooms)

    if (entries.length === 0) {
      return EMPTY_ROOM_DIRECTORY
    }

    return entries.reduce(
      (acc, room) => {
        acc[room.id] = { name: room.name }
        return acc
      },
      {} as Record<string, { name: string }>
    )
  }, [sessionRooms])

  const greenroomRoomId = useMemo(() => {
    const greenroom = Object.values(sessionRooms).find((room) => isGreenRoomName(room.name))
    return greenroom?.id
  }, [sessionRooms])

  const orderedMessages = useMemo(() => {
    const values = Object.values(sessionMessages ?? {})
    if (values.length < 2) {
      return values
    }

    let isChronological = true
    for (let index = 1; index < values.length; index += 1) {
      if (values[index - 1].createdAt > values[index].createdAt) {
        isChronological = false
        break
      }
    }

    if (isChronological) {
      return values
    }

    return [...values].sort((a, b) => a.createdAt - b.createdAt)
  }, [sessionMessages])

  const visibleMessages = useMemo(() => {
    const roomScopedMessages: Message[] = []
    const startedIndices: number[] = []
    const isResolvedRoomGreen = isGreenRoomName(resolvedRoomName)

    for (const message of orderedMessages) {
      if (Array.isArray(message.visibleTo) && !message.visibleTo.includes(currentUserId)) {
        continue
      }

      const roomNameForMessage = message.roomId ? roomDirectory[message.roomId]?.name : undefined
      const isGreenroomMessage =
        message.roomId === greenroomRoomId ||
        (message.roomId === roomId
          ? isResolvedRoomGreen
          : typeof roomNameForMessage === 'string' && isGreenRoomName(roomNameForMessage))
      const bookendState = getBookendState(message.content, message.type)

      if (!isGreenroomMode) {
        if (isGreenroomMessage) {
          continue
        }

        if (bookendState === 'started') {
          startedIndices.push(roomScopedMessages.length)
        }

        roomScopedMessages.push(message)
        continue
      }

      const isGreenroomContextMessage =
        message.roomId === roomId ||
        (typeof roomNameForMessage === 'string' && isGreenRoomName(roomNameForMessage))
      const isSessionSummaryMessage =
        message.type === MessageType.SYSTEM &&
        typeof message.content === 'string' &&
        message.content.startsWith(SESSION_SUMMARY_PREFIX)
      const isHistoricalSessionArtifact =
        (Boolean(bookendState) || isSessionSummaryMessage) &&
        Boolean(message.sessionId) &&
        message.sessionId !== sessionId

      if (!isGreenroomContextMessage) {
        continue
      }

      if (isHistoricalSessionArtifact) {
        continue
      }

      if (
        bookendState &&
        bookendState !== 'started' &&
        bookendState !== 'ended' &&
        bookendState !== 'cooldown'
      ) {
        continue
      }

      roomScopedMessages.push(message)
    }

    return isGreenroomMode || startedIndices.length === 0
      ? roomScopedMessages
      : roomScopedMessages.slice(startedIndices[startedIndices.length - 1])
  }, [
    currentUserId,
    greenroomRoomId,
    isGreenroomMode,
    orderedMessages,
    resolvedRoomName,
    roomDirectory,
    roomId,
    sessionId,
  ])

  return { roomDirectory, visibleMessages }
}

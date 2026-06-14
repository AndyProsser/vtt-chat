/**
 * ChatWindow
 * Main chat container. Loads history on mount and renders message list + input.
 * New messages arrive via WS events (CHAT:MESSAGE_SENT) dispatched to chatSlice.
 */

import { memo, useCallback, useMemo, useRef, useState } from 'react'
import type { WheelEvent } from 'react'
import type { EventEnvelope, UUID } from '@shared'
import { MessageType, Role, RoomType } from '@shared'
import type { SessionState } from '@shared'
import { useStore } from '@/hooks/useStore'
import { ROOM_NAMES } from '@/constants/roomPresence.constants'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { useChatVisibleMessages } from '@/hooks/session/useChatVisibleMessages'
import { useChatHistory } from '@/hooks/session/useChatHistory'
import { useChatScroll } from '@/hooks/session/useChatScroll'
import { ChatWindowHeader } from './ChatWindowHeader'
import { ChatWindowFailedQueue } from './ChatWindowFailedQueue'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { TypingIndicator } from './TypingIndicator'
import type { OutgoingChatMessage } from '@/state/chatSlice'
import type { Message } from '@/types/chat'
import { generateClientId } from '@/utils/uuid'
import { showToast } from '@/state/toastCenter'
import '@/styles/components/workspaces/session/chat/ChatWindow.css'

interface ChatWindowProps {
  apiUrl: string
  token: string
  sessionId: UUID
  roomId: UUID
  campaignId?: UUID
  roomName?: string
  roomType?: RoomType
  user: { id: UUID; username: string; role: Role | string }
  messageGroupingWindowMs?: number
  forceMessageType?: MessageType
  sendWsEvent?: (event: EventEnvelope) => void
  onPendingNewMessageCountChange?: (count: number) => void
}

function areChatWindowPropsEqual(previous: ChatWindowProps, next: ChatWindowProps): boolean {
  return (
    previous.apiUrl === next.apiUrl &&
    previous.token === next.token &&
    previous.sessionId === next.sessionId &&
    previous.roomId === next.roomId &&
    previous.campaignId === next.campaignId &&
    previous.roomName === next.roomName &&
    previous.roomType === next.roomType &&
    previous.user.id === next.user.id &&
    previous.user.username === next.user.username &&
    previous.user.role === next.user.role &&
    previous.messageGroupingWindowMs === next.messageGroupingWindowMs &&
    previous.forceMessageType === next.forceMessageType &&
    previous.sendWsEvent === next.sendWsEvent &&
    previous.onPendingNewMessageCountChange === next.onPendingNewMessageCountChange
  )
}

const DEFAULT_MESSAGE_GROUPING_WINDOW_MS = 5 * 60 * 1000
const EMPTY_OUTGOING_QUEUE: OutgoingChatMessage[] = []

function ChatWindowComponent({
  apiUrl,
  token,
  sessionId,
  roomId,
  campaignId,
  roomName,
  roomType,
  user,
  messageGroupingWindowMs = DEFAULT_MESSAGE_GROUPING_WINDOW_MS,
  forceMessageType,
  sendWsEvent,
  onPendingNewMessageCountChange,
}: ChatWindowProps) {
  const messageListRef = useRef<HTMLDivElement>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  const isGreenroomMode = forceMessageType === MessageType.OOC
  const resolvedRoomName =
    roomName?.trim() || (isGreenroomMode ? ROOM_NAMES.greenRoom : ROOM_NAMES.mainRoom)

  const { roomDirectory, visibleMessages } = useChatVisibleMessages({
    sessionId,
    roomId,
    resolvedRoomName,
    isGreenroomMode,
    currentUserId: user.id,
  })

  const addMessage = useStore((state) => state.addMessage)
  const enqueueOutgoingMessage = useStore((state) => state.enqueueOutgoingMessage)
  const updateOutgoingMessage = useStore((state) => state.updateOutgoingMessage)
  const removeOutgoingMessage = useStore((state) => state.removeOutgoingMessage)
  const sessionOutgoingQueue = useStore(
    (state) =>
      ((state.outgoingQueue as any)[sessionId] as OutgoingChatMessage[]) ?? EMPTY_OUTGOING_QUEUE
  )
  const sessionDmId = useStore(
    (state) =>
      ((state.sessions as any)[sessionId] as { dmId?: UUID; state?: SessionState } | undefined)
        ?.dmId
  )

  const {
    isLoading,
    error: historyError,
    hasHiddenOlderGreenroomHistory,
    revealOlderGreenroomHistory,
  } = useChatHistory({
    apiUrl,
    token,
    sessionId,
    roomId,
    campaignId,
    isGreenroomMode,
    messageListRef,
    topSentinelRef,
  })

  const latestVisibleMessage = visibleMessages[visibleMessages.length - 1]
  const latestVisibleMessageKey = latestVisibleMessage
    ? `${latestVisibleMessage.id}:${latestVisibleMessage.createdAt}`
    : undefined

  const {
    isUserPinnedToBottom,
    isAutoFollowInProgress,
    pendingNewMessageCount,
    scrollToLatest,
    clearPendingNewMessageCount,
    handleListScroll,
    scheduleSettledBottomSnap: _scheduleSettledBottomSnap,
  } = useChatScroll({
    messageListRef,
    latestVisibleMessageKey,
    isLoading,
    contextKey: `${sessionId}:${roomId}`,
    onPendingNewMessageCountChange,
  })

  const handleListWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (!isGreenroomMode || !hasHiddenOlderGreenroomHistory) return

      const scrollContainer = messageListRef.current
      if (!scrollContainer || event.deltaY >= 0 || scrollContainer.scrollTop > 8) return

      revealOlderGreenroomHistory()
    },
    [hasHiddenOlderGreenroomHistory, isGreenroomMode, revealOlderGreenroomHistory]
  )

  const postMessage = useCallback(
    async (content: string, type: MessageType, recipientId?: UUID) => {
      const res = await fetch(
        isGreenroomMode && campaignId
          ? `${apiUrl}/api/chat/campaign/${campaignId}/chat`
          : `${apiUrl}/api/chat/message`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(
            isGreenroomMode && campaignId
              ? { content }
              : { sessionId, roomId, content, type, recipientId }
          ),
        }
      )

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message ?? `HTTP ${res.status}`)
      }

      const responseBody = await res.json().catch(() => null)
      const rawMessage = responseBody?.message ?? responseBody

      if (rawMessage && typeof rawMessage === 'object') {
        const createdAtRaw = (rawMessage as any).createdAt
        const createdAt =
          typeof createdAtRaw === 'number'
            ? createdAtRaw
            : createdAtRaw
              ? new Date(createdAtRaw).getTime()
              : Date.now()

        const optimisticMessage: Message = {
          id: ((rawMessage as any).id ?? (rawMessage as any).messageId) as UUID,
          roomId,
          authorId: ((rawMessage as any).authorId ?? user.id) as UUID,
          authorUsername: ((rawMessage as any).authorUsername ?? user.username) as string,
          content: ((rawMessage as any).content ?? content) as string,
          type: ((rawMessage as any).type ?? type) as MessageType,
          isDmOnly: Boolean((rawMessage as any).isDmOnly),
          visibleTo: Array.isArray((rawMessage as any).visibleTo)
            ? ((rawMessage as any).visibleTo as UUID[])
            : undefined,
          targetIds: Array.isArray((rawMessage as any).targetIds)
            ? ((rawMessage as any).targetIds as UUID[])
            : undefined,
          createdAt,
          editedAt: (rawMessage as any).editedAt as number | undefined,
        }

        if (optimisticMessage.id) {
          // WS still remains source-of-truth; this only backfills missing echo.
          addMessage(sessionId, optimisticMessage)
        }
      }
    },
    [
      addMessage,
      apiUrl,
      campaignId,
      isGreenroomMode,
      roomId,
      sessionId,
      token,
      user.id,
      user.username,
    ]
  )

  const handleSend = useCallback(
    async (content: string, type: MessageType, recipientId?: string) => {
      setError(null)
      const queuedMessageId = generateClientId('queued-message') as UUID

      enqueueOutgoingMessage(sessionId, {
        id: queuedMessageId,
        roomId,
        content,
        type,
        recipientId: recipientId as UUID | undefined,
        createdAt: Date.now(),
        status: 'sending',
      })

      try {
        await postMessage(content, type, recipientId as UUID | undefined)
        removeOutgoingMessage(sessionId, queuedMessageId)
      } catch (err: any) {
        const message = err.message ?? 'Failed to send message'
        updateOutgoingMessage(sessionId, queuedMessageId, { status: 'failed', error: message })
        setError(message)
      }
    },
    [
      enqueueOutgoingMessage,
      postMessage,
      removeOutgoingMessage,
      roomId,
      sessionId,
      updateOutgoingMessage,
    ]
  )

  const handleRollCommand = useCallback(
    async (args: string) => {
      const res = await fetch(`${apiUrl}/api/chat/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ command: 'roll', args, sessionId, roomId }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message ?? `HTTP ${res.status}`)
      }
    },
    [apiUrl, token, sessionId, roomId]
  )

  const handleCommandError = useCallback((message: string) => {
    showToast({ message, variant: 'error' })
  }, [])

  const emitTypingEvent = useCallback(
    (type: 'CHAT:TYPING_STARTED' | 'CHAT:TYPING_STOPPED') => {
      if (
        !sendWsEvent ||
        user.role === Role.SPECTATOR ||
        String(user.role) === 'SPECTATOR' ||
        !roomId
      ) {
        return
      }

      const now = Date.now()
      sendWsEvent({
        id: generateClientId('ws') as UUID,
        type,
        version: 1,
        userId: user.id,
        userRole: user.role as Role,
        sessionId,
        roomId,
        timestamp: now,
        payload:
          type === 'CHAT:TYPING_STARTED'
            ? { userId: user.id, username: user.username, roomId, startedAt: now }
            : { userId: user.id, username: user.username, roomId, stoppedAt: now },
      })
    },
    [roomId, sendWsEvent, sessionId, user.id, user.role, user.username]
  )

  const handleTypingStarted = useCallback(
    () => emitTypingEvent('CHAT:TYPING_STARTED'),
    [emitTypingEvent]
  )

  const handleTypingStopped = useCallback(
    () => emitTypingEvent('CHAT:TYPING_STOPPED'),
    [emitTypingEvent]
  )

  const retryFailedMessage = useCallback(
    async (entry: OutgoingChatMessage) => {
      setError(null)
      updateOutgoingMessage(sessionId, entry.id, { status: 'sending', error: undefined })

      try {
        await postMessage(entry.content, entry.type, entry.recipientId)
        removeOutgoingMessage(sessionId, entry.id)
      } catch (err: any) {
        const message = err.message ?? 'Failed to send message'
        updateOutgoingMessage(sessionId, entry.id, { status: 'failed', error: message })
        setError(message)
      }
    },
    [postMessage, removeOutgoingMessage, sessionId, updateOutgoingMessage]
  )

  const failedQueueItems = useMemo(
    () =>
      sessionOutgoingQueue
        .filter((entry) => entry.roomId === roomId && entry.status === 'failed')
        .sort((a, b) => b.createdAt - a.createdAt),
    [roomId, sessionOutgoingQueue]
  )

  const displayError = error ?? historyError

  return (
    <section className="session-chat-window">
      <ChatWindowHeader
        apiUrl={apiUrl}
        token={token}
        sessionId={sessionId}
        roomName={roomName}
        isGreenroomMode={isGreenroomMode}
        isLoading={isLoading}
        visibleMessageCount={visibleMessages.length}
      />

      {displayError && <div className="session-chat-window__error">{displayError}</div>}

      <ChatWindowFailedQueue
        items={failedQueueItems}
        sessionId={sessionId}
        onRetry={retryFailedMessage}
        onDismiss={(id) => removeOutgoingMessage(sessionId, id as UUID)}
      />

      {isLoading ? (
        <div className="session-chat-window__loading-state">Loading messages…</div>
      ) : (
        <>
          {isGreenroomMode && hasHiddenOlderGreenroomHistory ? (
            <div className="session-chat-window__hidden-older">
              <button
                type="button"
                className="session-chat-window__hidden-older-button"
                onClick={revealOlderGreenroomHistory}
                aria-label="Load earlier messages"
              >
                <span
                  className="material-symbols-outlined session-chat-window__hidden-older-icon"
                  aria-hidden="true"
                >
                  history
                </span>
                <span className="session-chat-window__hidden-older-text">
                  Load earlier messages
                </span>
              </button>
            </div>
          ) : null}

          <MessageList
            messages={visibleMessages}
            sessionId={sessionId}
            currentUserId={user.id}
            currentUserRole={String(user.role)}
            sessionDmId={sessionDmId}
            groupingWindowMs={messageGroupingWindowMs}
            listRef={messageListRef}
            topSentinelRef={topSentinelRef}
            onListScroll={handleListScroll}
            onListWheel={handleListWheel}
            roomDirectory={roomDirectory}
            activeRoomId={roomId}
            hideIntermissionMarkers={isGreenroomMode}
            emptyDayLabel={isGreenroomMode ? 'Today' : undefined}
          />
        </>
      )}

      {!isLoading &&
      visibleMessages.length > 0 &&
      !isUserPinnedToBottom &&
      !isAutoFollowInProgress ? (
        <TooltipProvider delayDuration={140}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`session-chat-window__jump-to-latest ${pendingNewMessageCount > 0 ? 'session-chat-window__jump-to-latest--new' : ''}`}
                onClick={() => {
                  scrollToLatest('auto')
                  clearPendingNewMessageCount()
                }}
                aria-label="Jump to latest message"
              >
                ↓
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">
              {pendingNewMessageCount > 0
                ? `Jump to latest (${pendingNewMessageCount} new)`
                : 'Jump to latest'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}

      <TypingIndicator sessionId={sessionId} roomId={roomId} currentUserId={user.id} />

      <MessageInput
        onSend={handleSend}
        onRollCommand={handleRollCommand}
        onCommandError={handleCommandError}
        onTypingStarted={handleTypingStarted}
        onTypingStopped={handleTypingStopped}
        role={user.role}
        username={user.username}
        sessionId={sessionId}
        currentUserId={user.id}
        currentRoomId={roomId}
        disabled={isLoading}
        forceMessageType={forceMessageType}
        roomType={roomType}
      />
    </section>
  )
}

export const ChatWindow = memo(ChatWindowComponent, areChatWindowPropsEqual)

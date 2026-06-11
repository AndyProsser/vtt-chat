/**
 * MessageList
 * Renders the chronological list of messages for the current session.
 * Messages arrive pre-filtered by the server (visibility-safe).
 */

import { memo, useMemo, useRef } from 'react'
import type { RefObject, UIEventHandler, WheelEventHandler } from 'react'
import type { UUID } from '@shared'
import type { Message } from '@/types/chat'
import { MessageType } from '@shared'
import { parseNoteSharedMessage } from '@/utils/noteSharedMessage'
import { useStore } from '@/hooks/useStore'
import { MessageListVirtualized } from './MessageList.virtualized'
import type { ConditionMessageMetadata, PreparedMessage } from '@/types/messageList'
import {
  DEFAULT_CHAT_GROUPING_WINDOW_MS,
  SESSION_BOOKEND_PREFIXES,
  SESSION_NOTE_PREFIX,
  SESSION_RECAP_PREFIX,
  CAMPAIGN_BRIEF_PREFIX,
  SESSION_SUMMARY_PREFIX,
} from '@/constants/workspaces.constants'
import {
  EMPTY_PARTICIPANT_DIRECTORY,
  EMPTY_SESSION_PRESENCE,
  SYSTEM_USER_ID,
  TYPE_VARIANTS,
  TYPE_ICON_BY_VARIANT,
  countOwnKeys,
  parseSessionSummary,
  parseConditionMessageFallback,
  getSessionBookendState,
  formatBookendTimestamp,
  formatRelativeTime,
  dayKey,
  formatDayLabel,
} from './MessageList.helpers'

export type { ConditionMessageMetadata, PreparedMessage }

export interface MessageListProps {
  sessionId: UUID
  messages: Message[]
  currentUserId: string
  currentUserRole?: string
  sessionDmId?: string
  groupingWindowMs?: number
  listRef?: RefObject<HTMLDivElement | null>
  topSentinelRef?: RefObject<HTMLDivElement | null>
  onListScroll?: UIEventHandler<HTMLDivElement>
  onListWheel?: WheelEventHandler<HTMLDivElement>
  roomDirectory?: Record<string, { name: string }>
  participantDirectory?: Record<UUID, { displayName: string; avatarUrl?: string | null }>
  activeRoomId?: string
  hideIntermissionMarkers?: boolean
  emptyDayLabel?: string
}

function areMessageListPropsEqual(previous: MessageListProps, next: MessageListProps): boolean {
  return (
    previous.sessionId === next.sessionId &&
    previous.messages === next.messages &&
    previous.currentUserId === next.currentUserId &&
    previous.currentUserRole === next.currentUserRole &&
    previous.sessionDmId === next.sessionDmId &&
    previous.groupingWindowMs === next.groupingWindowMs &&
    previous.listRef === next.listRef &&
    previous.topSentinelRef === next.topSentinelRef &&
    previous.onListScroll === next.onListScroll &&
    previous.onListWheel === next.onListWheel &&
    previous.roomDirectory === next.roomDirectory &&
    previous.activeRoomId === next.activeRoomId &&
    previous.hideIntermissionMarkers === next.hideIntermissionMarkers &&
    previous.emptyDayLabel === next.emptyDayLabel
  )
}

function MessageListComponent({
  sessionId,
  messages,
  currentUserId,
  currentUserRole,
  sessionDmId,
  groupingWindowMs = DEFAULT_CHAT_GROUPING_WINDOW_MS,
  listRef,
  topSentinelRef,
  onListScroll,
  onListWheel,
  roomDirectory,
  activeRoomId,
  hideIntermissionMarkers = false,
  emptyDayLabel,
}: MessageListProps) {
  const participantDirectoryRef = useRef(EMPTY_PARTICIPANT_DIRECTORY)
  const sessionPresence = useStore(
    (state) =>
      ((state.sessionPresence as any)[sessionId] as typeof EMPTY_SESSION_PRESENCE) ??
      EMPTY_SESSION_PRESENCE
  )
  const participantDirectory = useMemo(() => {
    const entries = Object.entries(sessionPresence) as Array<
      [UUID, { username: string; avatarUrl?: string | null; characterName?: string | null }]
    >

    if (entries.length === 0) {
      participantDirectoryRef.current = EMPTY_PARTICIPANT_DIRECTORY
      return EMPTY_PARTICIPANT_DIRECTORY
    }

    const previousDirectory = participantDirectoryRef.current
    const nextDirectory = {} as Record<UUID, { displayName: string; avatarUrl?: string | null }>
    let hasChanged = countOwnKeys(previousDirectory) !== entries.length

    for (const [participantUserId, participant] of entries) {
      const nextDisplayName = participant.characterName || participant.username
      const nextAvatarUrl = participant.avatarUrl
      const previousEntry = previousDirectory[participantUserId]

      if (
        !previousEntry ||
        previousEntry.displayName !== nextDisplayName ||
        previousEntry.avatarUrl !== nextAvatarUrl
      ) {
        hasChanged = true
      }

      nextDirectory[participantUserId] = { displayName: nextDisplayName, avatarUrl: nextAvatarUrl }
    }

    if (!hasChanged) return previousDirectory

    participantDirectoryRef.current = nextDirectory
    return nextDirectory
  }, [sessionPresence])

  const preparedMessages = useMemo<PreparedMessage[]>(
    () =>
      messages.map((msg, index) => {
        const previous = index > 0 ? messages[index - 1] : undefined
        const variant = TYPE_VARIANTS[msg.type] ?? TYPE_VARIANTS[MessageType.OOC]
        const isSystem = msg.type === MessageType.SYSTEM || msg.authorId === SYSTEM_USER_ID
        const isSessionBookend =
          isSystem && SESSION_BOOKEND_PREFIXES.some((prefix) => msg.content.startsWith(prefix))
        const sessionBookendState = isSessionBookend ? getSessionBookendState(msg.content) : null
        const isSessionNote = isSystem && msg.content.startsWith(SESSION_NOTE_PREFIX)
        const noteShared = isSystem
          ? parseNoteSharedMessage({ content: msg.content, metadata: msg.metadata })
          : null
        const conditionMessage: ConditionMessageMetadata | null = (() => {
          if (!isSystem) return null
          if (msg.metadata?.conditionMessage?.kind === 'CONDITION') {
            return msg.metadata.conditionMessage as ConditionMessageMetadata
          }
          if (isSessionBookend || isSessionNote || noteShared) return null
          const c = msg.content
          if (
            c.startsWith(SESSION_RECAP_PREFIX) ||
            c.startsWith(CAMPAIGN_BRIEF_PREFIX) ||
            c.startsWith(SESSION_SUMMARY_PREFIX)
          )
            return null
          const parsed = parseConditionMessageFallback(c)
          if (!parsed) return null
          return { kind: 'CONDITION', targetUserId: '' as UUID, ...parsed }
        })()
        const recapPrefix = msg.content.startsWith(CAMPAIGN_BRIEF_PREFIX)
          ? CAMPAIGN_BRIEF_PREFIX
          : SESSION_RECAP_PREFIX
        const isSessionRecap = isSystem && msg.content.startsWith(recapPrefix)
        const isSessionSummary = isSystem && msg.content.startsWith(SESSION_SUMMARY_PREFIX)
        const summaryStats = isSessionSummary ? parseSessionSummary(msg.content) : null
        const isSelf = !isSystem && msg.authorId === currentUserId
        const roomName = msg.roomId ? roomDirectory?.[msg.roomId]?.name : undefined
        const authorProfile = participantDirectory?.[msg.authorId]
        const conditionTargetProfile = conditionMessage
          ? participantDirectory?.[conditionMessage.targetUserId]
          : undefined

        const parseFallbackTargetName = (content: string): string | null => {
          const stripped = content.replace(/^[\[]|[\]]$/g, '').trim()
          const removalMatch = stripped.match(/^(.+?)'s condition was cleared$/)
          if (removalMatch) return removalMatch[1]
          const distanceRemovalMatch = stripped.match(/^(.+?) has returned to the party$/)
          if (distanceRemovalMatch) return distanceRemovalMatch[1]
          const applyMatch = stripped.match(/^(.+?) is /)
          return applyMatch?.[1] ?? null
        }

        const conditionTargetName = conditionMessage
          ? (conditionTargetProfile?.displayName ?? parseFallbackTargetName(msg.content))
          : null
        const authorName = conditionMessage
          ? (conditionTargetName ?? 'Unknown')
          : isSystem
            ? 'SYSTEM'
            : authorProfile?.displayName || msg.authorUsername || 'Unknown'
        const authorAvatarUrl = conditionMessage
          ? (conditionTargetProfile?.avatarUrl ?? null)
          : isSystem
            ? null
            : (authorProfile?.avatarUrl ?? null)
        const whisperTargetNames =
          (msg.type === MessageType.WHISPER || msg.type === MessageType.DM) &&
          Array.isArray(msg.targetIds) &&
          msg.targetIds.length > 0
            ? msg.targetIds
                .map((targetId) => participantDirectory?.[targetId]?.displayName || 'Unknown')
                .filter((name) => name.trim().length > 0)
            : []
        const whisperRouteText =
          msg.type === MessageType.DM
            ? 'DM'
            : msg.type === MessageType.WHISPER && whisperTargetNames.length === 1
              ? whisperTargetNames[0]
              : null
        const whisperRouteLines =
          msg.type === MessageType.WHISPER && whisperTargetNames.length > 1
            ? whisperTargetNames
            : []
        const whisperRouteEntries =
          whisperRouteLines.length > 0
            ? whisperRouteLines
            : whisperRouteText
              ? [whisperRouteText]
              : []
        const hasWhisperRoute = whisperRouteEntries.length > 0
        const isDmWhisper =
          msg.type === MessageType.DM ||
          (msg.type === MessageType.WHISPER && Boolean(sessionDmId) && msg.authorId === sessionDmId)
        const bubbleWhisperClass =
          (msg.type === MessageType.WHISPER || msg.type === MessageType.DM) && isDmWhisper
            ? 'session-message-list__message-bubble--whisper-dm'
            : ''
        const typeIconClass = `session-message-list__message-type-icon--${variant}`
        const typeIcon = TYPE_ICON_BY_VARIANT[variant]
        const isGroupedWithPrevious = Boolean(
          groupingWindowMs > 0 &&
          previous &&
          previous.authorId === msg.authorId &&
          msg.createdAt - previous.createdAt <= groupingWindowMs
        )
        const showRoomShift = Boolean(
          !isSystem &&
          roomName &&
          (!previous || previous.roomId !== msg.roomId || previous.type === MessageType.SYSTEM)
        )
        const showDaySeparator = !previous || dayKey(previous.createdAt) !== dayKey(msg.createdAt)
        const dayLabel = showDaySeparator ? formatDayLabel(msg.createdAt) : null
        const relativeTime = formatRelativeTime(msg.createdAt)
        const bookendTime = isSessionBookend ? formatBookendTimestamp(msg.createdAt) : null

        return {
          msg,
          variant,
          isSystem,
          isSessionBookend,
          sessionBookendState,
          isSessionNote,
          noteShared,
          conditionMessage,
          recapPrefix,
          isSessionRecap,
          isSessionSummary,
          summaryStats,
          isSelf,
          roomName,
          authorName,
          authorAvatarUrl,
          whisperRouteEntries,
          hasWhisperRoute,
          isDmWhisper,
          bubbleWhisperClass,
          typeIconClass,
          typeIcon,
          isGroupedWithPrevious,
          showRoomShift,
          showDaySeparator,
          dayLabel,
          relativeTime,
          bookendTime,
        }
      }),
    [currentUserId, groupingWindowMs, messages, participantDirectory, roomDirectory, sessionDmId]
  )

  return (
    <MessageListVirtualized
      sessionId={sessionId}
      preparedMessages={preparedMessages}
      currentUserId={currentUserId}
      currentUserRole={currentUserRole}
      sessionDmId={sessionDmId}
      groupingWindowMs={groupingWindowMs}
      listRef={listRef}
      topSentinelRef={topSentinelRef}
      onListScroll={onListScroll}
      onListWheel={onListWheel}
      participantDirectory={participantDirectory}
      roomDirectory={roomDirectory}
      activeRoomId={activeRoomId}
      hideIntermissionMarkers={hideIntermissionMarkers}
      emptyDayLabel={emptyDayLabel}
    />
  )
}

export const MessageList = memo(MessageListComponent, areMessageListPropsEqual)

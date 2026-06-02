/**
 * MessageList
 * Renders the chronological list of messages for the current session.
 * Messages arrive pre-filtered by the server (visibility-safe).
 */

import { memo, useMemo, useRef } from 'react'
import type { RefObject, UIEventHandler, WheelEventHandler } from 'react'
import type { UUID } from '@shared'
import type { Message, SessionBookendState, SessionSummaryStats } from '@/types/chat'
import type { ParsedNoteSharedMessage } from '@/utils/noteSharedMessage'
import { MessageType } from '@shared'
import { parseNoteSharedMessage } from '@/utils/noteSharedMessage'
import { useStore } from '@/hooks/useStore'
import { MessageListVirtualized } from './MessageList.virtualized'
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

export interface PreparedMessage {
  msg: Message
  variant: 'ic' | 'ooc' | 'whisper' | 'dm' | 'system'
  isSystem: boolean
  isSessionBookend: boolean
  sessionBookendState: SessionBookendState | null
  isSessionNote: boolean
  noteShared: ParsedNoteSharedMessage | null
  recapPrefix: string
  isSessionRecap: boolean
  isSessionSummary: boolean
  summaryStats: SessionSummaryStats | null
  isSelf: boolean
  roomName?: string
  authorName: string
  authorAvatarUrl: string | null
  whisperRouteEntries: string[]
  hasWhisperRoute: boolean
  isDmWhisper: boolean
  bubbleWhisperClass: string
  typeIconClass: string
  typeIcon: string
  isGroupedWithPrevious: boolean
  showRoomShift: boolean
  showDaySeparator: boolean
  dayLabel: string | null
  relativeTime: string
  bookendTime: string | null
}

const DEFAULT_GROUPING_WINDOW_MS = 5 * 60 * 1000
const EMPTY_PARTICIPANT_DIRECTORY: Record<
  UUID,
  {
    displayName: string
    avatarUrl?: string | null
  }
> = {}
const EMPTY_SESSION_PRESENCE: Record<
  UUID,
  {
    username: string
    avatarUrl?: string | null
    characterName?: string | null
  }
> = {}

function countOwnKeys(record: Record<string, unknown>): number {
  let total = 0
  for (const _key in record) {
    total += 1
  }
  return total
}

const TYPE_VARIANTS: Record<string, 'ic' | 'ooc' | 'whisper' | 'dm' | 'system'> = {
  [MessageType.IC]: 'ic',
  [MessageType.OOC]: 'ooc',
  [MessageType.WHISPER]: 'whisper',
  [MessageType.DM]: 'dm',
  [MessageType.SYSTEM]: 'system',
}

const TYPE_ICON_BY_VARIANT: Record<'ic' | 'ooc' | 'whisper' | 'dm' | 'system', string> = {
  ic: 'swords',
  ooc: 'chat_bubble',
  whisper: 'visibility_off',
  dm: 'mail',
  system: 'info',
}

const TYPE_LABEL_BY_VARIANT: Record<'ic' | 'ooc' | 'whisper' | 'dm' | 'system', string> = {
  ic: 'In Character',
  ooc: 'Out of Character',
  whisper: 'Whisper',
  dm: 'DM',
  system: 'System',
}

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000'
const SESSION_BOOKEND_PREFIXES = [
  'Session Start:',
  'Session End:',
  '[Session Started]',
  '[Session Ended]',
  '[Session Paused]',
  '[Session Resumed]',
  '[Session Cooldown]',
]
const SESSION_NOTE_PREFIX = 'Session Note:'
const SESSION_RECAP_PREFIX = '[Last Session]'
const CAMPAIGN_BRIEF_PREFIX = '[Campaign Brief]'
const SESSION_SUMMARY_PREFIX = '[Session Summary]'

function parseSessionSummary(content: string): SessionSummaryStats | null {
  try {
    const json = content.slice(SESSION_SUMMARY_PREFIX.length).trim()
    return JSON.parse(json) as SessionSummaryStats
  } catch {
    return null
  }
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}
const BOOKEND_META: Record<
  SessionBookendState,
  { label: string; icon: string; className: string }
> = {
  started: {
    label: 'STARTED',
    icon: 'play_circle',
    className: 'session-message-list__session-marker--started',
  },
  ended: {
    label: 'ENDED',
    icon: 'stop_circle',
    className: 'session-message-list__session-marker--ended',
  },
  paused: {
    label: 'PAUSED',
    icon: 'pause_circle',
    className: 'session-message-list__session-marker--paused',
  },
  resumed: {
    label: 'RESUMED',
    icon: 'play_circle',
    className: 'session-message-list__session-marker--resumed',
  },
  cooldown: {
    label: 'CLOSED',
    icon: 'theaters',
    className: 'session-message-list__session-marker--cooldown',
  },
}

function getSessionBookendState(content: string): SessionBookendState | null {
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

function formatBookendTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getAuthorInitial(username: string): string {
  return username.trim().charAt(0).toUpperCase() || '?'
}

function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts
  const seconds = Math.max(1, Math.floor(diffMs / 1000))

  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? '' : 's'} ago`
  }

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }

  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function dayKey(ts: number): string {
  const date = new Date(ts)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function formatDayLabel(ts: number): string {
  const targetDate = new Date(ts)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfTarget = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate()
  )
  const deltaDays = Math.round(
    (startOfTarget.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000)
  )

  if (deltaDays === 0) {
    return 'Today'
  }

  if (deltaDays === -1) {
    return 'Yesterday'
  }

  return targetDate.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
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
  groupingWindowMs = DEFAULT_GROUPING_WINDOW_MS,
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

      nextDirectory[participantUserId] = {
        displayName: nextDisplayName,
        avatarUrl: nextAvatarUrl,
      }
    }

    if (!hasChanged) {
      return previousDirectory
    }

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
        const recapPrefix = msg.content.startsWith(CAMPAIGN_BRIEF_PREFIX)
          ? CAMPAIGN_BRIEF_PREFIX
          : SESSION_RECAP_PREFIX
        const isSessionRecap = isSystem && msg.content.startsWith(recapPrefix)
        const isSessionSummary = isSystem && msg.content.startsWith(SESSION_SUMMARY_PREFIX)
        const summaryStats = isSessionSummary ? parseSessionSummary(msg.content) : null
        const isSelf = !isSystem && msg.authorId === currentUserId
        const roomName = msg.roomId ? roomDirectory?.[msg.roomId]?.name : undefined
        const authorProfile = participantDirectory?.[msg.authorId]
        const authorName = isSystem
          ? 'SYSTEM'
          : authorProfile?.displayName || msg.authorUsername || 'Unknown'
        const authorAvatarUrl = isSystem ? null : (authorProfile?.avatarUrl ?? null)
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

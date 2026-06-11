import type { UUID } from '@shared'
import type { Message, SessionBookendState, SessionSummaryStats } from '@/types/chat'
import type { ParsedNoteSharedMessage } from '@/utils/noteSharedMessage'

export interface ConditionMessageMetadata {
  kind: 'CONDITION'
  targetUserId: UUID
  presetName?: string
  isRemoval: boolean
  overrideType?: 'CONDITION' | 'DISTANCE'
}

export interface PreparedMessage {
  msg: Message
  variant: 'ic' | 'ooc' | 'whisper' | 'dm' | 'system'
  isSystem: boolean
  isSessionBookend: boolean
  sessionBookendState: SessionBookendState | null
  isSessionNote: boolean
  noteShared: ParsedNoteSharedMessage | null
  conditionMessage: ConditionMessageMetadata | null
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

export interface VirtualizedListData {
  messages: PreparedMessage[]
  currentUserId: string
  currentUserRole?: string
  sessionDmId?: string
  groupingWindowMs: number
  roomDirectory?: Record<string, { name: string }>
  activeRoomId?: string
  hideIntermissionMarkers: boolean
  /** Stable reference — extracted from DynamicRowHeight so rowProps doesn't invalidate on every measurement. */
  setRowHeight: (index: number, height: number) => void
}

import { memo, useLayoutEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import {
  List,
  type DynamicRowHeight,
  type RowComponentProps,
  useDynamicRowHeight,
} from 'react-window'
import { MessageType, type UUID } from '@shared'
import { Icon } from '@/components/ui/Icon'
import { NoteSharedCard } from '@/components/workspaces/shared/panels/NoteSharedCard'
import type { SessionHistoryMessage } from '@/types/history'
import { type ParsedNoteSharedMessage, parseNoteSharedMessage } from '@/utils/noteSharedMessage'
import {
  CAMPAIGN_BRIEF_PREFIX,
  HISTORY_GROUPING_WINDOW_MS,
  SESSION_BOOKEND_PREFIXES,
  SESSION_RECAP_PREFIX,
  getAuthorInitial,
  toMessageVariant,
  toTypeIcon,
} from './HistoryPanel.helpers'

export interface HistoryGroup {
  label: string
  sessionId: UUID
  sessionName: string
  startedAtLabel: string
  items: SessionHistoryMessage[]
}

type HistoryRow =
  | {
      kind: 'boundary'
      key: string
      sessionName: string
      startedAtLabel: string
    }
  | {
      kind: 'recap'
      key: string
      recapLabel: string
      body: string
    }
  | {
      kind: 'note-shared'
      key: string
      note: ParsedNoteSharedMessage
      timestampLabel: string
      timestampDateTime: string
    }
  | {
      kind: 'message'
      key: string
      message: SessionHistoryMessage
      isGroupedWithPrevious: boolean
      isSelf: boolean
      whisperRouteEntries: string[]
      hasWhisperRoute: boolean
    }

function resolveHistoryWhisperRouteEntries(
  message: SessionHistoryMessage,
  participantLabelsByUserId: Map<string, string>
): string[] {
  if (message.type === MessageType.DM) {
    return ['DM']
  }

  if (message.type !== MessageType.WHISPER || !Array.isArray(message.targetIds)) {
    return []
  }

  return message.targetIds
    .map((targetId) => participantLabelsByUserId.get(targetId) || 'Unknown')
    .filter((label) => label.trim().length > 0)
}

/**
 * Flatten the grouped thread structure into a single, ordered list of rows.
 * Each session contributes one boundary row followed by its visible messages
 * (recaps, note-shared cards, regular bubbles). System bookend lines are
 * filtered out — they exist in chat history but are rendered as the boundary
 * header instead.
 */
export function flattenHistoryGroupsToRows(
  groups: HistoryGroup[],
  currentUserId?: UUID
): HistoryRow[] {
  const rows: HistoryRow[] = []

  for (const group of groups) {
    const participantLabelsByUserId = new Map<string, string>()

    for (const message of group.items) {
      const participantLabel = message.authorCharacterName || message.authorUsername
      if (participantLabel.trim().length > 0) {
        participantLabelsByUserId.set(message.authorId, participantLabel)
      }
    }

    rows.push({
      kind: 'boundary',
      key: `boundary:${group.sessionId}`,
      sessionName: group.sessionName,
      startedAtLabel: group.startedAtLabel,
    })

    let previousMessage: SessionHistoryMessage | undefined

    for (const message of group.items) {
      const isSystem = message.type === MessageType.SYSTEM
      const recapPrefix = message.content.startsWith(CAMPAIGN_BRIEF_PREFIX)
        ? CAMPAIGN_BRIEF_PREFIX
        : SESSION_RECAP_PREFIX
      const isSessionRecap = isSystem && message.content.startsWith(recapPrefix)
      const isSessionBookend =
        isSystem && SESSION_BOOKEND_PREFIXES.some((prefix) => message.content.startsWith(prefix))

      if (isSessionBookend) {
        continue
      }

      if (isSessionRecap) {
        const recapBody = message.content.slice(recapPrefix.length).trim()
        const recapLabel = recapPrefix === CAMPAIGN_BRIEF_PREFIX ? 'Campaign Brief' : 'Last Session'
        rows.push({
          kind: 'recap',
          key: `recap:${group.sessionId}:${message.id}`,
          recapLabel,
          body: recapBody,
        })
        previousMessage = message
        continue
      }

      const noteShared = isSystem
        ? parseNoteSharedMessage({
            content: message.content,
            metadata: message.metadata,
          })
        : null

      if (noteShared) {
        rows.push({
          kind: 'note-shared',
          key: `note:${group.sessionId}:${message.id}`,
          note: noteShared,
          timestampLabel: new Date(message.createdAt).toLocaleTimeString(),
          timestampDateTime: new Date(message.createdAt).toISOString(),
        })
        previousMessage = message
        continue
      }

      const isGroupedWithPrevious = Boolean(
        previousMessage &&
        previousMessage.authorId === message.authorId &&
        Math.abs(message.createdAt - previousMessage.createdAt) <= HISTORY_GROUPING_WINDOW_MS
      )
      const whisperRouteEntries = resolveHistoryWhisperRouteEntries(
        message,
        participantLabelsByUserId
      )

      rows.push({
        kind: 'message',
        key: `msg:${group.sessionId}:${message.id}`,
        message,
        isGroupedWithPrevious,
        isSelf: Boolean(currentUserId) && message.authorId === currentUserId,
        whisperRouteEntries,
        hasWhisperRoute: whisperRouteEntries.length > 0,
      })

      previousMessage = message
    }
  }

  return rows
}

interface RowData {
  rows: HistoryRow[]
  rowHeightCache: DynamicRowHeight
}

// Conservative starting estimates — actual height is measured & cached after
// first paint, so these only affect the initial scrollbar sizing.
function estimateRowHeight(row: HistoryRow): number {
  if (row.kind === 'boundary') {
    return 56
  }
  if (row.kind === 'recap') {
    return 120
  }
  if (row.kind === 'note-shared') {
    return 160
  }
  const length = row.message.content.length
  return Math.min(360, 64 + Math.ceil(length / 60) * 22)
}

function HistoryBoundaryRow({
  sessionName,
  startedAtLabel,
}: {
  sessionName: string
  startedAtLabel: string
}) {
  return (
    <div
      className="knowledge-panel-history__boundary"
      aria-label={`Session boundary ${sessionName} ${startedAtLabel}`}
    >
      <div className="knowledge-panel-history__boundary-title-row">
        <span className="knowledge-panel-history__boundary-side-icon">
          <Icon name="keyboard_double_arrow_left" />
        </span>
        <span className="knowledge-panel-history__boundary-text">
          <span className="knowledge-panel-history__boundary-session">{sessionName}</span>
          <span className="knowledge-panel-history__boundary-date">{startedAtLabel}</span>
        </span>
        <span className="knowledge-panel-history__boundary-side-icon">
          <Icon name="keyboard_double_arrow_right" />
        </span>
      </div>
    </div>
  )
}

function HistoryRecapRow({ recapLabel, body }: { recapLabel: string; body: string }) {
  return (
    <article className="session-message-list__session-recap">
      <span
        className="session-message-list__session-recap-icon material-symbols-outlined"
        aria-hidden="true"
      >
        menu_book
      </span>
      <div className="session-message-list__session-recap-body">
        <span className="session-message-list__session-recap-label">{recapLabel}</span>
        <p className="session-message-list__session-recap-text">{body}</p>
      </div>
    </article>
  )
}

function HistoryMessageRow({
  message,
  isSelf,
  isGroupedWithPrevious,
  whisperRouteEntries,
  hasWhisperRoute,
}: {
  message: SessionHistoryMessage
  isSelf: boolean
  isGroupedWithPrevious: boolean
  whisperRouteEntries: string[]
  hasWhisperRoute: boolean
}) {
  const variant = toMessageVariant(message.type)
  const authorLabel = message.authorCharacterName || message.authorUsername

  return (
    <article
      className={`session-message-list__message ${isSelf ? 'session-message-list__message--self' : ''} ${isGroupedWithPrevious ? 'session-message-list__message--grouped' : ''}`}
    >
      <div className="session-message-list__message-row">
        {!isSelf && !isGroupedWithPrevious ? (
          <span
            className={`session-message-list__message-avatar ${variant === 'system' ? 'session-message-list__message-avatar--system' : ''}`}
            aria-hidden="true"
          >
            {getAuthorInitial(authorLabel)}
          </span>
        ) : (
          <span
            className="session-message-list__message-avatar session-message-list__message-avatar--spacer"
            aria-hidden="true"
          />
        )}

        <div className="session-message-list__message-content">
          {!isGroupedWithPrevious ? (
            <div className="session-message-list__message-meta">
              <span className="session-message-list__message-author">{authorLabel}</span>
            </div>
          ) : null}

          <div
            className={`session-message-list__message-bubble session-message-list__message-bubble--${variant} ${isSelf ? 'session-message-list__message-bubble--self' : ''}`}
          >
            <span
              className={`session-message-list__message-type-icon session-message-list__message-type-icon--${variant} material-symbols-outlined`}
              aria-hidden="true"
            >
              {toTypeIcon(variant)}
            </span>
            <span className="session-message-list__message-bubble-text">{message.content}</span>
          </div>

          <div
            className={`session-message-list__message-footer ${hasWhisperRoute ? `session-message-list__message-footer--whisper ${isSelf ? 'session-message-list__message-footer--whisper-outgoing' : 'session-message-list__message-footer--whisper-incoming'}` : ''}`}
          >
            {hasWhisperRoute ? (
              <div
                className={`session-message-list__message-whisper-meta ${isSelf ? 'session-message-list__message-whisper-meta--outgoing' : 'session-message-list__message-whisper-meta--incoming'}`}
              >
                {!isSelf ? (
                  <div className="session-message-list__message-whisper-meta-row--incoming">
                    <div className="session-message-list__message-timestamp session-message-list__message-timestamp--whisper">
                      {new Date(message.createdAt).toLocaleTimeString()}
                    </div>
                    <div className="session-message-list__message-whisper-route session-message-list__message-whisper-route--incoming-list">
                      {whisperRouteEntries.map((line, index) => (
                        <div
                          key={`${message.id}-whisper-${index}`}
                          className="session-message-list__message-whisper-route-line"
                        >
                          <span
                            className="session-message-list__message-whisper-connector"
                            aria-hidden="true"
                          >
                            <span className="material-symbols-outlined" aria-hidden="true">
                              subdirectory_arrow_right
                            </span>
                          </span>
                          <span className="session-message-list__message-whisper-route-label">
                            {line}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="session-message-list__message-whisper-route session-message-list__message-whisper-route--stacked session-message-list__message-whisper-route--outgoing">
                      {whisperRouteEntries.map((line, index) => (
                        <div
                          key={`${message.id}-whisper-${index}`}
                          className="session-message-list__message-whisper-route-line"
                        >
                          <span className="session-message-list__message-whisper-route-label">
                            {line}
                          </span>
                          <span
                            className="session-message-list__message-whisper-connector"
                            aria-hidden="true"
                          >
                            <span className="material-symbols-outlined" aria-hidden="true">
                              subdirectory_arrow_left
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="session-message-list__message-timestamp session-message-list__message-timestamp--whisper">
                      {new Date(message.createdAt).toLocaleTimeString()}
                    </div>
                  </>
                )}
              </div>
            ) : null}
            {!hasWhisperRoute ? (
              <span className="session-message-list__message-timestamp">
                {new Date(message.createdAt).toLocaleTimeString()}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}

function renderRow(row: HistoryRow) {
  if (row.kind === 'boundary') {
    return <HistoryBoundaryRow sessionName={row.sessionName} startedAtLabel={row.startedAtLabel} />
  }
  if (row.kind === 'recap') {
    return <HistoryRecapRow recapLabel={row.recapLabel} body={row.body} />
  }
  if (row.kind === 'note-shared') {
    return (
      <NoteSharedCard
        note={row.note}
        timestampLabel={row.timestampLabel}
        timestampDateTime={row.timestampDateTime}
      />
    )
  }
  return (
    <HistoryMessageRow
      message={row.message}
      isSelf={row.isSelf}
      isGroupedWithPrevious={row.isGroupedWithPrevious}
      whisperRouteEntries={row.whisperRouteEntries}
      hasWhisperRoute={row.hasWhisperRoute}
    />
  )
}

function HistoryVirtualRow({ ariaAttributes, index, style, ...data }: RowComponentProps<RowData>) {
  const row = data.rows[index]
  const contentRef = useRef<HTMLDivElement | null>(null)
  const lastHeightRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    const node = contentRef.current
    if (!node || !row) {
      return
    }

    // Debounced size reporting to reduce ResizeObserver overhead
    let timeoutId: NodeJS.Timeout | null = null

    const reportSize = () => {
      const height = Math.ceil(node.getBoundingClientRect().height)
      // Only update cache if height actually changed—avoid redundant cache updates
      if (height > 0 && lastHeightRef.current !== height) {
        lastHeightRef.current = height
        data.rowHeightCache.setRowHeight(index, height)
      }
    }

    // Initial measurement
    reportSize()

    if (typeof ResizeObserver === 'undefined') {
      const handleResize = () => {
        if (timeoutId) clearTimeout(timeoutId)
        timeoutId = setTimeout(reportSize, 50)
      }
      window.addEventListener('resize', handleResize)
      return () => {
        window.removeEventListener('resize', handleResize)
        if (timeoutId) clearTimeout(timeoutId)
      }
    }

    // Use ResizeObserver with debounced callback
    const observer = new ResizeObserver(() => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(reportSize, 16) // ~60fps debounce
    })
    observer.observe(node)

    return () => {
      observer.disconnect()
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [data.rowHeightCache, index, row])

  if (!row) {
    return null
  }

  return (
    <div
      {...ariaAttributes}
      style={style as CSSProperties}
      className="session-message-list__virtual-row"
    >
      <div ref={contentRef} className="session-message-list__virtual-row-content">
        {renderRow(row)}
      </div>
    </div>
  )
}

const MemoizedHistoryVirtualRow = memo(HistoryVirtualRow)

export interface HistoryPanelVirtualListProps {
  rows: HistoryRow[]
}

/**
 * Windowed renderer for HistoryPanel using react-window v2 list primitives.
 */
export function HistoryPanelVirtualList({ rows }: HistoryPanelVirtualListProps) {
  const defaultRowHeight = useMemo(() => {
    if (rows.length === 0) {
      return 96
    }

    const sampleSize = Math.min(16, rows.length)
    let total = 0

    for (let index = 0; index < sampleSize; index += 1) {
      total += estimateRowHeight(rows[index])
    }

    return Math.max(56, Math.round(total / sampleSize))
  }, [rows])

  const rowHeightCache = useDynamicRowHeight({ defaultRowHeight })
  const rowProps = useMemo<RowData>(() => ({ rows, rowHeightCache }), [rows, rowHeightCache])

  if (rows.length === 0) {
    return null
  }

  return (
    <div style={{ flex: '1 1 0', minHeight: 0, height: '100%', overflow: 'hidden' }}>
      <List
        className="knowledge-panel-history__virtual-list"
        defaultHeight={360}
        style={{ height: '100%' }}
        rowCount={rows.length}
        rowHeight={rowHeightCache}
        rowProps={rowProps}
        rowComponent={MemoizedHistoryVirtualRow}
        overscanCount={6}
      />
    </div>
  )
}

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { CSSProperties } from 'react'
import {
  VariableSizeList as List,
  type ListChildComponentProps,
  type VariableSizeList as VariableSizeListType,
} from 'react-window'
import { MessageType, type UUID } from '@shared'
import { Icon } from '@/components/ui/Icon'
import { NoteSharedCard } from '@/components/workspaces/shared/panels/NoteSharedCard'
import type { SessionHistoryMessage } from '@/types/history'
import {
  type ParsedNoteSharedMessage,
  parseNoteSharedMessage,
} from '@/utils/noteSharedMessage'
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
        const recapLabel =
          recapPrefix === CAMPAIGN_BRIEF_PREFIX ? 'Campaign Brief' : 'Last Session'
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

      rows.push({
        kind: 'message',
        key: `msg:${group.sessionId}:${message.id}`,
        message,
        isGroupedWithPrevious,
        isSelf: Boolean(currentUserId) && message.authorId === currentUserId,
      })

      previousMessage = message
    }
  }

  return rows
}

interface RowData {
  rows: HistoryRow[]
  setMeasuredSize: (key: string, index: number, size: number) => void
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
}: {
  message: SessionHistoryMessage
  isSelf: boolean
  isGroupedWithPrevious: boolean
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

          <div className="session-message-list__message-footer">
            <span className="session-message-list__message-timestamp">
              {new Date(message.createdAt).toLocaleTimeString()}
            </span>
          </div>
        </div>
      </div>
    </article>
  )
}

function renderRow(row: HistoryRow) {
  if (row.kind === 'boundary') {
    return (
      <HistoryBoundaryRow sessionName={row.sessionName} startedAtLabel={row.startedAtLabel} />
    )
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
    />
  )
}

/**
 * Inner element forwarded to react-window. Wraps the absolutely-positioned
 * row layer so we can apply a knowledge-panel-history list class for styling.
 */
const InnerElement = forwardRef<HTMLDivElement, { style?: CSSProperties; children?: unknown }>(
  function InnerElement({ style, children, ...rest }, ref) {
    return (
      <div ref={ref} style={style} className="knowledge-panel-history__virtual-inner" {...rest}>
        {children as React.ReactNode}
      </div>
    )
  }
)

function HistoryVirtualRow({ index, style, data }: ListChildComponentProps<RowData>) {
  const row = data.rows[index]
  const contentRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const node = contentRef.current
    if (!node) {
      return
    }

    // Measure the inner content node — react-window pins the wrapper to its
    // currently estimated height, so measuring the wrapper just echoes that
    // back. We need the natural content size to correctly reflow neighbours.
    const reportSize = () => {
      const height = Math.ceil(node.getBoundingClientRect().height)
      if (height > 0) {
        data.setMeasuredSize(row.key, index, height)
      }
    }

    reportSize()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', reportSize)
      return () => {
        window.removeEventListener('resize', reportSize)
      }
    }

    const observer = new ResizeObserver(reportSize)
    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [data, index, row.key])

  return (
    <div style={style as CSSProperties} className="session-message-list__virtual-row">
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
 * Windowed renderer for HistoryPanel. Mirrors the MessageList virtualization
 * pattern: VariableSizeList with ResizeObserver-measured content cells, a
 * width-keyed cache invalidation pass, and horizontal padding on the row
 * wrapper so absolutely-positioned rows don't clip avatars at the edges.
 */
export function HistoryPanelVirtualList({ rows }: HistoryPanelVirtualListProps) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const listInstanceRef = useRef<VariableSizeListType | null>(null)
  const [viewportHeight, setViewportHeight] = useState(1)
  const [viewportWidth, setViewportWidth] = useState(1)
  const sizeCacheRef = useRef<Record<string, number>>({})

  useLayoutEffect(() => {
    const node = shellRef.current
    if (!node) {
      return
    }

    const updateSize = () => {
      const nextHeight = Math.max(1, Math.floor(node.clientHeight))
      const nextWidth = Math.max(1, Math.floor(node.clientWidth))
      setViewportHeight((current) => (current === nextHeight ? current : nextHeight))
      setViewportWidth((current) => (current === nextWidth ? current : nextWidth))
    }

    updateSize()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize)
      return () => {
        window.removeEventListener('resize', updateSize)
      }
    }

    const observer = new ResizeObserver(updateSize)
    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [])

  // Reflow when the row set itself changes (new fetch, filter, sort).
  useEffect(() => {
    listInstanceRef.current?.resetAfterIndex(0, true)
  }, [rows])

  // Width changes invalidate all measured heights — text wraps to a different
  // number of lines so the cache is no longer accurate.
  useEffect(() => {
    sizeCacheRef.current = {}
    listInstanceRef.current?.resetAfterIndex(0, true)
  }, [viewportWidth])

  const setMeasuredSize = useCallback((key: string, index: number, size: number) => {
    const previous = sizeCacheRef.current[key]
    if (previous === size) {
      return
    }
    sizeCacheRef.current[key] = size
    listInstanceRef.current?.resetAfterIndex(index, false)
  }, [])

  const itemData = useMemo<RowData>(() => ({ rows, setMeasuredSize }), [rows, setMeasuredSize])

  if (rows.length === 0) {
    return null
  }

  return (
    <div
      ref={shellRef}
      style={{ flex: '1 1 0', minHeight: 0, height: '100%', overflow: 'hidden' }}
    >
      <List
        ref={listInstanceRef}
        innerElementType={InnerElement}
        className="knowledge-panel-history__virtual-list"
        height={viewportHeight}
        width="100%"
        itemCount={rows.length}
        itemData={itemData}
        itemKey={(index, data) => data.rows[index]?.key ?? index}
        itemSize={(index) => {
          const row = rows[index]
          if (!row) {
            return 1
          }
          return sizeCacheRef.current[row.key] ?? estimateRowHeight(row)
        }}
        overscanCount={6}
      >
        {MemoizedHistoryVirtualRow}
      </List>
    </div>
  )
}

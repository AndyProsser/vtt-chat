import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  List,
  type DynamicRowHeight,
  type RowComponentProps,
  useDynamicRowHeight,
} from 'react-window'
import { MessageType } from '@shared'
import type { UUID } from '@shared'
import { NoteSharedCard } from '@/components/workspaces/shared/panels/NoteSharedCard'
import type { HistoryGroup, SessionHistoryMessage } from '@/types/history'
import { type ParsedNoteSharedMessage, parseNoteSharedMessage } from '@/utils/noteSharedMessage'
import {
  CAMPAIGN_BRIEF_PREFIX,
  SESSION_BOOKEND_PREFIXES,
  SESSION_RECAP_PREFIX,
} from '@/constants/workspaces.constants'
import {
  HISTORY_GROUPING_WINDOW_MS,
  isHistoryDmWhisper,
  parseConditionTargetName,
  parseHistoryConditionMessage,
  resolveHistoryWhisperRouteEntries,
} from './HistoryPanel.helpers'
import { HistoryBoundaryRow } from './rows/HistoryBoundaryRow'
import { HistoryConditionMarkerRow } from './rows/HistoryConditionMarkerRow'
import { HistoryMessageRow } from './rows/HistoryMessageRow'
import { HistoryRecapRow } from './rows/HistoryRecapRow'

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
      kind: 'condition-marker'
      key: string
      isRemoval: boolean
      overrideType: 'CONDITION' | 'DISTANCE'
      presetName?: string
      targetName: string
      timestampLabel: string
      timestampISO: string
    }
  | {
      kind: 'message'
      key: string
      message: SessionHistoryMessage
      isGroupedWithPrevious: boolean
      isSelf: boolean
      whisperRouteEntries: string[]
      hasWhisperRoute: boolean
      isDmWhisper: boolean
    }

/**
 * Flatten grouped session threads into a single ordered list of virtual rows.
 * Session bookend messages are suppressed — they appear as boundary headers instead.
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

      const conditionMarker = isSystem ? parseHistoryConditionMessage(message.content) : null

      if (conditionMarker) {
        rows.push({
          kind: 'condition-marker',
          key: `condition:${group.sessionId}:${message.id}`,
          ...conditionMarker,
          targetName: parseConditionTargetName(message.content) ?? 'Unknown',
          timestampLabel: new Date(message.createdAt).toLocaleTimeString(),
          timestampISO: new Date(message.createdAt).toISOString(),
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
        isDmWhisper: isHistoryDmWhisper(message, group.sessionDmId),
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

// Conservative starting estimates — actual height is measured & cached after first paint.
function estimateRowHeight(row: HistoryRow): number {
  if (row.kind === 'boundary') return 56
  if (row.kind === 'recap') return 120
  if (row.kind === 'note-shared') return 160
  if (row.kind === 'condition-marker') return 28
  const length = row.message.content.length
  return Math.min(360, 64 + Math.ceil(length / 60) * 22)
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
        isExcerpt={row.note.excerptSource != null}
      />
    )
  }
  if (row.kind === 'condition-marker') {
    return (
      <HistoryConditionMarkerRow
        isRemoval={row.isRemoval}
        overrideType={row.overrideType}
        presetName={row.presetName}
        targetName={row.targetName}
        timestampLabel={row.timestampLabel}
        timestampISO={row.timestampISO}
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
      isDmWhisper={row.isDmWhisper}
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

    let timeoutId: NodeJS.Timeout | null = null

    const reportSize = () => {
      const height = Math.ceil(node.getBoundingClientRect().height)
      // Only update cache if height actually changed — avoids redundant cache writes.
      if (height > 0 && lastHeightRef.current !== height) {
        lastHeightRef.current = height
        data.rowHeightCache.setRowHeight(index, height)
      }
    }

    // Defer initial measurement — calling setRowHeight synchronously inside useLayoutEffect
    // creates a nested re-render cascade when many rows mount at the same time (e.g. a
    // screenful of note-shared cards with immediatelyRender:false Tiptap editors all
    // reporting a small initial height). Deferring breaks that cascade without affecting
    // the ResizeObserver-driven steady-state updates.
    timeoutId = setTimeout(reportSize, 0)

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

export interface HistoryPanelVirtualListProps {
  rows: HistoryRow[]
  autoScrollToLastRow?: boolean
}

/**
 * Windowed renderer for HistoryPanel using react-window v2 list primitives.
 */
export function HistoryPanelVirtualList({
  rows,
  autoScrollToLastRow = false,
}: HistoryPanelVirtualListProps) {
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

  const [listApi, setListApi] = useState<{ element?: HTMLDivElement | null } | null>(null)
  const rowHeightCache = useDynamicRowHeight({ defaultRowHeight })
  const rowProps = useMemo<RowData>(() => ({ rows, rowHeightCache }), [rows, rowHeightCache])

  useEffect(() => {
    if (!autoScrollToLastRow || !listApi?.element || rows.length === 0) {
      return
    }

    let retryCount = 0
    const maxRetries = 8
    let lastScrollHeight = 0
    let retryTimeoutId: number | null = null

    const scrollToBottom = () => {
      const container = listApi.element
      if (container) {
        const newScrollHeight = container.scrollHeight
        const scrolledEnough = newScrollHeight > lastScrollHeight + 40
        lastScrollHeight = newScrollHeight

        if (scrolledEnough && retryCount < maxRetries) {
          retryCount += 1
          retryTimeoutId = window.setTimeout(scrollToBottom, 16)
        } else if (container.scrollHeight > 0) {
          container.scrollTop = container.scrollHeight
        }
      }
    }

    const timeoutId = window.setTimeout(scrollToBottom, 24)

    return () => {
      window.clearTimeout(timeoutId)
      if (retryTimeoutId !== null) window.clearTimeout(retryTimeoutId)
    }
  }, [autoScrollToLastRow, listApi, rows])

  if (rows.length === 0) {
    return null
  }

  return (
    <div style={{ flex: '1 1 0', minHeight: 0, height: '100%', overflow: 'hidden' }}>
      <List
        listRef={setListApi}
        className="knowledge-panel-history__virtual-list"
        defaultHeight={360}
        style={{ height: '100%' }}
        rowCount={rows.length}
        rowHeight={rowHeightCache}
        rowProps={rowProps}
        rowComponent={HistoryVirtualRow}
        overscanCount={6}
      />
    </div>
  )
}

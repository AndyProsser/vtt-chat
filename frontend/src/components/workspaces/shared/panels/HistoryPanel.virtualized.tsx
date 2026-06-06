import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  List,
  type DynamicRowHeight,
  type RowComponentProps,
  useDynamicRowHeight,
} from 'react-window'
import { MessageType, type UUID, findConditionPreset, findDistancePreset } from '@shared'
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
  sessionDmId?: UUID
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

function isHistoryDmWhisper(message: SessionHistoryMessage, sessionDmId?: UUID): boolean {
  return (
    message.type === MessageType.DM ||
    (message.type === MessageType.WHISPER &&
      Boolean(sessionDmId) &&
      message.authorId === sessionDmId)
  )
}

function parseHistoryConditionMessage(
  content: string
): { isRemoval: boolean; overrideType: 'CONDITION' | 'DISTANCE'; presetName?: string } | null {
  if (!content.startsWith('[') || !content.endsWith(']')) return null
  const stripped = content.slice(1, -1).trim()
  if (stripped.match(/^.+? has returned to the party$/)) {
    return { isRemoval: true, overrideType: 'DISTANCE' }
  }
  if (stripped.match(/^.+?'s condition was cleared$/)) {
    return { isRemoval: true, overrideType: 'CONDITION' }
  }
  const applyMatch = stripped.match(/^.+? is (.+)$/)
  if (applyMatch) {
    const presetName = applyMatch[1]
    return { isRemoval: false, presetName, overrideType: findDistancePreset(presetName) ? 'DISTANCE' : 'CONDITION' }
  }
  return null
}

function parseConditionTargetName(content: string): string | null {
  const stripped = content.replace(/^\[|\]$/g, '').trim()
  const removalCondition = stripped.match(/^(.+?)'s condition was cleared$/)
  if (removalCondition) return removalCondition[1]
  const removalDistance = stripped.match(/^(.+?) has returned to the party$/)
  if (removalDistance) return removalDistance[1]
  const apply = stripped.match(/^(.+?) is /)
  return apply?.[1] ?? null
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
  if (row.kind === 'condition-marker') {
    return 28
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
  isDmWhisper,
}: {
  message: SessionHistoryMessage
  isSelf: boolean
  isGroupedWithPrevious: boolean
  whisperRouteEntries: string[]
  hasWhisperRoute: boolean
  isDmWhisper: boolean
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
                    <div
                      className={`session-message-list__message-whisper-route session-message-list__message-whisper-route--incoming-list ${isDmWhisper ? 'session-message-list__message-whisper-route--dm' : ''}`}
                    >
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
                    <div
                      className={`session-message-list__message-whisper-route session-message-list__message-whisper-route--stacked session-message-list__message-whisper-route--outgoing ${isDmWhisper ? 'session-message-list__message-whisper-route--dm' : ''}`}
                    >
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

function HistoryConditionMarkerRow({
  isRemoval,
  overrideType,
  presetName,
  targetName,
  timestampLabel,
  timestampISO,
}: {
  isRemoval: boolean
  overrideType: 'CONDITION' | 'DISTANCE'
  presetName?: string
  targetName: string
  timestampLabel: string
  timestampISO: string
}) {
  const isDistance = overrideType === 'DISTANCE'
  const conditionPreset = !isDistance && presetName ? findConditionPreset(presetName) : undefined
  const distancePreset = isDistance && presetName ? findDistancePreset(presetName) : undefined
  const preset = conditionPreset ?? distancePreset
  const label = preset?.label ?? presetName ?? (isDistance ? 'distant' : 'affected')

  let iconName: string
  let markerContent: React.ReactElement

  if (isRemoval) {
    iconName = isDistance ? 'person' : 'check_circle'
    markerContent = isDistance
      ? <><strong>{targetName}</strong> has returned to the party</>
      : <><strong>{targetName}</strong>{`'s condition was cleared`}</>
  } else {
    iconName = preset?.icon ?? (isDistance ? 'social_distance' : 'psychology')
    markerContent = <>{targetName} is <strong>{label}</strong></>
  }

  return (
    <article
      className={`session-message-list__condition-marker ${isDistance ? 'session-message-list__condition-marker--distance' : 'session-message-list__condition-marker--condition'} ${isRemoval ? 'session-message-list__condition-marker--removal' : ''}`}
      role="status"
    >
      <span
        className="session-message-list__condition-marker-icon material-symbols-outlined"
        aria-hidden="true"
      >
        {iconName}
      </span>
      <span className="session-message-list__condition-marker-text">{markerContent}</span>
      <span className="session-message-list__condition-marker-line" aria-hidden="true" />
      <time className="session-message-list__condition-marker-time" dateTime={timestampISO}>
        {timestampLabel}
      </time>
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
          // Heights still changing; recheck in 16ms (~1 frame)
          retryCount += 1
          retryTimeoutId = window.setTimeout(scrollToBottom, 16)
        } else if (container.scrollHeight > 0) {
          // Heights stable or max retries reached; scroll to bottom
          container.scrollTop = container.scrollHeight
        }
      }
    }

    // Start scroll-to-bottom after a brief delay to allow ResizeObserver to start
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

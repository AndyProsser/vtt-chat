import { memo, useMemo } from 'react'
import type { ComponentProps } from 'react'
import type { UUID } from '@shared'
import type { RightRailTab } from '@/types/ui'
import { useStore } from '@/hooks/useStore'
import { isJournalNote } from '@/utils/notesPanel'
import { SessionWorkspace } from '@/components/workspaces/SessionWorkspace'

type SessionWorkspaceProps = ComponentProps<typeof SessionWorkspace>

type SessionWorkspaceChromeConnectorProps = {
  baseProps: SessionWorkspaceProps
}

const EMPTY_NOTES_BY_ID = Object.freeze({}) as Record<
  UUID,
  { title: string; tags?: string[] | null }
>

const EMPTY_PAUSE_STATS: SessionWorkspaceProps['currentPauseStats'] = {
  cumulativePauseMs: 0,
  pauseCount: 0,
  pauseStartedAt: undefined,
}

const EMPTY_DM_OVERRIDES = Object.freeze({}) as SessionWorkspaceProps['dmOverrides']

const EMPTY_RIGHT_RAIL_INDICATORS = Object.freeze({
  notes: 0,
  journal: 0,
  history: 0,
}) as Partial<Record<RightRailTab, number>>

/**
 * Isolates high-churn session workspace slices so WorkspaceInitialization doesn't
 * subscribe to note/override/pause updates that only affect SessionWorkspace.
 */
export const SessionWorkspaceChromeConnector = memo(
  function SessionWorkspaceChromeConnector({ baseProps }: SessionWorkspaceChromeConnectorProps) {
    const currentPauseStats = useStore((state) => {
      if (!state.currentSessionId) {
        return EMPTY_PAUSE_STATS
      }

      return state.pauseStats[state.currentSessionId] ?? EMPTY_PAUSE_STATS
    })

    const dmOverrides = useStore((state) => state.dmOverrides)
    const broadcastModeEnabled = useStore((state) => state.broadcastModeEnabled)
    const currentConditionName = useStore((state) => state.currentCondition?.name)
    const currentSessionNotesById = useStore((state) => {
      if (!state.currentSessionId) {
        return EMPTY_NOTES_BY_ID
      }

      const notesBySession = state.notes as Record<
        UUID,
        Record<UUID, { title: string; tags?: string[] | null }>
      >
      return notesBySession[state.currentSessionId] ?? EMPTY_NOTES_BY_ID
    })

    const rightRailIndicators = useMemo<Partial<Record<RightRailTab, number>>>(() => {
      const handoutCount = Object.values(currentSessionNotesById).filter(
        (note) => !isJournalNote(note)
      ).length
      return {
        notes: handoutCount,
        journal: 0,
        history: 0,
      }
    }, [currentSessionNotesById])

    return (
      <SessionWorkspace
        {...baseProps}
        currentPauseStats={currentPauseStats}
        dmOverrides={dmOverrides}
        broadcastModeEnabled={broadcastModeEnabled}
        currentConditionName={currentConditionName}
        rightRailIndicators={rightRailIndicators}
      />
    )
  },
  (prev, next) => prev.baseProps === next.baseProps
)

export const SESSION_WORKSPACE_CONNECTOR_PLACEHOLDERS = {
  currentPauseStats: EMPTY_PAUSE_STATS,
  dmOverrides: EMPTY_DM_OVERRIDES,
  broadcastModeEnabled: false,
  currentConditionName: undefined,
  rightRailIndicators: EMPTY_RIGHT_RAIL_INDICATORS,
} as const

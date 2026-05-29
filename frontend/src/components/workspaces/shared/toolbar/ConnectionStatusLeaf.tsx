import { memo, useMemo } from 'react'
import type { UUID, CoreWsState, LiveKitConnectionState } from '@shared'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import { useConnectionStatus } from '@/hooks/useConnectionStatus'
import { toneFromAudioState, toneFromCoreState } from '@/constants/sessionToolbar.constants'
import '@/styles/components/workspaces/shared/toolbar/SessionToolbar.css'

interface ConnectionStatusLeafProps {
  wsState: 'connected' | 'connecting' | 'disconnected' | 'reconnecting'
  coreWsState: CoreWsState
  livekitState: LiveKitConnectionState
  sessionId?: UUID | null
  roomId?: UUID | null
}

/**
 * ConnectionStatusLeaf — Self-contained connection status indicator.
 *
 * A React.memo leaf component that renders the connection status display
 * (colored dot + tooltip). Re-renders only when the connection state values
 * (coreWsState, livekitState) actually change, not when parent re-renders
 * due to other state changes.
 *
 * The parent (SessionToolbar) memoizes the props passed here, ensuring this
 * leaf only re-renders when the connection state truly changes.
 *
 * Rendered at top-right of toolbar, shows a colored dot + tooltip with
 * Core and Audio connection states.
 */
export const ConnectionStatusLeaf = memo(function ConnectionStatusLeafInner({
  wsState,
  coreWsState,
  livekitState,
  sessionId,
  roomId,
}: ConnectionStatusLeafProps) {
  const connectionStatus = useConnectionStatus({
    wsState,
    sessionId,
    roomId,
  })

  const coreToneClass = useMemo(() => toneFromCoreState(coreWsState), [coreWsState])

  const audioToneClass = useMemo(() => toneFromAudioState(livekitState), [livekitState])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="session-toolbar__connection"
          data-status-color={connectionStatus.statusColorKey}
          aria-label={`Connection: ${connectionStatus.label}`}
          role="status"
        >
          <span className="session-toolbar__connection-dot" aria-hidden="true" />
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="end"
        className="session-toolbar__tooltip-content--status"
      >
        <div className="session-toolbar__status-tooltip-title">Status</div>
        <div className="session-toolbar__status-tooltip-row">
          <span>Core</span>
          <strong className={coreToneClass}>{coreWsState}</strong>
        </div>
        <div className="session-toolbar__status-tooltip-row">
          <span>Audio</span>
          <strong className={audioToneClass}>{livekitState}</strong>
        </div>
      </TooltipContent>
    </Tooltip>
  )
})

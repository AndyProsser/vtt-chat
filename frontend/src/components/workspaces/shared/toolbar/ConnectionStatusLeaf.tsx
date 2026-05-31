import { memo, useMemo } from 'react'
import type { UUID } from '@shared'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import { useConnectionStatus } from '@/hooks/useConnectionStatus'
import {
  CONNECTION_STATUS_COPY,
  getCoreWsStateLabel,
  getLiveKitConnectionStateLabel,
  toneFromAudioState,
  toneFromCoreState,
} from '@/constants/sessionToolbar.constants'
import '@/styles/components/workspaces/shared/toolbar/SessionToolbar.css'

interface ConnectionStatusLeafProps {
  wsState: 'connected' | 'connecting' | 'disconnected' | 'reconnecting'
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
  sessionId,
  roomId,
}: ConnectionStatusLeafProps) {
  const connectionStatus = useConnectionStatus({
    wsState,
    sessionId,
    roomId,
  })

  const coreToneClass = useMemo(
    () => toneFromCoreState(connectionStatus.coreWsState),
    [connectionStatus.coreWsState]
  )

  const audioToneClass = useMemo(
    () => toneFromAudioState(connectionStatus.livekitState),
    [connectionStatus.livekitState]
  )

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
        <div className="session-toolbar__status-tooltip-title">{CONNECTION_STATUS_COPY.title}</div>
        <div className="session-toolbar__status-tooltip-row">
          <span>{CONNECTION_STATUS_COPY.coreLabel}</span>
          <strong className={coreToneClass}>
            {getCoreWsStateLabel(connectionStatus.coreWsState)}
          </strong>
        </div>
        <div className="session-toolbar__status-tooltip-row">
          <span>{CONNECTION_STATUS_COPY.audioLabel}</span>
          <strong className={audioToneClass}>
            {getLiveKitConnectionStateLabel(connectionStatus.livekitState)}
          </strong>
        </div>
      </TooltipContent>
    </Tooltip>
  )
})

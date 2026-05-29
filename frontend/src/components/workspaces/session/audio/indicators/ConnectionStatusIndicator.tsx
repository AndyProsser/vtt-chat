/**
 * ConnectionStatusIndicator
 *
 * Leaf component for audio connection status dot.
 * Subscribes only to connection status (primitive boolean), preventing parent re-renders
 * when other non-status bits change.
 *
 * Mounts/unmounts based on status changes; parent uses `:has()` CSS selector
 * to cascade styles if needed.
 */

import React from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { AUDIO_CONNECTION_STATUS_TITLES } from '@/constants/audioUi.constants'
import type { AudioConnectionStatusState } from '@/constants/audioUi.constants'

interface ConnectionStatusIndicatorProps {
  statusState: AudioConnectionStatusState
}

export const ConnectionStatusIndicator = React.memo(
  ({ statusState }: ConnectionStatusIndicatorProps) => {
    return (
      <TooltipProvider delayDuration={140}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="session-audio-device-panel__status-dot"
              data-state={statusState}
              aria-label={AUDIO_CONNECTION_STATUS_TITLES[statusState]}
            />
          </TooltipTrigger>
          <TooltipContent side="top">{AUDIO_CONNECTION_STATUS_TITLES[statusState]}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }
)

ConnectionStatusIndicator.displayName = 'ConnectionStatusIndicator'

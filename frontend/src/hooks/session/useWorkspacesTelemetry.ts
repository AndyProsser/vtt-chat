import { useEffect } from 'react'
import type { RefObject } from 'react'
import type { UUID } from '@shared'
import { createHttpTelemetryTransport, telemetryClient } from '@/utils/telemetry'

type WsState = 'connected' | 'connecting' | 'disconnected' | 'reconnecting'

type UseWorkspacesTelemetryParams = {
  apiUrl: string
  token: string
  wsState: WsState
  currentSessionId: UUID | undefined
  wsTelemetryPrevRef: RefObject<WsState | null>
}

/**
 * Owns workspace telemetry lifecycle and emits websocket connectivity transitions.
 */
export function useWorkspacesTelemetry(params: UseWorkspacesTelemetryParams) {
  const { apiUrl, token, wsState, currentSessionId, wsTelemetryPrevRef } = params

  useEffect(() => {
    telemetryClient.setTransport(
      createHttpTelemetryTransport({
        apiUrl,
        token,
      })
    )
    telemetryClient.start()

    return () => {
      telemetryClient.stop()
    }
  }, [apiUrl, token])

  useEffect(() => {
    const previous = wsTelemetryPrevRef.current
    if (previous && previous !== wsState) {
      telemetryClient.track('WS_CONNECTION_STATE_CHANGED', {
        from: previous,
        to: wsState,
        sessionId: currentSessionId,
      })

      if ((previous === 'reconnecting' || previous === 'disconnected') && wsState === 'connected') {
        telemetryClient.track('LIVEKIT_RECONNECT', {
          reason: previous,
          sessionId: currentSessionId,
        })
      }
    }

    wsTelemetryPrevRef.current = wsState
  }, [currentSessionId, wsState, wsTelemetryPrevRef])
}

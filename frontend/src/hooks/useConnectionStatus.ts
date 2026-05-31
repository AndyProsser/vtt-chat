/**
 * useConnectionStatus
 *
 * Derives the canonical aggregate connection status from Core WS state and
 * LiveKit state, following the canonical mapping table defined in ROADMAP.md
 * (Section 0 — Connection Status Implementation Checklist).
 *
 * Canonical enums are defined in shared/types and re-exported here for
 * convenient import by consumers.
 */

import { useMemo } from 'react'
import {
  CoreWsState,
  LiveKitConnectionState,
  StatusColorKey,
  StatusContext,
  StatusIconState,
} from '@shared'
import { useStore } from './useStore'
import { buildLiveKitConnectionKey } from './useLiveKit'
import { CONNECTION_STATUS_COPY } from '@/constants/sessionToolbar.constants'
import type { ConnectionState as WsConnectionState } from '../types/ws'

export type { CoreWsState, LiveKitConnectionState, StatusContext, StatusIconState, StatusColorKey }

export interface ConnectionStatus {
  coreWsState: CoreWsState
  livekitState: LiveKitConnectionState
  statusContext: StatusContext
  statusIconState: StatusIconState
  statusColorKey: StatusColorKey
  /** Human-readable label suitable for aria-label / tooltip */
  label: string
}

/**
 * Map a raw WS connection state string to the canonical CoreWsState enum.
 */
function deriveCoreWsState(wsState: WsConnectionState): CoreWsState {
  if (wsState === 'connected') {
    return CoreWsState.CONNECTED
  }

  if (wsState === 'connecting' || wsState === 'reconnecting') {
    return CoreWsState.CONNECTING
  }

  return CoreWsState.ERROR
}

/**
 * Map a LiveKit connection snapshot to the canonical LiveKitConnectionState enum.
 * Returns NOT_APPLICABLE when there is no relevant connection key.
 */
function deriveLiveKitState(
  snapshot: {
    isConnected: boolean
    isConnecting: boolean
    error?: string | null
  } | null
): LiveKitConnectionState {
  if (!snapshot) {
    return LiveKitConnectionState.NOT_APPLICABLE
  }

  if (snapshot.isConnected) {
    return LiveKitConnectionState.CONNECTED
  }

  if (snapshot.isConnecting) {
    return LiveKitConnectionState.CONNECTING
  }

  if (snapshot.error) {
    return LiveKitConnectionState.ERROR
  }

  // Disconnected without error after initial connection attempt → treat as ERROR
  // (connection was expected but is now gone)
  return LiveKitConnectionState.ERROR
}

/**
 * Compute the canonical statusIconState and statusColorKey from the
 * mapping table in ROADMAP.md Section 0.
 */
function computeStatus(
  coreWsState: CoreWsState,
  livekitState: LiveKitConnectionState,
  statusContext: StatusContext
): { statusIconState: StatusIconState; statusColorKey: StatusColorKey; label: string } {
  if (statusContext === StatusContext.OUTSIDE_CAMPAIGN) {
    if (coreWsState === CoreWsState.CONNECTED) {
      return {
        statusIconState: StatusIconState.OK,
        statusColorKey: StatusColorKey.GREEN,
        label: CONNECTION_STATUS_COPY.aggregate.connected,
      }
    }

    if (coreWsState === CoreWsState.CONNECTING) {
      return {
        statusIconState: StatusIconState.CONNECTING,
        statusColorKey: StatusColorKey.YELLOW,
        label: CONNECTION_STATUS_COPY.aggregate.connecting,
      }
    }

    return {
      statusIconState: StatusIconState.ERROR,
      statusColorKey: StatusColorKey.RED,
      label: CONNECTION_STATUS_COPY.aggregate.connectionError,
    }
  }

  // INSIDE_CAMPAIGN mapping
  if (coreWsState === CoreWsState.ERROR) {
    return {
      statusIconState: StatusIconState.ERROR,
      statusColorKey: StatusColorKey.RED,
      label: CONNECTION_STATUS_COPY.aggregate.connectionError,
    }
  }

  if (coreWsState === CoreWsState.CONNECTING) {
    if (livekitState === LiveKitConnectionState.ERROR) {
      return {
        statusIconState: StatusIconState.ERROR,
        statusColorKey: StatusColorKey.RED,
        label: CONNECTION_STATUS_COPY.aggregate.connectionError,
      }
    }

    return {
      statusIconState: StatusIconState.CONNECTING,
      statusColorKey: StatusColorKey.YELLOW,
      label: CONNECTION_STATUS_COPY.aggregate.connecting,
    }
  }

  // coreWsState === CONNECTED from here
  if (livekitState === LiveKitConnectionState.CONNECTED) {
    return {
      statusIconState: StatusIconState.OK,
      statusColorKey: StatusColorKey.GREEN,
      label: CONNECTION_STATUS_COPY.aggregate.connected,
    }
  }

  if (livekitState === LiveKitConnectionState.CONNECTING) {
    return {
      statusIconState: StatusIconState.OK_PARTIAL,
      statusColorKey: StatusColorKey.PALE_GREEN,
      label: CONNECTION_STATUS_COPY.aggregate.voiceConnecting,
    }
  }

  if (livekitState === LiveKitConnectionState.ERROR) {
    return {
      statusIconState: StatusIconState.DEGRADED_AUDIO,
      statusColorKey: StatusColorKey.ORANGE,
      label: CONNECTION_STATUS_COPY.aggregate.voiceUnavailable,
    }
  }

  // NOT_APPLICABLE — session is active but no room selected yet
  return {
    statusIconState: StatusIconState.OK,
    statusColorKey: StatusColorKey.GREEN,
    label: CONNECTION_STATUS_COPY.aggregate.connected,
  }
}

interface UseConnectionStatusOptions {
  wsState: WsConnectionState
  /** Provide when inside a campaign session */
  sessionId?: string | null
  /** Provide when a room is selected (triggers inside-campaign LiveKit check) */
  roomId?: string | null
}

/**
 * Derives the canonical aggregate connection status.
 *
 * Pass sessionId + roomId when inside a campaign session so LiveKit connection
 * state is included in the aggregate. Omit (or pass null) when outside a
 * campaign to get outside-campaign rules.
 */
export function useConnectionStatus({
  wsState,
  sessionId,
  roomId,
}: UseConnectionStatusOptions): ConnectionStatus {
  const liveKitConnectionKey = useMemo(
    () => (sessionId && roomId ? buildLiveKitConnectionKey(sessionId, roomId, 'room') : null),
    [roomId, sessionId]
  )
  const livekitSnapshot = useStore((state) =>
    liveKitConnectionKey ? (state.livekitConnections[liveKitConnectionKey] ?? null) : null
  )

  return useMemo(() => {
    const coreWsState = deriveCoreWsState(wsState)

    // Inside campaign whenever we have a session, regardless of room selection.
    // LiveKit state is only included when a room is also selected.
    const statusContext = sessionId ? StatusContext.INSIDE_CAMPAIGN : StatusContext.OUTSIDE_CAMPAIGN

    let livekitState: LiveKitConnectionState = LiveKitConnectionState.NOT_APPLICABLE

    if (statusContext === StatusContext.INSIDE_CAMPAIGN && sessionId && roomId) {
      // A selected room implies voice connection should be active; while the
      // first snapshot is pending, surface CONNECTING rather than NOT_APPLICABLE.
      livekitState = livekitSnapshot
        ? deriveLiveKitState(livekitSnapshot)
        : LiveKitConnectionState.CONNECTING
    }

    const { statusIconState, statusColorKey, label } = computeStatus(
      coreWsState,
      livekitState,
      statusContext
    )

    return { coreWsState, livekitState, statusContext, statusIconState, statusColorKey, label }
  }, [livekitSnapshot, roomId, sessionId, wsState])
}

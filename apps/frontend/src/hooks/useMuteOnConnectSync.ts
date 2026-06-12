/**
 * useMuteOnConnectSync
 *
 * When the WS connects to a session and the user has not yet published audio
 * (device.enabled = false), broadcasts `userMuted: true` to all clients via
 * the REST API. This keeps the UI in sync after a page refresh: Redis may still
 * hold the player's pre-refresh unmuted state, but they are not actually
 * transmitting until they click "Go Live".
 *
 * Only fires once per session ID per page load. When the user goes live,
 * handleLocalTrackPublished in useLiveKit.ts calls syncBackendMuteState(false),
 * which restores the correct unmuted state for all clients.
 */
import { useEffect, useRef } from 'react'
import { useStore } from '@/state/store'
import type { UUID } from '@shared'

interface UseMuteOnConnectSyncParams {
  sessionId: UUID | null
  isWsConnected: boolean
  apiUrl: string
  token: string
}

export function useMuteOnConnectSync({
  sessionId,
  isWsConnected,
  apiUrl,
  token,
}: UseMuteOnConnectSyncParams) {
  const deviceEnabled = useStore((state) => state.device.enabled)
  const lastSyncedSessionRef = useRef<UUID | null>(null)

  useEffect(() => {
    if (!isWsConnected || !sessionId || deviceEnabled) {
      return
    }

    if (lastSyncedSessionRef.current === sessionId) {
      return
    }

    lastSyncedSessionRef.current = sessionId

    fetch(`${apiUrl}/api/audio/mute`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {
      // Fire-and-forget; audio state will re-sync when the user clicks Go Live
    })
  }, [isWsConnected, sessionId, deviceEnabled, apiUrl, token])
}

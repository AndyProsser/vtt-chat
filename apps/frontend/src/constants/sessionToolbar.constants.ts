import type { CoreWsState, LiveKitConnectionState } from '@shared'

/** Default post-session cooldown window: 5 minutes */
export const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000

export const CONNECTION_STATUS_COPY = {
  title: 'Status',
  coreLabel: 'Core',
  audioLabel: 'Audio',
  aggregate: {
    connected: 'Connected',
    connecting: 'Connecting…',
    connectionError: 'Connection error',
    voiceConnecting: 'Voice connecting…',
    voiceUnavailable: 'Voice unavailable',
  },
} as const

export const CORE_WS_STATE_LABELS: Record<CoreWsState, string> = {
  CONNECTED: 'Connected',
  CONNECTING: 'Connecting',
  ERROR: 'Error',
}

export const LIVEKIT_CONNECTION_STATE_LABELS: Record<LiveKitConnectionState, string> = {
  CONNECTED: 'Connected',
  CONNECTING: 'Connecting',
  ERROR: 'Error',
  NOT_APPLICABLE: 'Not applicable',
}

export function toFiniteTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      return numeric
    }

    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return undefined
}

export function formatDuration(totalSeconds: number): string {
  const s = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

export function formatTimestamp(ms: number | undefined): string {
  if (!Number.isFinite(ms) || !ms) return '—'
  return new Date(ms).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function toneFromCoreState(value: CoreWsState): 'is-green' | 'is-yellow' | 'is-red' {
  if (value === 'CONNECTED') return 'is-green'
  if (value === 'CONNECTING') return 'is-yellow'
  return 'is-red'
}

export function getCoreWsStateLabel(value: CoreWsState): string {
  return CORE_WS_STATE_LABELS[value]
}

export function toneFromAudioState(
  value: LiveKitConnectionState
): 'is-green' | 'is-yellow' | 'is-red' {
  if (value === 'CONNECTED') return 'is-green'
  if (value === 'CONNECTING' || value === 'NOT_APPLICABLE') return 'is-yellow'
  return 'is-red'
}

export function getLiveKitConnectionStateLabel(value: LiveKitConnectionState): string {
  return LIVEKIT_CONNECTION_STATE_LABELS[value]
}

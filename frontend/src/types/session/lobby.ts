import type { CoreWsState } from '@shared'

export type LobbyStats = {
  activeSessions: number
  connectedPlayersAndDms: number
  connectedSpectators: number
  peakConcurrentUsers24h: number
  totalTimePlayedLabel: string
  activeCampaigns: number
  pausedCampaigns: number
  averageSessionDurationLabel: string
}

export type LobbyConnectionStatus = {
  statusColorKey: string
  label: string
  coreWsState: CoreWsState
}

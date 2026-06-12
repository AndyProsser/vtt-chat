import type { LobbyStats } from '@/types/session/lobby'

export const INITIAL_LOBBY_STATS: LobbyStats = {
  activeSessions: 0,
  connectedPlayersAndDms: 0,
  connectedSpectators: 0,
  peakConcurrentUsers24h: 0,
  totalTimePlayedLabel: '0m',
  activeCampaigns: 0,
  pausedCampaigns: 0,
  averageSessionDurationLabel: '0m',
}

export const LOBBY_CAMPAIGN_LIST_RELOAD_DEBOUNCE_MS = 250

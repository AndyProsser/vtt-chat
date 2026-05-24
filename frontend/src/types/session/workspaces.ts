import type { CampaignLobbyStatsUpdatedPayload, UUID } from '@shared'
import { PresenceState, Role, RoomType, SessionState } from '@shared'
import type { CampaignSummary } from '@/types/session/campaign'

export interface WorkspacesProps {
  apiUrl: string
  wsUrl: string
  token: string
  user: { id: UUID; username: string; role: Role; authType?: 'FULL' | 'GUEST' }
  onSessionCreated?: (sessionId: UUID) => void
  onReady?: () => void
}

export interface ApiRoom {
  id: UUID
  sessionId: UUID
  name: string
  type: RoomType
  createdBy: UUID
  createdAt: number
}

export interface ApiPresence {
  sessionId: UUID
  userId: UUID
  username: string
  role?: Role
  playerName?: string
  avatarUrl?: string | null
  characterName?: string | null
  characterClass?: string | null
  characterSubclass?: string | null
  characterRace?: string | null
  level?: number | null
  characterStats?: Record<string, unknown> | null
  primaryRoomId?: UUID
  privateRoomId?: UUID
  state: PresenceState
  lastSeenAt: number
}

export interface ApiTakeoverIdentitySnapshot {
  active: boolean
  actorUserId: UUID
  effectiveUserId: UUID
  assumedUserId: UUID | null
  assumedDisplayName: string | null
  startedAt: number | null
  staleRecovered: boolean
}

export interface ApiSessionStats {
  connectedPlayersWithDm: number
  connectedPlayers: number
  connectedSpectators: number
  connectedTotal: number
  updatedAt: number
}

export interface ApiBroadcastState {
  enabled: boolean
  dmId?: UUID
  broadcastRoomId?: string
  changedAt?: number
}

export interface ApiAudioEnvironmentState {
  roomId: UUID
  environmentName: string
}

export interface ApiPlatformStatusResponse {
  activeSessions?: number
  peakConcurrentUsers24h?: number
  lobbyStats?: CampaignLobbyStatsUpdatedPayload
}

export interface ApiDiscoverableCampaign extends Omit<CampaignSummary, 'latestSessionState'> {
  activeSessionState?: SessionState | null
  spectatorInviteCode?: string | null
  spectatorInviteActive?: boolean
}

export type ActiveSessionContext = {
  campaignId: UUID
  sessionId: UUID
}

export type UserCharacterRecord = {
  id: UUID
  campaignId: UUID
  userId: UUID
  name: string
  race: string | null
  class: string | null
  subclass: string | null
  avatarUrl: string | null
  metadata: Record<string, unknown> | null
  isActive: boolean
}

export type SessionState = 'IDLE' | 'ACTIVE' | 'PAUSED' | 'ENDED'
export type CampaignStatusFilter = 'all' | 'active' | 'idle' | 'ended' | 'no_session'

export interface CampaignSummary {
  id: string
  name: string
  description: string | null
  isArchived?: boolean
  inviteCode: string
  currentDmId: string
  currentDm: {
    id: string
    username: string
  }
  memberCount: number
  sessionCount: number
  latestSession: {
    id: string
    name: string
    state: SessionState
    createdAt: string
    startedAt: string | null
    endedAt: string | null
    updatedAt: string
    _count: {
      rooms: number
      members: number
    }
  } | null
  createdAt: string
  updatedAt: string
}

export interface CampaignListResponse {
  campaigns: CampaignSummary[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface CampaignMember {
  userId: string
  username: string
  role: 'DM' | 'PLAYER' | 'SPECTATOR' | 'SYSTEM'
  primaryRoomId: string | null
  presenceState: string
}

export interface CampaignRoom {
  id: string
  name: string
  type: 'MAIN' | 'GROUP' | 'PRIVATE'
  createdAt: string
  updatedAt: string
  occupantCount: number
}

export interface CampaignRoomsResponse {
  campaign: {
    id: string
    name: string
  }
  session: {
    id: string
    name: string
    state: SessionState
    updatedAt: string
  } | null
  rooms: CampaignRoom[]
  members?: CampaignMember[]
}

export function prettyState(state: SessionState): string {
  if (state === 'IDLE') return 'Idle'
  if (state === 'ACTIVE') return 'Active'
  if (state === 'PAUSED') return 'Paused'
  return 'Ended'
}

export function statusClass(state: SessionState | 'NO_SESSION'): string {
  if (state === 'ACTIVE') return 'status-active'
  if (state === 'PAUSED') return 'status-paused'
  if (state === 'ENDED') return 'status-ended'
  if (state === 'IDLE') return 'status-idle'
  return 'status-none'
}

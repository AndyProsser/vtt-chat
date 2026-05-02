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

export interface RecordingSummary {
  id: string
  campaignId: string
  sessionId: string | null
  roomId: string | null
  title: string
  storageKey: string | null
  sourceUrl: string | null
  durationSeconds: number | null
  startedAt: string | null
  endedAt: string | null
  journalSummary: string | null
  metadata: Record<string, unknown> | null
  session?: {
    id: string
    name: string
  } | null
  room?: {
    id: string
    name: string
  } | null
  createdAt: string
  updatedAt: string
}

export interface CampaignRecordingsResponse {
  campaign: {
    id: string
    name: string
  }
  recordings: RecordingSummary[]
}

export interface CampaignExportBundle {
  version: number
  exportedAt: string
  sourceCampaignId: string
  campaign: {
    name: string
    description: string | null
    inviteCode: string
    currentDmId: string
    currentDmUsername: string
    createdAt: string
    updatedAt: string
  }
  members: Array<Record<string, unknown>>
  characters: Array<Record<string, unknown>>
  sessions: Array<Record<string, unknown>>
  recordings: Array<Record<string, unknown>>
}

export interface CampaignExportResponse {
  message: string
  artifactId: string
  counts: Record<string, number>
  bundle: CampaignExportBundle
}

export interface CampaignImportResponse {
  message: string
  artifactId: string
  counts: Record<string, number>
  campaign: CampaignSummary
}

export interface RecordingDraft {
  title: string
  sessionId: string
  roomId: string
  sourceUrl: string
  storageKey: string
  durationSeconds: string
  startedAt: string
  endedAt: string
  journalSummary: string
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

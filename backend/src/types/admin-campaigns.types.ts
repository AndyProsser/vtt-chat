export type AdminCampaignsStatusFilter = 'all' | 'active' | 'idle' | 'ended' | 'no_session'

export interface AdminCampaignsListRequest {
  search: string
  statusFilter: AdminCampaignsStatusFilter
  page: number
  pageSize: number
}

export interface AdminCampaignLatestSession {
  id: string
  name: string
  state: string
  createdAt: Date
  startedAt: Date | null
  endedAt: Date | null
  updatedAt: Date
  _count: {
    rooms: number
    members: number
  }
}

export interface AdminCampaignRepositoryRow {
  id: string
  name: string
  description: string | null
  inviteCode: string
  currentDmId: string
  createdAt: Date
  updatedAt: Date
  currentDm: {
    id: string
    username: string
  } | null
  _count: {
    members: number
    sessions: number
  }
  sessions: AdminCampaignLatestSession[]
}

export interface AdminCampaignListItem {
  id: string
  name: string
  description: string | null
  isArchived: boolean
  inviteCode: string
  currentDmId: string
  currentDm: {
    id: string
    username: string
  } | null
  memberCount: number
  sessionCount: number
  latestSession: AdminCampaignLatestSession | null
  createdAt: Date
  updatedAt: Date
}

export interface AdminCampaignsListResult {
  campaigns: AdminCampaignListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

import { listAdminCampaigns } from '@/repositories/admin-campaigns.repository'
import {
  ADMIN_CAMPAIGNS_DEFAULT_LIST_PAGE,
  ADMIN_CAMPAIGNS_DEFAULT_LIST_PAGE_SIZE,
  ADMIN_CAMPAIGNS_MAX_LIST_PAGE_SIZE,
  ADMIN_CAMPAIGNS_STATUS_FILTERS,
  ARCHIVED_CAMPAIGN_MARKER,
} from '@/constants/admin-campaigns.constants'
import type {
  AdminCampaignListItem,
  AdminCampaignRepositoryRow,
  AdminCampaignsListRequest,
  AdminCampaignsListResult,
  AdminCampaignsStatusFilter,
} from '@/types/admin-campaigns.types'

// ─── Private Helpers ──────────────────────────────────────────────────────────

function coerceCampaignStatusFilter(value: unknown): AdminCampaignsStatusFilter {
  const normalized = String(value || 'all')
    .trim()
    .toLowerCase()
  if ((ADMIN_CAMPAIGNS_STATUS_FILTERS as readonly string[]).includes(normalized)) {
    return normalized as AdminCampaignsStatusFilter
  }
  return 'all'
}

function toCampaignListItem(campaign: AdminCampaignRepositoryRow): AdminCampaignListItem {
  const latestSession = campaign.sessions[0] || null
  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    isArchived: isCampaignArchived(campaign.description),
    inviteCode: campaign.inviteCode,
    currentDm: campaign.currentDm,
    currentDmId: campaign.currentDmId,
    memberCount: campaign._count.members,
    sessionCount: campaign._count.sessions,
    latestSession,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
  }
}

// ─── Campaign Listing ─────────────────────────────────────────────────────────

export function parseAdminCampaignsListRequest(query: {
  search?: unknown
  status?: unknown
  page?: unknown
  pageSize?: unknown
}): AdminCampaignsListRequest {
  const page = Math.max(
    ADMIN_CAMPAIGNS_DEFAULT_LIST_PAGE,
    Number(query.page || ADMIN_CAMPAIGNS_DEFAULT_LIST_PAGE)
  )
  const pageSize = Math.min(
    ADMIN_CAMPAIGNS_MAX_LIST_PAGE_SIZE,
    Math.max(1, Number(query.pageSize || ADMIN_CAMPAIGNS_DEFAULT_LIST_PAGE_SIZE))
  )

  return {
    search: String(query.search || '').trim(),
    statusFilter: coerceCampaignStatusFilter(query.status),
    page,
    pageSize,
  }
}

export async function listAdminCampaignsForRequest(
  request: AdminCampaignsListRequest
): Promise<AdminCampaignsListResult> {
  const { campaigns, total } = await listAdminCampaigns(request)

  return {
    campaigns: campaigns.map(toCampaignListItem),
    total,
    page: request.page,
    pageSize: request.pageSize,
    totalPages: Math.max(1, Math.ceil(total / request.pageSize)),
  }
}

// ─── Campaign Archive Markers ─────────────────────────────────────────────────

export function isCampaignArchived(description?: string | null): boolean {
  return Boolean(description && description.startsWith(ARCHIVED_CAMPAIGN_MARKER))
}

export function applyArchivedMarker(description?: string | null): string {
  const normalized = String(description || '').trim()
  if (!normalized) {
    return `${ARCHIVED_CAMPAIGN_MARKER}Archived campaign`
  }
  if (normalized.startsWith(ARCHIVED_CAMPAIGN_MARKER)) {
    return normalized
  }
  return `${ARCHIVED_CAMPAIGN_MARKER}${normalized}`
}

export function removeArchivedMarker(description?: string | null): string {
  const normalized = String(description || '')
  if (!normalized.startsWith(ARCHIVED_CAMPAIGN_MARKER)) {
    return normalized.trim()
  }
  return normalized.slice(ARCHIVED_CAMPAIGN_MARKER.length).trim()
}

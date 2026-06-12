import { AdminPagination } from '../../components/AdminPagination'
import { CampaignFilters } from './CampaignFilters'
import { CampaignTable } from './CampaignTable'
import type { CampaignStatusFilter, CampaignSummary } from '@/types/campaigns'

interface CampaignListSectionProps {
  search: string
  statusFilter: CampaignStatusFilter
  pageSize: number
  campaigns: CampaignSummary[]
  total: number
  totalPages: number
  page: number
  loading: boolean
  selectedCampaignId: string | null
  endingSessionId: string | null
  archivingCampaignId: string | null
  onSearchChange: (value: string) => void
  onStatusFilterChange: (value: CampaignStatusFilter) => void
  onPageSizeChange: (value: number) => void
  onPageChange: (nextPage: number | ((current: number) => number)) => void
  onSelectCampaign: (campaignId: string) => void
  onEndSession: (campaign: CampaignSummary) => void
  onToggleArchive: (campaign: CampaignSummary, shouldArchive: boolean) => void
}

export function CampaignListSection({
  search,
  statusFilter,
  pageSize,
  campaigns,
  total,
  totalPages,
  page,
  loading,
  selectedCampaignId,
  endingSessionId,
  archivingCampaignId,
  onSearchChange,
  onStatusFilterChange,
  onPageSizeChange,
  onPageChange,
  onSelectCampaign,
  onEndSession,
  onToggleArchive,
}: CampaignListSectionProps) {
  return (
    <>
      <CampaignFilters
        search={search}
        statusFilter={statusFilter}
        pageSize={pageSize}
        onSearchChange={(value) => {
          onSearchChange(value)
          onPageChange(1)
        }}
        onStatusFilterChange={(value) => {
          onStatusFilterChange(value)
          onPageChange(1)
        }}
        onPageSizeChange={(value) => {
          onPageSizeChange(value)
          onPageChange(1)
        }}
      />

      <p className="admin-page-subtitle">
        Showing {campaigns.length} of {total} campaigns (page {page}/{totalPages})
      </p>

      <CampaignTable
        campaigns={campaigns}
        loading={loading}
        selectedCampaignId={selectedCampaignId}
        endingSessionId={endingSessionId}
        archivingCampaignId={archivingCampaignId}
        onSelectCampaign={onSelectCampaign}
        onEndSession={(campaign) => void onEndSession(campaign)}
        onToggleArchive={(campaign, shouldArchive) => void onToggleArchive(campaign, shouldArchive)}
      />

      <AdminPagination
        page={page}
        totalPages={totalPages}
        loading={loading}
        onPrevious={() => onPageChange((current) => Math.max(1, current - 1))}
        onNext={() => onPageChange((current) => Math.min(totalPages, current + 1))}
      />
    </>
  )
}

import type { CampaignStatusFilter } from './types'

interface CampaignFiltersProps {
  search: string
  statusFilter: CampaignStatusFilter
  pageSize: number
  onSearchChange: (value: string) => void
  onStatusFilterChange: (value: CampaignStatusFilter) => void
  onPageSizeChange: (value: number) => void
}

export function CampaignFilters({
  search,
  statusFilter,
  pageSize,
  onSearchChange,
  onStatusFilterChange,
  onPageSizeChange,
}: CampaignFiltersProps) {
  return (
    <div className="admin-toolbar-row wrap">
      <input
        type="search"
        placeholder="Search campaigns, invite codes, or DM"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />

      <select
        value={statusFilter}
        onChange={(event) => onStatusFilterChange(event.target.value as CampaignStatusFilter)}
      >
        <option value="all">All session states</option>
        <option value="active">Active sessions</option>
        <option value="idle">Idle or paused sessions</option>
        <option value="ended">Ended sessions</option>
        <option value="no_session">No sessions yet</option>
      </select>

      <select value={String(pageSize)} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
        <option value="10">10 / page</option>
        <option value="20">20 / page</option>
        <option value="50">50 / page</option>
      </select>
    </div>
  )
}

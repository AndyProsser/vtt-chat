interface UserFiltersProps {
  search: string
  roleFilter: string
  statusFilter: string
  pageSize: number
  onSearchChange: (value: string) => void
  onRoleFilterChange: (value: string) => void
  onStatusFilterChange: (value: string) => void
  onPageSizeChange: (value: number) => void
}

export function UserFilters({
  search,
  roleFilter,
  statusFilter,
  pageSize,
  onSearchChange,
  onRoleFilterChange,
  onStatusFilterChange,
  onPageSizeChange,
}: UserFiltersProps) {
  return (
    <div className="admin-toolbar-row wrap">
      <input
        type="search"
        placeholder="Search username, email, or display name"
        aria-label="Search users"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      <select
        aria-label="Filter by role"
        value={roleFilter}
        onChange={(event) => onRoleFilterChange(event.target.value)}
      >
        <option value="all">All roles</option>
        <option value="dm">DM</option>
        <option value="player">Player</option>
        <option value="spectator">Spectator</option>
        <option value="admin">Admin-capable</option>
      </select>
      <select
        aria-label="Filter by status"
        value={statusFilter}
        onChange={(event) => onStatusFilterChange(event.target.value)}
      >
        <option value="all">All statuses</option>
        <option value="active">Active</option>
        <option value="suspended">Suspended</option>
        <option value="banned">Banned</option>
      </select>
      <select
        aria-label="Rows per page"
        value={String(pageSize)}
        onChange={(event) => onPageSizeChange(Number(event.target.value))}
      >
        <option value="10">10 / page</option>
        <option value="25">25 / page</option>
        <option value="50">50 / page</option>
      </select>
    </div>
  )
}

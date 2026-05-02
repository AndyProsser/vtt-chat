import type { LogTimeRange } from './types'

interface LogFiltersProps {
  timeRange: LogTimeRange
  severity: string
  source: string
  userId: string
  roomId: string
  pageSize: number
  onTimeRangeChange: (value: LogTimeRange) => void
  onSeverityChange: (value: string) => void
  onSourceChange: (value: string) => void
  onUserIdChange: (value: string) => void
  onRoomIdChange: (value: string) => void
  onPageSizeChange: (value: number) => void
}

export function LogFilters({
  timeRange,
  severity,
  source,
  userId,
  roomId,
  pageSize,
  onTimeRangeChange,
  onSeverityChange,
  onSourceChange,
  onUserIdChange,
  onRoomIdChange,
  onPageSizeChange,
}: LogFiltersProps) {
  return (
    <div className="admin-toolbar-row wrap">
      <select
        aria-label="Filter by time range"
        value={timeRange}
        onChange={(event) => onTimeRangeChange(event.target.value as LogTimeRange)}
      >
        <option value="1h">Last 1 hour</option>
        <option value="24h">Last 24 hours</option>
        <option value="7d">Last 7 days</option>
      </select>

      <select
        aria-label="Filter by severity"
        value={severity}
        onChange={(event) => onSeverityChange(event.target.value)}
      >
        <option value="all">All severities</option>
        <option value="DEBUG">DEBUG</option>
        <option value="INFO">INFO</option>
        <option value="WARN">WARN</option>
        <option value="ERROR">ERROR</option>
      </select>

      <select
        aria-label="Filter by source"
        value={source}
        onChange={(event) => onSourceChange(event.target.value)}
      >
        <option value="all">All sources</option>
        <option value="admin-audit">admin-audit</option>
        <option value="telemetry">telemetry</option>
        <option value="runtime">runtime</option>
      </select>

      <input
        type="search"
        placeholder="Filter by user id"
        aria-label="Filter by user id"
        value={userId}
        onChange={(event) => onUserIdChange(event.target.value)}
      />

      <input
        type="search"
        placeholder="Filter by room id"
        aria-label="Filter by room id"
        value={roomId}
        onChange={(event) => onRoomIdChange(event.target.value)}
      />

      <select
        aria-label="Rows per page"
        value={String(pageSize)}
        onChange={(event) => onPageSizeChange(Number(event.target.value))}
      >
        <option value="10">10 / page</option>
        <option value="25">25 / page</option>
        <option value="50">50 / page</option>
        <option value="100">100 / page</option>
      </select>
    </div>
  )
}

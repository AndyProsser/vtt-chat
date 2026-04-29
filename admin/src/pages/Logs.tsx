import { Alert, Box, Typography } from '@mui/material'
import { AdminPagination } from '../components/AdminPagination'
import { LogDetailsPanel } from '../features/logs/LogDetailsPanel'
import { LogFilters } from '../features/logs/LogFilters'
import { LogsTable } from '../features/logs/LogsTable'
import { useLogsPage } from '../features/logs/useLogsPage'
import { adminApiBase } from '../utils/api'

export default function Logs() {
  const {
    timeRange,
    setTimeRange,
    severity,
    setSeverity,
    source,
    setSource,
    userId,
    setUserId,
    roomId,
    setRoomId,
    page,
    setPage,
    pageSize,
    setPageSize,
    rows,
    total,
    totalPages,
    loading,
    error,
    selectedLog,
    setSelectedLog,
    detailLoadingId,
    toggleSort,
    sortIndicator,
    openLogDetail,
  } = useLogsPage()

  return (
    <Box component="section" sx={{ display: 'grid', gap: 2 }}>
      <Typography variant="h5">Logs & Activity</Typography>
      <Typography variant="body2" color="text.secondary">
        Filter and inspect system events.
      </Typography>

      {loading && <Alert severity="info">Loading logs...</Alert>}
      {error && <Alert severity="error">{error}</Alert>}

      <LogFilters
        timeRange={timeRange}
        severity={severity}
        source={source}
        userId={userId}
        roomId={roomId}
        pageSize={pageSize}
        onTimeRangeChange={(value) => {
          setTimeRange(value)
          setPage(1)
        }}
        onSeverityChange={(value) => {
          setSeverity(value)
          setPage(1)
        }}
        onSourceChange={(value) => {
          setSource(value)
          setPage(1)
        }}
        onUserIdChange={(value) => {
          setUserId(value)
          setPage(1)
        }}
        onRoomIdChange={(value) => {
          setRoomId(value)
          setPage(1)
        }}
        onPageSizeChange={(value) => {
          setPageSize(value)
          setPage(1)
        }}
      />

      <Typography variant="body2" color="text.secondary">
        Showing {rows.length} of {total} entries (page {page}/{totalPages}) from {adminApiBase()}
        /telemetry/logs
      </Typography>

      <LogsTable
        rows={rows}
        detailLoadingId={detailLoadingId}
        onToggleSort={toggleSort}
        sortIndicator={sortIndicator}
        onOpenLogDetail={(row) => void openLogDetail(row)}
      />

      <AdminPagination
        page={page}
        totalPages={totalPages}
        loading={loading}
        onPrevious={() => setPage((current) => Math.max(1, current - 1))}
        onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
      />

      {selectedLog && <LogDetailsPanel log={selectedLog} onClose={() => setSelectedLog(null)} />}
    </Box>
  )
}

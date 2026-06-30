import { Box, Tab, Tabs, Typography } from '@mui/material'
import { useState } from 'react'
import { AdminPagination } from '../components/AdminPagination'
import { LogDetailsPanel } from '../features/logs/LogDetailsPanel'
import { LogFilters } from '../features/logs/LogFilters'
import { LogsTable } from '../features/logs/LogsTable'
import { useLogsPage } from '../features/logs/useLogsPage'
import { Alert } from '@mui/material'

type LogTab = 'events' | 'errors' | 'email' | 'trace' | 'audit'

const TABS: Array<{ key: LogTab; label: string }> = [
  { key: 'events', label: 'Events' },
  { key: 'errors', label: 'Errors' },
  { key: 'email', label: 'Email' },
  { key: 'trace', label: 'Trace' },
  { key: 'audit', label: 'Audit' },
]

/** Source filter presets per tab — passed into useLogsPage as the initial source. */
const TAB_SOURCE: Record<LogTab, string> = {
  events: '',
  errors: 'error',
  email: 'email',
  trace: 'trace',
  audit: 'audit',
}

const TAB_SEVERITY: Record<LogTab, string> = {
  events: '',
  errors: 'error',
  email: '',
  trace: 'debug',
  audit: '',
}

function LogTabContent({ tab }: { tab: LogTab }) {
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
  } = useLogsPage({
    initialSource: TAB_SOURCE[tab],
    initialSeverity: TAB_SEVERITY[tab],
  })

  return (
    <Box sx={{ display: 'grid', gap: 2, mt: 2 }}>
      {tab === 'trace' && (
        <Alert severity="info">
          Trace logs are high-volume diagnostic data. Extended exports may be slow. Default range is
          1 hour.
        </Alert>
      )}
      {tab === 'audit' && (
        <Alert severity="info">
          Audit logs are immutable. Entries record every admin action with actor, target, and
          timestamp.
        </Alert>
      )}

      {loading && <Alert severity="info">Loading…</Alert>}
      {error && <Alert severity="error">{error}</Alert>}

      <LogFilters
        timeRange={timeRange}
        severity={severity}
        source={source}
        userId={userId}
        roomId={roomId}
        pageSize={pageSize}
        onTimeRangeChange={(v) => { setTimeRange(v); setPage(1) }}
        onSeverityChange={(v) => { setSeverity(v); setPage(1) }}
        onSourceChange={(v) => { setSource(v); setPage(1) }}
        onUserIdChange={(v) => { setUserId(v); setPage(1) }}
        onRoomIdChange={(v) => { setRoomId(v); setPage(1) }}
        onPageSizeChange={(v) => { setPageSize(v); setPage(1) }}
      />

      <Typography variant="body2" color="text.secondary">
        {rows.length === 0 && !loading
          ? zeroStateMessage(tab)
          : `Showing ${rows.length} of ${total} entries (page ${page}/${totalPages})`}
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
        onPrevious={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
      />

      {selectedLog && <LogDetailsPanel log={selectedLog} onClose={() => setSelectedLog(null)} />}
    </Box>
  )
}

function zeroStateMessage(tab: LogTab): string {
  switch (tab) {
    case 'events':
      return 'No events in the selected range — the session is quiet.'
    case 'errors':
      return 'No errors in the last 24 hours — the roads are safe.'
    case 'email':
      return 'No email activity in the selected range.'
    case 'trace':
      return 'No trace logs — diagnostics are silent.'
    case 'audit':
      return 'No audit entries — no admin actions recorded.'
  }
}

export default function Logs() {
  const [activeTab, setActiveTab] = useState<LogTab>('events')

  return (
    <Box component="section" sx={{ display: 'grid', gap: 2 }}>
      <Box>
        <Typography variant="h5" fontWeight={700}>
          Logs
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Hall of Records — unified log viewer for events, errors, email, trace, and audit
        </Typography>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={activeTab}
          onChange={(_e, v: LogTab) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
        >
          {TABS.map((t) => (
            <Tab key={t.key} value={t.key} label={t.label} />
          ))}
        </Tabs>
      </Box>

      <LogTabContent key={activeTab} tab={activeTab} />
    </Box>
  )
}

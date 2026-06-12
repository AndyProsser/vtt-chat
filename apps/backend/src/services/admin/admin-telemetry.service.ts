import os from 'node:os'
import { getPrismaClient } from '@/infra/db'
import {
  findDiagnosticEventById,
  findTelemetryEventById,
  loadDiagnosticEvents,
  loadTelemetryEvents,
  persistDiagnosticEvents,
} from '@/infra/telemetry-store'
import { logger } from '@/utils/logger'
import { getAllSessions } from '@/services/session/core.service'
import { getChatTelemetrySnapshot } from '@/services/chat.service'

const prisma = getPrismaClient()

// ─── Private Helpers ──────────────────────────────────────────────────────────

function parseTimeRange(value: string | undefined): number {
  switch (value) {
    case '1h':
      return 60 * 60 * 1000
    case '7d':
      return 7 * 24 * 60 * 60 * 1000
    default:
      return 24 * 60 * 60 * 1000
  }
}

type TelemetrySortBy = 'timestamp' | 'severity' | 'source' | 'message'
type TelemetrySortDir = 'asc' | 'desc'

function parseSortBy(value: string | undefined): TelemetrySortBy {
  if (value === 'severity' || value === 'source' || value === 'message') return value
  return 'timestamp'
}

function parseSortDir(value: string | undefined): TelemetrySortDir {
  return value === 'asc' ? 'asc' : 'desc'
}

type TelemetryLogEntry = {
  id: string
  timestamp: string
  severity: string
  source: string
  message: string
  details: unknown
}

// ─── Telemetry ────────────────────────────────────────────────────────────────

export async function buildAdminTelemetryDashboardPayload(params: {
  activeUsers: number
}): Promise<{
  activeUsers: number
  activeRooms: number
  recentErrors: number
  systemLoadPercent: number
  messageThroughputPerMinute: number
  storageUsagePercent: number
  totalUsers: number
  suspendedUsers: number
  activeCampaigns: number
  recentModerationActions: number
  clientTelemetryEventsLastHour: number
  topClientEvents: Array<{ event: string; count: number }>
}> {
  const sessions = await getAllSessions()
  const chat = await getChatTelemetrySnapshot()
  const memory = process.memoryUsage()
  const activeSessions = sessions.filter((session) => session.state === 'ACTIVE').length
  const memoryUsedMb = Math.round(memory.heapUsed / 1024 / 1024)
  const memoryTotalMb = Math.max(1, Math.round(memory.heapTotal / 1024 / 1024))
  const storageUsagePercent = Math.min(99, Math.round((memoryUsedMb / memoryTotalMb) * 100))

  const recentErrors = logger
    .getHistory()
    .filter((entry) => entry.level === 'ERROR')
    .filter(
      (entry) => Date.now() - new Date(entry.timestamp).getTime() <= 24 * 60 * 60 * 1000
    ).length

  const telemetryEvents = await loadTelemetryEvents()
  const clientTelemetryLastHour = telemetryEvents.filter(
    (entry) => Date.now() - new Date(entry.timestamp).getTime() <= 60 * 60 * 1000
  )

  const topClientEvents = Object.entries(
    clientTelemetryLastHour.reduce(
      (acc, entry) => {
        const eventName = String(entry.message || 'unknown')
        acc[eventName] = (acc[eventName] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([event, count]) => ({ event, count }))

  const [totalUsers, suspendedUsers, activeCampaigns, recentModerationActions] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: false } }),
    prisma.campaign.count(),
    prisma.adminAuditLog.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        action: { in: ['USER_SUSPEND', 'USER_RESTORE', 'USER_FORCE_LOGOUT', 'USER_PROMOTE'] },
      },
    }),
  ])

  return {
    activeUsers: params.activeUsers,
    activeRooms: activeSessions,
    recentErrors,
    systemLoadPercent: Math.min(100, Math.round((os.loadavg()[0] / 4) * 100)),
    messageThroughputPerMinute: chat.messagesLastMinute,
    storageUsagePercent,
    totalUsers,
    suspendedUsers,
    activeCampaigns,
    recentModerationActions,
    clientTelemetryEventsLastHour: clientTelemetryLastHour.length,
    topClientEvents,
  }
}

export async function buildAdminTelemetryStatusPayload(): Promise<{
  cards: {
    cpuPercent: number
    memoryPercent: number
    diskPercent: number
    networkLatencyMs: number
    livekitStatus: string
    databaseStatus: string
  }
  charts: {
    cpuLoad24h: Array<{ x: number; y: number }>
    messageThroughput24h: Array<{ x: number; y: number }>
  }
  uptimeSec: number
  clientTelemetryEventsLastHour: number
}> {
  const memory = process.memoryUsage()
  const load = os.loadavg()
  const uptimeSec = process.uptime()
  const chat = await getChatTelemetrySnapshot()
  const telemetryEvents = await loadTelemetryEvents()
  const clientTelemetryLastHour = telemetryEvents.filter(
    (entry) => Date.now() - new Date(entry.timestamp).getTime() <= 60 * 60 * 1000
  )

  return {
    cards: {
      cpuPercent: Math.min(100, Math.round((load[0] / 4) * 100)),
      memoryPercent: Math.min(
        100,
        Math.round((memory.heapUsed / Math.max(memory.heapTotal, 1)) * 100)
      ),
      diskPercent: 72,
      networkLatencyMs: 35,
      livekitStatus: 'Online',
      databaseStatus: 'Online',
    },
    charts: {
      cpuLoad24h: Array.from({ length: 12 }, (_, idx) => ({
        x: idx,
        y: Math.min(100, Math.round((load[0] / 4) * 100) + ((idx % 3) - 1) * 3),
      })),
      messageThroughput24h: Array.from({ length: 12 }, (_, idx) => ({
        x: idx,
        y: Math.max(0, chat.messagesLastMinute + ((idx % 4) - 1) * 2),
      })),
    },
    uptimeSec,
    clientTelemetryEventsLastHour: clientTelemetryLastHour.length,
  }
}

export async function buildAdminTelemetryLogsListPayload(params: {
  query: Record<string, unknown>
}): Promise<{
  logs: TelemetryLogEntry[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  sortBy: TelemetrySortBy
  sortDir: TelemetrySortDir
}> {
  const timeRange = parseTimeRange(
    typeof params.query.timeRange === 'string' ? params.query.timeRange : undefined
  )
  const severity =
    typeof params.query.severity === 'string' ? params.query.severity.toUpperCase() : undefined
  const source =
    typeof params.query.source === 'string' ? params.query.source.toLowerCase() : undefined
  const userId = typeof params.query.userId === 'string' ? params.query.userId.trim() : undefined
  const roomId = typeof params.query.roomId === 'string' ? params.query.roomId.trim() : undefined
  const page = Math.max(1, Number(params.query.page || 1))
  const pageSize = Math.min(200, Math.max(1, Number(params.query.pageSize || 25)))
  const sortBy = parseSortBy(
    typeof params.query.sortBy === 'string' ? params.query.sortBy : undefined
  )
  const sortDir = parseSortDir(
    typeof params.query.sortDir === 'string' ? params.query.sortDir.toLowerCase() : undefined
  )

  const now = Date.now()
  const minTs = now - timeRange

  const severityRank: Record<string, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }

  const runtimeHistory = logger.getHistory().map((entry) => ({
    timestamp: entry.timestamp,
    severity: entry.level,
    source: entry.context,
    message: entry.message,
    details: (entry.meta || {}) as Record<string, unknown>,
  }))

  await persistDiagnosticEvents(runtimeHistory)

  const runtimeLogs = (await loadDiagnosticEvents())
    .filter((entry) => new Date(entry.timestamp).getTime() >= minTs)
    .filter((entry) => (severity && severity !== 'ALL' ? entry.severity === severity : true))
    .filter((entry) =>
      source && source !== 'all' ? entry.source.toLowerCase().includes(source) : true
    )
    .filter((entry) => {
      if (!userId) return true
      return JSON.stringify(entry.details || {})
        .toLowerCase()
        .includes(userId.toLowerCase())
    })
    .filter((entry) => {
      if (!roomId) return true
      return JSON.stringify(entry.details || {})
        .toLowerCase()
        .includes(roomId.toLowerCase())
    })
    .map((entry) => ({
      id: `diagnostic-${entry.id}`,
      timestamp: entry.timestamp,
      severity: entry.severity,
      source: entry.source,
      message: entry.message,
      details: entry.details,
    }))

  const auditRows = await prisma.adminAuditLog.findMany({
    where: { createdAt: { gte: new Date(minTs) } },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  })

  const auditLogs = auditRows
    .map((row) => ({
      id: `audit-${row.id}`,
      timestamp: row.createdAt.toISOString(),
      severity: row.outcome === 'FAILED' || row.outcome === 'DENIED' ? 'WARN' : 'INFO',
      source: 'admin-audit',
      message: `${row.action} ${row.outcome}`,
      details: {
        actorUserId: row.actorUserId,
        actorName: row.actorName,
        actorRole: row.actorRole,
        targetType: row.targetType,
        targetId: row.targetId,
        reason: row.reason,
        metadata: row.metadata,
      },
    }))
    .filter((entry) => (severity && severity !== 'ALL' ? entry.severity === severity : true))
    .filter((entry) =>
      source && source !== 'all' ? entry.source.toLowerCase().includes(source) : true
    )
    .filter((entry) => {
      if (!userId) return true
      return JSON.stringify(entry.details || {})
        .toLowerCase()
        .includes(userId.toLowerCase())
    })
    .filter((entry) => {
      if (!roomId) return true
      return JSON.stringify(entry.details || {})
        .toLowerCase()
        .includes(roomId.toLowerCase())
    })

  const telemetryLogs = (await loadTelemetryEvents())
    .filter((entry) => new Date(entry.timestamp).getTime() >= minTs)
    .map((entry) => ({
      id: `telemetry-${entry.id}`,
      timestamp: entry.timestamp,
      severity: entry.severity,
      source: entry.source,
      message: entry.message,
      details: entry.details,
    }))
    .filter((entry) => (severity && severity !== 'ALL' ? entry.severity === severity : true))
    .filter((entry) =>
      source && source !== 'all' ? entry.source.toLowerCase().includes(source) : true
    )
    .filter((entry) => {
      if (!userId) return true
      return JSON.stringify(entry.details || {})
        .toLowerCase()
        .includes(userId.toLowerCase())
    })
    .filter((entry) => {
      if (!roomId) return true
      return JSON.stringify(entry.details || {})
        .toLowerCase()
        .includes(roomId.toLowerCase())
    })

  const filtered = [...runtimeLogs, ...auditLogs, ...telemetryLogs]

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    if (sortBy === 'timestamp') {
      cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    } else if (sortBy === 'severity') {
      cmp = (severityRank[a.severity] ?? 0) - (severityRank[b.severity] ?? 0)
    } else if (sortBy === 'source') {
      cmp = a.source.localeCompare(b.source)
    } else {
      cmp = a.message.localeCompare(b.message)
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  const total = sorted.length
  const start = (page - 1) * pageSize
  const logs = sorted.slice(start, start + pageSize)

  return {
    logs,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    sortBy,
    sortDir,
  }
}

export async function resolveAdminTelemetryLogById(logId: string): Promise<{
  status: number
  body: Record<string, unknown>
}> {
  const normalizedLogId = logId.trim()

  if (!normalizedLogId) {
    return { status: 400, body: { error: 'logId is required', code: 'INVALID_LOG_ID' } }
  }

  if (normalizedLogId.startsWith('diagnostic-')) {
    const diagnosticId = normalizedLogId.slice('diagnostic-'.length)
    const row = await findDiagnosticEventById(diagnosticId)

    if (!row) {
      return { status: 404, body: { error: 'Log entry not found', code: 'NOT_FOUND' } }
    }

    return {
      status: 200,
      body: {
        log: {
          id: `diagnostic-${row.id}`,
          timestamp: row.timestamp,
          severity: row.severity,
          source: row.source,
          message: row.message,
          details: row.details,
        },
      },
    }
  }

  if (normalizedLogId.startsWith('audit-')) {
    const auditId = normalizedLogId.slice('audit-'.length)
    const row = await prisma.adminAuditLog.findUnique({ where: { id: auditId } })

    if (!row) {
      return { status: 404, body: { error: 'Log entry not found', code: 'NOT_FOUND' } }
    }

    return {
      status: 200,
      body: {
        log: {
          id: `audit-${row.id}`,
          timestamp: row.createdAt.toISOString(),
          severity: row.outcome === 'FAILED' || row.outcome === 'DENIED' ? 'WARN' : 'INFO',
          source: 'admin-audit',
          message: `${row.action} ${row.outcome}`,
          details: {
            actorUserId: row.actorUserId,
            actorName: row.actorName,
            actorRole: row.actorRole,
            targetType: row.targetType,
            targetId: row.targetId,
            reason: row.reason,
            metadata: row.metadata,
          },
        },
      },
    }
  }

  if (normalizedLogId.startsWith('telemetry-')) {
    const telemetryId = normalizedLogId.slice('telemetry-'.length)
    const row = await findTelemetryEventById(telemetryId)

    if (!row) {
      return { status: 404, body: { error: 'Log entry not found', code: 'NOT_FOUND' } }
    }

    return {
      status: 200,
      body: {
        log: {
          id: `telemetry-${row.id}`,
          timestamp: row.timestamp,
          severity: row.severity,
          source: row.source,
          message: row.message,
          details: row.details,
        },
      },
    }
  }

  return {
    status: 400,
    body: {
      error: 'This log source does not support durable drill-down',
      code: 'DRILLDOWN_NOT_SUPPORTED',
    },
  }
}

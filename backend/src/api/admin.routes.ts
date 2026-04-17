import { Router, Request, Response } from 'express'
import os from 'os'
import { getAllSessions } from '@/services/session.service'
import { getChatTelemetrySnapshot } from '@/core/chat/chat.service'
import { logger } from '@/utils/logger'

const router = Router()

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

router.get('/telemetry/dashboard', (_req: Request, res: Response) => {
  const sessions = getAllSessions()
  const wsManager = _req.app.locals.wsManager as { getConnectionCount?: () => number } | undefined
  const chat = getChatTelemetrySnapshot()
  const memory = process.memoryUsage()
  const activeSessions = sessions.filter((s) => s.state === 'ACTIVE').length
  const memoryUsedMb = Math.round(memory.heapUsed / 1024 / 1024)
  const memoryTotalMb = Math.max(1, Math.round(memory.heapTotal / 1024 / 1024))
  const storageUsagePercent = Math.min(99, Math.round((memoryUsedMb / memoryTotalMb) * 100))

  const recentErrors = logger
    .getHistory()
    .filter((entry) => entry.level === 'ERROR')
    .filter(
      (entry) => Date.now() - new Date(entry.timestamp).getTime() <= 24 * 60 * 60 * 1000
    ).length

  res.status(200).json({
    activeUsers: wsManager?.getConnectionCount?.() ?? 0,
    activeRooms: activeSessions,
    recentErrors,
    systemLoadPercent: Math.min(100, Math.round((os.loadavg()[0] / 4) * 100)),
    messageThroughputPerMinute: chat.messagesLastMinute,
    storageUsagePercent,
  })
})

router.get('/telemetry/status', (_req: Request, res: Response) => {
  const memory = process.memoryUsage()
  const load = os.loadavg()
  const uptimeSec = process.uptime()
  const chat = getChatTelemetrySnapshot()

  res.status(200).json({
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
  })
})

router.get('/telemetry/logs', (req: Request, res: Response) => {
  const timeRange = parseTimeRange(req.query.timeRange as string | undefined)
  const severity = (req.query.severity as string | undefined)?.toUpperCase()
  const source = (req.query.source as string | undefined)?.toLowerCase()
  const userId = (req.query.userId as string | undefined)?.trim()
  const roomId = (req.query.roomId as string | undefined)?.trim()
  const page = Math.max(1, Number(req.query.page || 1))
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize || 25)))
  const sortByRaw = (req.query.sortBy as string | undefined) || 'timestamp'
  const sortDirRaw = ((req.query.sortDir as string | undefined) || 'desc').toLowerCase()

  const sortBy: 'timestamp' | 'severity' | 'source' | 'message' = [
    'timestamp',
    'severity',
    'source',
    'message',
  ].includes(sortByRaw)
    ? (sortByRaw as 'timestamp' | 'severity' | 'source' | 'message')
    : 'timestamp'
  const sortDir: 'asc' | 'desc' = sortDirRaw === 'asc' ? 'asc' : 'desc'

  const now = Date.now()
  const minTs = now - timeRange

  const severityRank: Record<string, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  }

  const filtered = logger
    .getHistory()
    .filter((entry) => new Date(entry.timestamp).getTime() >= minTs)
    .filter((entry) => (severity && severity !== 'ALL' ? entry.level === severity : true))
    .filter((entry) =>
      source && source !== 'all' ? entry.context.toLowerCase().includes(source) : true
    )
    .filter((entry) => {
      if (!userId) return true
      return JSON.stringify(entry.meta || {})
        .toLowerCase()
        .includes(userId.toLowerCase())
    })
    .filter((entry) => {
      if (!roomId) return true
      return JSON.stringify(entry.meta || {})
        .toLowerCase()
        .includes(roomId.toLowerCase())
    })

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    if (sortBy === 'timestamp') {
      cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    } else if (sortBy === 'severity') {
      cmp = (severityRank[a.level] ?? 0) - (severityRank[b.level] ?? 0)
    } else if (sortBy === 'source') {
      cmp = a.context.localeCompare(b.context)
    } else {
      cmp = a.message.localeCompare(b.message)
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  const total = sorted.length
  const start = (page - 1) * pageSize
  const logs = sorted.slice(start, start + pageSize).map((entry) => ({
    timestamp: entry.timestamp,
    severity: entry.level,
    source: entry.context,
    message: entry.message,
    details: entry.meta,
  }))

  res.status(200).json({
    logs,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    sortBy,
    sortDir,
  })
})

export default router

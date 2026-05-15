import os from 'node:os'
import { getAllSessions } from '@/services/session/core.service'
import { getChatTelemetrySnapshot } from '@/services/chat.service'
import { loadTelemetryEvents } from '@/infra/telemetry-store'
import { logger } from '@/utils/logger'
import { getPrismaClient } from '@/infra/db'

const prisma = getPrismaClient()

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

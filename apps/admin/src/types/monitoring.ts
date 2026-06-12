export interface TimelinePoint {
  x: number
  y: number
}

export interface DashboardTelemetry {
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
}

export interface StatusTelemetry {
  cards: {
    cpuPercent: number
    memoryPercent: number
    diskPercent: number
    networkLatencyMs: number
    livekitStatus: string
    databaseStatus: string
  }
  charts: {
    cpuLoad24h: TimelinePoint[]
    messageThroughput24h: TimelinePoint[]
  }
  uptimeSec: number
  clientTelemetryEventsLastHour: number
}

export interface MonitoringSnapshot {
  dashboard: DashboardTelemetry | null
  status: StatusTelemetry | null
}

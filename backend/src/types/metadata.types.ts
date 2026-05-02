import type { SessionState } from '@shared'

export type MetadataTemplate = {
  id: string
  title: string
  description: string
  labels: string[]
}

export type SessionMetadataSnapshot = {
  sessionId: string
  title: string
  description: string | null
  state: SessionState
  dmId: string
  campaign: {
    id: string
    name: string
  } | null
  tags: string[]
  stats: {
    messageCount: number
    noteCount: number
    memberCount: number
    roomCount: number
    presenceCount: number
    eventCount: number
  }
  createdAt: number
  updatedAt: number
}

export type MetadataTimelineEntry = {
  id: string
  sessionId: string
  actorId: string | null
  actorUsername: string
  eventType: string
  action: string
  detail: string | null
  timestamp: number
}

export type MetadataAccessResult =
  | {
      ok: true
      session: {
        id: string
        name: string
        description: string | null
        state: SessionState
        dmId: string
        createdAt: Date
        updatedAt: Date
        campaign: { id: string; name: string } | null
        _count: {
          messages: number
          notes: number
          members: number
          rooms: number
          presence: number
          logs: number
        }
      }
    }
  | {
      ok: false
      code: 'SESSION_NOT_FOUND' | 'FORBIDDEN'
    }

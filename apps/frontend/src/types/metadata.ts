import type { UUID } from '@shared'

export interface SessionMetadata {
  sessionId: UUID
  title: string
  description?: string
  tags: string[]
  updatedAt: number
}

export interface MetadataSnapshot {
  id: string
  sessionId: UUID
  label: string
  value: string
  createdAt: number
}

export interface MetadataTimelineEntry {
  id: string
  sessionId: UUID
  actorId: UUID
  actorUsername: string
  action: string
  detail?: string
  timestamp: number
}

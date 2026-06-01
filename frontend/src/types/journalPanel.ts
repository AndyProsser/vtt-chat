import { type UUID } from '@shared'
import type { Session } from '@/types/session'

export interface RawNote {
  id: string
  title?: string
  content?: string
  name?: string
  markdown?: string
  tags?: string[]
  visibility?: string
  publishedAt?: number
  createdAt?: number
  updatedAt?: number
  authorId?: string
  authorUsername?: string
}

export interface JournalEntry {
  id: string
  hashtags: string[]
  markdown: string
  updatedAt: number
  authorUsername?: string
}

export interface SessionJournalStatus {
  hasJournal: boolean
  hasContent: boolean
  hashtags: string[]
  journalTitle?: string
  journalUpdatedAt?: number
  needsRecap?: boolean
}

export interface OptimisticSessionSelection {
  sessionId: UUID
  baselineControlledSessionId: UUID | null
}

export interface MissingRecapCopy {
  cardBody: string
}

export type JournalSavedPayload = {
  sessionId: UUID
  hasContent: boolean
  hasJournal: boolean
  hashtags: string[]
}

export type MissingRecapCopyBuilder = (session: Session, nextSession?: Session) => MissingRecapCopy

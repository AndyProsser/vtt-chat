import type { NoteVisibility, SessionEntity, UUID } from '@shared'

export interface CreateSessionRequest {
  name: SessionEntity['name']
  description?: string
  dmId: UUID
}

export interface JoinSessionRequest {
  sessionId: UUID
  userId: UUID
}

export interface SendMessageRequest {
  sessionId: UUID
  roomId: UUID
  authorId: UUID
  content: string
  isDmOnly?: boolean
}

export interface ApplyConditionRequest {
  sessionId: UUID
  userId: UUID
  condition: string
}

export interface RemoveConditionRequest {
  sessionId: UUID
  userId: UUID
  condition: string
}

export interface SetRoomEnvironmentRequest {
  roomId: UUID
  environmentId: string
}

export interface CreateMetadataRequest {
  sessionId: UUID
  roomId: UUID
  authorId: UUID
  type: string
  title: string
  description?: string
  data?: Record<string, unknown>
  tags?: string[]
}

export interface CreateNoteRequest {
  sessionId: UUID
  title: string
  content: string
  authorId: UUID
  visibility?: NoteVisibility
  tags?: string[]
}

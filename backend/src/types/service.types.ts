export interface CreateSessionRequest {
  name: string
  description?: string
  dmId: string
}

export interface JoinSessionRequest {
  sessionId: string
  userId: string
}

export interface SendMessageRequest {
  sessionId: string
  roomId: string
  authorId: string
  content: string
  isDmOnly?: boolean
}

export interface ApplyConditionRequest {
  sessionId: string
  userId: string
  condition: string
}

export interface RemoveConditionRequest {
  sessionId: string
  userId: string
  condition: string
}

export interface SetRoomEnvironmentRequest {
  roomId: string
  environmentId: string
}

export interface CreateMetadataRequest {
  sessionId: string
  roomId: string
  authorId: string
  type: string
  title: string
  description?: string
  data?: Record<string, any>
  tags?: string[]
}

export interface CreateNoteRequest {
  sessionId: string
  title: string
  content: string
  authorId: string
  visibility?: 'DM_ONLY' | 'PLAYERS_VISIBLE' | 'CUSTOM'
  tags?: string[]
}

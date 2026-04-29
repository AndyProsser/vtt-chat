// ============================================================================
// WebSocket Event Types
// ============================================================================

export interface WebSocketEvent {
  type: string
  sessionId: string
  roomId: string
  timestamp: number
  payload: Record<string, any>
}

export interface ChatMessageEvent extends WebSocketEvent {
  type: 'CHAT_MESSAGE'
  payload: {
    messageId: string
    authorId: string
    content: string
    isDmOnly: boolean
  }
}

export interface UserJoinedEvent extends WebSocketEvent {
  type: 'USER_JOINED'
  payload: {
    userId: string
    username: string
    role: 'PLAYER' | 'DM'
  }
}

export interface UserLeftEvent extends WebSocketEvent {
  type: 'USER_LEFT'
  payload: {
    userId: string
    username: string
  }
}

export interface ConditionAppliedEvent extends WebSocketEvent {
  type: 'CONDITION_APPLIED'
  payload: {
    userId: string
    condition: string
  }
}

export interface ConditionRemovedEvent extends WebSocketEvent {
  type: 'CONDITION_REMOVED'
  payload: {
    userId: string
    condition: string
  }
}

export interface EnvironmentChangedEvent extends WebSocketEvent {
  type: 'ENVIRONMENT_CHANGED'
  payload: {
    environmentId: string
    environmentName: string
  }
}

export interface SessionEndedEvent extends WebSocketEvent {
  type: 'SESSION_ENDED'
  payload: {
    sessionId: string
    endedAt: string
  }
}

export interface RoomChangedEvent extends WebSocketEvent {
  type: 'ROOM_CHANGED'
  payload: {
    userId: string
    fromRoomId: string
    toRoomId: string
  }
}

export interface MetadataCreatedEvent extends WebSocketEvent {
  type: 'METADATA_CREATED'
  payload: {
    metadataId: string
    type: string
    title: string
    tags: string[]
  }
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  token: string
  user: UserDTO
}

export interface UserDTO {
  id: string
  username: string
  email: string | null
  role: 'PLAYER' | 'DM'
  createdAt: string
}

export interface SessionDTO {
  id: string
  name: string
  description: string | null
  dm: string
  isActive: boolean
  isArchived: boolean
  memberCount: number
  createdAt: string
  endedAt: string | null
}

export interface RoomDTO {
  id: string
  sessionId: string
  name: string
  type: 'MAIN' | 'GROUP' | 'PRIVATE'
  isActive: boolean
  environmentId: string | null
  environmentName: string | null
  memberCount: number
}

export interface MessageDTO {
  id: string
  sessionId: string
  roomId: string
  authorId: string
  authorName: string
  content: string
  type: 'TEXT' | 'SYSTEM' | 'AUDIO_LOG'
  isDmOnly: boolean
  isSystemMessage: boolean
  createdAt: string
}

export interface MetadataDTO {
  id: string
  sessionId: string
  roomId: string
  type: string
  title: string
  description: string | null
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface NoteDTO {
  id: string
  sessionId: string
  title: string
  content: string
  authorId: string
  visibility: 'DM_ONLY' | 'PLAYERS_VISIBLE' | 'CUSTOM'
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface PlayerConditionDTO {
  id: string
  userId: string
  condition: string
  appliedAt: string
}

// ============================================================================
// Authorization Types
// ============================================================================

export interface AuthToken {
  userId: string
  username: string
  role: 'PLAYER' | 'DM' | 'SPECTATOR'
  authType: 'FULL' | 'GUEST'
  sessionId: string
  iat: number
  exp: number
}

export interface AdminAuthToken {
  userId: string
  username: string
  adminRole: 'SUPER_ADMIN' | 'ADMIN' | 'CAMPAIGN_DM' | 'READ_ONLY'
  iat: number
  exp: number
}

// ============================================================================
// Service Layer Types
// ============================================================================

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

// ============================================================================
// Error Types
// ============================================================================

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code: string
  ) {
    super(message)
  }
}

export class AuthError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(401, message, 'AUTH_ERROR')
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`, 'NOT_FOUND')
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(403, message, 'FORBIDDEN')
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message, 'VALIDATION_ERROR')
  }
}

// ============================================================================
// Pagination
// ============================================================================

export interface PaginationQuery {
  limit?: number
  offset?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  limit: number
  offset: number
}

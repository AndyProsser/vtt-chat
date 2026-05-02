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

import { Role, RoomType, type UUID } from '@shared'

export interface NotesShareUser {
  id: UUID
  username: string
  role: Role | string
  avatarUrl?: string | null
  characterName?: string | null
  status?: 'HERE' | 'AWAY' | 'LOBBY' | 'NOT_HERE' | 'OFFLINE'
}

export interface NotesShareRoom {
  id: UUID
  name: string
  type: RoomType
}

export interface PartyPresenceMember {
  userId: UUID
  username: string
  role: Role | string
  avatarUrl?: string | null
  characterName?: string | null
  status?: 'HERE' | 'AWAY' | 'LOBBY' | 'NOT_HERE' | 'OFFLINE'
}

export interface PartyPresenceResponse {
  members?: PartyPresenceMember[]
}

export interface RoomsResponse {
  rooms?: NotesShareRoom[]
}

export interface RoomMembersResponse {
  members?: UUID[]
}

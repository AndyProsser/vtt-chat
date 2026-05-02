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

import type { EventEnvelope, Role, UUID } from '@shared'

/**
 * Legacy WS event compatibility types.
 *
 * Runtime transport uses shared EventEnvelope with namespaced event types
 * (`ROOM:USER_JOINED`, `CHAT:MESSAGE_SENT`, etc). These aliases retain
 * backward-compatible typing for any older call-sites while composing from the
 * canonical shared envelope.
 */

type LegacyEventEnvelope<TPayload, TType extends string> = Omit<EventEnvelope<TPayload>, 'type'> & {
  type: TType
}

export type WebSocketEvent = EventEnvelope<Record<string, unknown>>

export type ChatMessageEvent = LegacyEventEnvelope<
  {
    messageId: UUID
    authorId: UUID
    content: string
    isDmOnly: boolean
  },
  'CHAT_MESSAGE'
>

export type UserJoinedEvent = LegacyEventEnvelope<
  {
    userId: UUID
    username: string
    role: Exclude<`${Role}`, 'SYSTEM'>
  },
  'USER_JOINED'
>

export type UserLeftEvent = LegacyEventEnvelope<
  {
    userId: UUID
    username: string
  },
  'USER_LEFT'
>

export type ConditionAppliedEvent = LegacyEventEnvelope<
  {
    userId: UUID
    condition: string
  },
  'CONDITION_APPLIED'
>

export type ConditionRemovedEvent = LegacyEventEnvelope<
  {
    userId: UUID
    condition: string
  },
  'CONDITION_REMOVED'
>

export type EnvironmentChangedEvent = LegacyEventEnvelope<
  {
    environmentId: string
    environmentName: string
  },
  'ENVIRONMENT_CHANGED'
>

export type SessionEndedEvent = LegacyEventEnvelope<
  {
    sessionId: UUID
    endedAt: string
  },
  'SESSION_ENDED'
>

export type RoomChangedEvent = LegacyEventEnvelope<
  {
    userId: UUID
    fromRoomId: UUID
    toRoomId: UUID
  },
  'ROOM_CHANGED'
>

export type MetadataCreatedEvent = LegacyEventEnvelope<
  {
    metadataId: UUID
    type: string
    title: string
    tags: string[]
  },
  'METADATA_CREATED'
>

import { describe, expectTypeOf, it } from 'vitest'
import type {
  MessageEntity,
  NoteEntity,
  NoteVisibility,
  PresenceEntity,
  Role,
  RoomEntity,
  RoomType,
  SessionEntity,
} from '@shared'
import type { UserDTO, RoomDTO, NoteDTO } from '@/types/api.types'
import type { PlayerFacingRole, AdminRole, SharedRoleValue } from '@/types/auth.types'
import type { HandoffExchangeUser, UserAuthContext } from '@/types/auth-user-context.types'
import type { MetadataAccessResult } from '@/types/metadata.types'
import type { CreateNoteRequest, CreateSessionRequest } from '@/types/service.types'
import type { WebSocketEvent } from '@/types/ws.types'
import type { StoredMessage } from '@/types/chat.types'
import type { StoredNote } from '@/types/notes.types'
import type { RealtimePresence, StoredRoom } from '@/types/room.types'

describe('shared type alignment (backend)', () => {
  it('stored room extends shared room entity', () => {
    expectTypeOf<StoredRoom>().toMatchTypeOf<RoomEntity>()
  })

  it('stored message extends shared message entity', () => {
    expectTypeOf<StoredMessage>().toMatchTypeOf<MessageEntity>()
  })

  it('stored note extends shared note entity', () => {
    expectTypeOf<StoredNote>().toMatchTypeOf<NoteEntity>()
  })

  it('realtime presence extends shared presence entity', () => {
    expectTypeOf<RealtimePresence>().toMatchTypeOf<PresenceEntity>()
  })

  it('player-facing auth roles are derived from shared role contract', () => {
    expectTypeOf<PlayerFacingRole>().toMatchTypeOf<Exclude<SharedRoleValue, 'SYSTEM'>>()
  })

  it('user auth context role shape aligns with shared role contract', () => {
    expectTypeOf<UserAuthContext['role']>().toMatchTypeOf<SharedRoleValue>()
    expectTypeOf<HandoffExchangeUser['role']>().toMatchTypeOf<SharedRoleValue>()
  })

  it('admin role shape is canonical across auth and user-context types', () => {
    expectTypeOf<UserAuthContext['adminRole']>().toEqualTypeOf<AdminRole | null>()
    expectTypeOf<HandoffExchangeUser['adminRole']>().toEqualTypeOf<AdminRole | null>()
  })

  it('api dto enums align with shared contracts', () => {
    expectTypeOf<UserDTO['role']>().toMatchTypeOf<Extract<SharedRoleValue, 'PLAYER' | 'DM'>>()
    expectTypeOf<RoomDTO['type']>().toMatchTypeOf<`${RoomType}`>()
    expectTypeOf<NoteDTO['visibility']>().toMatchTypeOf<`${NoteVisibility}`>()
  })

  it('metadata access success session composes shared session contract', () => {
    type AccessSession = Extract<MetadataAccessResult, { ok: true }>['session']
    expectTypeOf<AccessSession>().toMatchTypeOf<Pick<SessionEntity, 'name' | 'state'>>()
  })

  it('service dto enums align with shared contracts', () => {
    expectTypeOf<CreateNoteRequest['visibility']>().toMatchTypeOf<`${NoteVisibility}` | undefined>()
    expectTypeOf<CreateSessionRequest['name']>().toMatchTypeOf<SessionEntity['name']>()
  })

  it('websocket base event composes shared event envelope shape', () => {
    expectTypeOf<WebSocketEvent['payload']>().toMatchTypeOf<Record<string, unknown>>()
  })
})

import { describe, expectTypeOf, it } from 'vitest'
import type { MessageEntity, NoteEntity, RoomEntity, SessionEntity, UserEntity } from '@shared'
import type { Message } from '@/types/chat'
import type { Note } from '@/types/notes'
import type { Room } from '@/types/room'
import type { Session } from '@/types/session'
import type { User } from '@/types/user'

describe('shared type alignment (frontend)', () => {
  it('frontend session type aligns with shared canonical session contract', () => {
    expectTypeOf<Session>().toEqualTypeOf<SessionEntity>()
  })

  it('frontend room type aligns with shared canonical room contract', () => {
    expectTypeOf<Room>().toEqualTypeOf<RoomEntity>()
  })

  it('frontend message type aligns with shared canonical message contract', () => {
    expectTypeOf<Message>().toEqualTypeOf<MessageEntity>()
  })

  it('frontend note type aligns with shared canonical note contract', () => {
    expectTypeOf<Note>().toEqualTypeOf<NoteEntity>()
  })

  it('frontend user type aligns with shared canonical user contract', () => {
    expectTypeOf<User>().toEqualTypeOf<UserEntity>()
  })
})

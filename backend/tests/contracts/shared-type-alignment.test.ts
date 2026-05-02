import { describe, expectTypeOf, it } from 'vitest'
import type { MessageEntity, NoteEntity, PresenceEntity, RoomEntity } from '@shared'
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
})

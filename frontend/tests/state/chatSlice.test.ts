import { beforeEach, describe, expect, it } from 'vitest'
import type { EventEnvelope } from '@shared'
import type { UUID } from '@shared'
import { useStore } from '../../src/state/store'
import type { Message, TypingIndicator } from '@/types/chat'

const SESSION_A = '11111111-1111-4111-8111-111111111111' as UUID
const SESSION_B = '22222222-2222-4222-8222-222222222222' as UUID
const MSG_ID_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID
const MSG_ID_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as UUID
const USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' as UUID
const ROOM_ID_A = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' as UUID
const ROOM_ID_B = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' as UUID
const NOW = 1700000000000

function makeEvent(
  type: string,
  sessionId: UUID,
  payload: Record<string, unknown> = {}
): EventEnvelope {
  return {
    id: '00000000-0000-4000-8000-000000000000' as any,
    type,
    version: 1,
    userId: USER_ID as any,
    userRole: 'PLAYER' as any,
    sessionId: sessionId as any,
    roomId: null,
    timestamp: NOW,
    payload,
  }
}

const SAMPLE_MESSAGE: Message = {
  id: MSG_ID_1,
  roomId: ROOM_ID_A,
  authorId: USER_ID,
  authorUsername: 'alice',
  content: 'Hello world',
  type: 'OOC' as any,
  isDmOnly: false,
  createdAt: NOW,
}

describe('chatSlice', () => {
  beforeEach(() => {
    useStore.getState().reset()
  })

  // ── Direct actions ─────────────────────────────────────────────────────────

  describe('addMessage', () => {
    it('adds a message to the correct session', () => {
      useStore.getState().addMessage(SESSION_A, SAMPLE_MESSAGE)
      const msgs = useStore.getState().messages[SESSION_A]
      expect(msgs).toBeDefined()
      expect(msgs![MSG_ID_1]).toEqual(SAMPLE_MESSAGE)
    })

    it('does not overwrite messages from a different session', () => {
      useStore.getState().addMessage(SESSION_A, SAMPLE_MESSAGE)
      const other: Message = { ...SAMPLE_MESSAGE, id: MSG_ID_2 }
      useStore.getState().addMessage(SESSION_B, other)
      expect(Object.keys(useStore.getState().messages[SESSION_A]!)).toHaveLength(1)
      expect(Object.keys(useStore.getState().messages[SESSION_B]!)).toHaveLength(1)
    })

    it('deduplicates near-identical session bookends but keeps later repeated markers', () => {
      const pausedA: Message = {
        ...SAMPLE_MESSAGE,
        id: MSG_ID_1,
        type: 'SYSTEM' as any,
        content: '[Session Paused] Session Current',
        createdAt: NOW,
      }

      const pausedNearDuplicate: Message = {
        ...pausedA,
        id: MSG_ID_2,
        createdAt: NOW + 2_000,
      }

      const pausedLater: Message = {
        ...pausedA,
        id: 'abababab-abab-4aba-8aba-abababababab' as UUID,
        createdAt: NOW + 60_000,
      }

      useStore.getState().addMessage(SESSION_A, pausedA)
      useStore.getState().addMessage(SESSION_A, pausedNearDuplicate)
      useStore.getState().addMessage(SESSION_A, pausedLater)

      const sessionMessages = useStore.getState().messages[SESSION_A] || {}
      expect(Object.keys(sessionMessages)).toHaveLength(2)
      expect(sessionMessages[pausedA.id]).toBeDefined()
      expect(sessionMessages[pausedLater.id]).toBeDefined()
      expect(sessionMessages[pausedNearDuplicate.id]).toBeUndefined()
    })
  })

  describe('updateMessage', () => {
    it('updates an existing message', () => {
      useStore.getState().addMessage(SESSION_A, SAMPLE_MESSAGE)
      useStore.getState().updateMessage(SESSION_A, MSG_ID_1, { content: 'Edited' })
      expect(useStore.getState().messages[SESSION_A]![MSG_ID_1]!.content).toBe('Edited')
    })

    it('is a no-op when message does not exist', () => {
      useStore.getState().addMessage(SESSION_A, SAMPLE_MESSAGE)
      const before = useStore.getState().messages[SESSION_A]
      useStore.getState().updateMessage(SESSION_A, MSG_ID_2, { content: 'Ghost' })
      expect(useStore.getState().messages[SESSION_A]).toEqual(before)
    })
  })

  describe('deleteMessage', () => {
    it('removes a message from its session', () => {
      useStore.getState().addMessage(SESSION_A, SAMPLE_MESSAGE)
      useStore.getState().deleteMessage(SESSION_A, MSG_ID_1)
      expect(useStore.getState().messages[SESSION_A]![MSG_ID_1]).toBeUndefined()
    })
  })

  describe('setTypingIndicators', () => {
    it('sets typing indicators for a session', () => {
      const indicators: TypingIndicator[] = [
        { userId: USER_ID, username: 'alice', until: NOW + 5000 },
      ]
      useStore.getState().setTypingIndicators(SESSION_A, indicators)
      expect(useStore.getState().typingIndicators[SESSION_A]).toEqual(indicators)
    })

    it('replaces existing indicators', () => {
      const first: TypingIndicator[] = [{ userId: USER_ID, username: 'alice', until: NOW + 5000 }]
      const second: TypingIndicator[] = []
      useStore.getState().setTypingIndicators(SESSION_A, first)
      useStore.getState().setTypingIndicators(SESSION_A, second)
      expect(useStore.getState().typingIndicators[SESSION_A]).toHaveLength(0)
    })
  })

  describe('clearMessages', () => {
    it('clears a specific session', () => {
      useStore.getState().addMessage(SESSION_A, SAMPLE_MESSAGE)
      useStore.getState().addMessage(SESSION_B, { ...SAMPLE_MESSAGE, id: MSG_ID_2 })
      useStore.getState().clearMessages(SESSION_A)
      expect(useStore.getState().messages[SESSION_A]).toBeUndefined()
      expect(useStore.getState().messages[SESSION_B]).toBeDefined()
    })

    it('clears all sessions when called without argument', () => {
      useStore.getState().addMessage(SESSION_A, SAMPLE_MESSAGE)
      useStore.getState().addMessage(SESSION_B, { ...SAMPLE_MESSAGE, id: MSG_ID_2 })
      useStore.getState().clearMessages()
      expect(useStore.getState().messages).toEqual({})
      expect(useStore.getState().typingIndicators).toEqual({})
    })
  })

  describe('clearRoomMessages', () => {
    it('clears only messages from one room in the targeted session', () => {
      useStore.getState().addMessage(SESSION_A, SAMPLE_MESSAGE)
      useStore.getState().addMessage(SESSION_A, {
        ...SAMPLE_MESSAGE,
        id: MSG_ID_2,
        roomId: ROOM_ID_B,
      })

      useStore.getState().clearRoomMessages(SESSION_A, ROOM_ID_A)

      expect(useStore.getState().messages[SESSION_A]?.[MSG_ID_1]).toBeUndefined()
      expect(useStore.getState().messages[SESSION_A]?.[MSG_ID_2]).toBeDefined()
    })
  })

  // ── Event handlers ─────────────────────────────────────────────────────────

  describe('handleMessageSent', () => {
    it('adds message from event payload', () => {
      const event = makeEvent('CHAT:MESSAGE_SENT', SESSION_A, {
        messageId: MSG_ID_1,
        roomId: ROOM_ID_A,
        authorId: USER_ID,
        authorUsername: 'alice',
        content: 'Hi there',
        type: 'OOC',
        isDmOnly: false,
        isOffTheRecord: false,
        visibleTo: [USER_ID],
      })
      useStore.getState().handleMessageSent(event)
      const msg = useStore.getState().messages[SESSION_A]![MSG_ID_1]
      expect(msg).toBeDefined()
      expect(msg!.content).toBe('Hi there')
      expect(msg!.createdAt).toBe(NOW)
      expect(msg!.roomId).toBe(ROOM_ID_A)
      expect(msg!.visibleTo).toEqual([USER_ID])
    })
  })

  describe('handleMessageEdited', () => {
    it('updates content on existing message', () => {
      useStore.getState().addMessage(SESSION_A, SAMPLE_MESSAGE)
      const event = makeEvent('CHAT:MESSAGE_EDITED', SESSION_A, {
        messageId: MSG_ID_1,
        content: 'Updated content',
      })
      useStore.getState().handleMessageEdited(event)
      const msg = useStore.getState().messages[SESSION_A]![MSG_ID_1]
      expect(msg!.content).toBe('Updated content')
      expect(msg!.editedAt).toBe(NOW)
    })

    it('is a no-op when message does not exist', () => {
      useStore.getState().clearMessages(SESSION_A)

      const event = makeEvent('CHAT:MESSAGE_EDITED', SESSION_A, {
        messageId: MSG_ID_2,
        content: 'Ghost edit',
      })
      useStore.getState().handleMessageEdited(event)
      // The unknown message should not appear; the session key may exist but be empty
      expect(useStore.getState().messages[SESSION_A]?.[MSG_ID_2]).toBeUndefined()
    })
  })

  describe('handleMessageDeleted', () => {
    it('removes message from store', () => {
      useStore.getState().addMessage(SESSION_A, SAMPLE_MESSAGE)
      const event = makeEvent('CHAT:MESSAGE_DELETED', SESSION_A, { messageId: MSG_ID_1 })
      useStore.getState().handleMessageDeleted(event)
      expect(useStore.getState().messages[SESSION_A]![MSG_ID_1]).toBeUndefined()
    })
  })

  describe('handleTypingStarted', () => {
    it('adds a typing indicator for the user', () => {
      const event = makeEvent('CHAT:TYPING_STARTED', SESSION_A, {
        userId: USER_ID,
        username: 'alice',
        roomId: ROOM_ID_A,
      })
      useStore.getState().handleTypingStarted(event)
      const indicators = useStore.getState().typingIndicators[SESSION_A]
      expect(indicators).toHaveLength(1)
      expect(indicators![0]!.username).toBe('alice')
      expect(indicators![0]!.roomId).toBe(ROOM_ID_A)
      expect(indicators![0]!.until).toBeGreaterThan(NOW)
    })

    it('replaces existing indicator for same user', () => {
      const event = makeEvent('CHAT:TYPING_STARTED', SESSION_A, {
        userId: USER_ID,
        username: 'alice',
      })
      useStore.getState().handleTypingStarted(event)
      useStore.getState().handleTypingStarted(event)
      expect(useStore.getState().typingIndicators[SESSION_A]).toHaveLength(1)
    })
  })

  describe('handleTypingStopped', () => {
    it('removes typing indicator for user', () => {
      const startEvent = makeEvent('CHAT:TYPING_STARTED', SESSION_A, {
        userId: USER_ID,
        username: 'alice',
      })
      useStore.getState().handleTypingStarted(startEvent)
      expect(useStore.getState().typingIndicators[SESSION_A]).toHaveLength(1)

      const stopEvent = makeEvent('CHAT:TYPING_STOPPED', SESSION_A, { userId: USER_ID })
      useStore.getState().handleTypingStopped(stopEvent)
      expect(useStore.getState().typingIndicators[SESSION_A]).toHaveLength(0)
    })
  })

  describe('handleRoomContextCleared', () => {
    it('removes only messages scoped to the cleared room', () => {
      useStore.getState().addMessage(SESSION_A, SAMPLE_MESSAGE)
      useStore.getState().addMessage(SESSION_A, {
        ...SAMPLE_MESSAGE,
        id: MSG_ID_2,
        roomId: ROOM_ID_B,
      })

      const event = makeEvent('CHAT:ROOM_CONTEXT_CLEARED', SESSION_A, {
        roomId: ROOM_ID_A,
      })
      useStore.getState().handleRoomContextCleared(event)

      expect(useStore.getState().messages[SESSION_A]?.[MSG_ID_1]).toBeUndefined()
      expect(useStore.getState().messages[SESSION_A]?.[MSG_ID_2]).toBeDefined()
    })
  })

  describe('handleMessageSent — session bookend deduplication', () => {
    beforeEach(() => {
      useStore.getState().clearMessages()
    })

    it('does not add a duplicate bookend within dedupe window', () => {
      const bookendEvent = makeEvent('CHAT:MESSAGE_SENT', SESSION_A, {
        messageId: MSG_ID_1,
        roomId: ROOM_ID_A,
        authorId: USER_ID,
        authorUsername: 'system',
        content: '[Session Started]',
        type: 'SYSTEM',
        isDmOnly: false,
      })
      const duplicateEvent = makeEvent('CHAT:MESSAGE_SENT', SESSION_A, {
        messageId: MSG_ID_2,
        roomId: ROOM_ID_A,
        authorId: USER_ID,
        authorUsername: 'system',
        content: '[Session Started]',
        type: 'SYSTEM',
        isDmOnly: false,
      })

      useStore.getState().handleMessageSent(bookendEvent)
      useStore.getState().handleMessageSent(duplicateEvent)

      const msgs = useStore.getState().messages[SESSION_A]!
      // Only the first bookend should be stored; the duplicate is rejected
      expect(Object.keys(msgs)).toHaveLength(1)
      expect(msgs[MSG_ID_1]).toBeDefined()
      expect(msgs[MSG_ID_2]).toBeUndefined()
    })

    it('adds a bookend that is outside the dedupe window', () => {
      const bookendEvent = makeEvent('CHAT:MESSAGE_SENT', SESSION_A, {
        messageId: MSG_ID_1,
        roomId: ROOM_ID_A,
        authorId: USER_ID,
        authorUsername: 'system',
        content: '[Session Started]',
        type: 'SYSTEM',
        isDmOnly: false,
      })
      // Second event is far outside the 10 000 ms dedupe window
      const lateEvent = {
        ...makeEvent('CHAT:MESSAGE_SENT', SESSION_A, {
          messageId: MSG_ID_2,
          roomId: ROOM_ID_A,
          authorId: USER_ID,
          authorUsername: 'system',
          content: '[Session Started]',
          type: 'SYSTEM',
          isDmOnly: false,
        }),
        timestamp: NOW + 20_000,
      }

      useStore.getState().handleMessageSent(bookendEvent)
      useStore.getState().handleMessageSent(lateEvent)

      const msgs = useStore.getState().messages[SESSION_A]!
      expect(Object.keys(msgs)).toHaveLength(2)
    })

    it('adds non-bookend SYSTEM messages without dedup checks', () => {
      const event1 = makeEvent('CHAT:MESSAGE_SENT', SESSION_A, {
        messageId: MSG_ID_1,
        roomId: ROOM_ID_A,
        authorId: USER_ID,
        authorUsername: 'system',
        content: 'Player joined the session',
        type: 'SYSTEM',
        isDmOnly: false,
      })
      const event2 = makeEvent('CHAT:MESSAGE_SENT', SESSION_A, {
        messageId: MSG_ID_2,
        roomId: ROOM_ID_A,
        authorId: USER_ID,
        authorUsername: 'system',
        content: 'Player joined the session',
        type: 'SYSTEM',
        isDmOnly: false,
      })

      useStore.getState().handleMessageSent(event1)
      useStore.getState().handleMessageSent(event2)

      // Non-bookend SYSTEM messages are not deduplicated
      const msgs = useStore.getState().messages[SESSION_A]!
      expect(Object.keys(msgs)).toHaveLength(2)
    })
  })
})

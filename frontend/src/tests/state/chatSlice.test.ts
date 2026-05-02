import { beforeEach, describe, expect, it } from 'vitest'
import type { EventEnvelope } from '@shared'
import type { UUID } from '@shared'
import { useStore } from '../../state/store'
import type { Message, TypingIndicator } from '@/types/chat'

const SESSION_A = '11111111-1111-4111-8111-111111111111' as UUID
const SESSION_B = '22222222-2222-4222-8222-222222222222' as UUID
const MSG_ID_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID
const MSG_ID_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as UUID
const USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' as UUID
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

  // ── Event handlers ─────────────────────────────────────────────────────────

  describe('handleMessageSent', () => {
    it('adds message from event payload', () => {
      const event = makeEvent('CHAT:MESSAGE_SENT', SESSION_A, {
        messageId: MSG_ID_1,
        authorId: USER_ID,
        authorUsername: 'alice',
        content: 'Hi there',
        type: 'OOC',
        isDmOnly: false,
      })
      useStore.getState().handleMessageSent(event)
      const msg = useStore.getState().messages[SESSION_A]![MSG_ID_1]
      expect(msg).toBeDefined()
      expect(msg!.content).toBe('Hi there')
      expect(msg!.createdAt).toBe(NOW)
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
      })
      useStore.getState().handleTypingStarted(event)
      const indicators = useStore.getState().typingIndicators[SESSION_A]
      expect(indicators).toHaveLength(1)
      expect(indicators![0]!.username).toBe('alice')
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
})

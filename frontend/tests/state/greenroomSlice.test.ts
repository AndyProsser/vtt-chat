import { beforeEach, describe, expect, it } from 'vitest'
import type { UUID } from '@shared'
import { useStore } from '../../src/state/store'
import type { Message } from '../../src/types/chat'

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111' as UUID
const MSG_ID_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID
const MSG_ID_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as UUID
const AUTHOR_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' as UUID
const SESSION_ID = '22222222-2222-4222-8222-222222222222' as UUID
const NOW = 1700000000000

function makeMessage(id: UUID, content = 'hello'): Message {
  return {
    id,
    authorId: AUTHOR_ID,
    authorUsername: 'alice',
    content,
    type: 'OOC' as any,
    isDmOnly: false,
    createdAt: NOW,
  }
}

function makeEvent(type: string, payload: Record<string, unknown>) {
  return {
    id: '00000000-0000-4000-8000-000000000000' as any,
    type,
    version: 1,
    userId: AUTHOR_ID as any,
    userRole: 'PLAYER' as any,
    sessionId: SESSION_ID as any,
    roomId: null,
    timestamp: NOW,
    payload,
  }
}

describe('greenroomSlice', () => {
  beforeEach(() => {
    useStore.setState({
      greenroomMessages: {},
      currentCampaignId: null,
      isGreenroomLoading: false,
    })
  })

  describe('addGreenroomMessage', () => {
    it('adds a message to the store', () => {
      const msg = makeMessage(MSG_ID_1)
      useStore.getState().addGreenroomMessage(msg)
      expect(useStore.getState().greenroomMessages[MSG_ID_1]).toEqual(msg)
    })

    it('overwrites a message with the same id', () => {
      const msg = makeMessage(MSG_ID_1, 'original')
      const updated = makeMessage(MSG_ID_1, 'updated')
      useStore.getState().addGreenroomMessage(msg)
      useStore.getState().addGreenroomMessage(updated)
      expect(useStore.getState().greenroomMessages[MSG_ID_1]!.content).toBe('updated')
    })
  })

  describe('updateGreenroomMessage', () => {
    it('updates fields of an existing message', () => {
      useStore.getState().addGreenroomMessage(makeMessage(MSG_ID_1, 'original'))
      useStore
        .getState()
        .updateGreenroomMessage(MSG_ID_1, { content: 'edited', editedAt: NOW + 1000 })
      const msg = useStore.getState().greenroomMessages[MSG_ID_1]!
      expect(msg.content).toBe('edited')
      expect(msg.editedAt).toBe(NOW + 1000)
    })

    it('is a no-op for an unknown message id', () => {
      useStore.getState().addGreenroomMessage(makeMessage(MSG_ID_1, 'original'))
      useStore.getState().updateGreenroomMessage(MSG_ID_2, { content: 'edited' })
      expect(useStore.getState().greenroomMessages[MSG_ID_1]!.content).toBe('original')
    })
  })

  describe('deleteGreenroomMessage', () => {
    it('removes an existing message', () => {
      useStore.getState().addGreenroomMessage(makeMessage(MSG_ID_1))
      useStore.getState().deleteGreenroomMessage(MSG_ID_1)
      expect(useStore.getState().greenroomMessages[MSG_ID_1]).toBeUndefined()
    })

    it('is idempotent for unknown message ids', () => {
      useStore.getState().addGreenroomMessage(makeMessage(MSG_ID_1))
      useStore.getState().deleteGreenroomMessage(MSG_ID_2)
      expect(useStore.getState().greenroomMessages[MSG_ID_1]).toBeDefined()
    })
  })

  describe('clearGreenroomMessages', () => {
    it('removes all messages', () => {
      useStore.getState().addGreenroomMessage(makeMessage(MSG_ID_1))
      useStore.getState().addGreenroomMessage(makeMessage(MSG_ID_2))
      useStore.getState().clearGreenroomMessages()
      expect(useStore.getState().greenroomMessages).toEqual({})
    })
  })

  describe('setGreenroomCampaignId', () => {
    it('sets campaign id', () => {
      useStore.getState().setGreenroomCampaignId(CAMPAIGN_ID)
      expect(useStore.getState().currentCampaignId).toBe(CAMPAIGN_ID)
    })

    it('clears campaign id when set to null', () => {
      useStore.getState().setGreenroomCampaignId(CAMPAIGN_ID)
      useStore.getState().setGreenroomCampaignId(null)
      expect(useStore.getState().currentCampaignId).toBeNull()
    })
  })

  describe('handleGreenroomMessageSent', () => {
    it('creates a message from the event payload', () => {
      useStore.getState().handleGreenroomMessageSent(
        makeEvent('GREENROOM:MESSAGE_SENT', {
          messageId: MSG_ID_1,
          authorId: AUTHOR_ID,
          authorUsername: 'alice',
          content: 'test message',
          type: 'OOC',
          isDmOnly: false,
        })
      )
      const msg = useStore.getState().greenroomMessages[MSG_ID_1]!
      expect(msg.content).toBe('test message')
      expect(msg.authorId).toBe(AUTHOR_ID)
      expect(msg.createdAt).toBe(NOW)
    })

    it('includes optional fields when present', () => {
      useStore.getState().handleGreenroomMessageSent(
        makeEvent('GREENROOM:MESSAGE_SENT', {
          messageId: MSG_ID_1,
          authorId: AUTHOR_ID,
          authorUsername: 'alice',
          content: 'whisper',
          type: 'WHISPER',
          isDmOnly: true,
          isOffTheRecord: true,
          visibleTo: [AUTHOR_ID],
          targetIds: [AUTHOR_ID],
        })
      )
      const msg = useStore.getState().greenroomMessages[MSG_ID_1]!
      expect(msg.isDmOnly).toBe(true)
      expect(msg.isOffTheRecord).toBe(true)
      expect(msg.visibleTo).toEqual([AUTHOR_ID])
    })
  })

  describe('handleGreenroomMessageEdited', () => {
    it('updates content for an existing message', () => {
      useStore.getState().addGreenroomMessage(makeMessage(MSG_ID_1, 'original'))
      useStore
        .getState()
        .handleGreenroomMessageEdited(
          makeEvent('GREENROOM:MESSAGE_EDITED', { messageId: MSG_ID_1, content: 'revised' })
        )
      expect(useStore.getState().greenroomMessages[MSG_ID_1]!.content).toBe('revised')
    })

    it('is a no-op for unknown message id', () => {
      useStore.getState().addGreenroomMessage(makeMessage(MSG_ID_1, 'original'))
      useStore
        .getState()
        .handleGreenroomMessageEdited(
          makeEvent('GREENROOM:MESSAGE_EDITED', { messageId: MSG_ID_2, content: 'revised' })
        )
      expect(useStore.getState().greenroomMessages[MSG_ID_1]!.content).toBe('original')
    })
  })

  describe('handleGreenroomMessageDeleted', () => {
    it('removes a message from the store', () => {
      useStore.getState().addGreenroomMessage(makeMessage(MSG_ID_1))
      useStore
        .getState()
        .handleGreenroomMessageDeleted(
          makeEvent('GREENROOM:MESSAGE_DELETED', { messageId: MSG_ID_1 })
        )
      expect(useStore.getState().greenroomMessages[MSG_ID_1]).toBeUndefined()
    })

    it('is idempotent for unknown message id', () => {
      useStore.getState().addGreenroomMessage(makeMessage(MSG_ID_1))
      useStore
        .getState()
        .handleGreenroomMessageDeleted(
          makeEvent('GREENROOM:MESSAGE_DELETED', { messageId: MSG_ID_2 })
        )
      expect(useStore.getState().greenroomMessages[MSG_ID_1]).toBeDefined()
    })
  })
})

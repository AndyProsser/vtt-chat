import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageType } from '@shared'

const store = new Map<string, any>()

const repositoryMocks = vi.hoisted(() => ({
  createChatMessageRecord: vi.fn(async (_params: any) => {}),
  deleteSessionMessages: vi.fn(async (_sessionId: string) => {}),
  findMessageById: vi.fn(async (messageId: string) => store.get(messageId) ?? null),
  getChatCounts: vi.fn(async () => ({
    totalMessages: store.size,
    messagesLastMinute: store.size,
    activeChatSessions: 1,
  })),
  listSessionMessages: vi.fn(async (_sessionId: string) => Array.from(store.values())),
  softDeleteMessageRecord: vi.fn(async (_params: any) => {}),
  updateMessageRecord: vi.fn(async (_params: any) => {}),
}))

vi.mock('@/repositories/chat.repository', () => ({
  createChatMessageRecord: repositoryMocks.createChatMessageRecord,
  deleteSessionMessages: repositoryMocks.deleteSessionMessages,
  findMessageById: repositoryMocks.findMessageById,
  getChatCounts: repositoryMocks.getChatCounts,
  listSessionMessages: repositoryMocks.listSessionMessages,
  softDeleteMessageRecord: repositoryMocks.softDeleteMessageRecord,
  updateMessageRecord: repositoryMocks.updateMessageRecord,
}))

import { deleteMessage, editMessage } from '../../../src/core/chat/chat.service'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222'
const AUTHOR_ID = '33333333-3333-4333-8333-333333333333'

describe('chat system message protections', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    store.clear()

    store.set(MESSAGE_ID, {
      id: MESSAGE_ID,
      sessionId: SESSION_ID,
      authorId: AUTHOR_ID,
      authorUsername: 'dm-user',
      content: '[Session Started] Chapter 1',
      type: MessageType.SYSTEM,
      isDmOnly: false,
      visibleTo: null,
      createdAt: new Date(),
      editedAt: null,
      deletedAt: null,
      deletedBy: null,
    })
  })

  it('blocks edits of SYSTEM messages', async () => {
    const updated = await editMessage(MESSAGE_ID as any, AUTHOR_ID as any, 'DM', 'changed')
    expect(updated).toBeNull()
    expect(repositoryMocks.updateMessageRecord).not.toHaveBeenCalled()
  })

  it('blocks deletes of SYSTEM messages', async () => {
    const deleted = await deleteMessage(MESSAGE_ID as any, AUTHOR_ID as any, 'DM')
    expect(deleted).toBeNull()
    expect(repositoryMocks.softDeleteMessageRecord).not.toHaveBeenCalled()
  })
})

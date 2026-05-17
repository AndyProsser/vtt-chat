import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageType } from '@shared'

const mocks = vi.hoisted(() => ({
  createChatMessageRecord: vi.fn(),
  deleteSessionMessages: vi.fn(),
  findMessageById: vi.fn(),
  getChatCounts: vi.fn(),
  listCampaignMessages: vi.fn(),
  listCampaignMessagesSince: vi.fn(),
  listCampaignGroupRooms: vi.fn(),
  listMessagesBySessionIds: vi.fn(),
  listSessionMessages: vi.fn(),
  listSessionMessagesSince: vi.fn(),
  findSessionById: vi.fn(),
  listSessionsByCampaign: vi.fn(),
  softDeleteMessageRecord: vi.fn(),
  updateMessageRecord: vi.fn(),
}))

vi.mock('@/repositories/chat.repository', () => ({
  createChatMessageRecord: mocks.createChatMessageRecord,
  deleteSessionMessages: mocks.deleteSessionMessages,
  findMessageById: mocks.findMessageById,
  getChatCounts: mocks.getChatCounts,
  listCampaignMessages: mocks.listCampaignMessages,
  listCampaignMessagesSince: mocks.listCampaignMessagesSince,
  listMessagesBySessionIds: mocks.listMessagesBySessionIds,
  listSessionMessages: mocks.listSessionMessages,
  listSessionMessagesSince: mocks.listSessionMessagesSince,
  softDeleteMessageRecord: mocks.softDeleteMessageRecord,
  updateMessageRecord: mocks.updateMessageRecord,
}))

vi.mock('@/repositories/room.repository', () => ({
  listCampaignGroupRooms: mocks.listCampaignGroupRooms,
}))

vi.mock('@/repositories/session.repository', () => ({
  findSessionById: mocks.findSessionById,
  listSessionsByCampaign: mocks.listSessionsByCampaign,
}))

import {
  canSeeMessage,
  clearSessionMessages,
  deleteMessage,
  editMessage,
  getChatTelemetrySnapshot,
  getMessages,
  getCampaignGreenroomMessages,
  sendMessage,
} from '@/services/chat.service'

const SESSION_ID = '11111111-1111-4111-8111-111111111111' as any
const AUTHOR_ID = '22222222-2222-4222-8222-222222222222' as any
const DM_ID = '33333333-3333-4333-8333-333333333333' as any

function makeRepoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    sessionId: SESSION_ID,
    authorId: AUTHOR_ID,
    authorUsername: 'author',
    content: 'hello',
    type: MessageType.OOC,
    isDmOnly: false,
    visibleTo: null,
    createdAt: new Date(1700000000000),
    editedAt: null,
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  }
}

describe('chat.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.findSessionById.mockResolvedValue({
      id: SESSION_ID,
      campaignId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    })
    mocks.listSessionsByCampaign.mockResolvedValue([
      { id: SESSION_ID },
      { id: '88888888-8888-4888-8888-888888888888' },
    ])
    mocks.listCampaignGroupRooms.mockResolvedValue([
      {
        id: '99999999-9999-4999-8999-999999999999',
        sessionId: SESSION_ID,
        name: 'Green Room',
        type: 'GROUP',
      },
      {
        id: '77777777-7777-4777-8777-777777777777',
        sessionId: '88888888-8888-4888-8888-888888888888',
        name: 'green-room',
        type: 'GROUP',
      },
    ])
    mocks.listMessagesBySessionIds.mockResolvedValue([])
    mocks.listSessionMessagesSince.mockResolvedValue([])
    mocks.listCampaignMessages.mockResolvedValue([])
    mocks.listCampaignMessagesSince.mockResolvedValue([])
  })

  it('creates whisper visibility list and persists message', async () => {
    const message = await sendMessage({
      sessionId: SESSION_ID,
      authorId: AUTHOR_ID,
      authorUsername: 'author',
      dmId: DM_ID,
      content: 'secret',
      type: MessageType.WHISPER,
      recipientId: '55555555-5555-4555-8555-555555555555' as any,
    })

    expect(message.isDmOnly).toBe(true)
    expect(message.visibleTo).toEqual(
      expect.arrayContaining([AUTHOR_ID, DM_ID, '55555555-5555-4555-8555-555555555555'])
    )
    expect(mocks.createChatMessageRecord).toHaveBeenCalledTimes(1)
  })

  it('creates direct-message visibility for sender and DM', async () => {
    const message = await sendMessage({
      sessionId: SESSION_ID,
      authorId: AUTHOR_ID,
      authorUsername: 'author',
      dmId: DM_ID,
      content: 'hello dm',
      type: MessageType.DM,
    })

    expect(message.isDmOnly).toBe(true)
    expect(message.visibleTo).toEqual(expect.arrayContaining([AUTHOR_ID, DM_ID]))
    expect(message.targetIds).toBeUndefined()
    expect(mocks.createChatMessageRecord).toHaveBeenCalledTimes(1)
  })

  it('skips persistence for off-the-record whisper-group messages', async () => {
    const message = await sendMessage({
      sessionId: SESSION_ID,
      authorId: AUTHOR_ID,
      authorUsername: 'author',
      dmId: DM_ID,
      content: 'whisper circle',
      type: MessageType.WHISPER,
      visibleTo: [AUTHOR_ID, DM_ID],
      isOffTheRecord: true,
    })

    expect(message.isOffTheRecord).toBe(true)
    expect(mocks.createChatMessageRecord).not.toHaveBeenCalled()
    expect(mocks.getChatCounts).not.toHaveBeenCalled()
  })

  it('filters visible messages by role and whisper audience', async () => {
    mocks.listSessionMessagesSince.mockResolvedValue([
      makeRepoRow({ type: MessageType.OOC }),
      makeRepoRow({
        id: '66666666-6666-4666-8666-666666666666',
        type: MessageType.WHISPER,
        isDmOnly: true,
        visibleTo: [AUTHOR_ID, DM_ID],
      }),
    ])

    const asPlayer = await getMessages(
      SESSION_ID,
      '77777777-7777-4777-8777-777777777777' as any,
      'PLAYER'
    )
    const asDm = await getMessages(SESSION_ID, DM_ID, 'DM')

    expect(asPlayer).toHaveLength(1)
    expect(asDm).toHaveLength(2)
  })

  it('enforces edit permission and blocks system message edits', async () => {
    mocks.findMessageById.mockResolvedValueOnce(makeRepoRow({ type: MessageType.SYSTEM }))

    const blocked = await editMessage(
      '44444444-4444-4444-8444-444444444444' as any,
      AUTHOR_ID,
      'PLAYER',
      'new'
    )

    expect(blocked).toBeNull()

    mocks.findMessageById.mockResolvedValueOnce(makeRepoRow({ type: MessageType.OOC }))

    const edited = await editMessage(
      '44444444-4444-4444-8444-444444444444' as any,
      AUTHOR_ID,
      'PLAYER',
      'new'
    )

    expect(edited?.content).toBe('new')
    expect(mocks.updateMessageRecord).toHaveBeenCalledTimes(1)
  })

  it('enforces delete permission and blocks deleted/system messages', async () => {
    mocks.findMessageById.mockResolvedValueOnce(makeRepoRow({ type: MessageType.SYSTEM }))
    expect(
      await deleteMessage('44444444-4444-4444-8444-444444444444' as any, AUTHOR_ID, 'PLAYER')
    ).toBeNull()

    mocks.findMessageById.mockResolvedValueOnce(makeRepoRow({ deletedAt: new Date(1700000000200) }))
    expect(
      await deleteMessage('44444444-4444-4444-8444-444444444444' as any, AUTHOR_ID, 'PLAYER')
    ).toBeNull()

    mocks.findMessageById.mockResolvedValueOnce(makeRepoRow())
    const deleted = await deleteMessage(
      '44444444-4444-4444-8444-444444444444' as any,
      AUTHOR_ID,
      'PLAYER'
    )

    expect(deleted?.deletedBy).toBe(AUTHOR_ID)
    expect(mocks.softDeleteMessageRecord).toHaveBeenCalledTimes(1)
  })

  it('provides visibility helper, telemetry snapshot, and clear semantics', async () => {
    expect(
      canSeeMessage(
        {
          id: '1' as any,
          sessionId: SESSION_ID,
          authorId: AUTHOR_ID,
          authorUsername: 'author',
          content: 'hi',
          type: MessageType.WHISPER,
          isDmOnly: true,
          isOffTheRecord: true,
          visibleTo: [AUTHOR_ID],
          createdAt: 1,
        },
        '99999999-9999-4999-8999-999999999999' as any,
        'PLAYER'
      )
    ).toBe(false)

    clearSessionMessages(SESSION_ID)
    expect(mocks.deleteSessionMessages).toHaveBeenCalledWith(SESSION_ID)

    mocks.getChatCounts.mockResolvedValue({
      totalMessages: 10,
      messagesLastMinute: 3,
      activeChatSessions: 2,
    })

    const snapshot = await getChatTelemetrySnapshot()
    expect(snapshot.totalMessages).toBe(10)
  })

  it('merges greenroom messages across campaign sessions', async () => {
    mocks.listCampaignMessages.mockResolvedValue([
      makeRepoRow({
        id: '12121212-1212-4121-8121-121212121212',
        sessionId: SESSION_ID,
        type: MessageType.OOC,
        visibleTo: { roomId: '99999999-9999-4999-8999-999999999999' },
        createdAt: new Date(1700000000000),
      }),
      makeRepoRow({
        id: '13131313-1313-4131-8131-131313131313',
        sessionId: '88888888-8888-4888-8888-888888888888',
        type: MessageType.SYSTEM,
        content: '[Session Ended] Chapter One',
        visibleTo: { roomId: '77777777-7777-4777-8777-777777777777' },
        createdAt: new Date(1700000001000),
      }),
      makeRepoRow({
        id: '14141414-1414-4141-8141-141414141414',
        sessionId: '88888888-8888-4888-8888-888888888888',
        type: MessageType.OOC,
        visibleTo: { roomId: '16161616-1616-4161-8161-161616161616' },
        createdAt: new Date(1700000002000),
      }),
    ])

    const result = await getCampaignGreenroomMessages(
      '99999999-9999-4999-8999-999999999999' as any,
      AUTHOR_ID,
      'PLAYER'
    )

    expect(result.map((message) => message.id)).toEqual([
      '12121212-1212-4121-8121-121212121212',
      '13131313-1313-4131-8131-131313131313',
      '14141414-1414-4141-8141-141414141414',
    ])
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  prisma: {
    session: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    note: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@/services/chat.service', () => ({
  sendMessage: mocks.sendMessage,
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => mocks.prisma,
}))

vi.mock('@/infra/logging/logger', () => ({
  logger: {
    warn: vi.fn(),
  },
}))

import { getPlayerPerspectiveJournalRoast, type UUID } from '@shared'
import {
  emitSessionBoundarySystemMessage,
  emitSessionRecapMessage,
} from '@/services/system-messages.service'
import { logger } from '@/infra/logging/logger'

const SESSION_ID = '11111111-1111-4111-8111-111111111111' as UUID
const DM_ID = '22222222-2222-4222-8222-222222222222' as UUID
const MAIN_ROOM_ID = '33333333-3333-4333-8333-333333333333' as UUID
const GREEN_ROOM_ID = '44444444-4444-4444-8444-444444444444' as UUID

describe('system messages service', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.prisma.session.findUnique.mockResolvedValue(null)
    mocks.prisma.session.findFirst.mockResolvedValue(null)
    mocks.prisma.note.findMany.mockResolvedValue([])

    mocks.sendMessage.mockImplementation(async (params: any) => ({
      id: crypto.randomUUID() as UUID,
      sessionId: params.sessionId,
      roomId: params.roomId,
      authorId: params.authorId,
      authorUsername: params.authorUsername,
      content: params.content,
      type: params.type,
      isDmOnly: false,
      createdAt: Date.now(),
    }))
  })

  it('persists and broadcasts boundary markers for each requested room', async () => {
    const wsManager = {
      broadcastEventToSession: vi.fn(),
    }

    await emitSessionBoundarySystemMessage({
      sessionId: SESSION_ID,
      roomIds: [MAIN_ROOM_ID, GREEN_ROOM_ID],
      sessionName: 'Session One',
      boundaryType: 'SESSION_STARTED',
      dmId: DM_ID,
      dmUsername: 'gm',
      wsManager: wsManager as any,
    })

    expect(mocks.sendMessage).toHaveBeenCalledTimes(2)
    expect(mocks.sendMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        sessionId: SESSION_ID,
        roomId: MAIN_ROOM_ID,
        content: '[Session Started] Session One',
      })
    )
    expect(mocks.sendMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sessionId: SESSION_ID,
        roomId: GREEN_ROOM_ID,
        content: '[Session Started] Session One',
      })
    )

    expect(wsManager.broadcastEventToSession).toHaveBeenCalledTimes(2)
    const roomIds = wsManager.broadcastEventToSession.mock.calls.map(
      ([, event]: any) => event.roomId
    )
    expect(roomIds).toEqual([MAIN_ROOM_ID, GREEN_ROOM_ID])
    expect(
      wsManager.broadcastEventToSession.mock.calls.every(
        ([sessionId, event]: any[]) =>
          sessionId === SESSION_ID &&
          event.type === 'CHAT:MESSAGE_SENT' &&
          event.payload.content === '[Session Started] Session One'
      )
    ).toBe(true)
  })

  it('emits first-session recap card from campaign name + description', async () => {
    mocks.prisma.session.findUnique.mockResolvedValue({
      campaignId: '99999999-9999-4999-8999-999999999999',
      campaign: {
        name: 'Shattered Crown',
        description: 'The party is hunting fragments of an ancient crown across haunted ruins.',
      },
    })
    mocks.prisma.session.findFirst.mockResolvedValue(null)

    await emitSessionRecapMessage({
      sessionId: SESSION_ID,
      mainRoomId: MAIN_ROOM_ID,
      dmId: DM_ID,
      dmUsername: 'gm',
    })

    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        roomId: MAIN_ROOM_ID,
        content:
          '[Campaign Brief] Shattered Crown: The party is hunting fragments of an ancient crown across haunted ruins.',
      })
    )
  })

  it('emits dry-humor recap when first-session campaign description is empty', async () => {
    mocks.prisma.session.findUnique.mockResolvedValue({
      campaignId: '99999999-9999-4999-8999-999999999999',
      campaign: {
        name: 'Blank Pages',
        description: '   ',
      },
    })
    mocks.prisma.session.findFirst.mockResolvedValue(null)

    await emitSessionRecapMessage({
      sessionId: SESSION_ID,
      mainRoomId: MAIN_ROOM_ID,
      dmId: DM_ID,
      dmUsername: 'gm',
    })

    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        roomId: MAIN_ROOM_ID,
        content: expect.stringContaining('[Campaign Brief] Blank Pages:'),
      })
    )
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('description blank'),
      })
    )
  })

  it('uses the shared journal roast when the previous session has no journal entry', async () => {
    mocks.prisma.session.findUnique.mockResolvedValue({
      campaignId: '99999999-9999-4999-8999-999999999999',
      campaign: {
        name: 'Shattered Crown',
        description: 'The party is hunting fragments of an ancient crown across haunted ruins.',
      },
    })
    mocks.prisma.session.findFirst.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      name: 'Session 24 - 2026-05-13',
    })
    mocks.prisma.note.findMany.mockResolvedValue([])

    await emitSessionRecapMessage({
      sessionId: SESSION_ID,
      mainRoomId: MAIN_ROOM_ID,
      dmId: DM_ID,
      dmUsername: 'gm',
    })

    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        roomId: MAIN_ROOM_ID,
        content: `[Last Session] ${getPlayerPerspectiveJournalRoast('55555555-5555-4555-8555-555555555555', 'Session 24 - 2026-05-13')}`,
      })
    )
  })

  it('queries previous terminal session with deterministic tie-breakers', async () => {
    mocks.prisma.session.findUnique.mockResolvedValue({
      campaignId: '99999999-9999-4999-8999-999999999999',
      campaign: {
        name: 'Shattered Crown',
        description: '',
      },
    })
    mocks.prisma.session.findFirst.mockResolvedValue({
      id: '66666666-6666-4666-8666-666666666666',
      name: 'Session 25 - 2026-05-13',
    })
    mocks.prisma.note.findMany.mockResolvedValue([])

    await emitSessionRecapMessage({
      sessionId: SESSION_ID,
      mainRoomId: MAIN_ROOM_ID,
      dmId: DM_ID,
      dmUsername: 'gm',
    })

    expect(mocks.prisma.session.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          state: { in: ['ENDED', 'CLEANUP'] },
        }),
        orderBy: [
          { endedAt: 'desc' },
          { startedAt: 'desc' },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
      })
    )
  })

  it('broadcasts recap events when a previous journal exists and skips warning-free path', async () => {
    const wsManager = {
      broadcastEventToSession: vi.fn(),
    }

    mocks.prisma.session.findUnique.mockResolvedValue({
      campaignId: '99999999-9999-4999-8999-999999999999',
      campaign: {
        name: 'Shattered Crown',
        description: 'The party is hunting fragments of an ancient crown across haunted ruins.',
      },
    })
    mocks.prisma.session.findFirst.mockResolvedValue({
      id: '77777777-7777-4777-8777-777777777777',
      name: 'Session 26 - 2026-05-20',
    })
    mocks.prisma.note.findMany.mockResolvedValue([
      {
        title: 'Session Journal',
        content: 'The party escaped the ruins. They recovered one fragment.',
        tags: [],
      },
    ])

    await emitSessionRecapMessage({
      sessionId: SESSION_ID,
      mainRoomId: MAIN_ROOM_ID,
      dmId: DM_ID,
      dmUsername: 'gm',
      wsManager: wsManager as any,
    })

    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        roomId: MAIN_ROOM_ID,
        content: '[Last Session] The party escaped the ruins. They recovered one fragment.',
      })
    )
    expect(wsManager.broadcastEventToSession).toHaveBeenCalledTimes(1)
    expect(wsManager.broadcastEventToSession).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({
        type: 'CHAT:MESSAGE_SENT',
        sessionId: SESSION_ID,
        roomId: MAIN_ROOM_ID,
        payload: expect.objectContaining({
          content: '[Last Session] The party escaped the ruins. They recovered one fragment.',
        }),
      })
    )
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('warns and skips broadcast when a stored recap message is missing sessionId', async () => {
    const wsManager = {
      broadcastEventToSession: vi.fn(),
    }

    mocks.prisma.session.findUnique.mockResolvedValue({
      campaignId: '99999999-9999-4999-8999-999999999999',
      campaign: {
        name: 'Shattered Crown',
        description: null,
      },
    })
    mocks.prisma.session.findFirst.mockResolvedValue(null)
    mocks.sendMessage.mockResolvedValueOnce({
      id: '88888888-8888-4888-8888-888888888888',
      sessionId: undefined,
      roomId: MAIN_ROOM_ID,
      authorId: DM_ID,
      authorUsername: 'gm',
      content:
        "[Campaign Brief] Shattered Crown: The DM left the campaign description blank, so we'll call this a bold commitment to improvisation.",
      type: 'SYSTEM',
      isDmOnly: false,
      createdAt: 1,
    })

    await emitSessionRecapMessage({
      sessionId: SESSION_ID,
      mainRoomId: MAIN_ROOM_ID,
      dmId: DM_ID,
      dmUsername: 'gm',
      wsManager: wsManager as any,
    })

    expect(logger.warn).toHaveBeenCalledWith('System message stored without sessionId', {
      messageId: '88888888-8888-4888-8888-888888888888',
    })
    expect(wsManager.broadcastEventToSession).not.toHaveBeenCalled()
  })

  it('deduplicates boundary room ids and falls back to a session-scoped boundary when none are provided', async () => {
    await emitSessionBoundarySystemMessage({
      sessionId: SESSION_ID,
      roomIds: [MAIN_ROOM_ID, MAIN_ROOM_ID],
      sessionName: 'Session One',
      boundaryType: 'SESSION_PAUSED',
      dmId: DM_ID,
      dmUsername: 'gm',
    })

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1)
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: MAIN_ROOM_ID,
        content: '[Session Paused] Session One',
      })
    )

    vi.clearAllMocks()

    await emitSessionBoundarySystemMessage({
      sessionId: SESSION_ID,
      sessionName: 'Session One',
      boundaryType: 'SESSION_ENDED',
      dmId: DM_ID,
      dmUsername: 'gm',
    })

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1)
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: undefined,
        content: '[Session Ended] Session One',
      })
    )
  })
})

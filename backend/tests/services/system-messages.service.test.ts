import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
}))

vi.mock('@/services/chat.service', () => ({
  sendMessage: mocks.sendMessage,
}))

import type { UUID } from '@shared'
import { emitSessionBoundarySystemMessage } from '@/services/system-messages.service'

const SESSION_ID = '11111111-1111-4111-8111-111111111111' as UUID
const DM_ID = '22222222-2222-4222-8222-222222222222' as UUID
const MAIN_ROOM_ID = '33333333-3333-4333-8333-333333333333' as UUID
const GREEN_ROOM_ID = '44444444-4444-4444-8444-444444444444' as UUID

describe('system messages service', () => {
  beforeEach(() => {
    vi.clearAllMocks()

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
})

import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageType, Role, RoomType, SessionState } from '@shared'
import type { UUID } from '@shared'
import { SessionWorkspaceCenterPane } from '@/components/workspaces/session/CenterPane'
import { useStore } from '../../src/state/store'

const chatWindowSpy = vi.fn()

vi.mock('@/components/workspaces/session/chat/ChatWindow', () => ({
  ChatWindow: (props: unknown) => {
    chatWindowSpy(props)
    return <div data-testid="chat-window" />
  },
}))

const SESSION_ID = '11111111-1111-4111-8111-111111111111' as UUID
const ROOM_ID = '22222222-2222-4222-8222-222222222222' as UUID
const GREENROOM_ID = '44444444-4444-4444-8444-444444444444' as UUID
const CAMPAIGN_ID = '33333333-3333-4333-8333-333333333333' as UUID

function buildProps() {
  return {
    view: 'chat' as const,
    effectiveSessionRole: Role.DM,
    currentSessionState: SessionState.COOLDOWN,
    sessionEndedAt: Date.now(),
    configuredCooldownDurationMs: 60_000,
    apiUrl: 'http://localhost:3000',
    token: 'token',
    currentSessionId: SESSION_ID,
    campaignId: CAMPAIGN_ID,
    effectiveSessionUser: {
      id: ROOM_ID,
      username: 'Morgan',
      role: Role.DM,
    },
    messageGroupingWindowMs: 300000,
    sendWsEvent: undefined,
    onPendingNewMessageCountChange: undefined,
  }
}

describe('SessionWorkspaceCenterPane', () => {
  beforeEach(() => {
    // Seed the store with a MAIN room so useSessionSelectedRoomId resolves it.
    useStore.getState().replaceSessionRooms(SESSION_ID, [
      {
        id: ROOM_ID,
        sessionId: SESSION_ID,
        name: 'Main Room',
        type: RoomType.MAIN,
        createdAt: 1,
      },
    ])
  })

  afterEach(() => {
    useStore.getState().replaceSessionRooms(SESSION_ID, [])
    useStore.getState().setSelectedRoomIdOverride(SESSION_ID, '')
  })

  it('does not force greenroom chat mode during cooldown when the selected room is not greenroom', () => {
    chatWindowSpy.mockClear()

    render(<SessionWorkspaceCenterPane {...buildProps()} />)

    expect(screen.getByTestId('chat-window')).toBeTruthy()
    expect(chatWindowSpy).toHaveBeenCalledTimes(1)
    expect(chatWindowSpy.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        forceMessageType: undefined,
      })
    )
  })

  it('keeps greenroom chat mode when the selected room actually is greenroom', () => {
    chatWindowSpy.mockClear()

    // Seed a "Green Room" room and override selection to it so the component
    // derives isGreenroomChatMode = true from the store.
    useStore.getState().replaceSessionRooms(SESSION_ID, [
      { id: ROOM_ID, sessionId: SESSION_ID, name: 'Main Room', type: RoomType.MAIN, createdAt: 1 },
      {
        id: GREENROOM_ID,
        sessionId: SESSION_ID,
        name: 'Green Room',
        type: RoomType.GROUP,
        createdAt: 1,
      },
    ])
    useStore.getState().setSelectedRoomIdOverride(SESSION_ID, GREENROOM_ID)

    render(<SessionWorkspaceCenterPane {...buildProps()} />)

    expect(chatWindowSpy).toHaveBeenCalledTimes(1)
    expect(chatWindowSpy.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        forceMessageType: MessageType.OOC,
      })
    )
  })
})

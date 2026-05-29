import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MessageType, Role, RoomType, SessionState } from '@shared'
import type { UUID } from '@shared'
import { SessionWorkspaceCenterPane } from '@/components/workspaces/session/CenterPane'

const chatWindowSpy = vi.fn()

vi.mock('@/components/workspaces/session/chat/ChatWindow', () => ({
  ChatWindow: (props: unknown) => {
    chatWindowSpy(props)
    return <div data-testid="chat-window" />
  },
}))

const SESSION_ID = '11111111-1111-4111-8111-111111111111' as UUID
const ROOM_ID = '22222222-2222-4222-8222-222222222222' as UUID
const CAMPAIGN_ID = '33333333-3333-4333-8333-333333333333' as UUID

function buildProps() {
  return {
    view: 'chat' as const,
    effectiveSessionRole: Role.DM,
    currentSessionState: SessionState.COOLDOWN,
    sessionEndedAt: Date.now(),
    configuredCooldownDurationMs: 60_000,
    selectedRoomId: ROOM_ID,
    apiUrl: 'http://localhost:3000',
    token: 'token',
    currentSessionId: SESSION_ID,
    selectedRoom: {
      id: ROOM_ID,
      sessionId: SESSION_ID,
      name: 'Main Room',
      type: RoomType.MAIN,
      createdAt: 1,
    },
    campaignId: CAMPAIGN_ID,
    effectiveSessionUser: {
      id: ROOM_ID,
      username: 'Morgan',
      role: Role.DM,
    },
    messageGroupingWindowMs: 300000,
    sendWsEvent: undefined,
    isGreenroomChatMode: false,
    onPendingNewMessageCountChange: undefined,
  }
}

describe('SessionWorkspaceCenterPane', () => {
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

    render(
      <SessionWorkspaceCenterPane
        {...buildProps()}
        isGreenroomChatMode={true}
        selectedRoom={{
          id: ROOM_ID,
          sessionId: SESSION_ID,
          name: 'Green Room',
          type: RoomType.GROUP,
          createdAt: 1,
        }}
      />
    )

    expect(chatWindowSpy).toHaveBeenCalledTimes(1)
    expect(chatWindowSpy.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        forceMessageType: MessageType.OOC,
      })
    )
  })
})

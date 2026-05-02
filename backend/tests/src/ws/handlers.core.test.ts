import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventEnvelope, UUID } from '@shared'
import { MessageType, NoteVisibility } from '@shared'

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  getSession: vi.fn(),
  loggerDebug: vi.fn(),
}))

vi.mock('@/services/chat.service', () => ({
  sendMessage: mocks.sendMessage,
  editMessage: mocks.editMessage,
  deleteMessage: mocks.deleteMessage,
}))

vi.mock('@/services/notes.service', () => ({
  createNote: mocks.createNote,
  updateNote: mocks.updateNote,
  deleteNote: mocks.deleteNote,
}))

vi.mock('@/services/session.service', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/utils', () => ({
  logger: {
    debug: mocks.loggerDebug,
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

import { chatHandlers, notesHandlers, sessionHandlers } from '@/ws/handlers'

function event(type: string, payload: Record<string, unknown>): EventEnvelope {
  return {
    id: '11111111-1111-4111-8111-111111111111' as UUID,
    type,
    version: 1,
    userId: '22222222-2222-4222-8222-222222222222' as UUID,
    userRole: 'PLAYER' as any,
    sessionId: '33333333-3333-4333-8333-333333333333' as UUID,
    roomId: null,
    timestamp: Date.now(),
    payload,
  }
}

describe('ws handlers core', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSession.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      dmId: '44444444-4444-4444-8444-444444444444',
    })
  })

  it('chat message sent resolves session and calls sendMessage', async () => {
    await chatHandlers.handleMessageSent(
      event('CHAT:MESSAGE_SENT', {
        content: 'hello',
        type: MessageType.OOC,
        authorUsername: 'alice',
      })
    )

    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'hello',
        type: MessageType.OOC,
      })
    )
  })

  it('chat handlers delegate edit and delete when message id exists', async () => {
    await chatHandlers.handleMessageEdited(
      event('CHAT:MESSAGE_EDITED', {
        messageId: '55555555-5555-4555-8555-555555555555',
        newContent: 'new content',
      })
    )

    await chatHandlers.handleMessageDeleted(
      event('CHAT:MESSAGE_DELETED', {
        messageId: '55555555-5555-4555-8555-555555555555',
      })
    )

    expect(mocks.editMessage).toHaveBeenCalledTimes(1)
    expect(mocks.deleteMessage).toHaveBeenCalledTimes(1)
  })

  it('notes handlers create, update, and delete notes with safe defaults', async () => {
    await notesHandlers.handleNoteCreated(
      event('NOTES:CREATED', {
        title: 'note title',
        content: 'note body',
        visibility: NoteVisibility.PLAYERS_VISIBLE,
        tags: ['tag1', 'tag2'],
        allowedUsers: ['66666666-6666-4666-8666-666666666666', 123],
      })
    )

    await notesHandlers.handleNoteUpdated(
      event('NOTES:UPDATED', {
        noteId: '77777777-7777-4777-8777-777777777777',
        title: 'updated title',
        visibility: NoteVisibility.CUSTOM,
        allowedUsers: ['66666666-6666-4666-8666-666666666666'],
      })
    )

    await notesHandlers.handleNoteDeleted(
      event('NOTES:DELETED', {
        noteId: '77777777-7777-4777-8777-777777777777',
      })
    )

    expect(mocks.createNote).toHaveBeenCalledTimes(1)
    expect(mocks.updateNote).toHaveBeenCalledTimes(1)
    expect(mocks.deleteNote).toHaveBeenCalledTimes(1)
  })

  it('session handlers execute and emit handled logs', async () => {
    await sessionHandlers.handleSessionCreated(event('SESSION:CREATED', {}))
    await sessionHandlers.handleSessionStarted(event('SESSION:STARTED', {}))
    await sessionHandlers.handleSessionPaused(event('SESSION:PAUSED', {}))
    await sessionHandlers.handleSessionResumed(event('SESSION:RESUMED', {}))
    await sessionHandlers.handleSessionEnded(event('SESSION:ENDED', {}))

    expect(mocks.loggerDebug).toHaveBeenCalledTimes(5)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventEnvelope, UUID } from '@shared'

const mocks = vi.hoisted(() => ({
  setRoomEnvironmentState: vi.fn(),
  applyDMOverrideState: vi.fn(),
  removeDMOverrideState: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock('@/services/audio-state.service', () => ({
  setRoomEnvironmentState: mocks.setRoomEnvironmentState,
  applyDMOverrideState: mocks.applyDMOverrideState,
  removeDMOverrideState: mocks.removeDMOverrideState,
}))

vi.mock('@/utils', () => ({
  logger: {
    info: mocks.loggerInfo,
    error: mocks.loggerError,
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

import { audioHandlers } from '@/ws/handlers/audio.handler'

const BASE_EVENT: EventEnvelope = {
  id: '11111111-1111-4111-8111-111111111111' as UUID,
  type: 'AUDIO:ENVIRONMENT_SET',
  version: 1,
  userId: '22222222-2222-4222-8222-222222222222' as UUID,
  userRole: 'DM' as any,
  sessionId: '33333333-3333-4333-8333-333333333333' as UUID,
  roomId: null,
  timestamp: Date.now(),
  payload: {},
}

describe('audio ws handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('persists environment set events', async () => {
    await audioHandlers.handleEnvironmentSet({
      ...BASE_EVENT,
      payload: {
        environmentId: 'env-cave',
        environmentName: 'cave',
        roomId: '44444444-4444-4444-8444-444444444444',
        setBy: '55555555-5555-4555-8555-555555555555',
        setAt: 1700000000000,
      },
    })

    expect(mocks.setRoomEnvironmentState).toHaveBeenCalledTimes(1)
    expect(mocks.loggerInfo).toHaveBeenCalled()
  })

  it('persists dm override applied events', async () => {
    await audioHandlers.handleDMOverrideApplied({
      ...BASE_EVENT,
      type: 'AUDIO:DM_OVERRIDE_APPLIED',
      payload: {
        targetUserId: '66666666-6666-4666-8666-666666666666',
        dmId: '55555555-5555-4555-8555-555555555555',
        overrideType: 'MUTE',
        appliedAt: 1700000000100,
      },
    })

    expect(mocks.applyDMOverrideState).toHaveBeenCalledTimes(1)
  })

  it('persists dm override removed events', async () => {
    await audioHandlers.handleDMOverrideRemoved({
      ...BASE_EVENT,
      type: 'AUDIO:DM_OVERRIDE_REMOVED',
      payload: {
        targetUserId: '66666666-6666-4666-8666-666666666666',
        dmId: '55555555-5555-4555-8555-555555555555',
        overrideType: 'MUTE',
        removedAt: 1700000000200,
      },
    })

    expect(mocks.removeDMOverrideState).toHaveBeenCalledTimes(1)
  })

  it('logs errors from effect handler failures', async () => {
    mocks.loggerInfo.mockImplementation(() => {
      throw new Error('log failed')
    })

    await audioHandlers.handleEffectApplied({
      ...BASE_EVENT,
      type: 'AUDIO:EFFECT_APPLIED',
      payload: {
        effectId: 'effect-1',
        effectName: 'reverb',
        appliedBy: '55555555-5555-4555-8555-555555555555',
        appliedAt: 1700000000300,
      },
    })

    expect(mocks.loggerError).toHaveBeenCalledWith(
      'audio',
      expect.stringContaining('Error handling AUDIO:EFFECT_APPLIED')
    )
  })
})

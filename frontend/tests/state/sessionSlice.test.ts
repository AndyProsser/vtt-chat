import { beforeEach, describe, expect, it } from 'vitest'
import type { EventEnvelope } from '@shared'
import type { UUID } from '@shared'
import { useStore } from '../../src/state/store'
import type { Session } from '@/types/session'

const SESSION_ID_1 = '11111111-1111-4111-8111-111111111111' as UUID
const SESSION_ID_2 = '22222222-2222-4222-8222-222222222222' as UUID
const DM_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' as UUID
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
    userId: DM_ID as any,
    userRole: 'DM' as any,
    sessionId: sessionId as any,
    roomId: null,
    timestamp: NOW,
    payload,
  }
}

const SAMPLE_SESSION: Session = {
  id: SESSION_ID_1,
  name: 'Test Campaign',
  dmId: DM_ID,
  state: 'IDLE' as any,
  createdAt: NOW,
}

describe('sessionSlice', () => {
  beforeEach(() => {
    useStore.getState().reset()
  })

  // ── Direct actions ─────────────────────────────────────────────────────────

  describe('createSession', () => {
    it('adds a session to the store', () => {
      useStore.getState().createSession(SAMPLE_SESSION)
      expect(useStore.getState().sessions[SESSION_ID_1]).toEqual(SAMPLE_SESSION)
    })

    it('can store multiple sessions', () => {
      const second: Session = { ...SAMPLE_SESSION, id: SESSION_ID_2, name: 'Second' }
      useStore.getState().createSession(SAMPLE_SESSION)
      useStore.getState().createSession(second)
      expect(Object.keys(useStore.getState().sessions)).toHaveLength(2)
    })
  })

  describe('replaceSessions', () => {
    it('replaces all sessions with the provided list', () => {
      useStore.getState().createSession(SAMPLE_SESSION)
      const replacement: Session = { ...SAMPLE_SESSION, id: SESSION_ID_2, name: 'Replaced' }
      useStore.getState().replaceSessions([replacement])
      expect(Object.keys(useStore.getState().sessions)).toHaveLength(1)
      expect(useStore.getState().sessions[SESSION_ID_2]).toBeDefined()
      expect(useStore.getState().sessions[SESSION_ID_1]).toBeUndefined()
    })

    it('sets to empty object when passed empty array', () => {
      useStore.getState().createSession(SAMPLE_SESSION)
      useStore.getState().replaceSessions([])
      expect(useStore.getState().sessions).toEqual({})
    })

    it('hydrates cooldownExtensionCount and leaves extend disabled after refresh when count is capped', () => {
      useStore.getState().replaceSessions([
        {
          ...SAMPLE_SESSION,
          state: 'COOLDOWN' as any,
          cooldownExtensionCount: 3,
        },
      ])

      const hydratedCount = useStore.getState().cooldownExtensionCounts[SESSION_ID_1]
      expect(hydratedCount).toBe(3)

      // Workspaces computes canExtendCooldown as canManageCooldown && count < 3.
      const canManageCooldown = true
      const canExtendCooldown = Boolean(canManageCooldown) && (hydratedCount ?? 0) < 3
      expect(canExtendCooldown).toBe(false)
    })
  })

  describe('updateSession', () => {
    it('updates session fields', () => {
      useStore.getState().createSession(SAMPLE_SESSION)
      useStore.getState().updateSession(SESSION_ID_1, { name: 'Renamed Campaign' })
      expect(useStore.getState().sessions[SESSION_ID_1]!.name).toBe('Renamed Campaign')
    })

    it('does not overwrite other sessions', () => {
      const second: Session = { ...SAMPLE_SESSION, id: SESSION_ID_2 }
      useStore.getState().createSession(SAMPLE_SESSION)
      useStore.getState().createSession(second)
      useStore.getState().updateSession(SESSION_ID_1, { name: 'Modified' })
      expect(useStore.getState().sessions[SESSION_ID_2]!.name).toBe(SAMPLE_SESSION.name)
    })
  })

  describe('removeSession', () => {
    it('removes the specified session', () => {
      useStore.getState().createSession(SAMPLE_SESSION)
      useStore.getState().removeSession(SESSION_ID_1)
      expect(useStore.getState().sessions[SESSION_ID_1]).toBeUndefined()
    })

    it('clears currentSessionId if it matches', () => {
      useStore.getState().createSession(SAMPLE_SESSION)
      useStore.getState().setCurrentSession(SESSION_ID_1)
      useStore.getState().removeSession(SESSION_ID_1)
      expect(useStore.getState().currentSessionId).toBeNull()
    })

    it('preserves currentSessionId if a different session is removed', () => {
      const second: Session = { ...SAMPLE_SESSION, id: SESSION_ID_2 }
      useStore.getState().createSession(SAMPLE_SESSION)
      useStore.getState().createSession(second)
      useStore.getState().setCurrentSession(SESSION_ID_1)
      useStore.getState().removeSession(SESSION_ID_2)
      expect(useStore.getState().currentSessionId).toBe(SESSION_ID_1)
    })
  })

  describe('setCurrentSession', () => {
    it('sets the current session id', () => {
      useStore.getState().setCurrentSession(SESSION_ID_1)
      expect(useStore.getState().currentSessionId).toBe(SESSION_ID_1)
    })

    it('can be set to null', () => {
      useStore.getState().setCurrentSession(SESSION_ID_1)
      useStore.getState().setCurrentSession(null)
      expect(useStore.getState().currentSessionId).toBeNull()
    })
  })

  describe('clearSessions', () => {
    it('empties sessions and clears currentSessionId', () => {
      useStore.getState().createSession(SAMPLE_SESSION)
      useStore.getState().setCurrentSession(SESSION_ID_1)
      useStore.getState().clearSessions()
      expect(useStore.getState().sessions).toEqual({})
      expect(useStore.getState().currentSessionId).toBeNull()
    })
  })

  // ── Event handlers ─────────────────────────────────────────────────────────

  describe('handleSessionCreated', () => {
    it('adds session from event payload', () => {
      const event = makeEvent('SESSION:CREATED', SESSION_ID_1, {
        id: SESSION_ID_1,
        name: 'New Campaign',
        dmId: DM_ID,
        description: 'Desc',
      })
      useStore.getState().handleSessionCreated(event)
      const session = useStore.getState().sessions[SESSION_ID_1]
      expect(session).toBeDefined()
      expect(session!.name).toBe('New Campaign')
      expect(session!.state).toBe('IDLE')
      expect(session!.createdAt).toBe(NOW)
    })
  })

  describe('handleSessionStateChanged', () => {
    it('updates session state to ACTIVE and stamps startedAt', () => {
      useStore.getState().createSession(SAMPLE_SESSION)
      const event = makeEvent('SESSION:STATE_CHANGED', SESSION_ID_1, { state: 'ACTIVE' })
      useStore.getState().handleSessionStateChanged(event)
      const session = useStore.getState().sessions[SESSION_ID_1]
      expect(session!.state).toBe('ACTIVE')
      expect(session!.startedAt).toBe(NOW)
    })

    it('updates session state to PAUSED and stamps pausedAt', () => {
      useStore.getState().createSession(SAMPLE_SESSION)
      const event = makeEvent('SESSION:STATE_CHANGED', SESSION_ID_1, { state: 'PAUSED' })
      useStore.getState().handleSessionStateChanged(event)
      const session = useStore.getState().sessions[SESSION_ID_1]
      expect(session!.state).toBe('PAUSED')
      expect(session!.pausedAt).toBe(NOW)
    })

    it('updates session state to ENDED and stamps endedAt', () => {
      useStore.getState().createSession(SAMPLE_SESSION)
      const event = makeEvent('SESSION:STATE_CHANGED', SESSION_ID_1, { state: 'ENDED' })
      useStore.getState().handleSessionStateChanged(event)
      const session = useStore.getState().sessions[SESSION_ID_1]
      expect(session!.state).toBe('ENDED')
      expect(session!.endedAt).toBe(NOW)
    })

    it('does not reset startedAt when resuming from PAUSED to ACTIVE', () => {
      useStore.getState().createSession({
        ...SAMPLE_SESSION,
        state: 'PAUSED' as any,
        startedAt: NOW - 5_000,
      })

      const event = makeEvent('SESSION:STATE_CHANGED', SESSION_ID_1, { state: 'ACTIVE' })
      useStore.getState().handleSessionStateChanged(event)

      const session = useStore.getState().sessions[SESSION_ID_1]
      expect(session!.state).toBe('ACTIVE')
      expect(session!.startedAt).toBe(NOW - 5_000)
    })

    it('resets pause stats on a fresh ACTIVE start from IDLE', () => {
      useStore.getState().createSession(SAMPLE_SESSION)
      useStore.getState().hydrateSessionPauseStats({
        ...SAMPLE_SESSION,
        cumulativePauseMs: 12_000,
        pauseCount: 2,
        pauseStartedAt: NOW - 3_000,
      })

      const event = makeEvent('SESSION:STATE_CHANGED', SESSION_ID_1, { state: 'ACTIVE' })
      useStore.getState().handleSessionStateChanged(event)

      const stats = useStore.getState().pauseStats[SESSION_ID_1]
      expect(stats).toEqual({
        cumulativePauseMs: 0,
        pauseCount: 0,
        pauseStartedAt: undefined,
      })
    })
  })

  describe('handleSessionCooldownStarted', () => {
    it('moves session into COOLDOWN and sets endedAt/cooldownExpiresAt from payload', () => {
      useStore.getState().createSession({ ...SAMPLE_SESSION, state: 'ACTIVE' as any })
      const event = makeEvent('SESSION:COOLDOWN_STARTED', SESSION_ID_1, {
        cooldownStartedAt: NOW + 1000,
        cooldownExpiresAt: NOW + 61_000,
      })
      useStore.getState().handleSessionCooldownStarted(event)
      const session = useStore.getState().sessions[SESSION_ID_1]
      expect(session!.state).toBe('COOLDOWN')
      expect(session!.endedAt).toBe(NOW + 1000)
      expect(session!.cooldownExpiresAt).toBe(NOW + 61_000)
    })

    it('is a no-op when the session does not exist', () => {
      const UNKNOWN_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff' as UUID
      const event = makeEvent('SESSION:COOLDOWN_STARTED', UNKNOWN_ID, {})
      useStore.getState().handleSessionCooldownStarted(event)
      expect(useStore.getState().sessions[UNKNOWN_ID]).toBeUndefined()
    })
  })

  describe('handleSessionCooldownExtended', () => {
    it('moves session into COOLDOWN and updates endedAt/cooldownExpiresAt from WS payload', () => {
      useStore.getState().createSession({
        ...SAMPLE_SESSION,
        state: 'ENDED' as any,
        endedAt: NOW,
      })

      const event = makeEvent('SESSION:COOLDOWN_EXTENDED', SESSION_ID_1, {
        state: 'ENDED',
        endedAt: NOW + 60_000,
        cooldownExpiresAt: NOW + 120_000,
      })

      useStore.getState().handleSessionCooldownExtended(event)

      const session = useStore.getState().sessions[SESSION_ID_1]
      expect(session!.state).toBe('COOLDOWN')
      expect(session!.endedAt).toBe(NOW + 60_000)
      expect(session!.cooldownExpiresAt).toBe(NOW + 120_000)
    })

    it('falls back to current endedAt when payload.endedAt is null', () => {
      useStore.getState().createSession({
        ...SAMPLE_SESSION,
        state: 'ENDED' as any,
        endedAt: NOW + 9999,
      })
      const event = makeEvent('SESSION:COOLDOWN_EXTENDED', SESSION_ID_1, { endedAt: null })
      useStore.getState().handleSessionCooldownExtended(event)
      const session = useStore.getState().sessions[SESSION_ID_1]
      expect(session!.endedAt).toBe(NOW + 9999)
    })

    it('is a no-op when the session does not exist', () => {
      // Use a session id that was never created
      const UNKNOWN_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff' as UUID
      const event = makeEvent('SESSION:COOLDOWN_EXTENDED', UNKNOWN_ID, { endedAt: NOW })
      useStore.getState().handleSessionCooldownExtended(event)
      expect(useStore.getState().sessions[UNKNOWN_ID]).toBeUndefined()
    })
  })

  describe('handleSessionEnded', () => {
    it('marks session as ENDED and stamps endedAt', () => {
      useStore.getState().createSession(SAMPLE_SESSION)
      const event = makeEvent('SESSION:ENDED', SESSION_ID_1, {})
      useStore.getState().handleSessionEnded(event)
      const session = useStore.getState().sessions[SESSION_ID_1]
      expect(session!.state).toBe('ENDED')
      expect(session!.endedAt).toBe(NOW)
    })
  })
})

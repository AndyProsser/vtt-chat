import { beforeEach, describe, expect, it } from 'vitest'
import type { UUID } from '@shared'
import { PresenceState } from '@shared'
import { useStore } from '../../src/state/store'
import type { SessionPresence } from '../../src/types/room'

const SESSION_ID = '11111111-1111-4111-8111-111111111111' as UUID
const USER_ID_1 = '22222222-2222-4222-8222-222222222222' as UUID
const USER_ID_2 = '33333333-3333-4333-8333-333333333333' as UUID
const ROOM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID
const ROOM_ID_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as UUID
const NOW = 1700000000000

function makePresence(overrides: Partial<SessionPresence> = {}): SessionPresence {
  return {
    userId: USER_ID_1,
    username: 'alice',
    state: PresenceState.ONLINE,
    primaryRoomId: ROOM_ID,
    lastSeenAt: NOW,
    ...overrides,
  }
}

describe('presenceSlice', () => {
  beforeEach(() => {
    useStore.setState({
      sessionPresence: {},
      sessionStatsBySessionId: {},
      presenceSpeakingBySession: {},
      presenceLkSpeakingBySession: {},
    })
  })

  describe('replaceSessionPresenceMap', () => {
    it('rebuilds WS speaking tracker from snapshot presence states', () => {
      useStore.getState().replaceSessionPresenceMap(SESSION_ID, {
        [USER_ID_1]: makePresence({ userId: USER_ID_1, state: PresenceState.SPEAKING }),
        [USER_ID_2]: makePresence({
          userId: USER_ID_2,
          username: 'bob',
          state: PresenceState.ONLINE,
          primaryRoomId: ROOM_ID_2,
        }),
      })

      expect(useStore.getState().presenceSpeakingBySession[SESSION_ID]?.[USER_ID_1]).toBe(true)
      expect(useStore.getState().presenceSpeakingBySession[SESSION_ID]?.[USER_ID_2]).toBeUndefined()

      useStore.getState().replaceSessionPresenceMap(SESSION_ID, {
        [USER_ID_1]: makePresence({ userId: USER_ID_1, state: PresenceState.ONLINE }),
      })

      expect(useStore.getState().presenceSpeakingBySession[SESSION_ID]).toBeUndefined()
    })
  })

  // ── upsertSessionPresenceOnJoin ───────────────────────────────────────────

  describe('upsertSessionPresenceOnJoin', () => {
    it('adds a new presence entry on first join', () => {
      useStore.getState().upsertSessionPresenceOnJoin({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        username: 'alice',
        roomId: ROOM_ID,
        joinedAt: NOW,
      })
      const presence = useStore.getState().sessionPresence[SESSION_ID]?.[USER_ID_1]
      expect(presence).toBeDefined()
      expect(presence!.username).toBe('alice')
      expect(presence!.state).toBe(PresenceState.ONLINE)
      expect(presence!.primaryRoomId).toBe(ROOM_ID)
      expect(presence!.lastSeenAt).toBe(NOW)
    })

    it('preserves existing fields not in join payload', () => {
      useStore.getState().upsertSessionPresenceOnJoin({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        username: 'alice',
        roomId: ROOM_ID,
        joinedAt: NOW,
        characterName: 'Aldric',
      })
      // Join again without characterName
      useStore.getState().upsertSessionPresenceOnJoin({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        username: 'alice',
        roomId: ROOM_ID_2,
        joinedAt: NOW + 1000,
      })
      const presence = useStore.getState().sessionPresence[SESSION_ID]?.[USER_ID_1]
      expect(presence!.characterName).toBe('Aldric')
      expect(presence!.primaryRoomId).toBe(ROOM_ID_2)
    })

    it('applies optional character profile fields', () => {
      useStore.getState().upsertSessionPresenceOnJoin({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        username: 'alice',
        roomId: ROOM_ID,
        joinedAt: NOW,
        playerName: 'Alice Player',
        characterName: 'Aldric',
        characterClass: 'Wizard',
        characterSubclass: 'Evocation',
        characterRace: 'Elf',
        level: 5,
        characterStats: { strength: 10 },
        avatarUrl: 'https://example.com/avatar.png',
      })
      const presence = useStore.getState().sessionPresence[SESSION_ID]?.[USER_ID_1]
      expect(presence!.playerName).toBe('Alice Player')
      expect(presence!.characterName).toBe('Aldric')
      expect(presence!.characterClass).toBe('Wizard')
      expect(presence!.level).toBe(5)
      expect(presence!.avatarUrl).toBe('https://example.com/avatar.png')
    })

    it('clears stale ghost mode when user joins a room again', () => {
      useStore.getState().upsertSessionPresenceOnJoin({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        username: 'alice',
        roomId: ROOM_ID,
        joinedAt: NOW,
      })

      useStore.getState().applySessionPresenceStateChange({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        state: PresenceState.ONLINE,
        changedAt: NOW + 100,
        ghost: true,
      })

      useStore.getState().upsertSessionPresenceOnJoin({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        username: 'alice',
        roomId: ROOM_ID_2,
        joinedAt: NOW + 200,
      })

      const presence = useStore.getState().sessionPresence[SESSION_ID]?.[USER_ID_1]
      expect(presence!.ghost).toBe(false)
      expect(presence!.primaryRoomId).toBe(ROOM_ID_2)
    })
  })

  // ── markSessionPresenceOnLeft ─────────────────────────────────────────────

  describe('markSessionPresenceOnLeft', () => {
    it('marks an existing user as IDLE on leave', () => {
      useStore.getState().upsertSessionPresenceOnJoin({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        username: 'alice',
        roomId: ROOM_ID,
        joinedAt: NOW,
      })
      useStore
        .getState()
        .markSessionPresenceOnLeft({ sessionId: SESSION_ID, userId: USER_ID_1, leftAt: NOW + 5000 })
      const presence = useStore.getState().sessionPresence[SESSION_ID]?.[USER_ID_1]
      expect(presence!.state).toBe(PresenceState.IDLE)
      expect(presence!.primaryRoomId).toBeUndefined()
      expect(presence!.lastSeenAt).toBe(NOW + 5000)
    })

    it('creates a minimal IDLE entry for unknown user on leave', () => {
      useStore.getState().markSessionPresenceOnLeft({
        sessionId: SESSION_ID,
        userId: USER_ID_2,
        leftAt: NOW,
      })
      const presence = useStore.getState().sessionPresence[SESSION_ID]?.[USER_ID_2]
      expect(presence).toBeDefined()
      expect(presence!.state).toBe(PresenceState.IDLE)
      expect(presence!.username).toBe('')
    })
  })

  // ── applySessionPresenceStateChange ──────────────────────────────────────

  describe('applySessionPresenceStateChange', () => {
    it('updates presence state and roomId', () => {
      useStore.getState().upsertSessionPresenceOnJoin({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        username: 'alice',
        roomId: ROOM_ID,
        joinedAt: NOW,
      })
      useStore.getState().applySessionPresenceStateChange({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        state: PresenceState.SPEAKING,
        changedAt: NOW + 1000,
        roomId: ROOM_ID_2,
      })
      const presence = useStore.getState().sessionPresence[SESSION_ID]?.[USER_ID_1]
      expect(presence!.state).toBe(PresenceState.SPEAKING)
      expect(presence!.primaryRoomId).toBe(ROOM_ID_2)
      expect(presence!.lastSeenAt).toBe(NOW + 1000)
    })

    it('preserves existing roomId when no roomId provided', () => {
      useStore.getState().upsertSessionPresenceOnJoin({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        username: 'alice',
        roomId: ROOM_ID,
        joinedAt: NOW,
      })
      useStore.getState().applySessionPresenceStateChange({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        state: PresenceState.TYPING,
        changedAt: NOW + 1000,
      })
      const presence = useStore.getState().sessionPresence[SESSION_ID]?.[USER_ID_1]
      expect(presence!.primaryRoomId).toBe(ROOM_ID)
    })

    it('sets ghost mode', () => {
      useStore.getState().upsertSessionPresenceOnJoin({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        username: 'alice',
        roomId: ROOM_ID,
        joinedAt: NOW,
      })
      useStore.getState().applySessionPresenceStateChange({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        state: PresenceState.ONLINE,
        changedAt: NOW + 1000,
        ghost: true,
      })
      const presence = useStore.getState().sessionPresence[SESSION_ID]?.[USER_ID_1]
      expect(presence!.ghost).toBe(true)
    })

    it('defaults ghost to false when not specified and no existing ghost', () => {
      useStore.getState().applySessionPresenceStateChange({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        state: PresenceState.ONLINE,
        changedAt: NOW,
      })
      const presence = useStore.getState().sessionPresence[SESSION_ID]?.[USER_ID_1]
      expect(presence!.ghost).toBe(false)
    })

    it('updates character profile fields when provided', () => {
      useStore.getState().upsertSessionPresenceOnJoin({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        username: 'alice',
        roomId: ROOM_ID,
        joinedAt: NOW,
        characterName: 'Old Name',
      })
      useStore.getState().applySessionPresenceStateChange({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        state: PresenceState.ONLINE,
        changedAt: NOW + 1000,
        characterName: 'New Name',
        characterClass: 'Rogue',
        level: 10,
      })
      const presence = useStore.getState().sessionPresence[SESSION_ID]?.[USER_ID_1]
      expect(presence!.characterName).toBe('New Name')
      expect(presence!.characterClass).toBe('Rogue')
      expect(presence!.level).toBe(10)
    })

    it('clears character field to undefined when explicitly set to null', () => {
      useStore.getState().upsertSessionPresenceOnJoin({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        username: 'alice',
        roomId: ROOM_ID,
        joinedAt: NOW,
        characterName: 'Aldric',
      })
      useStore.getState().applySessionPresenceStateChange({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        state: PresenceState.ONLINE,
        changedAt: NOW + 1000,
        characterName: null,
      })
      const presence = useStore.getState().sessionPresence[SESSION_ID]?.[USER_ID_1]
      expect(presence!.characterName).toBeUndefined()
    })

    it('preserves existing character fields when not provided in update', () => {
      useStore.getState().upsertSessionPresenceOnJoin({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        username: 'alice',
        roomId: ROOM_ID,
        joinedAt: NOW,
        characterName: 'Aldric',
        characterRace: 'Elf',
      })
      useStore.getState().applySessionPresenceStateChange({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        state: PresenceState.ONLINE,
        changedAt: NOW + 1000,
        // no characterName or characterRace
      })
      const presence = useStore.getState().sessionPresence[SESSION_ID]?.[USER_ID_1]
      expect(presence!.characterName).toBe('Aldric')
      expect(presence!.characterRace).toBe('Elf')
    })
  })

  // ── applySessionPresenceProfileUpdate ────────────────────────────────────

  describe('applySessionPresenceProfileUpdate', () => {
    it('updates profile fields without changing state', () => {
      useStore.getState().upsertSessionPresenceOnJoin({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        username: 'alice',
        roomId: ROOM_ID,
        joinedAt: NOW,
      })
      useStore.getState().applySessionPresenceProfileUpdate({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        updatedAt: NOW + 1000,
        playerName: 'Alice Player',
        characterName: 'Aldric',
        level: 7,
      })
      const presence = useStore.getState().sessionPresence[SESSION_ID]?.[USER_ID_1]
      expect(presence!.playerName).toBe('Alice Player')
      expect(presence!.characterName).toBe('Aldric')
      expect(presence!.level).toBe(7)
      expect(presence!.state).toBe(PresenceState.ONLINE)
    })

    it('preserves existing roomId when none provided', () => {
      useStore.getState().upsertSessionPresenceOnJoin({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        username: 'alice',
        roomId: ROOM_ID,
        joinedAt: NOW,
      })
      useStore.getState().applySessionPresenceProfileUpdate({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        updatedAt: NOW + 1000,
      })
      const presence = useStore.getState().sessionPresence[SESSION_ID]?.[USER_ID_1]
      expect(presence!.primaryRoomId).toBe(ROOM_ID)
    })

    it('updates username when provided', () => {
      useStore.getState().applySessionPresenceProfileUpdate({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        username: 'bob_updated',
        updatedAt: NOW,
      })
      const presence = useStore.getState().sessionPresence[SESSION_ID]?.[USER_ID_1]
      expect(presence!.username).toBe('bob_updated')
    })

    it('updates previousGroupId when provided', () => {
      useStore.getState().upsertSessionPresenceOnJoin({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        username: 'alice',
        roomId: ROOM_ID,
        joinedAt: NOW,
      })
      useStore.getState().applySessionPresenceProfileUpdate({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        updatedAt: NOW + 1000,
        previousGroupId: ROOM_ID_2,
      })
      const presence = useStore.getState().sessionPresence[SESSION_ID]?.[USER_ID_1]
      expect(presence!.previousGroupId).toBe(ROOM_ID_2)
    })
  })

  // ── applySessionRoomTransitionPresence ────────────────────────────────────

  describe('applySessionRoomTransitionPresence', () => {
    it('moves all listed users to target room and state', () => {
      useStore.getState().upsertSessionPresenceOnJoin({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        username: 'alice',
        roomId: ROOM_ID,
        joinedAt: NOW,
      })
      useStore.getState().upsertSessionPresenceOnJoin({
        sessionId: SESSION_ID,
        userId: USER_ID_2,
        username: 'bob',
        roomId: ROOM_ID,
        joinedAt: NOW,
      })
      useStore.getState().applySessionRoomTransitionPresence({
        sessionId: SESSION_ID,
        users: [
          { userId: USER_ID_1, username: 'alice' },
          { userId: USER_ID_2, username: 'bob' },
        ],
        targetRoomId: ROOM_ID_2,
        targetState: PresenceState.ONLINE,
        changedAt: NOW + 5000,
      })
      const p1 = useStore.getState().sessionPresence[SESSION_ID]?.[USER_ID_1]
      const p2 = useStore.getState().sessionPresence[SESSION_ID]?.[USER_ID_2]
      expect(p1!.primaryRoomId).toBe(ROOM_ID_2)
      expect(p2!.primaryRoomId).toBe(ROOM_ID_2)
      expect(p1!.state).toBe(PresenceState.ONLINE)
    })

    it('creates new presence entry for unknown users in transition', () => {
      useStore.getState().applySessionRoomTransitionPresence({
        sessionId: SESSION_ID,
        users: [{ userId: USER_ID_1, username: 'newuser' }],
        targetRoomId: ROOM_ID,
        targetState: PresenceState.ONLINE,
        changedAt: NOW,
      })
      const presence = useStore.getState().sessionPresence[SESSION_ID]?.[USER_ID_1]
      expect(presence).toBeDefined()
      expect(presence!.username).toBe('newuser')
    })

    it('preserves previousGroupId from existing presence', () => {
      useStore.getState().upsertSessionPresenceOnJoin({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        username: 'alice',
        roomId: ROOM_ID,
        joinedAt: NOW,
      })
      // Set previousGroupId
      useStore.getState().applySessionPresenceStateChange({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        state: PresenceState.ONLINE,
        changedAt: NOW,
        previousGroupId: ROOM_ID,
      })
      useStore.getState().applySessionRoomTransitionPresence({
        sessionId: SESSION_ID,
        users: [{ userId: USER_ID_1, username: 'alice' }],
        targetRoomId: ROOM_ID_2,
        targetState: PresenceState.ONLINE,
        changedAt: NOW + 1000,
      })
      const presence = useStore.getState().sessionPresence[SESSION_ID]?.[USER_ID_1]
      expect(presence!.previousGroupId).toBe(ROOM_ID)
    })
  })

  // ── applySessionPresenceDeviceSessions ───────────────────────────────────

  describe('applySessionPresenceDeviceSessions', () => {
    it('updates deviceSessions for an existing user', () => {
      useStore.getState().upsertSessionPresenceOnJoin({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        username: 'alice',
        roomId: ROOM_ID,
        joinedAt: NOW,
      })
      const deviceSessions = [{ tabId: 'tab-1', connectedAt: NOW }] as any
      useStore.getState().applySessionPresenceDeviceSessions({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        deviceSessions,
      })
      const presence = useStore.getState().sessionPresence[SESSION_ID]?.[USER_ID_1]
      expect(presence!.deviceSessions).toEqual(deviceSessions)
    })

    it('is a no-op when the user does not exist in presence', () => {
      useStore.getState().applySessionPresenceDeviceSessions({
        sessionId: SESSION_ID,
        userId: USER_ID_2,
        deviceSessions: [] as any,
      })
      // USER_ID_2 was never added, so should remain absent
      expect(useStore.getState().sessionPresence[SESSION_ID]?.[USER_ID_2]).toBeUndefined()
    })
  })

  // ── clearSessionPresence ─────────────────────────────────────────────────

  describe('clearSessionPresence', () => {
    it('clears all presence when no sessionId provided', () => {
      useStore.getState().upsertSessionPresenceOnJoin({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        username: 'alice',
        roomId: ROOM_ID,
        joinedAt: NOW,
      })
      useStore.getState().clearSessionPresence()
      expect(useStore.getState().sessionPresence).toEqual({})
      expect(useStore.getState().sessionStatsBySessionId).toEqual({})
    })

    it('clears only the specified session', () => {
      const SESSION_B = '99999999-9999-4999-8999-999999999999' as UUID
      useStore.getState().upsertSessionPresenceOnJoin({
        sessionId: SESSION_ID,
        userId: USER_ID_1,
        username: 'alice',
        roomId: ROOM_ID,
        joinedAt: NOW,
      })
      useStore.getState().upsertSessionPresenceOnJoin({
        sessionId: SESSION_B,
        userId: USER_ID_2,
        username: 'bob',
        roomId: ROOM_ID,
        joinedAt: NOW,
      })
      useStore.getState().clearSessionPresence(SESSION_ID)
      expect(useStore.getState().sessionPresence[SESSION_ID]).toBeUndefined()
      expect(useStore.getState().sessionPresence[SESSION_B]).toBeDefined()
    })
  })
})

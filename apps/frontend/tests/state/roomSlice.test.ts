import { beforeEach, describe, expect, it } from 'vitest'
import type { EventEnvelope, UUID } from '@shared'
import { SessionState } from '@shared'
import { useStore } from '../../src/state/store'
import type { Room, RoomUser } from '../../src/types/room'

const SESSION_A = '11111111-1111-4111-8111-111111111111' as UUID
const SESSION_B = '22222222-2222-4222-8222-222222222222' as UUID
const ROOM_ID_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID
const ROOM_ID_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as UUID
const MAIN_ROOM_ID = '99999999-9999-4999-8999-999999999999' as UUID
const USER_ID_1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' as UUID
const USER_ID_2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' as UUID
const DM_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' as UUID
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

const SAMPLE_ROOM: Room = {
  id: ROOM_ID_1,
  sessionId: SESSION_A,
  name: 'Main Hall',
  type: 'GROUP' as any,
  createdAt: NOW,
  createdBy: DM_ID,
}

const SAMPLE_MEMBER: RoomUser = {
  userId: USER_ID_1,
  username: 'alice',
  presenceState: 'ONLINE' as any,
  joinedAt: NOW,
}

describe('roomSlice', () => {
  beforeEach(() => {
    useStore.getState().reset()
  })

  // ── Direct actions ─────────────────────────────────────────────────────────

  describe('createRoom', () => {
    it('adds a room to the session and initialises empty member list', () => {
      useStore.getState().createRoom(SESSION_A, SAMPLE_ROOM)
      expect(useStore.getState().rooms[SESSION_A]![ROOM_ID_1]).toEqual(SAMPLE_ROOM)
      expect(useStore.getState().roomMembers[ROOM_ID_1]).toEqual([])
    })

    it('does not reset an existing member list when room is upserted', () => {
      useStore.getState().createRoom(SESSION_A, SAMPLE_ROOM)
      useStore.getState().addRoomMember(ROOM_ID_1, SAMPLE_MEMBER)
      // Upsert same room
      useStore.getState().createRoom(SESSION_A, SAMPLE_ROOM)
      expect(useStore.getState().roomMembers[ROOM_ID_1]).toHaveLength(1)
    })
  })

  describe('deleteRoom', () => {
    it('removes the room and its member list', () => {
      useStore.getState().createRoom(SESSION_A, SAMPLE_ROOM)
      useStore.getState().addRoomMember(ROOM_ID_1, SAMPLE_MEMBER)
      useStore.getState().deleteRoom(SESSION_A, ROOM_ID_1)
      expect(useStore.getState().rooms[SESSION_A]![ROOM_ID_1]).toBeUndefined()
      expect(useStore.getState().roomMembers[ROOM_ID_1]).toBeUndefined()
    })

    it('keeps moved members visible in Main after ROOM:DELETED reconciliation sequence', () => {
      const mainRoom: Room = {
        id: MAIN_ROOM_ID,
        sessionId: SESSION_A,
        name: 'Main',
        type: 'MAIN' as any,
        createdAt: NOW,
        createdBy: DM_ID,
      }
      const groupRoom: Room = {
        id: ROOM_ID_1,
        sessionId: SESSION_A,
        name: 'Side Group',
        type: 'GROUP' as any,
        createdAt: NOW,
        createdBy: DM_ID,
      }

      useStore.getState().createRoom(SESSION_A, mainRoom)
      useStore.getState().createRoom(SESSION_A, groupRoom)

      // Seed group membership as if users are currently inside the soon-to-be-deleted room.
      useStore.getState().handleUserJoined(
        makeEvent('ROOM:USER_JOINED', SESSION_A, {
          roomId: ROOM_ID_1,
          userId: USER_ID_1,
          username: 'alice',
        })
      )
      useStore.getState().handleUserJoined(
        makeEvent('ROOM:USER_JOINED', SESSION_A, {
          roomId: ROOM_ID_1,
          userId: USER_ID_2,
          username: 'bob',
        })
      )

      // Reconcile move events broadcast by backend during delete flow.
      useStore.getState().handleUserLeft(
        makeEvent('ROOM:USER_LEFT', SESSION_A, {
          roomId: ROOM_ID_1,
          userId: USER_ID_1,
        })
      )
      useStore.getState().handleUserJoined(
        makeEvent('ROOM:USER_JOINED', SESSION_A, {
          roomId: MAIN_ROOM_ID,
          userId: USER_ID_1,
          username: 'alice',
        })
      )
      useStore.getState().handleUserLeft(
        makeEvent('ROOM:USER_LEFT', SESSION_A, {
          roomId: ROOM_ID_1,
          userId: USER_ID_2,
        })
      )
      useStore.getState().handleUserJoined(
        makeEvent('ROOM:USER_JOINED', SESSION_A, {
          roomId: MAIN_ROOM_ID,
          userId: USER_ID_2,
          username: 'bob',
        })
      )

      // Final ROOM:DELETED handler path removes only the deleted room slice.
      useStore.getState().deleteRoom(SESSION_A, ROOM_ID_1)

      const state = useStore.getState()
      expect(state.rooms[SESSION_A]![ROOM_ID_1]).toBeUndefined()
      expect(state.roomMembers[ROOM_ID_1]).toBeUndefined()
      expect((state.roomMembers[MAIN_ROOM_ID] || []).map((member) => member.userId).sort()).toEqual(
        [USER_ID_1, USER_ID_2].sort()
      )
      expect(state.sessionPresence[SESSION_A]![USER_ID_1]!.primaryRoomId).toBe(MAIN_ROOM_ID)
      expect(state.sessionPresence[SESSION_A]![USER_ID_2]!.primaryRoomId).toBe(MAIN_ROOM_ID)
    })
  })

  describe('addRoomMember', () => {
    it('adds a member to the room', () => {
      useStore.getState().createRoom(SESSION_A, SAMPLE_ROOM)
      useStore.getState().addRoomMember(ROOM_ID_1, SAMPLE_MEMBER)
      expect(useStore.getState().roomMembers[ROOM_ID_1]).toHaveLength(1)
      expect(useStore.getState().roomMembers[ROOM_ID_1]![0]).toEqual(SAMPLE_MEMBER)
    })

    it('replaces existing entry for same userId (upsert)', () => {
      useStore.getState().createRoom(SESSION_A, SAMPLE_ROOM)
      useStore.getState().addRoomMember(ROOM_ID_1, SAMPLE_MEMBER)
      const updated: RoomUser = { ...SAMPLE_MEMBER, username: 'alice-renamed' }
      useStore.getState().addRoomMember(ROOM_ID_1, updated)
      expect(useStore.getState().roomMembers[ROOM_ID_1]).toHaveLength(1)
      expect(useStore.getState().roomMembers[ROOM_ID_1]![0]!.username).toBe('alice-renamed')
    })

    it('overwrites stale mock character details from ROOM:USER_JOINED payload metadata', () => {
      useStore.getState().createRoom(SESSION_A, SAMPLE_ROOM)
      useStore.getState().handleUserJoined(
        makeEvent('ROOM:USER_JOINED', SESSION_A, {
          roomId: ROOM_ID_1,
          userId: USER_ID_1,
          username: 'dev_mock_doran',
          playerName: 'Doran Flint',
          avatarUrl: '/branding/mock-races/scout-robot.svg',
          characterName: 'Magnus Gearwright',
          characterClass: 'Artificer',
          characterSubclass: 'Battle Smith',
          characterRace: 'Rock Gnome',
          level: 8,
          characterStats: { level: 8 },
        })
      )

      const member = useStore.getState().roomMembers[ROOM_ID_1]![0]!
      expect(member.playerName).toBe('Doran Flint')
      expect(member.characterName).toBe('Magnus Gearwright')
      expect(member.characterClass).toBe('Artificer')
      expect(member.characterRace).toBe('Rock Gnome')
      expect(member.level).toBe(8)
    })

    it('refreshes live member profile details from PRESENCE:PROFILE_UPDATED', () => {
      useStore.getState().createRoom(SESSION_A, SAMPLE_ROOM)
      useStore.getState().handleUserJoined(
        makeEvent('ROOM:USER_JOINED', SESSION_A, {
          roomId: ROOM_ID_1,
          userId: USER_ID_1,
          username: 'dev_mock_doran',
        })
      )

      useStore.getState().handlePresenceProfileUpdated(
        makeEvent('PRESENCE:PROFILE_UPDATED', SESSION_A, {
          userId: USER_ID_1,
          username: 'dev_mock_doran',
          updatedAt: NOW + 1000,
          playerName: 'Doran Flint',
          avatarUrl: '/branding/mock-races/scout-robot.svg',
          characterName: 'Magnus Gearwright',
          characterClass: 'Artificer',
          characterSubclass: 'Battle Smith',
          characterRace: 'Rock Gnome',
          level: 8,
          characterStats: { level: 8 },
        })
      )

      const member = useStore.getState().roomMembers[ROOM_ID_1]![0]!
      expect(member.playerName).toBe('Doran Flint')
      expect(member.characterName).toBe('Magnus Gearwright')
      expect(member.characterClass).toBe('Artificer')
      expect(member.level).toBe(8)
      expect(useStore.getState().sessionPresence[SESSION_A]![USER_ID_1]!.characterName).toBe(
        'Magnus Gearwright'
      )
    })
  })

  describe('removeRoomMember', () => {
    it('removes a member from the room', () => {
      useStore.getState().createRoom(SESSION_A, SAMPLE_ROOM)
      useStore.getState().addRoomMember(ROOM_ID_1, SAMPLE_MEMBER)
      useStore.getState().removeRoomMember(ROOM_ID_1, USER_ID_1)
      expect(useStore.getState().roomMembers[ROOM_ID_1]).toHaveLength(0)
    })
  })

  describe('updateMemberPresence', () => {
    it('updates presenceState for the specified member', () => {
      useStore.getState().createRoom(SESSION_A, SAMPLE_ROOM)
      useStore.getState().addRoomMember(ROOM_ID_1, SAMPLE_MEMBER)
      useStore.getState().updateMemberPresence(ROOM_ID_1, USER_ID_1, 'IDLE' as any)
      expect(useStore.getState().roomMembers[ROOM_ID_1]![0]!.presenceState).toBe('IDLE')
    })
  })

  describe('replaceSessionRooms', () => {
    it('replaces rooms for a session', () => {
      useStore.getState().createRoom(SESSION_A, SAMPLE_ROOM)
      useStore.getState().addRoomMember(ROOM_ID_1, SAMPLE_MEMBER)
      const newRoom: Room = { ...SAMPLE_ROOM, id: ROOM_ID_2, name: 'New Room' }
      useStore.getState().replaceSessionRooms(SESSION_A, [newRoom])
      expect(useStore.getState().rooms[SESSION_A]![ROOM_ID_1]).toBeUndefined()
      expect(useStore.getState().rooms[SESSION_A]![ROOM_ID_2]).toBeDefined()
      expect(useStore.getState().roomMembers[ROOM_ID_1]).toBeUndefined()
      expect(useStore.getState().roomMembers[ROOM_ID_2]).toEqual([])
    })

    it('does not affect other sessions', () => {
      useStore.getState().createRoom(SESSION_A, SAMPLE_ROOM)
      const roomB: Room = { ...SAMPLE_ROOM, id: ROOM_ID_2, sessionId: SESSION_B }
      useStore.getState().createRoom(SESSION_B, roomB)
      useStore.getState().replaceSessionRooms(SESSION_A, [])
      expect(useStore.getState().rooms[SESSION_B]![ROOM_ID_2]).toBeDefined()
    })
  })

  describe('replaceSessionPresence', () => {
    it('preserves hydrated device session snapshots on session presence entries', () => {
      useStore.getState().replaceSessionPresence(SESSION_A, [
        {
          userId: USER_ID_1,
          username: 'alice',
          state: 'ONLINE' as any,
          primaryRoomId: ROOM_ID_1,
          lastSeenAt: NOW,
          deviceSessions: [
            {
              deviceSessionId: 'device-a',
              deviceClass: 'DESKTOP' as any,
              label: 'Desktop',
              connectedAt: NOW,
              isActive: true,
              isMuted: false,
            },
            {
              deviceSessionId: 'device-b',
              deviceClass: 'MOBILE' as any,
              label: 'Mobile',
              connectedAt: NOW + 1000,
              isActive: false,
              isMuted: true,
            },
          ],
        } as any,
      ])

      expect(
        useStore.getState().sessionPresence[SESSION_A]![USER_ID_1]!.deviceSessions
      ).toHaveLength(2)
      expect(
        useStore.getState().sessionPresence[SESSION_A]![USER_ID_1]!.deviceSessions?.[1]
      ).toMatchObject({
        label: 'Mobile',
        isMuted: true,
      })
    })
  })

  describe('clearSessionTransitionNotice', () => {
    it('removes the transition notice for a session', () => {
      // Set via event handler then clear
      const mainRoomId = 'f0000000-0000-4000-8000-000000000001' as UUID
      const greenRoomId = 'f0000000-0000-4000-8000-000000000002' as UUID
      const event = makeEvent('SESSION:ROOM_TRANSITION_APPLIED', SESSION_A, {
        previousState: null,
        nextState: 'ACTIVE',
        movedUsers: 1,
        targetRoomId: mainRoomId,
        targetRoomName: 'Main',
        targetState: 'ONLINE',
        mainRoom: { id: mainRoomId, name: 'Main', roomType: 'GROUP' },
        greenRoom: { id: greenRoomId, name: 'Green Room', roomType: 'PRIVATE' },
        users: [{ userId: USER_ID_1, username: 'alice' }],
      })
      useStore.getState().handleSessionRoomTransitionApplied(event)
      expect(useStore.getState().sessionTransitionNotice[SESSION_A]).toBeDefined()

      useStore.getState().clearSessionTransitionNotice(SESSION_A)
      expect(useStore.getState().sessionTransitionNotice[SESSION_A]).toBeUndefined()
    })
  })

  describe('clearRooms', () => {
    it('clears all rooms and members when called without argument', () => {
      useStore.getState().createRoom(SESSION_A, SAMPLE_ROOM)
      useStore.getState().addRoomMember(ROOM_ID_1, SAMPLE_MEMBER)
      useStore.getState().clearRooms()
      expect(useStore.getState().rooms).toEqual({})
      expect(useStore.getState().roomMembers).toEqual({})
      expect(useStore.getState().sessionPresence).toEqual({})
    })

    it('clears rooms only for the specified session', () => {
      const roomB: Room = { ...SAMPLE_ROOM, id: ROOM_ID_2, sessionId: SESSION_B }
      useStore.getState().createRoom(SESSION_A, SAMPLE_ROOM)
      useStore.getState().createRoom(SESSION_B, roomB)
      useStore.getState().clearRooms(SESSION_A)
      expect(useStore.getState().rooms[SESSION_A]).toBeUndefined()
      expect(useStore.getState().rooms[SESSION_B]).toBeDefined()
    })
  })

  // ── Event handlers ─────────────────────────────────────────────────────────

  describe('handleRoomCreated', () => {
    it('creates room from event payload', () => {
      const event = makeEvent('ROOM:CREATED', SESSION_A, {
        roomId: ROOM_ID_1,
        name: 'Tavern',
        roomType: 'GROUP',
        createdBy: DM_ID,
      })
      useStore.getState().handleRoomCreated(event)
      const room = useStore.getState().rooms[SESSION_A]![ROOM_ID_1]
      expect(room).toBeDefined()
      expect(room!.name).toBe('Tavern')
      expect(useStore.getState().roomMembers[ROOM_ID_1]).toEqual([])
    })
  })

  describe('handleUserJoined', () => {
    it('adds user to roomMembers and sessionPresence', () => {
      useStore.getState().createRoom(SESSION_A, SAMPLE_ROOM)
      const event = makeEvent('ROOM:USER_JOINED', SESSION_A, {
        roomId: ROOM_ID_1,
        userId: USER_ID_1,
        username: 'alice',
      })
      useStore.getState().handleUserJoined(event)
      expect(useStore.getState().roomMembers[ROOM_ID_1]).toHaveLength(1)
      expect(useStore.getState().sessionPresence[SESSION_A]![USER_ID_1]).toBeDefined()
    })
  })

  describe('handleUserLeft', () => {
    it('removes user from roomMembers and marks presence as IDLE', () => {
      useStore.getState().createRoom(SESSION_A, SAMPLE_ROOM)
      const joinEvent = makeEvent('ROOM:USER_JOINED', SESSION_A, {
        roomId: ROOM_ID_1,
        userId: USER_ID_1,
        username: 'alice',
      })
      useStore.getState().handleUserJoined(joinEvent)

      const leaveEvent = makeEvent('ROOM:USER_LEFT', SESSION_A, {
        roomId: ROOM_ID_1,
        userId: USER_ID_1,
      })
      useStore.getState().handleUserLeft(leaveEvent)
      expect(useStore.getState().roomMembers[ROOM_ID_1]).toHaveLength(0)
      expect(useStore.getState().sessionPresence[SESSION_A]![USER_ID_1]!.state).toBe('IDLE')
    })
  })

  describe('handlePresenceStateChanged', () => {
    it('updates presenceState in roomMembers and sessionPresence', () => {
      useStore.getState().createRoom(SESSION_A, SAMPLE_ROOM)
      useStore.getState().addRoomMember(ROOM_ID_1, SAMPLE_MEMBER)
      // Seed sessionPresence
      const joinEvent = makeEvent('ROOM:USER_JOINED', SESSION_A, {
        roomId: ROOM_ID_1,
        userId: USER_ID_1,
        username: 'alice',
      })
      useStore.getState().handleUserJoined(joinEvent)

      const event = makeEvent('ROOM:PRESENCE_STATE_CHANGED', SESSION_A, {
        roomId: ROOM_ID_1,
        userId: USER_ID_1,
        username: 'alice',
        newState: 'IDLE',
      })
      useStore.getState().handlePresenceStateChanged(event)
      expect(useStore.getState().sessionPresence[SESSION_A]![USER_ID_1]!.state).toBe('IDLE')
    })

    it('updates ghost projection in sessionPresence', () => {
      useStore.getState().createRoom(SESSION_A, SAMPLE_ROOM)
      const joinEvent = makeEvent('ROOM:USER_JOINED', SESSION_A, {
        roomId: ROOM_ID_1,
        userId: USER_ID_1,
        username: 'alice',
      })
      useStore.getState().handleUserJoined(joinEvent)

      const previousRoomMembersRef = useStore.getState().roomMembers[ROOM_ID_1]

      const event = makeEvent('PRESENCE:USER_GHOST_MODE_CHANGED', SESSION_A, {
        roomId: ROOM_ID_1,
        userId: USER_ID_1,
        username: 'alice',
        ghostMode: true,
      })

      useStore.getState().handlePresenceGhostModeChanged(event)
      expect(useStore.getState().sessionPresence[SESSION_A]![USER_ID_1]!.ghost).toBe(true)
      expect(useStore.getState().roomMembers[ROOM_ID_1]).toBe(previousRoomMembersRef)
    })

    it('hydrates previousGroupId from presence payloads', () => {
      useStore.getState().createRoom(SESSION_A, SAMPLE_ROOM)
      const joinEvent = makeEvent('ROOM:USER_JOINED', SESSION_A, {
        roomId: ROOM_ID_1,
        userId: USER_ID_1,
        username: 'alice',
      })
      useStore.getState().handleUserJoined(joinEvent)

      const event = makeEvent('PRESENCE:STATE_CHANGED', SESSION_A, {
        roomId: ROOM_ID_1,
        userId: USER_ID_1,
        username: 'alice',
        newState: 'ONLINE',
        previousGroupId: ROOM_ID_2,
      })

      useStore.getState().handlePresenceStateChanged(event)
      expect(useStore.getState().sessionPresence[SESSION_A]![USER_ID_1]!.previousGroupId).toBe(
        ROOM_ID_2
      )
    })

    it('moves a member to the new room when presence state changes roomId', () => {
      const roomOne: Room = { ...SAMPLE_ROOM, id: ROOM_ID_1, name: 'Room One' }
      const roomTwo: Room = { ...SAMPLE_ROOM, id: ROOM_ID_2, name: 'Room Two' }

      useStore.getState().createRoom(SESSION_A, roomOne)
      useStore.getState().createRoom(SESSION_A, roomTwo)

      const joinEvent = makeEvent('ROOM:USER_JOINED', SESSION_A, {
        roomId: ROOM_ID_1,
        userId: USER_ID_1,
        username: 'alice',
      })
      useStore.getState().handleUserJoined(joinEvent)

      const event = makeEvent('PRESENCE:STATE_CHANGED', SESSION_A, {
        roomId: ROOM_ID_2,
        userId: USER_ID_1,
        username: 'alice',
        newState: 'ONLINE',
      })

      useStore.getState().handlePresenceStateChanged(event)

      expect(useStore.getState().roomMembers[ROOM_ID_1]).toHaveLength(0)
      expect(useStore.getState().roomMembers[ROOM_ID_2]).toHaveLength(1)
      expect(useStore.getState().roomMembers[ROOM_ID_2]![0]!.userId).toBe(USER_ID_1)
      expect(useStore.getState().sessionPresence[SESSION_A]![USER_ID_1]!.primaryRoomId).toBe(
        ROOM_ID_2
      )
    })

    it('clears stale ghost when presence state change moves user to a new room', () => {
      const roomOne: Room = { ...SAMPLE_ROOM, id: ROOM_ID_1, name: 'Room One' }
      const roomTwo: Room = { ...SAMPLE_ROOM, id: ROOM_ID_2, name: 'Room Two' }

      useStore.getState().createRoom(SESSION_A, roomOne)
      useStore.getState().createRoom(SESSION_A, roomTwo)

      useStore.getState().handleUserJoined(
        makeEvent('ROOM:USER_JOINED', SESSION_A, {
          roomId: ROOM_ID_1,
          userId: USER_ID_1,
          username: 'alice',
        })
      )

      useStore.getState().handlePresenceGhostModeChanged(
        makeEvent('PRESENCE:USER_GHOST_MODE_CHANGED', SESSION_A, {
          roomId: ROOM_ID_1,
          userId: USER_ID_1,
          username: 'alice',
          ghostMode: true,
        })
      )

      expect(useStore.getState().sessionPresence[SESSION_A]![USER_ID_1]!.ghost).toBe(true)

      useStore.getState().handlePresenceStateChanged(
        makeEvent('PRESENCE:STATE_CHANGED', SESSION_A, {
          roomId: ROOM_ID_2,
          userId: USER_ID_1,
          username: 'alice',
          newState: 'ONLINE',
        })
      )

      expect(useStore.getState().sessionPresence[SESSION_A]![USER_ID_1]!.ghost).toBe(false)
      expect(useStore.getState().sessionPresence[SESSION_A]![USER_ID_1]!.primaryRoomId).toBe(
        ROOM_ID_2
      )
    })

    it('keeps SPEAKING -> ONLINE transitions on lightweight speaking tracker path', () => {
      useStore.getState().createRoom(SESSION_A, SAMPLE_ROOM)
      useStore.getState().handleUserJoined(
        makeEvent('ROOM:USER_JOINED', SESSION_A, {
          roomId: ROOM_ID_1,
          userId: USER_ID_1,
          username: 'alice',
        })
      )

      useStore.getState().handlePresenceStateChanged(
        makeEvent('PRESENCE:STATE_CHANGED', SESSION_A, {
          roomId: ROOM_ID_1,
          userId: USER_ID_1,
          username: 'alice',
          newState: 'SPEAKING',
          changedAt: NOW + 10,
        })
      )

      expect(useStore.getState().presenceSpeakingBySession[SESSION_A]?.[USER_ID_1]).toBe(true)

      const roomMembersBeforeStop = useStore.getState().roomMembers[ROOM_ID_1]
      const sessionPresenceBeforeStop = useStore.getState().sessionPresence[SESSION_A]?.[USER_ID_1]

      useStore.getState().handlePresenceStateChanged(
        makeEvent('PRESENCE:STATE_CHANGED', SESSION_A, {
          roomId: ROOM_ID_1,
          userId: USER_ID_1,
          username: 'alice',
          newState: 'ONLINE',
          changedAt: NOW + 20,
        })
      )

      expect(useStore.getState().presenceSpeakingBySession[SESSION_A]?.[USER_ID_1]).toBeUndefined()
      expect(useStore.getState().roomMembers[ROOM_ID_1]).toBe(roomMembersBeforeStop)
      expect(useStore.getState().sessionPresence[SESSION_A]?.[USER_ID_1]).not.toBe(
        sessionPresenceBeforeStop
      )
      expect(useStore.getState().sessionPresence[SESSION_A]?.[USER_ID_1]?.state).toBe('ONLINE')
    })

    it('keeps speaking and online indicators in sync through IDLE -> ENDED -> CLEANUP sequences', () => {
      useStore.getState().replaceSessions([
        {
          id: SESSION_A,
          name: 'Session A',
          dmId: DM_ID,
          state: SessionState.IDLE,
          createdAt: NOW,
        } as any,
      ])
      useStore.getState().setCurrentSession(SESSION_A)

      useStore.getState().createRoom(SESSION_A, SAMPLE_ROOM)
      useStore.getState().handleUserJoined(
        makeEvent('ROOM:USER_JOINED', SESSION_A, {
          roomId: ROOM_ID_1,
          userId: USER_ID_1,
          username: 'alice',
        })
      )

      const roomMembersRef = useStore.getState().roomMembers[ROOM_ID_1]

      const runCycleForSessionState = (
        state: SessionState,
        speakingAt: number,
        onlineAt: number
      ) => {
        useStore.getState().updateSession(SESSION_A, { state })

        useStore.getState().handlePresenceStateChanged(
          makeEvent('PRESENCE:STATE_CHANGED', SESSION_A, {
            roomId: ROOM_ID_1,
            userId: USER_ID_1,
            username: 'alice',
            newState: 'SPEAKING',
            changedAt: speakingAt,
          })
        )

        expect(useStore.getState().presenceSpeakingBySession[SESSION_A]?.[USER_ID_1]).toBe(true)
        // SPEAKING is only tracked in presenceSpeakingBySession (fast path); sessionPresence
        // retains the prior state (ONLINE) to avoid cascading re-renders.
        expect(useStore.getState().sessionPresence[SESSION_A]?.[USER_ID_1]?.state).toBe('ONLINE')

        useStore.getState().handlePresenceStateChanged(
          makeEvent('PRESENCE:STATE_CHANGED', SESSION_A, {
            roomId: ROOM_ID_1,
            userId: USER_ID_1,
            username: 'alice',
            newState: 'ONLINE',
            changedAt: onlineAt,
          })
        )

        expect(
          useStore.getState().presenceSpeakingBySession[SESSION_A]?.[USER_ID_1]
        ).toBeUndefined()
        expect(useStore.getState().sessionPresence[SESSION_A]?.[USER_ID_1]?.state).toBe('ONLINE')
        expect(useStore.getState().roomMembers[ROOM_ID_1]).toBe(roomMembersRef)
      }

      runCycleForSessionState(SessionState.IDLE, NOW + 30, NOW + 31)
      runCycleForSessionState(SessionState.ENDED, NOW + 40, NOW + 41)
      runCycleForSessionState(SessionState.CLEANUP, NOW + 50, NOW + 51)
    })
  })

  describe('handleSessionRoomTransitionApplied', () => {
    it('upserts rooms, moves users to target room, and stores transition notice', () => {
      const mainRoomId = 'f0000000-0000-4000-8000-000000000001' as UUID
      const greenRoomId = 'f0000000-0000-4000-8000-000000000002' as UUID

      const event = makeEvent('SESSION:ROOM_TRANSITION_APPLIED', SESSION_A, {
        previousState: null,
        nextState: 'ACTIVE',
        movedUsers: 2,
        targetRoomId: mainRoomId,
        targetRoomName: 'Main',
        targetState: 'ONLINE',
        mainRoom: { id: mainRoomId, name: 'Main Hall', roomType: 'GROUP' },
        greenRoom: { id: greenRoomId, name: 'Green Room', roomType: 'PRIVATE' },
        users: [
          { userId: USER_ID_1, username: 'alice' },
          { userId: USER_ID_2, username: 'bob' },
        ],
      })
      useStore.getState().handleSessionRoomTransitionApplied(event)

      expect(useStore.getState().rooms[SESSION_A]![mainRoomId]).toBeDefined()
      expect(useStore.getState().rooms[SESSION_A]![greenRoomId]).toBeDefined()
      expect(useStore.getState().roomMembers[mainRoomId]).toHaveLength(2)
      expect(useStore.getState().sessionPresence[SESSION_A]![USER_ID_1]!.primaryRoomId).toBe(
        mainRoomId
      )
      const notice = useStore.getState().sessionTransitionNotice[SESSION_A]
      expect(notice).toBeDefined()
      expect(notice!.movedUsers).toBe(2)
      expect(notice!.nextState).toBe('ACTIVE')
    })

    it('respects per-user room targets when resuming from pause', () => {
      const mainRoomId = 'f0000000-0000-4000-8000-000000000001' as UUID
      const greenRoomId = 'f0000000-0000-4000-8000-000000000002' as UUID
      const groupRoomId = 'f0000000-0000-4000-8000-000000000003' as UUID

      useStore.setState((state) => ({
        rooms: {
          ...state.rooms,
          [SESSION_A]: {
            [groupRoomId]: {
              id: groupRoomId,
              sessionId: SESSION_A,
              name: 'Scouts',
              type: 'GROUP' as RoomType,
              createdAt: NOW,
              createdBy: USER_ID_1,
            },
          },
        },
        roomMembers: {
          [mainRoomId]: [
            {
              userId: USER_ID_1,
              username: 'alice',
              presenceState: 'ONLINE',
              joinedAt: NOW,
            },
            {
              userId: USER_ID_2,
              username: 'bob',
              presenceState: 'ONLINE',
              joinedAt: NOW,
            },
          ] as any,
        },
      }))

      const event = makeEvent('SESSION:ROOM_TRANSITION_APPLIED', SESSION_A, {
        previousState: 'PAUSED',
        nextState: 'ACTIVE',
        movedUsers: 2,
        targetRoomId: mainRoomId,
        targetRoomName: 'Main',
        targetState: 'ONLINE',
        mainRoom: { id: mainRoomId, name: 'Main Hall', roomType: 'MAIN' },
        greenRoom: { id: greenRoomId, name: 'Green Room', roomType: 'GROUP' },
        users: [
          {
            userId: USER_ID_1,
            username: 'alice',
            roomId: groupRoomId,
            previousGroupId: groupRoomId,
          },
          { userId: USER_ID_2, username: 'bob', roomId: mainRoomId },
        ],
      })

      useStore.getState().handleSessionRoomTransitionApplied(event)

      expect(useStore.getState().roomMembers[groupRoomId]?.map((member) => member.userId)).toEqual([
        USER_ID_1,
      ])
      expect(useStore.getState().roomMembers[mainRoomId]?.map((member) => member.userId)).toEqual([
        USER_ID_2,
      ])
      expect(useStore.getState().sessionPresence[SESSION_A]![USER_ID_1]!.primaryRoomId).toBe(
        groupRoomId
      )
      expect(useStore.getState().sessionPresence[SESSION_A]![USER_ID_1]!.previousGroupId).toBe(
        groupRoomId
      )
    })

    it('preserves existing member profile fields when session transitions move users between rooms', () => {
      const mainRoomId = 'f0000000-0000-4000-8000-000000000001' as UUID
      const greenRoomId = 'f0000000-0000-4000-8000-000000000002' as UUID

      useStore.setState((state) => ({
        rooms: {
          ...state.rooms,
          [SESSION_A]: {
            [mainRoomId]: {
              id: mainRoomId,
              sessionId: SESSION_A,
              name: 'Main Hall',
              type: 'MAIN' as RoomType,
              createdAt: NOW,
              createdBy: USER_ID_1,
            },
            [greenRoomId]: {
              id: greenRoomId,
              sessionId: SESSION_A,
              name: 'Green Room',
              type: 'GROUP' as RoomType,
              createdAt: NOW,
              createdBy: USER_ID_1,
            },
          },
        },
        roomMembers: {
          [mainRoomId]: [
            {
              userId: USER_ID_1,
              username: 'dev_mock_nyx',
              playerName: 'Magnus Gearwright',
              characterName: 'Magnus Gearwright',
              characterClass: 'Artificer',
              characterRace: 'Rock Gnome',
              level: 10,
              presenceState: 'ONLINE',
              joinedAt: NOW,
            },
          ] as any,
        },
      }))

      const event = makeEvent('SESSION:ROOM_TRANSITION_APPLIED', SESSION_A, {
        previousState: 'ACTIVE',
        nextState: 'IDLE',
        movedUsers: 1,
        targetRoomId: greenRoomId,
        targetRoomName: 'Green Room',
        targetState: 'ONLINE',
        mainRoom: { id: mainRoomId, name: 'Main Hall', roomType: 'MAIN' },
        greenRoom: { id: greenRoomId, name: 'Green Room', roomType: 'GROUP' },
        users: [{ userId: USER_ID_1, username: 'dev_mock_nyx', roomId: greenRoomId }],
      })

      useStore.getState().handleSessionRoomTransitionApplied(event)

      expect(useStore.getState().roomMembers[greenRoomId]).toEqual([
        expect.objectContaining({
          userId: USER_ID_1,
          username: 'dev_mock_nyx',
          playerName: 'Magnus Gearwright',
          characterName: 'Magnus Gearwright',
          characterClass: 'Artificer',
          characterRace: 'Rock Gnome',
          level: 10,
        }),
      ])
    })
  })
})

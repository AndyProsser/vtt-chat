import { describe, it, expect, vi } from 'vitest'
import { optimisticMoveMember, optimisticApplyEnvironment } from '@/services/groupsPanel.client'
import type { UUID } from '@shared'

const SESSION_ID = '11111111-1111-4111-8111-111111111111' as UUID
const USER_ID = '22222222-2222-4222-8222-222222222222' as UUID
const ROOM_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa' as UUID
const ROOM_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb' as UUID

describe('groupsPanel.client optimistic helpers', () => {
  it('reverts optimistic move when API fails', async () => {
    const addRoomMember = vi.fn()
    const removeRoomMember = vi.fn()
    const setSessionGroups = vi.fn()

    // Simulate fetchSessionGroups returning a room A with the member
    const fetchSessionGroupsFn = vi.fn(async () => [
      { id: ROOM_A, members: [{ userId: USER_ID, username: 'u' }] },
      { id: ROOM_B, members: [] },
    ])

    const moveRoomMemberFn = vi.fn(async () => {
      throw new Error('move failed')
    })

    const showToast = vi.fn()

    await expect(
      optimisticMoveMember({
        sessionId: SESSION_ID,
        targetUserId: USER_ID,
        targetRoomId: ROOM_B,
        addRoomMember,
        removeRoomMember,
        setSessionGroups,
        fetchSessionGroupsFn,
        moveRoomMemberFn,
        token: 't',
        apiUrl: 'https://api',
        showToast,
      })
    ).rejects.toThrow()

    // remove then add optimistic calls
    expect(removeRoomMember).toHaveBeenCalledWith(ROOM_A, USER_ID)
    expect(addRoomMember).toHaveBeenCalledWith(ROOM_B, expect.any(Object))

    // on failure, revert happened: remove from target, add back to prev
    expect(removeRoomMember).toHaveBeenCalledWith(ROOM_A, USER_ID) // initial remove
    expect(addRoomMember).toHaveBeenCalledWith(ROOM_B, expect.any(Object)) // optimistic add
    // revert: remove target and add back prev
    expect(removeRoomMember).toHaveBeenCalledWith(ROOM_B, USER_ID)
    expect(addRoomMember).toHaveBeenCalledWith(ROOM_A, expect.any(Object))

    expect(showToast).toHaveBeenCalled()
  })

  it('reverts optimistic environment apply on failure', async () => {
    const setSessionGroupEnvironment = vi.fn()
    const clearSessionGroupEnvironment = vi.fn()
    const applyGroupEnvironmentFn = vi.fn(async () => {
      throw new Error('env failed')
    })
    const showToast = vi.fn()

    // Case 1: previous env undefined => should call clear on revert
    await expect(
      optimisticApplyEnvironment({
        sessionId: SESSION_ID,
        groupId: ROOM_A,
        environmentName: 'Tavern',
        setSessionGroupEnvironment,
        clearSessionGroupEnvironment,
        applyGroupEnvironmentFn,
        token: 't',
        apiUrl: 'https://api',
        showToast,
        setApplying: () => {},
        getPrevEnv: () => undefined,
      })
    ).rejects.toThrow()

    expect(setSessionGroupEnvironment).toHaveBeenCalledWith(SESSION_ID, ROOM_A, 'Tavern')
    expect(clearSessionGroupEnvironment).toHaveBeenCalledWith(SESSION_ID, ROOM_A)
    expect(showToast).toHaveBeenCalled()

    // Case 2: previous env was 'Forest' => should restore to 'Forest'
    setSessionGroupEnvironment.mockReset()
    clearSessionGroupEnvironment.mockReset()
    showToast.mockReset()
    applyGroupEnvironmentFn.mockImplementationOnce(async () => {
      throw new Error('env failed')
    })

    await expect(
      optimisticApplyEnvironment({
        sessionId: SESSION_ID,
        groupId: ROOM_A,
        environmentName: 'Underwater',
        setSessionGroupEnvironment,
        clearSessionGroupEnvironment,
        applyGroupEnvironmentFn,
        token: 't',
        apiUrl: 'https://api',
        showToast,
        setApplying: () => {},
        getPrevEnv: () => 'Forest',
      })
    ).rejects.toThrow()

    expect(setSessionGroupEnvironment).toHaveBeenCalledWith(SESSION_ID, ROOM_A, 'Underwater')
    expect(setSessionGroupEnvironment).toHaveBeenCalledWith(SESSION_ID, ROOM_A, 'Forest')
    expect(showToast).toHaveBeenCalled()
  })
})

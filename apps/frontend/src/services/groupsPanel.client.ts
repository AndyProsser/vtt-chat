import type { UUID } from '@shared'
import type { RoomUser } from '@/types/room'
import {
  moveRoomMember as moveRoomMemberService,
  applyGroupEnvironment as applyGroupEnvironmentService,
  fetchSessionGroups,
} from './groupsPanel.service'

export async function optimisticMoveMember(params: {
  sessionId: UUID
  targetUserId: UUID
  targetRoomId: UUID
  addRoomMember: (roomId: UUID, member: RoomUser) => void
  removeRoomMember: (roomId: UUID, userId: UUID) => void
  fetchSessionGroupsFn?: (sessionId: UUID, token: string, apiUrl: string) => Promise<any[]>
  moveRoomMemberFn?: (
    sessionId: UUID,
    targetUserId: UUID,
    targetRoomId: UUID,
    token: string,
    apiUrl: string
  ) => Promise<any>
  setDmVoiceTarget?: (groupId?: UUID) => void
  token?: string
  apiUrl?: string
  showToast?: (opts: { message: string; variant?: 'error' | 'success' }) => void
}) {
  const {
    sessionId,
    targetUserId,
    targetRoomId,
    addRoomMember,
    removeRoomMember,
    fetchSessionGroupsFn = fetchSessionGroups,
    moveRoomMemberFn = moveRoomMemberService,
    setDmVoiceTarget,
    token,
    apiUrl,
    showToast,
  } = params

  // Find previous room by scanning current groups via fetch canonical state
  // Note: caller may have a local membersByRoomId snapshot; this helper is optimistic but will
  // rely on provided add/remove functions for local mutation.

  // For tests, callers can manage prevMember themselves; here we do a best-effort by fetching server
  let prevRoomId: UUID | undefined
  let prevMember: RoomUser | null = null
  let targetRoomIsPrivate = false

  try {
    // Best-effort fetch to locate the user's current room for revert support,
    // and to capture whether the target room is PRIVATE (for DM voice auto-target).
    const rooms = await fetchSessionGroupsFn(sessionId, token ?? '', apiUrl ?? '')
    for (const room of rooms) {
      const members: RoomUser[] = (room.members as RoomUser[]) || []
      if (members.some((m) => m.userId === targetUserId)) {
        prevRoomId = room.id as UUID
        prevMember = members.find((m) => m.userId === targetUserId) || null
      }
      if (room.id === targetRoomId) {
        targetRoomIsPrivate = room.type === 'PRIVATE'
      }
    }
  } catch {
    // ignore; caller may be using local state instead
  }

  if (prevRoomId === targetRoomId) return

  try {
    if (prevMember && prevRoomId) {
      removeRoomMember(prevRoomId, targetUserId)
    }

    if (prevMember) {
      const optimisticMember = { ...prevMember, previousGroupId: prevRoomId || undefined }
      addRoomMember(targetRoomId, optimisticMember)
    }

    await moveRoomMemberFn(
      sessionId,
      targetUserId,
      targetRoomId,
      params.token ?? '',
      params.apiUrl ?? ''
    )

    // DM voice auto-target: if the destination is a PRIVATE (whisper) room, lock
    // the DM voice to it. Room membership state is updated by the authoritative
    // ROOM:USER_LEFT / ROOM:USER_JOINED WS broadcasts — no HTTP re-fetch needed.
    if (targetRoomIsPrivate && setDmVoiceTarget) {
      setDmVoiceTarget(targetRoomId)
    }
  } catch (err: any) {
    // revert optimistic
    if (prevMember) {
      removeRoomMember(targetRoomId, targetUserId)
      if (prevRoomId) addRoomMember(prevRoomId, prevMember)
    }

    if (showToast) {
      showToast({ message: err?.message || 'Failed to move member', variant: 'error' })
    }

    throw err
  }
}

export async function optimisticApplyEnvironment(params: {
  sessionId: UUID
  groupId: UUID
  environmentName: string
  setSessionGroupEnvironment: (sessionId: UUID, groupId: UUID, environmentName: string) => void
  clearSessionGroupEnvironment: (sessionId: UUID, groupId: UUID) => void
  applyGroupEnvironmentFn?: (
    sessionId: UUID,
    groupId: UUID,
    environmentName: string,
    token: string,
    apiUrl: string
  ) => Promise<any>
  token?: string
  apiUrl?: string
  showToast?: (opts: { message: string; variant?: 'error' | 'success' }) => void
  setApplying?: (updater: (prev: UUID[]) => UUID[]) => void
  getPrevEnv?: () => string | undefined
}) {
  const {
    sessionId,
    groupId,
    environmentName,
    setSessionGroupEnvironment,
    clearSessionGroupEnvironment,
    applyGroupEnvironmentFn = applyGroupEnvironmentService,
    token,
    apiUrl,
    showToast,
    setApplying,
    getPrevEnv,
  } = params

  const prevEnv = getPrevEnv ? getPrevEnv() : undefined

  try {
    if (setApplying) setApplying((p) => [...p, groupId])
    setSessionGroupEnvironment(sessionId, groupId, environmentName)
    await applyGroupEnvironmentFn(sessionId, groupId, environmentName, token ?? '', apiUrl ?? '')
  } catch (err: any) {
    if (prevEnv === undefined) {
      clearSessionGroupEnvironment(sessionId, groupId)
    } else {
      setSessionGroupEnvironment(sessionId, groupId, prevEnv)
    }

    if (showToast)
      showToast({ message: err?.message || 'Failed to set environment', variant: 'error' })
    throw err
  } finally {
    if (setApplying) setApplying((p) => p.filter((id) => id !== groupId))
  }
}

export default { optimisticMoveMember, optimisticApplyEnvironment }

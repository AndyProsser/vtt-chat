import type { CampaignMember, CampaignRoom, RecordingDraft } from '@/types/campaigns'

export interface MemberRoomSelection {
  memberId: string
  roomId: string
}

export function buildCampaignQueryString(params: {
  search: string
  status: string
  page: number
  pageSize: number
}): string {
  const query = new URLSearchParams({
    search: params.search,
    status: params.status,
    page: String(params.page),
    pageSize: String(params.pageSize),
  })

  return query.toString()
}

export function selectInitialMemberRoom(
  members: CampaignMember[],
  rooms: CampaignRoom[],
  preferredMemberId: string
): MemberRoomSelection | null {
  if (!members.length || !rooms.length) {
    return null
  }

  const preferredMember = members.find((member) => member.role !== 'DM') || members[0]
  const targetMember =
    members.find((member) => member.userId === preferredMemberId) || preferredMember

  const roomId =
    rooms.find((room) => room.id === targetMember.primaryRoomId)?.id ||
    rooms.find((room) => room.id !== targetMember.primaryRoomId)?.id ||
    rooms[0].id

  return {
    memberId: targetMember.userId,
    roomId,
  }
}

export function sanitizeDurationSeconds(value: string): number | undefined {
  if (!value.trim()) {
    return undefined
  }

  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) {
    return undefined
  }

  return numberValue
}

export function withSessionRoomRetained(
  draft: RecordingDraft,
  fallback: RecordingDraft
): RecordingDraft {
  return {
    ...fallback,
    sessionId: draft.sessionId,
    roomId: draft.roomId,
  }
}

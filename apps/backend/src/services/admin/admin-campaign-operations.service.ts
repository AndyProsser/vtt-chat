import { getPrismaClient } from '@/infra/db'
import type { AdminAuthToken } from '@/types'
import type { Prisma } from '@prisma/client'
import {
  applyArchivedMarker,
  isCampaignArchived,
  removeArchivedMarker,
} from './admin-campaigns.service'
import {
  buildCampaignExport,
  createRecordingMetadata,
  importCampaignBundle,
  isValidTransferBundle,
  listRecordingMetadata,
} from './admin-portability.service'

const prisma = getPrismaClient()

// ─── Private Helpers ──────────────────────────────────────────────────────────

function canManageCampaign(actor: AdminAuthToken, currentDmId: string): boolean {
  return actor.adminRole !== 'CAMPAIGN_DM' || actor.userId === currentDmId
}

function mapRecordingForResponse(recording: {
  startedAt: Date | null
  endedAt: Date | null
  createdAt: Date
  updatedAt: Date
  [key: string]: unknown
}) {
  return {
    ...recording,
    startedAt: recording.startedAt?.toISOString() || null,
    endedAt: recording.endedAt?.toISOString() || null,
    createdAt: recording.createdAt.toISOString(),
    updatedAt: recording.updatedAt.toISOString(),
  }
}

// ─── Campaign Operations ──────────────────────────────────────────────────────

export async function getAdminCampaignRoomsPayload(params: {
  actor: AdminAuthToken
  campaignId: string
  requestedSessionId: string | null
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.campaignId },
    select: { id: true, name: true, currentDmId: true },
  })

  if (!campaign) {
    return { status: 404, body: { error: 'Campaign not found', code: 'NOT_FOUND' } }
  }

  if (!canManageCampaign(params.actor, campaign.currentDmId)) {
    return { status: 403, body: { error: 'Insufficient permissions', code: 'FORBIDDEN' } }
  }

  const session = params.requestedSessionId
    ? await prisma.session.findFirst({
        where: { id: params.requestedSessionId, campaignId: params.campaignId },
        select: { id: true, name: true, state: true, updatedAt: true },
      })
    : await prisma.session.findFirst({
        where: { campaignId: params.campaignId },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, name: true, state: true, updatedAt: true },
      })

  if (!session) {
    return { status: 200, body: { campaign, session: null, rooms: [] } }
  }

  const [rooms, roomPresenceCounts] = await Promise.all([
    prisma.room.findMany({
      where: { sessionId: session.id },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, type: true, createdAt: true, updatedAt: true },
    }),
    prisma.presenceSnapshot.groupBy({
      by: ['primaryRoomId'],
      where: {
        sessionId: session.id,
        primaryRoomId: { not: null },
        state: { not: 'OFFLINE' },
      },
      _count: { _all: true },
    }),
  ])

  const sessionMembers = await prisma.sessionMember.findMany({
    where: { sessionId: session.id },
    orderBy: [{ role: 'asc' }, { username: 'asc' }],
    select: { userId: true, username: true, role: true },
  })

  const presenceRows = await prisma.presenceSnapshot.findMany({
    where: { sessionId: session.id },
    select: { userId: true, primaryRoomId: true, state: true },
  })

  const presenceByUser = new Map(
    presenceRows.map((row) => [row.userId, { primaryRoomId: row.primaryRoomId, state: row.state }])
  )

  const roomOccupancy = new Map<string, number>()
  roomPresenceCounts.forEach((entry) => {
    if (entry.primaryRoomId) {
      roomOccupancy.set(entry.primaryRoomId, entry._count._all)
    }
  })

  return {
    status: 200,
    body: {
      campaign,
      session,
      rooms: rooms.map((room) => ({ ...room, occupantCount: roomOccupancy.get(room.id) || 0 })),
      members: sessionMembers.map((member) => {
        const presence = presenceByUser.get(member.userId)
        return {
          userId: member.userId,
          username: member.username,
          role: member.role,
          primaryRoomId: presence?.primaryRoomId || null,
          presenceState: presence?.state || 'OFFLINE',
        }
      }),
    },
  }
}

export async function endAdminCampaignSession(params: {
  actor: AdminAuthToken
  campaignId: string
  sessionId: string
  reason?: string
}): Promise<{
  status: number
  body: Record<string, unknown>
  audit?: {
    action: 'SESSION_FORCE_END'
    targetType: 'SESSION'
    targetId: string
    reason?: string
    metadata: Record<string, unknown>
  }
}> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.campaignId },
    select: { id: true, currentDmId: true, name: true },
  })

  if (!campaign) {
    return { status: 404, body: { error: 'Campaign not found', code: 'NOT_FOUND' } }
  }

  if (!canManageCampaign(params.actor, campaign.currentDmId)) {
    return { status: 403, body: { error: 'Insufficient permissions', code: 'FORBIDDEN' } }
  }

  const existingSession = await prisma.session.findUnique({
    where: { id: params.sessionId },
    select: { id: true, campaignId: true, name: true, state: true, endedAt: true },
  })

  if (!existingSession || existingSession.campaignId !== campaign.id) {
    return { status: 404, body: { error: 'Session not found', code: 'NOT_FOUND' } }
  }

  if (existingSession.state === 'ENDED') {
    return { status: 200, body: { message: 'Session is already ended', session: existingSession } }
  }

  const updatedSession = await prisma.session.update({
    where: { id: existingSession.id },
    data: { state: 'ENDED', endedAt: new Date() },
    select: { id: true, name: true, state: true, endedAt: true, updatedAt: true, campaignId: true },
  })

  return {
    status: 200,
    body: { message: 'Session ended successfully', session: updatedSession },
    audit: {
      action: 'SESSION_FORCE_END',
      targetType: 'SESSION',
      targetId: updatedSession.id,
      reason: params.reason,
      metadata: {
        campaignId: campaign.id,
        campaignName: campaign.name,
        sessionName: updatedSession.name,
        previousState: existingSession.state,
        nextState: updatedSession.state,
      },
    },
  }
}

export async function archiveAdminCampaign(params: {
  actor: AdminAuthToken
  campaignId: string
  reason?: string
}): Promise<{
  status: number
  body: Record<string, unknown>
  audit?: {
    action: 'CAMPAIGN_ARCHIVE'
    targetType: 'CAMPAIGN'
    targetId: string
    reason?: string
    metadata: Record<string, unknown>
  }
}> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.campaignId },
    select: { id: true, name: true, description: true, currentDmId: true },
  })

  if (!campaign) {
    return { status: 404, body: { error: 'Campaign not found', code: 'NOT_FOUND' } }
  }

  if (!canManageCampaign(params.actor, campaign.currentDmId)) {
    return { status: 403, body: { error: 'Insufficient permissions', code: 'FORBIDDEN' } }
  }

  if (isCampaignArchived(campaign.description)) {
    return {
      status: 200,
      body: {
        message: 'Campaign is already archived',
        campaign: { ...campaign, isArchived: true },
      },
    }
  }

  const [updatedCampaign, endedSessions] = await Promise.all([
    prisma.campaign.update({
      where: { id: campaign.id },
      data: { description: applyArchivedMarker(campaign.description) },
      select: { id: true, name: true, description: true, currentDmId: true, updatedAt: true },
    }),
    prisma.session.updateMany({
      where: { campaignId: campaign.id, state: { not: 'ENDED' } },
      data: { state: 'ENDED', endedAt: new Date() },
    }),
  ])

  return {
    status: 200,
    body: {
      message: 'Campaign archived successfully',
      campaign: { ...updatedCampaign, isArchived: true },
      endedSessionsCount: endedSessions.count,
    },
    audit: {
      action: 'CAMPAIGN_ARCHIVE',
      targetType: 'CAMPAIGN',
      targetId: campaign.id,
      reason: params.reason,
      metadata: { campaignName: campaign.name, endedSessionsCount: endedSessions.count },
    },
  }
}

export async function restoreAdminCampaign(params: {
  actor: AdminAuthToken
  campaignId: string
  reason?: string
}): Promise<{
  status: number
  body: Record<string, unknown>
  audit?: {
    action: 'CAMPAIGN_RESTORE'
    targetType: 'CAMPAIGN'
    targetId: string
    reason?: string
    metadata: Record<string, unknown>
  }
}> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.campaignId },
    select: { id: true, name: true, description: true, currentDmId: true },
  })

  if (!campaign) {
    return { status: 404, body: { error: 'Campaign not found', code: 'NOT_FOUND' } }
  }

  if (!canManageCampaign(params.actor, campaign.currentDmId)) {
    return { status: 403, body: { error: 'Insufficient permissions', code: 'FORBIDDEN' } }
  }

  if (!isCampaignArchived(campaign.description)) {
    return {
      status: 200,
      body: {
        message: 'Campaign is not archived',
        campaign: { ...campaign, isArchived: false },
      },
    }
  }

  const updatedCampaign = await prisma.campaign.update({
    where: { id: campaign.id },
    data: { description: removeArchivedMarker(campaign.description) },
    select: { id: true, name: true, description: true, currentDmId: true, updatedAt: true },
  })

  return {
    status: 200,
    body: {
      message: 'Campaign restored successfully',
      campaign: { ...updatedCampaign, isArchived: false },
    },
    audit: {
      action: 'CAMPAIGN_RESTORE',
      targetType: 'CAMPAIGN',
      targetId: campaign.id,
      reason: params.reason,
      metadata: { campaignName: campaign.name },
    },
  }
}

export async function getAdminCampaignExportPayload(params: {
  actor: AdminAuthToken
  campaignId: string
}): Promise<{
  status: number
  body: Record<string, unknown>
  audit?: {
    action: 'CAMPAIGN_EXPORT'
    targetType: 'CAMPAIGN'
    targetId: string
    metadata: Record<string, unknown>
  }
}> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.campaignId },
    select: { id: true, name: true, currentDmId: true },
  })

  if (!campaign) {
    return { status: 404, body: { error: 'Campaign not found', code: 'NOT_FOUND' } }
  }

  if (!canManageCampaign(params.actor, campaign.currentDmId)) {
    return { status: 403, body: { error: 'Insufficient permissions', code: 'FORBIDDEN' } }
  }

  const exported = await buildCampaignExport(campaign.id, params.actor.userId)
  if (!exported) {
    return { status: 404, body: { error: 'Campaign not found', code: 'NOT_FOUND' } }
  }

  return {
    status: 200,
    body: {
      message: 'Campaign export created successfully',
      artifactId: exported.artifactId,
      counts: exported.counts,
      bundle: exported.bundle,
    },
    audit: {
      action: 'CAMPAIGN_EXPORT',
      targetType: 'CAMPAIGN',
      targetId: campaign.id,
      metadata: { artifactId: exported.artifactId, ...exported.counts },
    },
  }
}

export async function getAdminCampaignRecordingsPayload(params: {
  actor: AdminAuthToken
  campaignId: string
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.campaignId },
    select: { id: true, name: true, currentDmId: true },
  })

  if (!campaign) {
    return { status: 404, body: { error: 'Campaign not found', code: 'NOT_FOUND' } }
  }

  if (!canManageCampaign(params.actor, campaign.currentDmId)) {
    return { status: 403, body: { error: 'Insufficient permissions', code: 'FORBIDDEN' } }
  }

  const recordings = await listRecordingMetadata(campaign.id)

  return {
    status: 200,
    body: { campaign, recordings: recordings.map(mapRecordingForResponse) },
  }
}

export async function createAdminCampaignRecordingPayload(params: {
  actor: AdminAuthToken
  campaignId: string
  body: Record<string, unknown>
}): Promise<{
  status: number
  body: Record<string, unknown>
  audit?: {
    action: 'RECORDING_METADATA_CREATE'
    targetType: 'CAMPAIGN'
    targetId: string
    metadata: Record<string, unknown>
  }
}> {
  const title = String(params.body.title || '').trim()
  const sessionId = String(params.body.sessionId || '').trim() || null
  const roomId = String(params.body.roomId || '').trim() || null
  const storageKey = String(params.body.storageKey || '').trim() || null
  const sourceUrl = String(params.body.sourceUrl || '').trim() || null
  const journalSummary = String(params.body.journalSummary || '').trim() || null
  const startedAt = String(params.body.startedAt || '').trim() || null
  const endedAt = String(params.body.endedAt || '').trim() || null
  const durationValue = Number(params.body.durationSeconds)
  const durationSeconds =
    Number.isFinite(durationValue) && durationValue >= 0 ? Math.round(durationValue) : null
  const metadata =
    params.body.metadata && typeof params.body.metadata === 'object' ? params.body.metadata : null

  if (!title) {
    return {
      status: 400,
      body: { error: 'title is required', code: 'MISSING_TITLE', field: 'title' },
    }
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: params.campaignId },
    select: { id: true, name: true, currentDmId: true },
  })

  if (!campaign) {
    return { status: 404, body: { error: 'Campaign not found', code: 'NOT_FOUND' } }
  }

  if (!canManageCampaign(params.actor, campaign.currentDmId)) {
    return { status: 403, body: { error: 'Insufficient permissions', code: 'FORBIDDEN' } }
  }

  if (sessionId) {
    const session = await prisma.session.findFirst({
      where: { id: sessionId, campaignId: campaign.id },
      select: { id: true },
    })
    if (!session) {
      return {
        status: 400,
        body: {
          error: 'sessionId must belong to the selected campaign',
          code: 'INVALID_SESSION',
          field: 'sessionId',
        },
      }
    }
  }

  if (roomId) {
    const room = await prisma.room.findFirst({
      where: {
        id: roomId,
        ...(sessionId ? { sessionId } : { session: { campaignId: campaign.id } }),
      },
      select: { id: true },
    })
    if (!room) {
      return {
        status: 400,
        body: {
          error: 'roomId must belong to the selected campaign/session',
          code: 'INVALID_ROOM',
          field: 'roomId',
        },
      }
    }
  }

  const recording = await createRecordingMetadata({
    campaignId: campaign.id,
    sessionId,
    roomId,
    title,
    storageKey,
    sourceUrl,
    durationSeconds,
    startedAt,
    endedAt,
    journalSummary,
    metadata: metadata as Prisma.InputJsonValue | null,
  })

  return {
    status: 201,
    body: {
      message: 'Recording metadata saved successfully',
      recording: mapRecordingForResponse(recording),
    },
    audit: {
      action: 'RECORDING_METADATA_CREATE',
      targetType: 'CAMPAIGN',
      targetId: campaign.id,
      metadata: {
        recordingId: recording.id,
        title: recording.title,
        sessionId: recording.sessionId,
        roomId: recording.roomId,
      },
    },
  }
}

export async function moveAdminCampaignPlayerPayload(params: {
  actor: AdminAuthToken
  campaignId: string
  sessionId: string
  roomId: string
  targetUserId: string
  reason?: string
}): Promise<{
  status: number
  body: Record<string, unknown>
  audit?: {
    action: 'ROOM_MOVE_PLAYER'
    targetType: 'SESSION'
    targetId: string
    reason?: string
    metadata: Record<string, unknown>
  }
  event?: {
    sessionId: string
    actorUserId: string
    targetUserId: string
    targetUsername: string
    previousRoomId: string | null
    roomId: string
  }
}> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.campaignId },
    select: { id: true, name: true, currentDmId: true },
  })

  if (!campaign) {
    return { status: 404, body: { error: 'Campaign not found', code: 'NOT_FOUND' } }
  }

  if (!canManageCampaign(params.actor, campaign.currentDmId)) {
    return { status: 403, body: { error: 'Insufficient permissions', code: 'FORBIDDEN' } }
  }

  const session = await prisma.session.findUnique({
    where: { id: params.sessionId },
    select: { id: true, campaignId: true, name: true },
  })

  if (!session || session.campaignId !== campaign.id) {
    return { status: 404, body: { error: 'Session not found', code: 'NOT_FOUND' } }
  }

  const room = await prisma.room.findUnique({
    where: { id: params.roomId },
    select: { id: true, sessionId: true, name: true },
  })

  if (!room || room.sessionId !== session.id) {
    return { status: 404, body: { error: 'Room not found', code: 'NOT_FOUND' } }
  }

  const sessionMember = await prisma.sessionMember.findUnique({
    where: { sessionId_userId: { sessionId: session.id, userId: params.targetUserId } },
    select: { userId: true, username: true, role: true },
  })

  if (!sessionMember) {
    return { status: 404, body: { error: 'Target user not in session', code: 'NOT_FOUND' } }
  }

  const previousPresence = await prisma.presenceSnapshot.findUnique({
    where: { sessionId_userId: { sessionId: session.id, userId: params.targetUserId } },
    select: { primaryRoomId: true },
  })

  await prisma.presenceSnapshot.upsert({
    where: { sessionId_userId: { sessionId: session.id, userId: params.targetUserId } },
    create: {
      sessionId: session.id,
      campaignId: campaign.id,
      userId: params.targetUserId,
      username: sessionMember.username,
      primaryRoomId: room.id,
      state: 'ONLINE',
      lastSeenAt: new Date(),
    },
    update: {
      username: sessionMember.username,
      campaignId: campaign.id,
      primaryRoomId: room.id,
      state: 'ONLINE',
      lastSeenAt: new Date(),
    },
  })

  return {
    status: 200,
    body: {
      message: 'Player moved successfully',
      movedBy: params.actor.userId,
      targetUserId: sessionMember.userId,
      targetUsername: sessionMember.username,
      movedFromRoomId: previousPresence?.primaryRoomId || null,
      movedToRoomId: room.id,
    },
    audit: {
      action: 'ROOM_MOVE_PLAYER',
      targetType: 'SESSION',
      targetId: session.id,
      reason: params.reason,
      metadata: {
        campaignId: campaign.id,
        campaignName: campaign.name,
        sessionName: session.name,
        targetUserId: sessionMember.userId,
        targetUsername: sessionMember.username,
        previousRoomId: previousPresence?.primaryRoomId || null,
        newRoomId: room.id,
        newRoomName: room.name,
      },
    },
    event: {
      sessionId: session.id,
      actorUserId: params.actor.userId,
      targetUserId: sessionMember.userId,
      targetUsername: sessionMember.username,
      previousRoomId: previousPresence?.primaryRoomId || null,
      roomId: room.id,
    },
  }
}

export async function importAdminCampaignBundlePayload(params: {
  actor: AdminAuthToken
  body: Record<string, unknown>
}): Promise<{
  status: number
  body: Record<string, unknown>
  audit?: {
    action: 'CAMPAIGN_IMPORT'
    targetType: 'CAMPAIGN'
    targetId: string
    metadata: Record<string, unknown>
  }
}> {
  const bundle = params.body.bundle ?? params.body
  const name = String(params.body.name || '').trim() || undefined
  const memberEmailMap =
    params.body.memberEmailMap &&
    typeof params.body.memberEmailMap === 'object' &&
    !Array.isArray(params.body.memberEmailMap)
      ? (params.body.memberEmailMap as Record<string, string>)
      : undefined

  if (!isValidTransferBundle(bundle)) {
    return {
      status: 400,
      body: { error: 'Invalid campaign transfer bundle', code: 'INVALID_TRANSFER_BUNDLE' },
    }
  }

  const imported = await importCampaignBundle(params.actor.userId, bundle, name, memberEmailMap)

  if (!imported) {
    return {
      status: 400,
      body: { error: 'Invalid campaign transfer bundle', code: 'INVALID_TRANSFER_BUNDLE' },
    }
  }

  return {
    status: 201,
    body: {
      message: 'Campaign imported successfully',
      artifactId: imported.artifactId,
      counts: imported.counts,
      campaign: imported.campaign,
    },
    audit: {
      action: 'CAMPAIGN_IMPORT',
      targetType: 'CAMPAIGN',
      targetId: imported.campaign.id,
      metadata: {
        artifactId: imported.artifactId,
        importedCampaignName: imported.campaign.name,
        ...imported.counts,
      },
    },
  }
}

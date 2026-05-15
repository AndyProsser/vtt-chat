import { randomUUID } from 'node:crypto'
import type { CampaignTransferBundle } from '@/types/portability.types'
import type { Prisma, PrismaClient } from '@prisma/client'
import { PORTABILITY_FORMAT_VERSION } from '@/constants/admin-portability.constants'
import {
  buildCounts,
  generateInviteCode,
  isCampaignTransferBundle,
  mapUserIdList,
  normalizeString,
  resolveImportedUsers,
  toDate,
  toIso,
} from './shared'

export async function buildCampaignExport(
  prisma: PrismaClient,
  campaignId: string,
  actorUserId?: string | null
) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      currentDm: {
        select: {
          id: true,
          username: true,
        },
      },
      members: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              role: true,
            },
          },
        },
        orderBy: { joinedAt: 'asc' },
      },
      characters: {
        orderBy: { createdAt: 'asc' },
      },
      sessions: {
        orderBy: { createdAt: 'asc' },
        include: {
          rooms: {
            orderBy: { createdAt: 'asc' },
          },
          members: {
            orderBy: { joinedAt: 'asc' },
          },
          messages: {
            orderBy: { createdAt: 'asc' },
          },
          notes: {
            orderBy: { createdAt: 'asc' },
          },
          logs: {
            orderBy: { createdAt: 'asc' },
          },
        },
      },
      recordings: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!campaign) {
    return null
  }

  const bundle: CampaignTransferBundle = {
    version: PORTABILITY_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    sourceCampaignId: campaign.id,
    campaign: {
      name: campaign.name,
      description: campaign.description,
      inviteCode: campaign.inviteCode,
      currentDmId: campaign.currentDmId,
      currentDmUsername: campaign.currentDm.username,
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
    },
    members: campaign.members.map((membership) => ({
      userId: membership.userId,
      username: membership.user.username,
      displayName: membership.user.displayName,
      campaignRole: membership.role,
      userRole: membership.user.role,
    })),
    characters: campaign.characters.map((character) => ({
      userId: character.userId,
      name: character.name,
      status: character.status,
      race: character.race,
      class: character.class,
      subclass: character.subclass,
      avatarUrl: character.avatarUrl,
      isActive: character.isActive,
      metadata: character.metadata as Prisma.JsonValue | null,
      createdAt: character.createdAt.toISOString(),
      updatedAt: character.updatedAt.toISOString(),
    })),
    sessions: campaign.sessions.map((session) => ({
      id: session.id,
      name: session.name,
      description: session.description,
      state: session.state,
      createdAt: session.createdAt.toISOString(),
      startedAt: toIso(session.startedAt),
      endedAt: toIso(session.endedAt),
      updatedAt: session.updatedAt.toISOString(),
      rooms: session.rooms.map((room) => ({
        id: room.id,
        name: room.name,
        type: room.type,
        createdBy: room.createdBy,
        createdAt: room.createdAt.toISOString(),
        updatedAt: room.updatedAt.toISOString(),
      })),
      members: session.members.map((member) => ({
        userId: member.userId,
        username: member.username,
        role: member.role,
        joinedAt: member.joinedAt.toISOString(),
      })),
      messages: session.messages.map((message) => ({
        authorId: message.authorId,
        authorUsername: message.authorUsername,
        content: message.content,
        type: message.type,
        isDmOnly: message.isDmOnly,
        visibleTo: message.visibleTo as Prisma.JsonValue | null,
        createdAt: message.createdAt.toISOString(),
        editedAt: toIso(message.editedAt),
        deletedAt: toIso(message.deletedAt),
        deletedBy: message.deletedBy,
      })),
      notes: session.notes.map((note) => ({
        authorId: note.authorId,
        authorUsername: note.authorUsername,
        title: note.title,
        content: note.content,
        visibility: note.visibility,
        tags: note.tags as Prisma.JsonValue | null,
        allowedUsers: note.allowedUsers as Prisma.JsonValue | null,
        publishedAt: toIso(note.publishedAt),
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString(),
      })),
      logs: session.logs.map((log) => ({
        userId: log.userId,
        username: log.username,
        eventType: log.eventType,
        detail: log.detail,
        createdAt: log.createdAt.toISOString(),
      })),
    })),
    recordings: campaign.recordings.map((recording) => ({
      title: recording.title,
      sessionId: recording.sessionId,
      roomId: recording.roomId,
      storageKey: recording.storageKey,
      sourceUrl: recording.sourceUrl,
      durationSeconds: recording.durationSeconds,
      startedAt: toIso(recording.startedAt),
      endedAt: toIso(recording.endedAt),
      journalSummary: recording.journalSummary,
      metadata: recording.metadata as Prisma.JsonValue | null,
      createdAt: recording.createdAt.toISOString(),
      updatedAt: recording.updatedAt.toISOString(),
    })),
  }

  const counts = buildCounts(bundle)

  const artifact = await prisma.importExportArtifact.create({
    data: {
      type: 'CAMPAIGN_EXPORT',
      campaignId,
      createdByUserId: actorUserId || undefined,
      formatVersion: PORTABILITY_FORMAT_VERSION,
      payload: bundle as unknown as Prisma.InputJsonValue,
      metadata: counts as Prisma.InputJsonValue,
    },
    select: { id: true },
  })

  return {
    bundle,
    artifactId: artifact.id,
    counts,
  }
}

export async function importCampaignBundle(
  prisma: PrismaClient,
  actorUserId: string,
  input: unknown,
  nameOverride?: string | null
) {
  if (!isCampaignTransferBundle(input)) {
    return null
  }

  const bundle = input

  const imported = await prisma.$transaction(async (tx) => {
    const userIdMap = await resolveImportedUsers(tx, actorUserId, bundle)
    const campaignName = normalizeString(nameOverride) || `${bundle.campaign.name} (Imported)`

    const campaign = await tx.campaign.create({
      data: {
        name: campaignName,
        description: bundle.campaign.description,
        inviteCode: generateInviteCode(),
        currentDmId: actorUserId,
      },
      select: {
        id: true,
        name: true,
        inviteCode: true,
        currentDmId: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    const membershipRows = bundle.members
      .map((member) => ({
        campaignId: campaign.id,
        userId: userIdMap.get(member.userId) || actorUserId,
        role: member.userId === bundle.campaign.currentDmId ? 'DM' : member.campaignRole,
      }))
      .filter(
        (member, index, rows) => rows.findIndex((entry) => entry.userId === member.userId) === index
      )

    if (!membershipRows.some((member) => member.userId === actorUserId)) {
      membershipRows.unshift({
        campaignId: campaign.id,
        userId: actorUserId,
        role: 'DM',
      })
    }

    if (membershipRows.length > 0) {
      await tx.campaignMembership.createMany({ data: membershipRows })
    }

    if (bundle.characters.length > 0) {
      await tx.character.createMany({
        data: bundle.characters.map((character) => ({
          campaignId: campaign.id,
          userId: userIdMap.get(character.userId) || actorUserId,
          name: character.name,
          status: character.status as any,
          race: character.race,
          class: character.class,
          subclass: character.subclass,
          avatarUrl: character.avatarUrl,
          isActive: character.isActive,
          metadata:
            character.metadata === null ? undefined : (character.metadata as Prisma.InputJsonValue),
          createdAt: toDate(character.createdAt) || new Date(),
          updatedAt: toDate(character.updatedAt) || new Date(),
        })),
      })
    }

    const sessionIdMap = new Map<string, string>()
    const roomIdMap = new Map<string, string>()

    if (bundle.sessions.length > 0) {
      await tx.session.createMany({
        data: bundle.sessions.map((session) => {
          const newId = randomUUID()
          sessionIdMap.set(session.id, newId)
          return {
            id: newId,
            campaignId: campaign.id,
            name: session.name,
            description: session.description,
            dmId: actorUserId,
            state: session.state,
            createdAt: toDate(session.createdAt) || new Date(),
            startedAt: toDate(session.startedAt),
            endedAt: toDate(session.endedAt),
            updatedAt: toDate(session.updatedAt) || new Date(),
          }
        }),
      })
    }

    const roomRows: Array<Record<string, unknown>> = []
    const memberRows: Array<Record<string, unknown>> = []
    const messageRows: Array<Record<string, unknown>> = []
    const noteRows: Array<Record<string, unknown>> = []
    const logRows: Array<Record<string, unknown>> = []

    bundle.sessions.forEach((session) => {
      const mappedSessionId = sessionIdMap.get(session.id)
      if (!mappedSessionId) {
        return
      }

      session.rooms.forEach((room) => {
        const newRoomId = randomUUID()
        roomIdMap.set(room.id, newRoomId)
        roomRows.push({
          id: newRoomId,
          sessionId: mappedSessionId,
          name: room.name,
          type: room.type,
          createdBy: userIdMap.get(room.createdBy) || actorUserId,
          createdAt: toDate(room.createdAt) || new Date(),
          updatedAt: toDate(room.updatedAt) || new Date(),
        })
      })

      session.members.forEach((member) => {
        memberRows.push({
          id: randomUUID(),
          sessionId: mappedSessionId,
          userId: userIdMap.get(member.userId) || actorUserId,
          username: member.username,
          role: member.role,
          joinedAt: toDate(member.joinedAt) || new Date(),
        })
      })

      session.messages.forEach((message) => {
        messageRows.push({
          id: randomUUID(),
          sessionId: mappedSessionId,
          authorId: userIdMap.get(message.authorId) || actorUserId,
          authorUsername: message.authorUsername,
          content: message.content,
          type: message.type,
          isDmOnly: message.isDmOnly,
          visibleTo: mapUserIdList(message.visibleTo, userIdMap) as Prisma.InputJsonValue | null,
          createdAt: toDate(message.createdAt) || new Date(),
          editedAt: toDate(message.editedAt),
          deletedAt: toDate(message.deletedAt),
          deletedBy: message.deletedBy ? userIdMap.get(message.deletedBy) || null : null,
        })
      })

      session.notes.forEach((note) => {
        noteRows.push({
          id: randomUUID(),
          sessionId: mappedSessionId,
          authorId: userIdMap.get(note.authorId) || actorUserId,
          authorUsername: note.authorUsername,
          title: note.title,
          content: note.content,
          visibility: note.visibility,
          tags: note.tags as Prisma.InputJsonValue | null,
          allowedUsers: mapUserIdList(note.allowedUsers, userIdMap) as Prisma.InputJsonValue | null,
          publishedAt: toDate(note.publishedAt),
          createdAt: toDate(note.createdAt) || new Date(),
          updatedAt: toDate(note.updatedAt) || new Date(),
        })
      })

      session.logs.forEach((entry) => {
        logRows.push({
          id: randomUUID(),
          sessionId: mappedSessionId,
          userId: entry.userId ? userIdMap.get(entry.userId) || null : null,
          username: entry.username,
          eventType: entry.eventType,
          detail: entry.detail,
          createdAt: toDate(entry.createdAt) || new Date(),
        })
      })
    })

    if (roomRows.length > 0) {
      await tx.room.createMany({ data: roomRows as any[] })
    }

    if (memberRows.length > 0) {
      await tx.sessionMember.createMany({ data: memberRows as any[] })
    }

    if (messageRows.length > 0) {
      await tx.chatMessage.createMany({ data: messageRows as any[] })
    }

    if (noteRows.length > 0) {
      await tx.note.createMany({ data: noteRows as any[] })
    }

    if (logRows.length > 0) {
      await tx.sessionLog.createMany({ data: logRows as any[] })
    }

    if (bundle.recordings.length > 0) {
      await tx.recordingMetadata.createMany({
        data: bundle.recordings.map((recording) => ({
          id: randomUUID(),
          campaignId: campaign.id,
          sessionId: recording.sessionId ? sessionIdMap.get(recording.sessionId) || null : null,
          roomId: recording.roomId ? roomIdMap.get(recording.roomId) || null : null,
          title: recording.title,
          storageKey: recording.storageKey,
          sourceUrl: recording.sourceUrl,
          durationSeconds: recording.durationSeconds,
          startedAt: toDate(recording.startedAt),
          endedAt: toDate(recording.endedAt),
          journalSummary: recording.journalSummary,
          metadata:
            recording.metadata === null ? undefined : (recording.metadata as Prisma.InputJsonValue),
          createdAt: toDate(recording.createdAt) || new Date(),
          updatedAt: toDate(recording.updatedAt) || new Date(),
        })),
      })
    }

    const counts = buildCounts(bundle)

    const artifact = await tx.importExportArtifact.create({
      data: {
        type: 'CAMPAIGN_IMPORT',
        campaignId: campaign.id,
        createdByUserId: actorUserId,
        formatVersion: PORTABILITY_FORMAT_VERSION,
        payload: bundle as unknown as Prisma.InputJsonValue,
        metadata: {
          importedCampaignId: campaign.id,
          importedCampaignName: campaign.name,
          ...counts,
        } as Prisma.InputJsonValue,
      },
      select: { id: true },
    })

    return {
      campaign,
      artifactId: artifact.id,
      counts,
    }
  })

  return imported
}

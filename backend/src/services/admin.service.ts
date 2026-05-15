import { randomUUID } from 'node:crypto'
import os from 'node:os'
import { getPrismaClient } from '@/infra/db'
import { hashPassword, verifyPassword } from '@/utils/auth'
import { isPasswordValid } from '@/utils/password'
import { AppError } from '@/types'
import type { AdminAuthToken } from '@/types'
import {
  findDiagnosticEventById,
  findTelemetryEventById,
  loadDiagnosticEvents,
  loadTelemetryEvents,
  persistDiagnosticEvents,
} from '@/infra/telemetry-store'
import type { LogRetentionSettings } from '@/infra/telemetry-store'
import { logger } from '@/utils/logger'
import { getAllSessions } from '@/services/session/core.service'
import { getChatTelemetrySnapshot } from '@/services/chat.service'
import { listExternalSystems, updateExternalSystem } from '@/services/integrations.service'
import { PORTABILITY_FORMAT_VERSION } from '@/constants/admin-portability.constants'
import {
  ADMIN_CAMPAIGNS_DEFAULT_LIST_PAGE,
  ADMIN_CAMPAIGNS_DEFAULT_LIST_PAGE_SIZE,
  ADMIN_CAMPAIGNS_MAX_LIST_PAGE_SIZE,
  ADMIN_CAMPAIGNS_STATUS_FILTERS,
  ARCHIVED_CAMPAIGN_MARKER,
} from '@/constants/admin-campaigns.constants'
import {
  ADMIN_USERS_DEFAULT_EXPORT_FORMAT,
  ADMIN_USERS_DEFAULT_LIST_PAGE,
  ADMIN_USERS_DEFAULT_LIST_PAGE_SIZE,
  ADMIN_USERS_EXPORT_CSV_HEADERS,
  ADMIN_USERS_IMPORT_PREVIEW_DEFAULT_ROLE,
  ADMIN_USERS_IMPORT_PREVIEW_MAX_ROWS,
  ADMIN_USERS_IMPORT_PREVIEW_MIN_USERNAME_LENGTH,
  ADMIN_USERS_MAX_LIST_PAGE_SIZE,
  ADMIN_USERS_ROLE_FILTERS,
  ADMIN_USERS_STATUS_FILTERS,
} from '@/constants/admin-users.constants'
import { listAdminCampaigns } from '@/repositories/admin-campaigns.repository'
import {
  findExistingUsernames,
  listAdminUsers,
  listAdminUsersForExport,
} from '@/repositories/admin-users.repository'
import type {
  AdminCampaignListItem,
  AdminCampaignRepositoryRow,
  AdminCampaignsListRequest,
  AdminCampaignsListResult,
  AdminCampaignsStatusFilter,
} from '@/types/admin-campaigns.types'
import type {
  AdminUsersExportFormat,
  AdminUsersExportRow,
  AdminUsersImportCandidate,
  AdminUsersImportPreviewRequest,
  AdminUsersImportPreviewResult,
  AdminUsersListItem,
  AdminUsersListRequest,
  AdminUsersListResult,
  AdminUsersRepositoryRow,
  AdminUsersRoleFilter,
  AdminUsersStatusFilter,
} from '@/types/admin-users.types'
import type { CampaignTransferBundle, OperationalExportBundle } from '@/types/portability.types'
import type {
  AdminRole,
  PortabilityArtifactType,
  Prisma,
  PrismaClient,
  PresenceState,
  Role,
} from '@prisma/client'

// ─── Module-level state ───────────────────────────────────────────────────────

const prisma = getPrismaClient()

const ADMIN_ASSIGNABLE_ROLES: AdminRole[] = ['SUPER_ADMIN', 'ADMIN', 'CAMPAIGN_DM', 'READ_ONLY']

type AdminPrincipal = {
  id: string
  username: string
  email: string
  adminRole: AdminRole
}

function getEffectiveAdminRole(user: {
  role: Role
  adminRole: AdminRole | null
}): AdminRole | null {
  if (user.adminRole) {
    return user.adminRole
  }
  if (user.role === 'DM') {
    return 'CAMPAIGN_DM'
  }
  return null
}

// ─── AdminService ─────────────────────────────────────────────────────────────

export class AdminService {
  static async adminUsersExist(): Promise<boolean> {
    const count = await prisma.user.count({
      where: { adminRole: 'SUPER_ADMIN' },
    })
    return count > 0
  }

  static async createInitialAdmin(
    email: string,
    username: string,
    password: string
  ): Promise<{ id: string; email: string; username: string }> {
    const adminsExist = await this.adminUsersExist()
    if (adminsExist) {
      throw new AppError(403, 'Admin user already exists. Cannot create another.', 'ADMIN_EXISTS')
    }

    if (!isPasswordValid(password)) {
      throw new AppError(400, 'Password does not meet security requirements', 'INVALID_PASSWORD')
    }

    const existingByUsername = await prisma.user.findUnique({ where: { username } })
    const existingByEmail = await prisma.user.findFirst({ where: { email } })
    if (existingByUsername && existingByEmail && existingByUsername.id !== existingByEmail.id) {
      throw new AppError(
        409,
        'Email and username belong to different users. Resolve conflict before setup.',
        'SETUP_IDENTITY_CONFLICT'
      )
    }

    const targetUser = existingByUsername || existingByEmail
    const hashedPassword = await hashPassword(password)

    const admin = targetUser
      ? await prisma.user.update({
          where: { id: targetUser.id },
          data: {
            email,
            username,
            displayName: targetUser.displayName || username,
            password: hashedPassword,
            adminRole: 'SUPER_ADMIN',
            isActive: true,
          },
        })
      : await prisma.user.create({
          data: {
            email,
            username,
            displayName: username,
            password: hashedPassword,
            role: 'PLAYER',
            adminRole: 'SUPER_ADMIN',
            isActive: true,
          },
        })

    return {
      id: admin.id,
      email: admin.email || email,
      username: admin.username,
    }
  }

  static async authenticateAdmin(
    username: string,
    password: string
  ): Promise<{ id: string; username: string; email: string; adminRole: AdminRole }> {
    const user = await prisma.user.findUnique({ where: { username } })

    if (!user) {
      throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS')
    }

    const effectiveAdminRole = getEffectiveAdminRole(user)
    if (!effectiveAdminRole) {
      throw new AppError(403, 'User does not have admin access', 'ADMIN_ACCESS_REQUIRED')
    }

    if (!user.isActive) {
      throw new AppError(403, 'Admin account is deactivated', 'ACCOUNT_DEACTIVATED')
    }

    if (!user.password) {
      throw new AppError(
        403,
        'Account does not have a password set. Complete account setup first.',
        'PASSWORD_NOT_SET'
      )
    }

    const passwordValid = await verifyPassword(password, user.password)
    if (!passwordValid) {
      throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS')
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email || '',
      adminRole: effectiveAdminRole,
    }
  }

  static async getAdminById(adminId: string): Promise<{
    id: string
    username: string
    email: string
    adminRole: AdminRole
    isActive: boolean
    createdAt: Date
  } | null> {
    const admin = await prisma.user.findUnique({ where: { id: adminId } })

    if (!admin) {
      return null
    }

    const effectiveAdminRole = getEffectiveAdminRole(admin)
    if (!effectiveAdminRole) {
      return null
    }

    return {
      id: admin.id,
      username: admin.username,
      email: admin.email || '',
      adminRole: effectiveAdminRole,
      isActive: admin.isActive,
      createdAt: admin.createdAt,
    }
  }

  static async updatePassword(
    adminId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const admin = await prisma.user.findUnique({ where: { id: adminId } })

    if (!admin) {
      throw new AppError(404, 'Admin user not found', 'NOT_FOUND')
    }

    if (!admin.password) {
      throw new AppError(400, 'Account does not have a password set', 'PASSWORD_NOT_SET')
    }

    const effectiveAdminRole = getEffectiveAdminRole(admin)
    if (!effectiveAdminRole) {
      throw new AppError(403, 'User does not have admin access', 'ADMIN_ACCESS_REQUIRED')
    }

    const currentPasswordValid = await verifyPassword(currentPassword, admin.password)
    if (!currentPasswordValid) {
      throw new AppError(401, 'Current password is incorrect', 'INVALID_PASSWORD')
    }

    if (!isPasswordValid(newPassword)) {
      throw new AppError(
        400,
        'New password does not meet security requirements',
        'INVALID_PASSWORD'
      )
    }

    const samePassword = await verifyPassword(newPassword, admin.password)
    if (samePassword) {
      throw new AppError(
        400,
        'New password cannot be the same as current password',
        'SAME_PASSWORD'
      )
    }

    const hashedPassword = await hashPassword(newPassword)
    await prisma.user.update({ where: { id: adminId }, data: { password: hashedPassword } })
  }

  static async promoteUserAdminRole(params: {
    actorUserId: string
    targetUserId: string
    adminRole: AdminRole
  }): Promise<AdminPrincipal> {
    const { actorUserId, targetUserId, adminRole } = params

    if (!ADMIN_ASSIGNABLE_ROLES.includes(adminRole)) {
      throw new AppError(400, 'Invalid admin role', 'INVALID_ADMIN_ROLE')
    }

    const actor = await prisma.user.findUnique({ where: { id: actorUserId } })
    if (!actor) {
      throw new AppError(404, 'Actor not found', 'NOT_FOUND')
    }

    const actorRole = getEffectiveAdminRole(actor)
    if (actorRole !== 'SUPER_ADMIN') {
      throw new AppError(403, 'Only SUPER_ADMIN can grant admin roles', 'FORBIDDEN')
    }

    const target = await prisma.user.findUnique({ where: { id: targetUserId } })
    if (!target) {
      throw new AppError(404, 'Target user not found', 'NOT_FOUND')
    }

    const updated = await prisma.user.update({ where: { id: target.id }, data: { adminRole } })

    return {
      id: updated.id,
      username: updated.username,
      email: updated.email || '',
      adminRole: getEffectiveAdminRole(updated) || adminRole,
    }
  }

  static async ensureDmAdminRole(userId: string): Promise<void> {
    await prisma.user.updateMany({
      where: { id: userId, role: 'DM', adminRole: null },
      data: { adminRole: 'CAMPAIGN_DM' },
    })
  }
}

// ─── Campaign Listing ─────────────────────────────────────────────────────────

function coerceCampaignStatusFilter(value: unknown): AdminCampaignsStatusFilter {
  const normalized = String(value || 'all')
    .trim()
    .toLowerCase()
  if ((ADMIN_CAMPAIGNS_STATUS_FILTERS as readonly string[]).includes(normalized)) {
    return normalized as AdminCampaignsStatusFilter
  }
  return 'all'
}

function toCampaignListItem(campaign: AdminCampaignRepositoryRow): AdminCampaignListItem {
  const latestSession = campaign.sessions[0] || null
  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    isArchived: isCampaignArchived(campaign.description),
    inviteCode: campaign.inviteCode,
    currentDm: campaign.currentDm,
    currentDmId: campaign.currentDmId,
    memberCount: campaign._count.members,
    sessionCount: campaign._count.sessions,
    latestSession,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
  }
}

export function parseAdminCampaignsListRequest(query: {
  search?: unknown
  status?: unknown
  page?: unknown
  pageSize?: unknown
}): AdminCampaignsListRequest {
  const page = Math.max(
    ADMIN_CAMPAIGNS_DEFAULT_LIST_PAGE,
    Number(query.page || ADMIN_CAMPAIGNS_DEFAULT_LIST_PAGE)
  )
  const pageSize = Math.min(
    ADMIN_CAMPAIGNS_MAX_LIST_PAGE_SIZE,
    Math.max(1, Number(query.pageSize || ADMIN_CAMPAIGNS_DEFAULT_LIST_PAGE_SIZE))
  )

  return {
    search: String(query.search || '').trim(),
    statusFilter: coerceCampaignStatusFilter(query.status),
    page,
    pageSize,
  }
}

export async function listAdminCampaignsForRequest(
  request: AdminCampaignsListRequest
): Promise<AdminCampaignsListResult> {
  const { campaigns, total } = await listAdminCampaigns(request)

  return {
    campaigns: campaigns.map(toCampaignListItem),
    total,
    page: request.page,
    pageSize: request.pageSize,
    totalPages: Math.max(1, Math.ceil(total / request.pageSize)),
  }
}

export function isCampaignArchived(description?: string | null): boolean {
  return Boolean(description && description.startsWith(ARCHIVED_CAMPAIGN_MARKER))
}

export function applyArchivedMarker(description?: string | null): string {
  const normalized = String(description || '').trim()
  if (!normalized) {
    return `${ARCHIVED_CAMPAIGN_MARKER}Archived campaign`
  }
  if (normalized.startsWith(ARCHIVED_CAMPAIGN_MARKER)) {
    return normalized
  }
  return `${ARCHIVED_CAMPAIGN_MARKER}${normalized}`
}

export function removeArchivedMarker(description?: string | null): string {
  const normalized = String(description || '')
  if (!normalized.startsWith(ARCHIVED_CAMPAIGN_MARKER)) {
    return normalized.trim()
  }
  return normalized.slice(ARCHIVED_CAMPAIGN_MARKER.length).trim()
}

// ─── Portability Shared Helpers (private) ────────────────────────────────────

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function slugifyUsername(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
  return slug.replace(/-+/g, '-').replace(/^-|-$/g, '') || 'imported-user'
}

function mapUserIdList(
  value: Prisma.JsonValue | null,
  userIdMap: Map<string, string>
): Prisma.JsonValue | null {
  if (!Array.isArray(value)) {
    return value
  }
  const mapped = value
    .map((entry) => (typeof entry === 'string' ? userIdMap.get(entry) || entry : null))
    .filter((entry): entry is string => Boolean(entry))
  return mapped
}

function buildCounts(bundle: CampaignTransferBundle) {
  return {
    members: bundle.members.length,
    characters: bundle.characters.length,
    sessions: bundle.sessions.length,
    rooms: bundle.sessions.reduce((total, session) => total + session.rooms.length, 0),
    messages: bundle.sessions.reduce((total, session) => total + session.messages.length, 0),
    notes: bundle.sessions.reduce((total, session) => total + session.notes.length, 0),
    logs: bundle.sessions.reduce((total, session) => total + session.logs.length, 0),
    recordings: bundle.recordings.length,
  }
}

function isCampaignTransferBundle(input: unknown): input is CampaignTransferBundle {
  if (!input || typeof input !== 'object') {
    return false
  }
  const candidate = input as Partial<CampaignTransferBundle>
  return (
    candidate.version === PORTABILITY_FORMAT_VERSION &&
    typeof candidate.sourceCampaignId === 'string' &&
    Boolean(candidate.campaign) &&
    Array.isArray(candidate.members) &&
    Array.isArray(candidate.characters) &&
    Array.isArray(candidate.sessions) &&
    Array.isArray(candidate.recordings)
  )
}

function generateInviteCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

async function resolveImportedUsers(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  bundle: CampaignTransferBundle
): Promise<Map<string, string>> {
  const sourceUsers = new Map<
    string,
    {
      username: string
      displayName: string
      role: Role
    }
  >()

  bundle.members.forEach((member) => {
    sourceUsers.set(member.userId, {
      username: member.username,
      displayName: member.displayName,
      role: member.userRole,
    })
  })

  bundle.sessions.forEach((session) => {
    session.members.forEach((member) => {
      if (!sourceUsers.has(member.userId)) {
        sourceUsers.set(member.userId, {
          username: member.username,
          displayName: member.username,
          role: member.role,
        })
      }
    })

    session.messages.forEach((message) => {
      if (!sourceUsers.has(message.authorId)) {
        sourceUsers.set(message.authorId, {
          username: message.authorUsername,
          displayName: message.authorUsername,
          role: 'PLAYER',
        })
      }
    })

    session.notes.forEach((note) => {
      if (!sourceUsers.has(note.authorId)) {
        sourceUsers.set(note.authorId, {
          username: note.authorUsername,
          displayName: note.authorUsername,
          role: 'PLAYER',
        })
      }
    })

    session.logs.forEach((entry) => {
      if (entry.userId && !sourceUsers.has(entry.userId)) {
        sourceUsers.set(entry.userId, {
          username: entry.username,
          displayName: entry.username,
          role: 'PLAYER',
        })
      }
    })
  })

  bundle.characters.forEach((character) => {
    if (!sourceUsers.has(character.userId)) {
      sourceUsers.set(character.userId, {
        username: `imported-${character.name}`,
        displayName: character.name,
        role: 'PLAYER',
      })
    }
  })

  const userIdMap = new Map<string, string>()
  userIdMap.set(bundle.campaign.currentDmId, actorUserId)

  for (const [sourceUserId, sourceUser] of sourceUsers.entries()) {
    if (sourceUserId === bundle.campaign.currentDmId) {
      continue
    }

    const existing = await tx.user.findUnique({
      where: { id: sourceUserId },
      select: { id: true },
    })

    if (existing) {
      userIdMap.set(sourceUserId, existing.id)
      continue
    }

    const created = await tx.user.create({
      data: {
        username: `${slugifyUsername(sourceUser.username)}-${randomUUID().slice(0, 8)}`,
        displayName: normalizeString(sourceUser.displayName) || sourceUser.username,
        role: sourceUser.role,
      },
      select: { id: true },
    })

    userIdMap.set(sourceUserId, created.id)
  }

  return userIdMap
}

// ─── Portability: Bundle ──────────────────────────────────────────────────────

export async function buildCampaignExport(campaignId: string, actorUserId?: string | null) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      currentDm: { select: { id: true, username: true } },
      members: {
        include: {
          user: { select: { id: true, username: true, displayName: true, role: true } },
        },
        orderBy: { joinedAt: 'asc' },
      },
      characters: { orderBy: { createdAt: 'asc' } },
      sessions: {
        orderBy: { createdAt: 'asc' },
        include: {
          rooms: { orderBy: { createdAt: 'asc' } },
          members: { orderBy: { joinedAt: 'asc' } },
          messages: { orderBy: { createdAt: 'asc' } },
          notes: { orderBy: { createdAt: 'asc' } },
          logs: { orderBy: { createdAt: 'asc' } },
        },
      },
      recordings: { orderBy: { createdAt: 'asc' } },
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

  return { bundle, artifactId: artifact.id, counts }
}

export async function importCampaignBundle(
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
      membershipRows.unshift({ campaignId: campaign.id, userId: actorUserId, role: 'DM' })
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
      if (!mappedSessionId) return

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

    if (roomRows.length > 0) await tx.room.createMany({ data: roomRows as any[] })
    if (memberRows.length > 0) await tx.sessionMember.createMany({ data: memberRows as any[] })
    if (messageRows.length > 0) await tx.chatMessage.createMany({ data: messageRows as any[] })
    if (noteRows.length > 0) await tx.note.createMany({ data: noteRows as any[] })
    if (logRows.length > 0) await tx.sessionLog.createMany({ data: logRows as any[] })

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

    return { campaign, artifactId: artifact.id, counts }
  })

  return imported
}

// ─── Portability: Artifact ────────────────────────────────────────────────────

export async function createOperationalExportArtifact(
  actorUserId: string,
  settings: Record<string, unknown>,
  telemetry: Array<Record<string, unknown>>,
  diagnostics: Array<Record<string, unknown>>,
  auditLog: Array<Record<string, unknown>>
) {
  const bundle: OperationalExportBundle = {
    version: PORTABILITY_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    telemetry,
    diagnostics,
    auditLog,
  }

  const artifact = await prisma.importExportArtifact.create({
    data: {
      type: 'OPERATIONS_EXPORT',
      createdByUserId: actorUserId,
      formatVersion: PORTABILITY_FORMAT_VERSION,
      payload: bundle as unknown as Prisma.InputJsonValue,
      metadata: {
        telemetryCount: telemetry.length,
        diagnosticCount: diagnostics.length,
        auditCount: auditLog.length,
      } as Prisma.InputJsonValue,
    },
    select: { id: true },
  })

  return { artifactId: artifact.id, bundle }
}

export function isValidTransferBundle(input: unknown): input is CampaignTransferBundle {
  return isCampaignTransferBundle(input)
}

export function portabilityArtifactTypeLabel(type: PortabilityArtifactType): string {
  if (type === 'CAMPAIGN_EXPORT') return 'Campaign export'
  if (type === 'CAMPAIGN_IMPORT') return 'Campaign import'
  return 'Operations export'
}

export function defaultRecordingState(): PresenceState {
  return 'OFFLINE'
}

// ─── Portability: Recording Metadata ─────────────────────────────────────────

interface RecordingCreateInput {
  campaignId: string
  sessionId?: string | null
  roomId?: string | null
  title: string
  storageKey?: string | null
  sourceUrl?: string | null
  durationSeconds?: number | null
  startedAt?: string | null
  endedAt?: string | null
  journalSummary?: string | null
  metadata?: Prisma.InputJsonValue | null
}

export async function listRecordingMetadata(campaignId: string) {
  return prisma.recordingMetadata.findMany({
    where: { campaignId },
    orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      campaignId: true,
      sessionId: true,
      roomId: true,
      title: true,
      storageKey: true,
      sourceUrl: true,
      durationSeconds: true,
      startedAt: true,
      endedAt: true,
      journalSummary: true,
      metadata: true,
      session: { select: { id: true, name: true } },
      room: { select: { id: true, name: true } },
      createdAt: true,
      updatedAt: true,
    },
  })
}

export async function createRecordingMetadata(input: RecordingCreateInput) {
  return prisma.recordingMetadata.create({
    data: {
      campaignId: input.campaignId,
      sessionId: input.sessionId || null,
      roomId: input.roomId || null,
      title: input.title,
      storageKey: input.storageKey || null,
      sourceUrl: input.sourceUrl || null,
      durationSeconds: input.durationSeconds || null,
      startedAt: toDate(input.startedAt),
      endedAt: toDate(input.endedAt),
      journalSummary: input.journalSummary || null,
      metadata: input.metadata || undefined,
    },
    select: {
      id: true,
      campaignId: true,
      sessionId: true,
      roomId: true,
      title: true,
      storageKey: true,
      sourceUrl: true,
      durationSeconds: true,
      startedAt: true,
      endedAt: true,
      journalSummary: true,
      metadata: true,
      session: { select: { id: true, name: true } },
      room: { select: { id: true, name: true } },
      createdAt: true,
      updatedAt: true,
    },
  })
}

// ─── Campaign Operations ──────────────────────────────────────────────────────

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

  if (!isValidTransferBundle(bundle)) {
    return {
      status: 400,
      body: { error: 'Invalid campaign transfer bundle', code: 'INVALID_TRANSFER_BUNDLE' },
    }
  }

  const imported = await importCampaignBundle(params.actor.userId, bundle, name)

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

// ─── Integrations ─────────────────────────────────────────────────────────────

type IntegrationMutationSuccess = {
  ok: true
  message: string
  system: ReturnType<typeof listExternalSystems>[number]
  audit: {
    action:
      | 'INTEGRATION_SYSTEM_AUTHORIZE'
      | 'INTEGRATION_SYSTEM_BLOCK'
      | 'INTEGRATION_SYSTEM_UPDATE'
    targetType: 'EXTERNAL_SYSTEM'
    targetId: string
    metadata: Record<string, unknown>
  }
}

type IntegrationMutationFailure = {
  ok: false
  code: 'NOT_FOUND'
  message: string
}

type IntegrationMutationResult = IntegrationMutationSuccess | IntegrationMutationFailure

export function listAdminIntegrationSystemsPayload(): {
  systems: Array<
    ReturnType<typeof listExternalSystems>[number] & {
      metrics: { linkedUsers: number; requests24h: number; lastSeenAt: null }
    }
  >
} {
  return {
    systems: listExternalSystems().map((system) => ({
      ...system,
      metrics: { linkedUsers: 0, requests24h: 0, lastSeenAt: null },
    })),
  }
}

export function authorizeAdminIntegrationSystem(system: string): IntegrationMutationResult {
  const result = updateExternalSystem(system, { authorizationState: 'AUTHORIZED' })

  if (!result) {
    return { ok: false, code: 'NOT_FOUND', message: 'External system not found' }
  }

  return {
    ok: true,
    message: 'External system authorized',
    system: result.next,
    audit: {
      action: 'INTEGRATION_SYSTEM_AUTHORIZE',
      targetType: 'EXTERNAL_SYSTEM',
      targetId: result.next.system,
      metadata: {
        previousState: result.previous.authorizationState,
        nextState: result.next.authorizationState,
        allowedScopes: result.next.allowedScopes,
      },
    },
  }
}

export function blockAdminIntegrationSystem(system: string): IntegrationMutationResult {
  const result = updateExternalSystem(system, { authorizationState: 'BLOCKED' })

  if (!result) {
    return { ok: false, code: 'NOT_FOUND', message: 'External system not found' }
  }

  return {
    ok: true,
    message: 'External system blocked',
    system: result.next,
    audit: {
      action: 'INTEGRATION_SYSTEM_BLOCK',
      targetType: 'EXTERNAL_SYSTEM',
      targetId: result.next.system,
      metadata: {
        previousState: result.previous.authorizationState,
        nextState: result.next.authorizationState,
        allowedScopes: result.next.allowedScopes,
      },
    },
  }
}

export function updateAdminIntegrationSystem(params: {
  system: string
  body: Record<string, unknown>
}): IntegrationMutationResult {
  const state = String(params.body.authorizationState || '')
    .trim()
    .toUpperCase()
  const authorizationState =
    state === 'AUTHORIZED' || state === 'LOG_ONLY' || state === 'BLOCKED' ? state : undefined

  const result = updateExternalSystem(params.system, {
    authorizationState,
    displayName: params.body.displayName,
    notes: params.body.notes,
    allowedScopes: params.body.allowedScopes,
  })

  if (!result) {
    return { ok: false, code: 'NOT_FOUND', message: 'External system not found' }
  }

  return {
    ok: true,
    message: 'External system updated',
    system: result.next,
    audit: {
      action: 'INTEGRATION_SYSTEM_UPDATE',
      targetType: 'EXTERNAL_SYSTEM',
      targetId: result.next.system,
      metadata: {
        previousState: result.previous.authorizationState,
        nextState: result.next.authorizationState,
        previousScopes: result.previous.allowedScopes,
        nextScopes: result.next.allowedScopes,
        previousDisplayName: result.previous.displayName,
        nextDisplayName: result.next.displayName,
      },
    },
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface RuntimeAdminSettingsState {
  primaryRegion: string
  maintenanceMode: 'off' | 'read-only' | 'full'
  chatPipelineEnabled: boolean
  audioOverridesEnabled: boolean
  logRetentionDays: number
  backupWindow: string
  updatedAt: string
}

const runtimeSettingsDefaults: Omit<RuntimeAdminSettingsState, 'updatedAt'> = {
  primaryRegion: 'us-east-1',
  maintenanceMode: 'off',
  chatPipelineEnabled: true,
  audioOverridesEnabled: true,
  logRetentionDays: 30,
  backupWindow: '02:00 UTC',
}

let runtimeSettingsState: RuntimeAdminSettingsState = {
  ...runtimeSettingsDefaults,
  updatedAt: new Date().toISOString(),
}

export function getRuntimeAdminSettingsState(): RuntimeAdminSettingsState {
  return runtimeSettingsState
}

export function updateRuntimeAdminSettingsFromBody(
  body: Record<string, unknown>
): RuntimeAdminSettingsState {
  runtimeSettingsState = {
    ...runtimeSettingsState,
    primaryRegion:
      typeof body.primaryRegion === 'string' && body.primaryRegion.trim()
        ? body.primaryRegion.trim()
        : runtimeSettingsState.primaryRegion,
    maintenanceMode:
      body.maintenanceMode === 'off' ||
      body.maintenanceMode === 'read-only' ||
      body.maintenanceMode === 'full'
        ? body.maintenanceMode
        : runtimeSettingsState.maintenanceMode,
    chatPipelineEnabled:
      typeof body.chatPipelineEnabled === 'boolean'
        ? body.chatPipelineEnabled
        : runtimeSettingsState.chatPipelineEnabled,
    audioOverridesEnabled:
      typeof body.audioOverridesEnabled === 'boolean'
        ? body.audioOverridesEnabled
        : runtimeSettingsState.audioOverridesEnabled,
    logRetentionDays:
      typeof body.logRetentionDays === 'number' && body.logRetentionDays >= 1
        ? Math.round(body.logRetentionDays)
        : runtimeSettingsState.logRetentionDays,
    backupWindow:
      typeof body.backupWindow === 'string' && body.backupWindow.trim()
        ? body.backupWindow.trim()
        : runtimeSettingsState.backupWindow,
    updatedAt: new Date().toISOString(),
  }

  return runtimeSettingsState
}

export function buildLogRetentionPatch(
  body: Record<string, unknown>
): Partial<LogRetentionSettings> {
  return {
    telemetryRetentionDays: body.telemetryRetentionDays as number | undefined,
    telemetryMaxFileSizeMb: body.telemetryMaxFileSizeMb as number | undefined,
    telemetryMaxFiles: body.telemetryMaxFiles as number | undefined,
    diagnosticRetentionDays: body.diagnosticRetentionDays as number | undefined,
    diagnosticMaxFileSizeMb: body.diagnosticMaxFileSizeMb as number | undefined,
    diagnosticMaxFiles: body.diagnosticMaxFiles as number | undefined,
  }
}

export function mergeAdminSettingsWithRetention(
  runtime: RuntimeAdminSettingsState,
  retention: LogRetentionSettings
): RuntimeAdminSettingsState & LogRetentionSettings {
  return {
    ...runtime,
    telemetryRetentionDays: retention.telemetryRetentionDays,
    telemetryMaxFileSizeMb: retention.telemetryMaxFileSizeMb,
    telemetryMaxFiles: retention.telemetryMaxFiles,
    diagnosticRetentionDays: retention.diagnosticRetentionDays,
    diagnosticMaxFileSizeMb: retention.diagnosticMaxFileSizeMb,
    diagnosticMaxFiles: retention.diagnosticMaxFiles,
  }
}

// ─── Settings Backup ──────────────────────────────────────────────────────────

export function buildSettingsBackupQueuedPayload(): {
  message: string
  queuedAt: string
  auditMetadata: { triggeredAt: string }
} {
  const queuedAt = new Date().toISOString()
  return {
    message: 'Backup queued successfully',
    queuedAt,
    auditMetadata: { triggeredAt: queuedAt },
  }
}

export async function buildSettingsOperationsExportPayload(actorUserId: string): Promise<{
  message: string
  artifactId: string
  bundle: unknown
  auditMetadata: {
    artifactId: string
    telemetryCount: number
    diagnosticCount: number
    auditCount: number
  }
}> {
  const [telemetry, diagnostics, auditLog] = await Promise.all([
    loadTelemetryEvents(),
    loadDiagnosticEvents(),
    prisma.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 250,
      select: {
        id: true,
        actorUserId: true,
        actorName: true,
        actorRole: true,
        action: true,
        targetType: true,
        targetId: true,
        outcome: true,
        reason: true,
        metadata: true,
        createdAt: true,
      },
    }),
  ])

  const exported = await createOperationalExportArtifact(
    actorUserId,
    getRuntimeAdminSettingsState(),
    telemetry.map((entry) => ({ ...entry })),
    diagnostics.map((entry) => ({ ...entry })),
    auditLog.map((entry) => ({
      ...entry,
      createdAt: entry.createdAt.toISOString(),
    })) as Array<Record<string, unknown>>
  )

  return {
    message: 'Operations export created successfully',
    artifactId: exported.artifactId,
    bundle: exported.bundle,
    auditMetadata: {
      artifactId: exported.artifactId,
      telemetryCount: telemetry.length,
      diagnosticCount: diagnostics.length,
      auditCount: auditLog.length,
    },
  }
}

// ─── Telemetry ────────────────────────────────────────────────────────────────

export async function buildAdminTelemetryDashboardPayload(params: {
  activeUsers: number
}): Promise<{
  activeUsers: number
  activeRooms: number
  recentErrors: number
  systemLoadPercent: number
  messageThroughputPerMinute: number
  storageUsagePercent: number
  totalUsers: number
  suspendedUsers: number
  activeCampaigns: number
  recentModerationActions: number
  clientTelemetryEventsLastHour: number
  topClientEvents: Array<{ event: string; count: number }>
}> {
  const sessions = await getAllSessions()
  const chat = await getChatTelemetrySnapshot()
  const memory = process.memoryUsage()
  const activeSessions = sessions.filter((session) => session.state === 'ACTIVE').length
  const memoryUsedMb = Math.round(memory.heapUsed / 1024 / 1024)
  const memoryTotalMb = Math.max(1, Math.round(memory.heapTotal / 1024 / 1024))
  const storageUsagePercent = Math.min(99, Math.round((memoryUsedMb / memoryTotalMb) * 100))

  const recentErrors = logger
    .getHistory()
    .filter((entry) => entry.level === 'ERROR')
    .filter(
      (entry) => Date.now() - new Date(entry.timestamp).getTime() <= 24 * 60 * 60 * 1000
    ).length

  const telemetryEvents = await loadTelemetryEvents()
  const clientTelemetryLastHour = telemetryEvents.filter(
    (entry) => Date.now() - new Date(entry.timestamp).getTime() <= 60 * 60 * 1000
  )

  const topClientEvents = Object.entries(
    clientTelemetryLastHour.reduce(
      (acc, entry) => {
        const eventName = String(entry.message || 'unknown')
        acc[eventName] = (acc[eventName] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([event, count]) => ({ event, count }))

  const [totalUsers, suspendedUsers, activeCampaigns, recentModerationActions] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: false } }),
    prisma.campaign.count(),
    prisma.adminAuditLog.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        action: { in: ['USER_SUSPEND', 'USER_RESTORE', 'USER_FORCE_LOGOUT', 'USER_PROMOTE'] },
      },
    }),
  ])

  return {
    activeUsers: params.activeUsers,
    activeRooms: activeSessions,
    recentErrors,
    systemLoadPercent: Math.min(100, Math.round((os.loadavg()[0] / 4) * 100)),
    messageThroughputPerMinute: chat.messagesLastMinute,
    storageUsagePercent,
    totalUsers,
    suspendedUsers,
    activeCampaigns,
    recentModerationActions,
    clientTelemetryEventsLastHour: clientTelemetryLastHour.length,
    topClientEvents,
  }
}

export async function buildAdminTelemetryStatusPayload(): Promise<{
  cards: {
    cpuPercent: number
    memoryPercent: number
    diskPercent: number
    networkLatencyMs: number
    livekitStatus: string
    databaseStatus: string
  }
  charts: {
    cpuLoad24h: Array<{ x: number; y: number }>
    messageThroughput24h: Array<{ x: number; y: number }>
  }
  uptimeSec: number
  clientTelemetryEventsLastHour: number
}> {
  const memory = process.memoryUsage()
  const load = os.loadavg()
  const uptimeSec = process.uptime()
  const chat = await getChatTelemetrySnapshot()
  const telemetryEvents = await loadTelemetryEvents()
  const clientTelemetryLastHour = telemetryEvents.filter(
    (entry) => Date.now() - new Date(entry.timestamp).getTime() <= 60 * 60 * 1000
  )

  return {
    cards: {
      cpuPercent: Math.min(100, Math.round((load[0] / 4) * 100)),
      memoryPercent: Math.min(
        100,
        Math.round((memory.heapUsed / Math.max(memory.heapTotal, 1)) * 100)
      ),
      diskPercent: 72,
      networkLatencyMs: 35,
      livekitStatus: 'Online',
      databaseStatus: 'Online',
    },
    charts: {
      cpuLoad24h: Array.from({ length: 12 }, (_, idx) => ({
        x: idx,
        y: Math.min(100, Math.round((load[0] / 4) * 100) + ((idx % 3) - 1) * 3),
      })),
      messageThroughput24h: Array.from({ length: 12 }, (_, idx) => ({
        x: idx,
        y: Math.max(0, chat.messagesLastMinute + ((idx % 4) - 1) * 2),
      })),
    },
    uptimeSec,
    clientTelemetryEventsLastHour: clientTelemetryLastHour.length,
  }
}

function parseTimeRange(value: string | undefined): number {
  switch (value) {
    case '1h':
      return 60 * 60 * 1000
    case '7d':
      return 7 * 24 * 60 * 60 * 1000
    default:
      return 24 * 60 * 60 * 1000
  }
}

type TelemetrySortBy = 'timestamp' | 'severity' | 'source' | 'message'
type TelemetrySortDir = 'asc' | 'desc'

function parseSortBy(value: string | undefined): TelemetrySortBy {
  if (value === 'severity' || value === 'source' || value === 'message') return value
  return 'timestamp'
}

function parseSortDir(value: string | undefined): TelemetrySortDir {
  return value === 'asc' ? 'asc' : 'desc'
}

type TelemetryLogEntry = {
  id: string
  timestamp: string
  severity: string
  source: string
  message: string
  details: unknown
}

export async function buildAdminTelemetryLogsListPayload(params: {
  query: Record<string, unknown>
}): Promise<{
  logs: TelemetryLogEntry[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  sortBy: TelemetrySortBy
  sortDir: TelemetrySortDir
}> {
  const timeRange = parseTimeRange(
    typeof params.query.timeRange === 'string' ? params.query.timeRange : undefined
  )
  const severity =
    typeof params.query.severity === 'string' ? params.query.severity.toUpperCase() : undefined
  const source =
    typeof params.query.source === 'string' ? params.query.source.toLowerCase() : undefined
  const userId = typeof params.query.userId === 'string' ? params.query.userId.trim() : undefined
  const roomId = typeof params.query.roomId === 'string' ? params.query.roomId.trim() : undefined
  const page = Math.max(1, Number(params.query.page || 1))
  const pageSize = Math.min(200, Math.max(1, Number(params.query.pageSize || 25)))
  const sortBy = parseSortBy(
    typeof params.query.sortBy === 'string' ? params.query.sortBy : undefined
  )
  const sortDir = parseSortDir(
    typeof params.query.sortDir === 'string' ? params.query.sortDir.toLowerCase() : undefined
  )

  const now = Date.now()
  const minTs = now - timeRange

  const severityRank: Record<string, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }

  const runtimeHistory = logger.getHistory().map((entry) => ({
    timestamp: entry.timestamp,
    severity: entry.level,
    source: entry.context,
    message: entry.message,
    details: (entry.meta || {}) as Record<string, unknown>,
  }))

  await persistDiagnosticEvents(runtimeHistory)

  const runtimeLogs = (await loadDiagnosticEvents())
    .filter((entry) => new Date(entry.timestamp).getTime() >= minTs)
    .filter((entry) => (severity && severity !== 'ALL' ? entry.severity === severity : true))
    .filter((entry) =>
      source && source !== 'all' ? entry.source.toLowerCase().includes(source) : true
    )
    .filter((entry) => {
      if (!userId) return true
      return JSON.stringify(entry.details || {})
        .toLowerCase()
        .includes(userId.toLowerCase())
    })
    .filter((entry) => {
      if (!roomId) return true
      return JSON.stringify(entry.details || {})
        .toLowerCase()
        .includes(roomId.toLowerCase())
    })
    .map((entry) => ({
      id: `diagnostic-${entry.id}`,
      timestamp: entry.timestamp,
      severity: entry.severity,
      source: entry.source,
      message: entry.message,
      details: entry.details,
    }))

  const auditRows = await prisma.adminAuditLog.findMany({
    where: { createdAt: { gte: new Date(minTs) } },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  })

  const auditLogs = auditRows
    .map((row) => ({
      id: `audit-${row.id}`,
      timestamp: row.createdAt.toISOString(),
      severity: row.outcome === 'FAILED' || row.outcome === 'DENIED' ? 'WARN' : 'INFO',
      source: 'admin-audit',
      message: `${row.action} ${row.outcome}`,
      details: {
        actorUserId: row.actorUserId,
        actorName: row.actorName,
        actorRole: row.actorRole,
        targetType: row.targetType,
        targetId: row.targetId,
        reason: row.reason,
        metadata: row.metadata,
      },
    }))
    .filter((entry) => (severity && severity !== 'ALL' ? entry.severity === severity : true))
    .filter((entry) =>
      source && source !== 'all' ? entry.source.toLowerCase().includes(source) : true
    )
    .filter((entry) => {
      if (!userId) return true
      return JSON.stringify(entry.details || {})
        .toLowerCase()
        .includes(userId.toLowerCase())
    })
    .filter((entry) => {
      if (!roomId) return true
      return JSON.stringify(entry.details || {})
        .toLowerCase()
        .includes(roomId.toLowerCase())
    })

  const telemetryLogs = (await loadTelemetryEvents())
    .filter((entry) => new Date(entry.timestamp).getTime() >= minTs)
    .map((entry) => ({
      id: `telemetry-${entry.id}`,
      timestamp: entry.timestamp,
      severity: entry.severity,
      source: entry.source,
      message: entry.message,
      details: entry.details,
    }))
    .filter((entry) => (severity && severity !== 'ALL' ? entry.severity === severity : true))
    .filter((entry) =>
      source && source !== 'all' ? entry.source.toLowerCase().includes(source) : true
    )
    .filter((entry) => {
      if (!userId) return true
      return JSON.stringify(entry.details || {})
        .toLowerCase()
        .includes(userId.toLowerCase())
    })
    .filter((entry) => {
      if (!roomId) return true
      return JSON.stringify(entry.details || {})
        .toLowerCase()
        .includes(roomId.toLowerCase())
    })

  const filtered = [...runtimeLogs, ...auditLogs, ...telemetryLogs]

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    if (sortBy === 'timestamp') {
      cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    } else if (sortBy === 'severity') {
      cmp = (severityRank[a.severity] ?? 0) - (severityRank[b.severity] ?? 0)
    } else if (sortBy === 'source') {
      cmp = a.source.localeCompare(b.source)
    } else {
      cmp = a.message.localeCompare(b.message)
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  const total = sorted.length
  const start = (page - 1) * pageSize
  const logs = sorted.slice(start, start + pageSize)

  return {
    logs,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    sortBy,
    sortDir,
  }
}

export async function resolveAdminTelemetryLogById(logId: string): Promise<{
  status: number
  body: Record<string, unknown>
}> {
  const normalizedLogId = logId.trim()

  if (!normalizedLogId) {
    return { status: 400, body: { error: 'logId is required', code: 'INVALID_LOG_ID' } }
  }

  if (normalizedLogId.startsWith('diagnostic-')) {
    const diagnosticId = normalizedLogId.slice('diagnostic-'.length)
    const row = await findDiagnosticEventById(diagnosticId)

    if (!row) {
      return { status: 404, body: { error: 'Log entry not found', code: 'NOT_FOUND' } }
    }

    return {
      status: 200,
      body: {
        log: {
          id: `diagnostic-${row.id}`,
          timestamp: row.timestamp,
          severity: row.severity,
          source: row.source,
          message: row.message,
          details: row.details,
        },
      },
    }
  }

  if (normalizedLogId.startsWith('audit-')) {
    const auditId = normalizedLogId.slice('audit-'.length)
    const row = await prisma.adminAuditLog.findUnique({ where: { id: auditId } })

    if (!row) {
      return { status: 404, body: { error: 'Log entry not found', code: 'NOT_FOUND' } }
    }

    return {
      status: 200,
      body: {
        log: {
          id: `audit-${row.id}`,
          timestamp: row.createdAt.toISOString(),
          severity: row.outcome === 'FAILED' || row.outcome === 'DENIED' ? 'WARN' : 'INFO',
          source: 'admin-audit',
          message: `${row.action} ${row.outcome}`,
          details: {
            actorUserId: row.actorUserId,
            actorName: row.actorName,
            actorRole: row.actorRole,
            targetType: row.targetType,
            targetId: row.targetId,
            reason: row.reason,
            metadata: row.metadata,
          },
        },
      },
    }
  }

  if (normalizedLogId.startsWith('telemetry-')) {
    const telemetryId = normalizedLogId.slice('telemetry-'.length)
    const row = await findTelemetryEventById(telemetryId)

    if (!row) {
      return { status: 404, body: { error: 'Log entry not found', code: 'NOT_FOUND' } }
    }

    return {
      status: 200,
      body: {
        log: {
          id: `telemetry-${row.id}`,
          timestamp: row.timestamp,
          severity: row.severity,
          source: row.source,
          message: row.message,
          details: row.details,
        },
      },
    }
  }

  return {
    status: 400,
    body: {
      error: 'This log source does not support durable drill-down',
      code: 'DRILLDOWN_NOT_SUPPORTED',
    },
  }
}

// ─── Users ────────────────────────────────────────────────────────────────────

function coerceUsersRoleFilter(value: unknown): AdminUsersRoleFilter {
  const normalized = String(value || 'all').toLowerCase()
  if ((ADMIN_USERS_ROLE_FILTERS as readonly string[]).includes(normalized)) {
    return normalized
  }
  return 'all'
}

function coerceUsersStatusFilter(value: unknown): AdminUsersStatusFilter {
  const normalized = String(value || 'all').toLowerCase()
  if ((ADMIN_USERS_STATUS_FILTERS as readonly string[]).includes(normalized)) {
    return normalized
  }
  return 'all'
}

function getUserEffectiveAdminRole(
  row: Pick<AdminUsersRepositoryRow, 'role' | 'adminRole'>
): 'SUPER_ADMIN' | 'ADMIN' | 'CAMPAIGN_DM' | 'READ_ONLY' | null {
  if (
    row.adminRole === 'SUPER_ADMIN' ||
    row.adminRole === 'ADMIN' ||
    row.adminRole === 'READ_ONLY'
  ) {
    return row.adminRole
  }
  if (row.adminRole === 'CAMPAIGN_DM' || row.role === 'DM') {
    return 'CAMPAIGN_DM'
  }
  return null
}

function toUserListItem(row: AdminUsersRepositoryRow): AdminUsersListItem {
  return { ...row, effectiveAdminRole: getUserEffectiveAdminRole(row) }
}

export function parseAdminUsersListRequest(query: {
  search?: unknown
  role?: unknown
  status?: unknown
  page?: unknown
  pageSize?: unknown
}): AdminUsersListRequest {
  const page = Math.max(
    ADMIN_USERS_DEFAULT_LIST_PAGE,
    Number(query.page || ADMIN_USERS_DEFAULT_LIST_PAGE)
  )
  const pageSize = Math.min(
    ADMIN_USERS_MAX_LIST_PAGE_SIZE,
    Math.max(1, Number(query.pageSize || ADMIN_USERS_DEFAULT_LIST_PAGE_SIZE))
  )

  return {
    search: String(query.search || '').trim(),
    roleFilter: coerceUsersRoleFilter(query.role),
    statusFilter: coerceUsersStatusFilter(query.status),
    page,
    pageSize,
  }
}

export async function listAdminUsersForRequest(
  request: AdminUsersListRequest
): Promise<AdminUsersListResult> {
  const { users, total } = await listAdminUsers(request)

  return {
    users: users.map(toUserListItem),
    total,
    page: request.page,
    pageSize: request.pageSize,
    totalPages: Math.max(1, Math.ceil(total / request.pageSize)),
  }
}

function toUserExportRow(row: AdminUsersRepositoryRow): AdminUsersExportRow {
  return {
    id: row.id,
    username: row.username,
    email: row.email || '',
    displayName: row.displayName || '',
    role: row.role,
    adminRole: row.adminRole || '',
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function parseAdminUsersExportFormat(value: unknown): AdminUsersExportFormat {
  return String(value || ADMIN_USERS_DEFAULT_EXPORT_FORMAT).toLowerCase() === 'csv' ? 'csv' : 'json'
}

export async function getAdminUsersExportRows(): Promise<AdminUsersExportRow[]> {
  const rows = await listAdminUsersForExport()
  return rows.map(toUserExportRow)
}

export function createAdminUsersCsv(rows: AdminUsersExportRow[]): string {
  const escape = (value: string | boolean) => {
    const cell = String(value)
    return cell.includes(',') || cell.includes('"') || cell.includes('\n')
      ? `"${cell.replace(/"/g, '""')}"`
      : cell
  }

  return [
    ADMIN_USERS_EXPORT_CSV_HEADERS.join(','),
    ...rows.map((row) =>
      ADMIN_USERS_EXPORT_CSV_HEADERS.map((header) => escape(row[header])).join(',')
    ),
  ].join('\n')
}

type ImportPreviewValidationError = {
  ok: false
  code: 'INVALID_BODY' | 'TOO_MANY_ROWS'
  message: string
}

type ImportPreviewValidationSuccess = {
  ok: true
  users: AdminUsersImportCandidate[]
}

type ImportPreviewValidationResult = ImportPreviewValidationError | ImportPreviewValidationSuccess

function validateImportPreviewRequest(body: unknown): ImportPreviewValidationResult {
  const request = body as AdminUsersImportPreviewRequest
  if (!request || !Array.isArray(request.users) || request.users.length === 0) {
    return { ok: false, code: 'INVALID_BODY', message: 'Body must contain a non-empty users array' }
  }

  if (request.users.length > ADMIN_USERS_IMPORT_PREVIEW_MAX_ROWS) {
    return {
      ok: false,
      code: 'TOO_MANY_ROWS',
      message: `Import preview limited to ${ADMIN_USERS_IMPORT_PREVIEW_MAX_ROWS} rows per batch`,
    }
  }

  return { ok: true, users: request.users }
}

export async function previewAdminUsersImport(params: {
  body: unknown
}): Promise<
  | { ok: true; data: AdminUsersImportPreviewResult }
  | { ok: false; code: 'INVALID_BODY' | 'TOO_MANY_ROWS'; message: string }
> {
  const validation = validateImportPreviewRequest(params.body)
  if (!validation.ok) {
    return validation
  }

  const usernames = validation.users
    .map((user) => String(user.username || '').trim())
    .filter((username) => username.length > 0)

  const existingSet = new Set(await findExistingUsernames(usernames))

  const preview = validation.users.map((user, idx) => {
    const username = String(user.username || '')
    return {
      index: idx,
      username,
      email: String(user.email || ''),
      displayName: String(user.displayName || user.username || ''),
      role: String(user.role || ADMIN_USERS_IMPORT_PREVIEW_DEFAULT_ROLE),
      conflict: existingSet.has(username),
      valid: username.trim().length >= ADMIN_USERS_IMPORT_PREVIEW_MIN_USERNAME_LENGTH,
    }
  })

  const importable = preview.filter((row) => row.valid && !row.conflict).length

  return {
    ok: true,
    data: { preview, importable, total: validation.users.length },
  }
}

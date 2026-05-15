/**
 * DEV Mock Players Service
 *
 * DEV-only helper for generating realistic mock players in-session so DM flows
 * can be exercised solo (drag groups, mute/conditions, environment changes).
 */

import { getPrismaClient } from '@/infra/db'
import { createToken, hashPassword } from '@/services/auth.service'
import { getSessionPresence, getRooms, joinRoom, leaveRoom } from '@/services/room.service'
import { addUserToSession, removeUserFromSession } from '@/services/session/core.service'
import {
  DEV_MOCK_AVATAR_URL,
  DEV_MOCK_EMAIL_DOMAIN,
  DEV_MOCK_PREFIX,
  MAX_DEV_MOCK_PLAYERS,
  MIN_DEV_MOCK_PLAYERS,
} from '@/constants/dev-mock.constants'
import { logger } from '@/utils/logger'
import { Prisma } from '@prisma/client'
import { PresenceState, Role, RoomType } from '@shared'
import type { UUID } from '@shared'

const prisma = getPrismaClient()

const campaignRosterByCampaignId = new Map<UUID, string[]>()
const sessionRosterBySessionId = new Map<UUID, string[]>()

type MockArchetype = {
  slug: string
  playerName: string
  characterName: string
  race: string
  className: string
  subclass?: string
}

function resolveMockAvatarUrl(race: string): string {
  const normalized = race.trim().toLowerCase()

  if (
    normalized.includes('dwarf') ||
    normalized.includes('goliath') ||
    normalized.includes('orc')
  ) {
    return '/branding/mock-races/warden-robot.svg'
  }

  if (
    normalized.includes('elf') ||
    normalized.includes('eladrin') ||
    normalized.includes('shadar')
  ) {
    return '/branding/mock-races/fey-robot.svg'
  }

  if (
    normalized.includes('tiefling') ||
    normalized.includes('dragonborn') ||
    normalized.includes('aasimar')
  ) {
    return '/branding/mock-races/arcane-robot.svg'
  }

  if (normalized.includes('gnome') || normalized.includes('halfling')) {
    return '/branding/mock-races/scout-robot.svg'
  }

  return DEV_MOCK_AVATAR_URL
}

const DND_ARCHETYPES: MockArchetype[] = [
  {
    slug: 'alric',
    playerName: 'Alric Stone',
    characterName: 'Brom Ironshield',
    race: 'Dwarf',
    className: 'Fighter',
    subclass: 'Champion',
  },
  {
    slug: 'lyra',
    playerName: 'Lyra Voss',
    characterName: 'Selene Nightbloom',
    race: 'Elf',
    className: 'Wizard',
    subclass: 'Evocation',
  },
  {
    slug: 'merric',
    playerName: 'Merric Dale',
    characterName: 'Pip Underbough',
    race: 'Halfling',
    className: 'Rogue',
    subclass: 'Thief',
  },
  {
    slug: 'kael',
    playerName: 'Kael Thorn',
    characterName: 'Riven Emberhand',
    race: 'Human',
    className: 'Warlock',
    subclass: 'Fiend',
  },
  {
    slug: 'iora',
    playerName: 'Iora Fen',
    characterName: 'Sister Ilyana',
    race: 'Human',
    className: 'Cleric',
    subclass: 'Life',
  },
  {
    slug: 'brakka',
    playerName: 'Brakka Rune',
    characterName: 'Grommash',
    race: 'Half-Orc',
    className: 'Barbarian',
    subclass: 'Berserker',
  },
  {
    slug: 'nyx',
    playerName: 'Nyx Vale',
    characterName: 'Astra Moonveil',
    race: 'Tiefling',
    className: 'Sorcerer',
    subclass: 'Draconic',
  },
  {
    slug: 'tamsin',
    playerName: 'Tamsin Crow',
    characterName: 'Willow Reed',
    race: 'Half-Elf',
    className: 'Bard',
    subclass: 'Lore',
  },
  {
    slug: 'voren',
    playerName: 'Voren Pike',
    characterName: 'Krag Bonespear',
    race: 'Goliath',
    className: 'Paladin',
    subclass: 'Vengeance',
  },
  {
    slug: 'elowen',
    playerName: 'Elowen Briar',
    characterName: 'Faelar Mossstep',
    race: 'Wood Elf',
    className: 'Ranger',
    subclass: 'Hunter',
  },
  {
    slug: 'doran',
    playerName: 'Doran Flint',
    characterName: 'Magnus Gearwright',
    race: 'Rock Gnome',
    className: 'Artificer',
    subclass: 'Battle Smith',
  },
  {
    slug: 'sable',
    playerName: 'Sable Drift',
    characterName: 'Shade Whispers',
    race: 'Shadar-kai',
    className: 'Monk',
    subclass: 'Shadow',
  },
  {
    slug: 'kestrel',
    playerName: 'Kestrel Ash',
    characterName: 'Captain Rowen',
    race: 'Human',
    className: 'Fighter',
    subclass: 'Battle Master',
  },
  {
    slug: 'orin',
    playerName: 'Orin Frost',
    characterName: 'Tharn Icevein',
    race: 'Dragonborn',
    className: 'Paladin',
    subclass: 'Devotion',
  },
  {
    slug: 'vexa',
    playerName: 'Vexa Dusk',
    characterName: 'Mira Starfall',
    race: 'Tiefling',
    className: 'Wizard',
    subclass: 'Illusion',
  },
  {
    slug: 'fenric',
    playerName: 'Fenric Hale',
    characterName: 'Rook Grey',
    race: 'Half-Elf',
    className: 'Rogue',
    subclass: 'Arcane Trickster',
  },
  {
    slug: 'zana',
    playerName: 'Zana Quill',
    characterName: 'Brother Sol',
    race: 'Aasimar',
    className: 'Cleric',
    subclass: 'Light',
  },
  {
    slug: 'torin',
    playerName: 'Torin Gale',
    characterName: 'Skarn Thunderjaw',
    race: 'Half-Orc',
    className: 'Barbarian',
    subclass: 'Totem Warrior',
  },
  {
    slug: 'lumen',
    playerName: 'Lumen Vale',
    characterName: 'Cyris Dawnsong',
    race: 'Eladrin',
    className: 'Bard',
    subclass: 'Glamour',
  },
  {
    slug: 'jasper',
    playerName: 'Jasper Reed',
    characterName: 'Nimble Cog',
    race: 'Forest Gnome',
    className: 'Druid',
    subclass: 'Moon',
  },
]

export interface MockPlayerDef {
  id: UUID
  username: string
  displayName: string
  email: string | null
}

function normalizeRoomName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function isMockUsername(username: string): boolean {
  return username.startsWith(DEV_MOCK_PREFIX)
}

function shuffle<T>(source: T[]): T[] {
  const next = [...source]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function pickRosterSize(): number {
  return clamp(
    MIN_DEV_MOCK_PLAYERS +
      Math.floor(Math.random() * (MAX_DEV_MOCK_PLAYERS - MIN_DEV_MOCK_PLAYERS + 1)),
    MIN_DEV_MOCK_PLAYERS,
    MAX_DEV_MOCK_PLAYERS
  )
}

function normalizeRequestedRosterSize(value?: number): number | null {
  if (!Number.isFinite(value)) {
    return null
  }

  return clamp(
    Math.floor(value as number),
    1,
    Math.min(MAX_DEV_MOCK_PLAYERS, DND_ARCHETYPES.length)
  )
}

function sameRosterSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  const leftSorted = [...left].sort().join('|')
  const rightSorted = [...right].sort().join('|')
  return leftSorted === rightSorted
}

function pickRerollRosterSlugs(params: { size: number; avoidSlugs?: string[] }): string[] {
  const avoidSlugs = new Set(params.avoidSlugs || [])
  const pool = DND_ARCHETYPES.map((entry) => entry.slug)
  const maxAttempts = 12

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = shuffle(pool).slice(0, params.size)
    if (!sameRosterSet(candidate, params.avoidSlugs || [])) {
      return candidate
    }
  }

  const nonAvoided = pool.filter((slug) => !avoidSlugs.has(slug))
  if (nonAvoided.length > 0) {
    const base = shuffle(pool).slice(0, params.size)
    base[base.length - 1] = nonAvoided[0]
    return base
  }

  return shuffle(pool).slice(0, params.size)
}

function pickLevels(count: number): number[] {
  const base = 3 + Math.floor(Math.random() * 12)
  return Array.from({ length: count }, () => clamp(base + Math.floor(Math.random() * 3) - 1, 1, 20))
}

function buildStatBlock(level: number): Prisma.InputJsonValue {
  const proficiencyBonus = level >= 17 ? 6 : level >= 13 ? 5 : level >= 9 ? 4 : level >= 5 ? 3 : 2
  return {
    level,
    proficiencyBonus,
    str: 8 + Math.floor(Math.random() * 10),
    dex: 8 + Math.floor(Math.random() * 10),
    con: 8 + Math.floor(Math.random() * 10),
    int: 8 + Math.floor(Math.random() * 10),
    wis: 8 + Math.floor(Math.random() * 10),
    cha: 8 + Math.floor(Math.random() * 10),
  }
}

async function upsertMockUser(archetype: MockArchetype): Promise<MockPlayerDef> {
  const username = `${DEV_MOCK_PREFIX}${archetype.slug}`
  const displayName = archetype.playerName
  const email = `${username}@${DEV_MOCK_EMAIL_DOMAIN}`
  const passwordHash = await hashPassword('dev-mock-password')
  const avatarUrl = resolveMockAvatarUrl(archetype.race)

  const user = await prisma.user.upsert({
    where: { username },
    create: {
      username,
      displayName,
      email,
      avatarUrl,
      password: passwordHash,
      role: 'PLAYER',
      authType: 'FULL',
      isActive: true,
    },
    update: {
      displayName,
      avatarUrl,
      isActive: true,
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
    },
  })

  return {
    id: user.id as UUID,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
  }
}

async function ensureCampaignCharacter(params: {
  campaignId: UUID
  user: MockPlayerDef
  archetype: MockArchetype
  level: number
}): Promise<void> {
  await prisma.campaignMembership.upsert({
    where: {
      campaignId_userId: {
        campaignId: params.campaignId,
        userId: params.user.id,
      },
    },
    create: {
      campaignId: params.campaignId,
      userId: params.user.id,
      role: 'PLAYER',
    },
    update: {
      role: 'PLAYER',
    },
  })

  const existing = await prisma.character.findFirst({
    where: {
      campaignId: params.campaignId,
      userId: params.user.id,
    },
    orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    select: { id: true },
  })

  const characterPayload = {
    name: params.archetype.characterName,
    race: params.archetype.race,
    class: params.archetype.className,
    subclass: params.archetype.subclass || null,
    avatarUrl: resolveMockAvatarUrl(params.archetype.race),
    isActive: true,
    metadata: buildStatBlock(params.level),
  }

  if (existing) {
    await prisma.character.update({
      where: { id: existing.id },
      data: characterPayload,
    })
    return
  }

  await prisma.character.create({
    data: {
      userId: params.user.id,
      campaignId: params.campaignId,
      ...characterPayload,
    },
  })
}

function pickTargetRoom(
  rooms: Array<{ id: UUID; name: string; type: RoomType }>,
  sessionState?: 'IDLE' | 'ACTIVE' | 'PAUSED' | 'ENDED' | 'CLEANUP'
) {
  const main = rooms.find((room) => room.type === RoomType.MAIN)
  const green = rooms.find((room) => {
    const normalized = normalizeRoomName(room.name)
    return normalized === 'green room' || normalized === 'green-room'
  })

  if (sessionState === 'ACTIVE' || sessionState === 'PAUSED') {
    return main || green
  }

  return green || main
}

function ensureRosterMemory(
  sessionId: UUID,
  campaignId?: UUID | null,
  forceReroll = false,
  requestedCount?: number,
  avoidSlugs?: string[]
): string[] {
  const normalizedRequestedCount = normalizeRequestedRosterSize(requestedCount)

  if (campaignId) {
    if (!forceReroll && campaignRosterByCampaignId.has(campaignId)) {
      const remembered = (campaignRosterByCampaignId.get(campaignId) as string[]).slice(
        0,
        MAX_DEV_MOCK_PLAYERS
      )
      campaignRosterByCampaignId.set(campaignId, remembered)
      return remembered
    }

    const size = normalizedRequestedCount ?? pickRosterSize()
    const slugs = pickRerollRosterSlugs({ size, avoidSlugs })
    const limitedSlugs = slugs.slice(0, MAX_DEV_MOCK_PLAYERS)
    campaignRosterByCampaignId.set(campaignId, limitedSlugs)
    return limitedSlugs
  }

  if (!forceReroll && sessionRosterBySessionId.has(sessionId)) {
    const remembered = (sessionRosterBySessionId.get(sessionId) as string[]).slice(
      0,
      MAX_DEV_MOCK_PLAYERS
    )
    sessionRosterBySessionId.set(sessionId, remembered)
    return remembered
  }

  const size = normalizedRequestedCount ?? pickRosterSize()
  const slugs = pickRerollRosterSlugs({ size, avoidSlugs })
  const limitedSlugs = slugs.slice(0, MAX_DEV_MOCK_PLAYERS)
  sessionRosterBySessionId.set(sessionId, limitedSlugs)
  return limitedSlugs
}

async function removeMockMembersFromSession(
  sessionId: UUID,
  members: Array<{ userId: UUID; username: string }>
): Promise<void> {
  if (members.length === 0) {
    return
  }

  const rooms = await getRooms(sessionId)

  for (const member of members) {
    for (const room of rooms) {
      await leaveRoom({
        sessionId,
        roomId: room.id as UUID,
        userId: member.userId,
        state: PresenceState.OFFLINE,
      })
    }

    await removeUserFromSession(sessionId, member.userId)
  }
}

export async function seedMockPlayers(): Promise<void> {
  for (const archetype of DND_ARCHETYPES) {
    await upsertMockUser(archetype)
  }
  logger.info('dev-mock-players', `Seeded ${DND_ARCHETYPES.length} DEV mock account templates`)
}

export async function listMockPlayers(): Promise<MockPlayerDef[]> {
  const users = await prisma.user.findMany({
    where: { username: { startsWith: DEV_MOCK_PREFIX } },
    orderBy: { username: 'asc' },
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
    },
  })

  return users.map((user) => ({
    id: user.id as UUID,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
  }))
}

export async function ensureDevMockPlayersForSession(
  sessionId: UUID,
  options?: { forceReroll?: boolean; requestedCount?: number; avoidSlugs?: string[] }
): Promise<MockPlayerDef[]> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, campaignId: true, state: true },
  })
  if (!session) {
    return []
  }

  const rooms = await getRooms(sessionId)
  const targetRoom = pickTargetRoom(rooms, session.state)
  if (!targetRoom) {
    logger.warn('dev-mock-players', `No MAIN/Green room found for session ${sessionId}`)
    return []
  }

  const rememberedSlugs = ensureRosterMemory(
    sessionId,
    session.campaignId as UUID | null,
    options?.forceReroll || false,
    options?.requestedCount,
    options?.avoidSlugs
  )
  let selectedArchetypes = rememberedSlugs
    .map((slug) => DND_ARCHETYPES.find((entry) => entry.slug === slug))
    .filter((entry): entry is MockArchetype => Boolean(entry))
  if (selectedArchetypes.length === 0) {
    selectedArchetypes = shuffle(DND_ARCHETYPES).slice(0, pickRosterSize())
  }
  selectedArchetypes = selectedArchetypes.slice(0, MAX_DEV_MOCK_PLAYERS)
  const levels = pickLevels(selectedArchetypes.length)
  const selectedUsers: MockPlayerDef[] = []
  const desiredUsernames = new Set(
    selectedArchetypes.map((archetype) => `${DEV_MOCK_PREFIX}${archetype.slug}`)
  )

  const existingSessionMocks = await prisma.sessionMember.findMany({
    where: {
      sessionId,
      username: { startsWith: DEV_MOCK_PREFIX },
    },
    orderBy: {
      username: 'asc',
    },
    select: {
      userId: true,
      username: true,
    },
  })

  const staleSessionMocks = existingSessionMocks.filter(
    (member) => !desiredUsernames.has(member.username)
  )

  if (staleSessionMocks.length > 0) {
    await removeMockMembersFromSession(
      sessionId,
      staleSessionMocks.map((member) => ({
        userId: member.userId as UUID,
        username: member.username,
      }))
    )
    logger.warn(
      'dev-mock-players',
      `Pruned ${staleSessionMocks.length} stale DEV mock players from session ${sessionId}`
    )
  }

  for (let i = 0; i < selectedArchetypes.length; i += 1) {
    const archetype = selectedArchetypes[i]
    const level = levels[i]
    const user = await upsertMockUser(archetype)
    selectedUsers.push(user)

    if (session.campaignId) {
      await ensureCampaignCharacter({
        campaignId: session.campaignId as UUID,
        user,
        archetype,
        level,
      })
    }

    await addUserToSession(sessionId, {
      id: user.id,
      username: user.username,
      role: Role.PLAYER,
      createdAt: 0,
    })

    await joinRoom({
      sessionId,
      roomId: targetRoom.id,
      userId: user.id,
      username: user.username,
      state: PresenceState.ONLINE,
    })
  }

  logger.info(
    'dev-mock-players',
    `Auto-joined ${selectedUsers.length} randomized DEV mock players to session ${sessionId}`
  )

  return selectedUsers
}

export async function joinMockPlayersToSession(sessionId: UUID): Promise<void> {
  await ensureDevMockPlayersForSession(sessionId)
}

export async function resetDevMockRoster(params: {
  sessionId?: UUID
  campaignId?: UUID
  requestedCount?: number
}): Promise<{
  count: number
  campaignId?: UUID
  sessionId?: UUID
  removedUsers: Array<{ userId: UUID; username: string; primaryRoomId?: UUID }>
  addedUsers: Array<{ userId: UUID; username: string; roomId?: UUID }>
}> {
  if (!params.sessionId && !params.campaignId) {
    return { count: 0, removedUsers: [], addedUsers: [] }
  }

  let resolvedCampaignId = params.campaignId
  let resolvedSessionId = params.sessionId

  if (!resolvedCampaignId && resolvedSessionId) {
    const session = await prisma.session.findUnique({
      where: { id: resolvedSessionId },
      select: { campaignId: true },
    })
    if (session?.campaignId) {
      resolvedCampaignId = session.campaignId as UUID
    }
  }

  if (resolvedCampaignId) {
    campaignRosterByCampaignId.delete(resolvedCampaignId)
  }
  if (resolvedSessionId) {
    sessionRosterBySessionId.delete(resolvedSessionId)
  }

  if (resolvedSessionId) {
    // Snapshot presence before removal so we know which rooms to broadcast USER_LEFT for
    const presenceBefore = await getSessionPresence(resolvedSessionId)
    const mockPresenceBefore = presenceBefore.filter((p) => p.username?.startsWith(DEV_MOCK_PREFIX))
    const removedSlugs = mockPresenceBefore.map((p) => p.username.replace(DEV_MOCK_PREFIX, ''))
    const removedUsers = mockPresenceBefore.map((p) => ({
      userId: p.userId,
      username: p.username,
      primaryRoomId: p.primaryRoomId,
    }))

    await removeMockPlayersFromSession(resolvedSessionId)

    const session = await prisma.session.findUnique({
      where: { id: resolvedSessionId },
      select: { campaignId: true },
    })

    const users = await ensureDevMockPlayersForSession(resolvedSessionId, {
      forceReroll: true,
      requestedCount: params.requestedCount,
      avoidSlugs: removedSlugs,
    })
    // Snapshot presence after addition so we know which room the new players joined
    const presenceAfter = await getSessionPresence(resolvedSessionId)
    const addedUsers = users.map((u) => ({
      userId: u.id,
      username: u.username,
      roomId: presenceAfter.find((p) => p.userId === u.id)?.primaryRoomId,
    }))

    return {
      count: users.length,
      campaignId: resolvedCampaignId,
      sessionId: resolvedSessionId,
      removedUsers,
      addedUsers,
    }
  }

  return {
    count: 0,
    campaignId: resolvedCampaignId,
    sessionId: resolvedSessionId,
    removedUsers: [],
    addedUsers: [],
  }
}

export async function removeMockPlayersFromSession(sessionId: UUID): Promise<void> {
  const rooms = await getRooms(sessionId)
  const members = await prisma.sessionMember.findMany({
    where: {
      sessionId,
      username: { startsWith: DEV_MOCK_PREFIX },
    },
    select: {
      userId: true,
      username: true,
    },
  })

  for (const member of members) {
    for (const room of rooms) {
      await leaveRoom({
        sessionId,
        roomId: room.id as UUID,
        userId: member.userId as UUID,
        state: PresenceState.OFFLINE,
      })
    }
    await removeUserFromSession(sessionId, member.userId as UUID)
  }

  logger.info(
    'dev-mock-players',
    `Removed ${members.length} DEV mock players from session ${sessionId}`
  )
}

export async function getMockPlayerTokens(
  sessionId: UUID
): Promise<Array<{ mock: MockPlayerDef; token: string }>> {
  const sessionMembers = await prisma.sessionMember.findMany({
    where: {
      sessionId,
      username: { startsWith: DEV_MOCK_PREFIX },
    },
    select: { userId: true, username: true },
  })

  const scopedUsers =
    sessionMembers.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: sessionMembers.map((entry) => entry.userId) } },
          select: { id: true, username: true, displayName: true, email: true },
        })
      : await prisma.user.findMany({
          where: { username: { startsWith: DEV_MOCK_PREFIX } },
          orderBy: { username: 'asc' },
          select: { id: true, username: true, displayName: true, email: true },
        })

  return scopedUsers.map((user) => {
    const mock = {
      id: user.id as UUID,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
    }

    return {
      mock,
      token: createToken({
        userId: mock.id,
        username: mock.username,
        role: 'PLAYER',
        sessionId,
      }),
    }
  })
}

export async function getSessionMockPlayerById(
  sessionId: UUID,
  userId: UUID
): Promise<MockPlayerDef | null> {
  const member = await prisma.sessionMember.findFirst({
    where: {
      sessionId,
      userId,
      username: { startsWith: DEV_MOCK_PREFIX },
    },
    select: {
      userId: true,
      username: true,
    },
  })

  if (!member) {
    return null
  }

  const user = await prisma.user.findUnique({
    where: { id: member.userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
    },
  })

  if (!user || !isMockUsername(user.username)) {
    return null
  }

  return {
    id: user.id as UUID,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
  }
}

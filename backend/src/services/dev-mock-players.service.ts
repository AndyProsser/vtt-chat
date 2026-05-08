/**
 * DEV Mock Players Service
 *
 * Seeds 5 fictional mock player accounts and makes them available to join any
 * DEV session so a single developer can test DM superpowers (conditions, drag-
 * to-group, environments, whisper, broadcast) without needing real players.
 *
 * SAFETY CONTRACT:
 * - This module must never be imported in production code paths.
 * - All mock accounts are identifiable by the `[DEV]` prefix in displayName.
 * - Mock accounts use a fixed `DEV_MOCK_` username prefix so they can never
 *   clash with real user sign-ups (real usernames go through normalisation and
 *   can only contain word chars — `[` and `]` are stripped).
 */

import { randomUUID } from 'crypto'
import { getPrismaClient } from '@/infra/db'
import { hashPassword } from '@/services/auth.service'
import { createToken } from '@/services/auth.service'
import { getRooms, joinRoom, leaveRoom } from '@/services/room.service'
import { addUserToSession, removeUserFromSession } from '@/services/session.service'
import { PresenceState, RoomType, Role } from '@shared'
import type { UUID } from '@shared'
import { logger } from '@/utils/logger'

const prisma = getPrismaClient()

export interface MockPlayerDef {
  id: UUID
  username: string
  displayName: string
  email: string
}

/**
 * The fixed mock player roster. IDs are stable across runs so upserts are
 * idempotent and references survive server restarts.
 */
export const MOCK_PLAYERS: MockPlayerDef[] = [
  {
    id: '00000000-de00-4000-8000-000000000001' as UUID,
    username: 'dev_mock_thorin',
    displayName: '[DEV] Thorin',
    email: 'dev-mock-thorin@dev.local',
  },
  {
    id: '00000000-de00-4000-8000-000000000002' as UUID,
    username: 'dev_mock_legolas',
    displayName: '[DEV] Legolas',
    email: 'dev-mock-legolas@dev.local',
  },
  {
    id: '00000000-de00-4000-8000-000000000003' as UUID,
    username: 'dev_mock_galadriel',
    displayName: '[DEV] Galadriel',
    email: 'dev-mock-galadriel@dev.local',
  },
  {
    id: '00000000-de00-4000-8000-000000000004' as UUID,
    username: 'dev_mock_boromir',
    displayName: '[DEV] Boromir',
    email: 'dev-mock-boromir@dev.local',
  },
  {
    id: '00000000-de00-4000-8000-000000000005' as UUID,
    username: 'dev_mock_samwise',
    displayName: '[DEV] Samwise',
    email: 'dev-mock-samwise@dev.local',
  },
]

/**
 * Ensure all mock player accounts exist in the DB.
 * Safe to call multiple times — uses upsert.
 */
export async function seedMockPlayers(): Promise<void> {
  // Shared password — only exists in DEV, never matters for security
  const pw = await hashPassword('dev-mock-password')

  for (const mock of MOCK_PLAYERS) {
    await prisma.user.upsert({
      where: { id: mock.id },
      create: {
        id: mock.id,
        username: mock.username,
        displayName: mock.displayName,
        email: mock.email,
        password: pw,
        role: 'PLAYER',
        authType: 'FULL',
        isActive: true,
      },
      update: {
        displayName: mock.displayName,
        isActive: true,
      },
    })
  }

  logger.info('dev-mock-players', `Seeded ${MOCK_PLAYERS.length} mock player accounts`)
}

/**
 * Join all mock players into a session's greenroom (or main room if the
 * session is ACTIVE/PAUSED).  Idempotent — safe to call repeatedly.
 *
 * Also creates SessionMember records so they appear in the member list.
 */
export async function joinMockPlayersToSession(sessionId: UUID): Promise<void> {
  const rooms = await getRooms(sessionId)

  // Target the MAIN room if present (active session), otherwise GREEN room.
  const mainRoom = rooms.find((r) => r.type === RoomType.MAIN)
  const greenRoom = rooms.find(
    (r) =>
      r.name.trim().toLowerCase() === 'green room' || r.name.trim().toLowerCase() === 'green-room'
  )
  const targetRoom = mainRoom || greenRoom

  if (!targetRoom) {
    logger.warn(
      'dev-mock-players',
      `No suitable room found in session ${sessionId} — mock players not joined`
    )
    return
  }

  for (const mock of MOCK_PLAYERS) {
    await addUserToSession(sessionId, {
      id: mock.id,
      username: mock.username,
      role: Role.PLAYER,
      createdAt: 0,
    })

    await joinRoom({
      sessionId,
      roomId: targetRoom.id as UUID,
      userId: mock.id,
      username: mock.username,
      state: PresenceState.ONLINE,
    })
  }

  logger.info(
    'dev-mock-players',
    `Joined ${MOCK_PLAYERS.length} mock players to session ${sessionId} room "${targetRoom.name}"`
  )
}

/**
 * Remove all mock players from a session's presence and member list.
 */
export async function removeMockPlayersFromSession(sessionId: UUID): Promise<void> {
  const rooms = await getRooms(sessionId)

  for (const mock of MOCK_PLAYERS) {
    for (const room of rooms) {
      await leaveRoom({
        sessionId,
        roomId: room.id as UUID,
        userId: mock.id,
        state: PresenceState.OFFLINE,
      })
    }
    await removeUserFromSession(sessionId, mock.id)
  }

  logger.info(
    'dev-mock-players',
    `Removed ${MOCK_PLAYERS.length} mock players from session ${sessionId}`
  )
}

/**
 * Generate short-lived JWT tokens for all mock players so the caller can
 * impersonate them in a private browser session for testing.
 */
export function getMockPlayerTokens(
  sessionId: UUID
): Array<{ mock: MockPlayerDef; token: string }> {
  return MOCK_PLAYERS.map((mock) => ({
    mock,
    token: createToken({
      userId: mock.id,
      username: mock.username,
      role: 'PLAYER',
      sessionId,
    }),
  }))
}

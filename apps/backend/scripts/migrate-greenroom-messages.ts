#!/usr/bin/env node
/**
 * Data Migration Script: Move greenroom messages from session-scoped to campaign-scoped storage
 *
 * This script migrates existing greenroom messages to the new campaign-scoped storage model.
 * It identifies messages in GROUP-type rooms named "green room" (case-insensitive) and moves
 * them from session-scoped to campaign-scoped storage.
 *
 * Usage: npx ts-node scripts/migrate-greenroom-messages.ts
 */

import { PrismaClient } from '@prisma/client'
import { RoomType } from '@shared'

const prisma = new PrismaClient()

async function migrateGreenroomMessages() {
  console.log('🚀 Starting greenroom message migration...')

  try {
    // Step 1: Find all GROUP-type rooms with "green room" name
    console.log('\n1️⃣  Finding greenroom rooms...')

    const greenroomRooms = await prisma.room.findMany({
      where: {
        type: RoomType.GROUP,
        name: {
          in: ['Green Room', 'green room', 'green-room', 'GREEN ROOM'],
        },
      },
      include: {
        session: {
          select: {
            campaignId: true,
          },
        },
      },
    })

    console.log(`Found ${greenroomRooms.length} greenroom rooms`)

    // Group by campaign to handle bulk migration
    const greenroomsByRoom: Map<string, string | null> = new Map()
    greenroomRooms.forEach((room) => {
      greenroomsByRoom.set(room.id, room.session?.campaignId ?? null)
    })

    console.log(`Mapped ${greenroomsByRoom.size} greenroom rooms to campaigns`)

    // Step 2: Migrate messages - move from session-scoped to campaign-scoped
    console.log('\n2️⃣  Migrating messages...')

    let migratedCount = 0

    for (const [roomId, campaignId] of greenroomsByRoom.entries()) {
      if (!campaignId) {
        console.log(`⚠️  Skipping room ${roomId}: no campaign found (standalone session greenroom)`)
        continue
      }

      // Find all messages in this greenroom
      const messages = await prisma.chatMessage.findMany({
        where: {
          visibleTo: {
            path: ['roomId'],
            equals: roomId,
          },
        },
      })

      console.log(
        `Migrating ${messages.length} messages from room ${roomId} to campaign ${campaignId}`
      )

      // Update messages: set campaignId, clear sessionId
      const updated = await prisma.chatMessage.updateMany(
        {
          where: {
            visibleTo: {
              path: ['roomId'],
              equals: roomId,
            },
          },
        },
        {
          data: {
            campaignId,
            sessionId: null,
          },
        }
      )

      migratedCount += updated.count
      console.log(`✅ Migrated ${updated.count} messages from room ${roomId}`)
    }

    console.log(`\n3️⃣  Migration complete!`)
    console.log(`📊 Total messages migrated: ${migratedCount}`)

    // Step 3: Verify migration
    console.log('\n4️⃣  Verifying migration...')

    const campaignScopedMessages = await prisma.chatMessage.count({
      where: {
        campaignId: { not: null },
        sessionId: null,
      },
    })

    const sessionScopedMessages = await prisma.chatMessage.count({
      where: {
        campaignId: null,
        sessionId: { not: null },
      },
    })

    const orphanedMessages = await prisma.chatMessage.count({
      where: {
        campaignId: null,
        sessionId: null,
      },
    })

    console.log(`Campaign-scoped messages: ${campaignScopedMessages}`)
    console.log(`Session-scoped messages: ${sessionScopedMessages}`)
    console.log(`Orphaned messages (no context): ${orphanedMessages}`)

    if (orphanedMessages > 0) {
      console.warn(`\n⚠️  WARNING: ${orphanedMessages} messages have no context!`)
    }

    console.log('\n✨ Migration completed successfully!')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

migrateGreenroomMessages().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})

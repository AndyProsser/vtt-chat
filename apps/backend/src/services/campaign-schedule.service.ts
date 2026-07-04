/**
 * Campaign schedule service.
 * Called on SESSION:ENDED (COOLDOWN → ENDED transition) to auto-advance
 * nextSessionDate from the recurrence rule, and broadcast CAMPAIGN:SCHEDULE_UPDATED
 * to all campaign members.
 */

import crypto from 'node:crypto'
import { SessionScheduleType, Role, calculateNextOccurrence, formatScheduleLabel } from '@shared'
import type { UUID } from '@shared'
import { getPrismaClient } from '@/infra/db'
import eventBroadcaster from '@/ws/event-broadcaster'
import { logger } from '@/utils/logger'

const prisma = getPrismaClient()

/**
 * Advances nextSessionDate for a campaign after a session ends.
 * - If a schedule is set: calculates the next occurrence from the rule.
 * - Resets nextSessionIsManual to false (consuming any one-off manual override).
 * - Broadcasts CAMPAIGN:SCHEDULE_UPDATED to all campaign members.
 * - No-ops silently if the campaign has no schedule.
 */
export async function advanceSessionScheduleOnEnded(campaignId: UUID, dmId: UUID): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      sessionScheduleType: true,
      sessionScheduleDay: true,
      sessionScheduleNth: true,
      sessionScheduleHour: true,
      sessionScheduleMinute: true,
      sessionScheduleTz: true,
    },
  })

  if (!campaign || !campaign.sessionScheduleType) {
    // No recurrence rule — nothing to advance.
    return
  }

  const {
    sessionScheduleType,
    sessionScheduleDay,
    sessionScheduleHour,
    sessionScheduleMinute,
    sessionScheduleTz,
    sessionScheduleNth,
  } = campaign

  if (
    sessionScheduleDay == null ||
    sessionScheduleHour == null ||
    sessionScheduleMinute == null ||
    !sessionScheduleTz
  ) {
    logger.warn('campaign-schedule', 'Incomplete schedule fields — skipping auto-advance', {
      campaignId,
    })
    return
  }

  let nextDate: Date
  try {
    nextDate = calculateNextOccurrence(
      {
        type: sessionScheduleType as SessionScheduleType,
        dayOfWeek: sessionScheduleDay,
        nth: sessionScheduleNth ?? undefined,
        hour: sessionScheduleHour,
        minute: sessionScheduleMinute,
        timezone: sessionScheduleTz,
      },
      new Date()
    )
  } catch (err) {
    logger.warn('campaign-schedule', 'Failed to calculate next occurrence during auto-advance', {
      campaignId,
      err,
    })
    return
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { nextSessionDate: nextDate, nextSessionIsManual: false },
  })

  const scheduleLabel = formatScheduleLabel({
    type: sessionScheduleType as SessionScheduleType,
    dayOfWeek: sessionScheduleDay,
    nth: sessionScheduleNth ?? undefined,
    hour: sessionScheduleHour,
    minute: sessionScheduleMinute,
    timezone: sessionScheduleTz,
  })

  await eventBroadcaster.broadcastToCampaignMembers(campaignId, {
    id: crypto.randomUUID() as UUID,
    type: 'CAMPAIGN:SCHEDULE_UPDATED',
    version: 1,
    userId: dmId,
    userRole: Role.SYSTEM,
    sessionId: null as unknown as UUID,
    roomId: null,
    timestamp: Date.now(),
    payload: {
      campaignId,
      nextSessionDate: nextDate.toISOString(),
      scheduleLabel,
      nextSessionIsManual: false,
    },
  })

  logger.info('campaign-schedule', 'Auto-advanced next session date', {
    campaignId,
    nextSessionDate: nextDate.toISOString(),
  })
}

/**
 * Metadata Event Handlers
 * Handles METADATA:* WebSocket events for character sheets, campaign data, and session metadata.
 *
 * Reference: docs/architecture/ADMIN-ARCHITECTURE.md
 *
 * Note: Metadata WS events are planned but not yet dispatched by the client.
 * Handlers are stubbed here ready for wiring once METADATA:* event types are added
 * to the shared event contract.
 */

import type { EventEnvelope } from '@shared'
import { logger } from '@/utils'
import eventBroadcaster from '@/services/event-broadcaster.service'

// ============================================================================
// Handler Interface
// ============================================================================

export interface MetadataHandlers {
  handleMetadataUpdated: (event: EventEnvelope) => Promise<void>
  handleCharacterSheetUpdated: (event: EventEnvelope) => Promise<void>
  handleCampaignDataUpdated: (event: EventEnvelope) => Promise<void>
  handleTemplateApplied: (event: EventEnvelope) => Promise<void>
}

// ============================================================================
// Handler Implementations
// ============================================================================

export const metadataHandlers: MetadataHandlers = {
  /**
   * METADATA:UPDATED
   *
   * Generic metadata field update (e.g. a custom field on a character or session object).
   *
   * Payload:
   * {
   *   entityType: 'CHARACTER' | 'SESSION' | 'CAMPAIGN',
   *   entityId: UUID,
   *   field: string,
   *   previousValue: unknown,
   *   newValue: unknown,
   *   updatedBy: UUID,
   *   updatedAt: number,
   * }
   */
  async handleMetadataUpdated(event: EventEnvelope): Promise<void> {
    try {
      const payload = event.payload as {
        entityType?: string
        entityId?: string
        field?: string
        updatedBy?: string
      }

      logger.info(
        'metadata',
        `Metadata updated on ${payload.entityType ?? 'unknown'} ${payload.entityId ?? ''}: field=${payload.field ?? ''} by ${payload.updatedBy ?? event.userId}`
      )

      if (event.sessionId) {
        eventBroadcaster.broadcastToSession(event.sessionId, event)
      }
    } catch (error) {
      logger.error(
        'metadata',
        `Error handling METADATA:UPDATED: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  },

  /**
   * METADATA:CHARACTER_SHEET_UPDATED
   *
   * A player's character sheet fields were updated (HP, stats, inventory, etc.).
   *
   * Payload:
   * {
   *   characterId: UUID,
   *   playerId: UUID,
   *   changes: Record<string, { previous: unknown; next: unknown }>,
   *   updatedAt: number,
   * }
   */
  async handleCharacterSheetUpdated(event: EventEnvelope): Promise<void> {
    try {
      const payload = event.payload as {
        characterId?: string
        playerId?: string
      }

      logger.info(
        'metadata',
        `Character sheet updated: character=${payload.characterId ?? ''} player=${payload.playerId ?? event.userId}`
      )

      if (event.sessionId) {
        eventBroadcaster.broadcastToSession(event.sessionId, event)
      }
    } catch (error) {
      logger.error(
        'metadata',
        `Error handling METADATA:CHARACTER_SHEET_UPDATED: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  },

  /**
   * METADATA:CAMPAIGN_DATA_UPDATED
   *
   * DM updates campaign-level metadata (world notes, lore fields, etc.).
   *
   * Payload:
   * {
   *   campaignId: UUID,
   *   field: string,
   *   previousValue: unknown,
   *   newValue: unknown,
   *   updatedBy: UUID,
   *   updatedAt: number,
   * }
   */
  async handleCampaignDataUpdated(event: EventEnvelope): Promise<void> {
    try {
      const payload = event.payload as {
        campaignId?: string
        field?: string
        updatedBy?: string
      }

      logger.info(
        'metadata',
        `Campaign data updated: campaign=${payload.campaignId ?? ''} field=${payload.field ?? ''} by ${payload.updatedBy ?? event.userId}`
      )

      if (event.sessionId) {
        eventBroadcaster.broadcastToSession(event.sessionId, event)
      }
    } catch (error) {
      logger.error(
        'metadata',
        `Error handling METADATA:CAMPAIGN_DATA_UPDATED: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  },

  /**
   * METADATA:TEMPLATE_APPLIED
   *
   * DM applies a metadata template to an entity (e.g. a standard monster stat block).
   *
   * Payload:
   * {
   *   templateId: UUID,
   *   templateName: string,
   *   targetEntityType: 'CHARACTER' | 'SESSION',
   *   targetEntityId: UUID,
   *   appliedBy: UUID,
   *   appliedAt: number,
   * }
   */
  async handleTemplateApplied(event: EventEnvelope): Promise<void> {
    try {
      const payload = event.payload as {
        templateId?: string
        templateName?: string
        targetEntityType?: string
        targetEntityId?: string
        appliedBy?: string
      }

      logger.info(
        'metadata',
        `Template applied: template=${payload.templateName ?? payload.templateId ?? ''} to ${payload.targetEntityType ?? 'unknown'}/${payload.targetEntityId ?? ''} by ${payload.appliedBy ?? event.userId}`
      )

      if (event.sessionId) {
        eventBroadcaster.broadcastToSession(event.sessionId, event)
      }
    } catch (error) {
      logger.error(
        'metadata',
        `Error handling METADATA:TEMPLATE_APPLIED: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  },
}

/**
 * Audio Event Handlers
 * Processes audio effects, presets, and DM overrides via WebSocket.
 *
 * Reference: docs/subsystems/AUDIO-ENGINE.md, docs/architecture/LIVEKIT-INTEGRATION.md
 */

import type { EventEnvelope } from '@shared'
import { logger } from '@/utils'
import eventBroadcaster from '@/services/event-broadcaster.service'

// ============================================================================
// Handler Interface
// ============================================================================

export interface AudioHandlers {
  handleEffectApplied: (event: EventEnvelope) => Promise<void>
  handleEffectRemoved: (event: EventEnvelope) => Promise<void>
  handlePresetLoaded: (event: EventEnvelope) => Promise<void>
  handleEnvironmentSet: (event: EventEnvelope) => Promise<void>
  handleDMOverrideApplied: (event: EventEnvelope) => Promise<void>
  handleDMOverrideRemoved: (event: EventEnvelope) => Promise<void>
}

// ============================================================================
// Handler Implementations
// ============================================================================

export const audioHandlers: AudioHandlers = {
  /**
   * AUDIO:EFFECT_APPLIED
   *
   * DM applies an audio effect to a user or room.
   * Example: Apply reverb, distortion, pitch shift to a user's audio
   *
   * Permissions:
   * - Only DM can apply effects to users
   * - Players can apply personal effects (future enhancement)
   *
   * Payload:
   * {
   *   effectId: UUID,
   *   effectName: "reverb" | "distortion" | "pitch_shift" | ...,
   *   targetUserId?: UUID,         // Apply to specific user
   *   targetRoomId?: UUID,         // Apply to entire room
   *   appliedBy: UUID,             // DM ID
   *   appliedAt: number,           // Timestamp
   *   parameters: { ... }          // Effect-specific params
   * }
   */
  async handleEffectApplied(event: EventEnvelope): Promise<void> {
    try {
      const payload = event.payload as {
        effectId: string
        effectName: string
        targetUserId?: string
        targetRoomId?: string
        appliedBy: string
        appliedAt: number
        parameters?: Record<string, any>
      }

      logger.info(
        'audio',
        `Effect ${payload.effectName} applied by ${payload.appliedBy}: target=${payload.targetUserId || payload.targetRoomId}`
      )

      // Broadcast event to room members (only room effects)
      if (event.sessionId) {
        eventBroadcaster.broadcastToSession(event.sessionId, event)
      }
    } catch (error) {
      logger.error(
        'audio',
        `Error handling AUDIO:EFFECT_APPLIED: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  },

  /**
   * AUDIO:EFFECT_REMOVED
   *
   * DM removes a previously applied effect.
   *
   * Payload:
   * {
   *   effectId: UUID,
   *   removedBy: UUID,
   *   removedAt: number
   * }
   */
  async handleEffectRemoved(event: EventEnvelope): Promise<void> {
    try {
      const payload = event.payload as {
        effectId: string
        removedBy: string
        removedAt: number
      }

      logger.info(
        'audio',
        `Effect ${payload.effectId} removed by ${payload.removedBy} at ${payload.removedAt}`
      )

      // Broadcast removal event to room
      if (event.sessionId) {
        eventBroadcaster.broadcastToSession(event.sessionId, event)
      }
    } catch (error) {
      logger.error(
        'audio',
        `Error handling AUDIO:EFFECT_REMOVED: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  },

  /**
   * AUDIO:PRESET_LOADED
   *
   * User or DM loads a preset audio configuration.
   * Examples: "narrator" voice, "tavern" environment, "far away" distance
   *
   * Permissions:
   * - Players can load personal presets (voice, IC, local settings)
   * - DM can load room/user presets (environment, DM voice, overrides)
   *
   * Payload:
   * {
   *   presetId: UUID,
   *   presetName: "narrator" | "tavern" | "whisper" | ...,
   *   loadedBy: UUID,
   *   targetUserId?: UUID,         // If DM applies to user
   *   loadedAt: number,
   *   parameters?: { ... }         // Preset details
   * }
   */
  async handlePresetLoaded(event: EventEnvelope): Promise<void> {
    try {
      const payload = event.payload as {
        presetId: string
        presetName: string
        loadedBy: string
        targetUserId?: string
        loadedAt: number
        parameters?: Record<string, any>
      }

      logger.info(
        'audio',
        `Preset ${payload.presetName} loaded by ${payload.loadedBy} for ${payload.targetUserId || 'self'}`
      )

      // Broadcast preset loaded event to room
      if (event.sessionId) {
        eventBroadcaster.broadcastToSession(event.sessionId, event)
      }
    } catch (error) {
      logger.error(
        'audio',
        `Error handling AUDIO:PRESET_LOADED: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  },

  /**
   * AUDIO:ENVIRONMENT_SET
   *
   * DM sets the room environment (ambient sound, reverb, acoustics).
   * Examples: "tavern", "cathedral", "forest", "underwater"
   *
   * Permissions:
   * - DM only can set environment
   *
   * Payload:
   * {
   *   environmentId: UUID,
   *   environmentName: "tavern" | "cave" | ...,
   *   roomId: UUID,
   *   setBy: UUID,
   *   setAt: number,
   *   parameters: {
   *     reverbSend: 0.3,
   *     lowpassFreq: 8000,
   *     roomGain: 0
   *   }
   * }
   */
  async handleEnvironmentSet(event: EventEnvelope): Promise<void> {
    try {
      const payload = event.payload as {
        environmentId: string
        environmentName: string
        roomId: string
        setBy: string
        setAt: number
        parameters?: Record<string, any>
      }

      logger.info(
        'audio',
        `Environment ${payload.environmentName} set by ${payload.setBy} in room ${payload.roomId}`
      )

      // Broadcast environment change to all room members
      if (event.sessionId) {
        eventBroadcaster.broadcastToSession(event.sessionId, event)
      }
    } catch (error) {
      logger.error(
        'audio',
        `Error handling AUDIO:ENVIRONMENT_SET: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  },

  /**
   * AUDIO:DM_OVERRIDE_APPLIED
   *
   * DM applies an override to a user's audio (mute, gain adjustment, filtering).
   * Used for controlling individual player audio without affecting others.
   *
   * Permissions:
   * - DM only
   *
   * Payload:
   * {
   *   targetUserId: UUID,
   *   dmId: UUID,
   *   overrideType: "MUTE" | "UNMUTE" | "GAIN" | "GATE" | "FILTER",
   *   parameters?: {
   *     "gain": 0.5,       // For GAIN
   *     "frequency": 2000, // For FILTER
   *     "threshold": -40   // For GATE
   *   },
   *   appliedAt: number
   * }
   */
  async handleDMOverrideApplied(event: EventEnvelope): Promise<void> {
    try {
      const payload = event.payload as {
        targetUserId: string
        dmId: string
        overrideType: 'MUTE' | 'UNMUTE' | 'GAIN' | 'GATE' | 'FILTER'
        parameters?: Record<string, any>
        appliedAt: number
      }

      logger.info(
        'audio',
        `DM override ${payload.overrideType} applied by ${payload.dmId} to user ${payload.targetUserId}`
      )

      // Broadcast override to affected user and DM
      if (event.sessionId) {
        eventBroadcaster.broadcastToSession(event.sessionId, event)
      }
    } catch (error) {
      logger.error(
        'audio',
        `Error handling AUDIO:DM_OVERRIDE_APPLIED: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  },

  /**
   * AUDIO:DM_OVERRIDE_REMOVED
   *
   * DM removes a previously applied override.
   *
   * Payload:
   * {
   *   targetUserId: UUID,
   *   dmId: UUID,
   *   overrideType: string,
   *   removedAt: number
   * }
   */
  async handleDMOverrideRemoved(event: EventEnvelope): Promise<void> {
    try {
      const payload = event.payload as {
        targetUserId: string
        dmId: string
        overrideType: string
        removedAt: number
      }

      logger.info(
        'audio',
        `DM override ${payload.overrideType} removed by ${payload.dmId} from user ${payload.targetUserId}`
      )

      // Broadcast override removal to affected user and DM
      if (event.sessionId) {
        eventBroadcaster.broadcastToSession(event.sessionId, event)
      }
    } catch (error) {
      logger.error(
        'audio',
        `Error handling AUDIO:DM_OVERRIDE_REMOVED: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  },
}

/**
 * Audio domain types.
 * Covers environment presets, DM voice overrides, and session audio state.
 */

import type { UUID } from '@shared'

export interface AudioPreset {
  id: UUID
  name: string
  category: 'VOICE' | 'DISTANCE' | 'ENVIRONMENT' | 'CONDITION' | 'IC'
}

/**
 * Persisted state of a room's audio environment (set by DM via AUDIO:ENVIRONMENT_SET).
 */
export interface AudioEnvironmentState {
  roomId: UUID
  environmentName: string
  environmentId: string
  parameters: Record<string, unknown>
  setBy: UUID
  setAt: number
}

/**
 * Persisted DM override applied to a specific user (AUDIO:DM_OVERRIDE_APPLIED).
 */
export interface AudioDMOverrideState {
  targetUserId: UUID
  overrideType: string
  parameters: Record<string, unknown>
  appliedBy: UUID
  appliedAt: number
}

/**
 * Full audio state for a session — returned by GET /api/audio/state/:sessionId.
 */
export interface AudioSessionState {
  sessionId: UUID
  environments: AudioEnvironmentState[]
  dmOverrides: AudioDMOverrideState[]
}

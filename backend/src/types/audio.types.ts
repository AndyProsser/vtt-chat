/**
 * Audio domain types.
 * Covers environment presets, DM voice overrides, and session audio state.
 */

export interface AudioPreset {
  id: string
  name: string
  category: 'VOICE' | 'DISTANCE' | 'ENVIRONMENT' | 'CONDITION' | 'IC'
}

/**
 * Persisted state of a room's audio environment (set by DM via AUDIO:ENVIRONMENT_SET).
 */
export interface AudioEnvironmentState {
  roomId: string
  environmentName: string
  environmentId: string
  parameters: Record<string, unknown>
  setBy: string
  setAt: number
}

/**
 * Persisted DM override applied to a specific user (AUDIO:DM_OVERRIDE_APPLIED).
 */
export interface AudioDMOverrideState {
  targetUserId: string
  overrideType: string
  parameters: Record<string, unknown>
  appliedBy: string
  appliedAt: number
}

/**
 * Full audio state for a session — returned by GET /api/audio/state/:sessionId.
 */
export interface AudioSessionState {
  sessionId: string
  environments: AudioEnvironmentState[]
  dmOverrides: AudioDMOverrideState[]
}

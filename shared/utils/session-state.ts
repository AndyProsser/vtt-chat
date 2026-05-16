import { SessionState, type SessionLifecycleState } from '../types/index'

export type CampaignDisplayState = 'IDLE' | 'GREENROOM' | 'ACTIVE' | 'PAUSED' | 'COOLDOWN'

export function normalizeSessionState(
  state: SessionLifecycleState | null | undefined
): SessionState | null {
  if (!state) return null

  if (state === SessionState.CLEANUP) return SessionState.CLEANUP
  if (state === SessionState.IDLE) return SessionState.IDLE
  if (state === SessionState.ACTIVE) return SessionState.ACTIVE
  if (state === SessionState.PAUSED) return SessionState.PAUSED
  if (state === SessionState.COOLDOWN) return SessionState.COOLDOWN
  if (state === SessionState.ENDED) return SessionState.ENDED

  return null
}

export function toPublicSessionState(
  state: SessionLifecycleState | null | undefined
): SessionLifecycleState | null {
  if (!state) return null
  return state
}

export function isGreenroomSessionState(state: SessionLifecycleState | null | undefined): boolean {
  if (!state) return true

  return (
    state === SessionState.IDLE || state === SessionState.ENDED || state === SessionState.CLEANUP
  )
}

/** Returns true when the session has a live or cooling-down participant context (not greenroom). */
export function isSessionLive(state: SessionLifecycleState | null | undefined): boolean {
  if (!state) return false
  return (
    state === SessionState.ACTIVE ||
    state === SessionState.PAUSED ||
    state === SessionState.COOLDOWN
  )
}

export function deriveCampaignDisplayState(
  latestSessionState: SessionLifecycleState | null | undefined
): CampaignDisplayState {
  if (!latestSessionState) return 'IDLE'
  if (latestSessionState === 'ACTIVE') return 'ACTIVE'
  if (latestSessionState === 'PAUSED') return 'PAUSED'
  if (latestSessionState === 'COOLDOWN') return 'COOLDOWN'
  return 'GREENROOM'
}

export function prettySessionState(state: SessionLifecycleState): string {
  if (state === 'IDLE') return 'Idle'
  if (state === 'ACTIVE') return 'Active'
  if (state === 'PAUSED') return 'Paused'
  if (state === 'COOLDOWN') return 'Cooldown'
  if (state === 'ENDED') return 'Ended'
  if (state === SessionState.CLEANUP) return 'Cleanup'
  return 'Unknown'
}

export function sessionStatusClass(state: SessionLifecycleState | 'NO_SESSION'): string {
  if (state === 'ACTIVE') return 'status-active'
  if (state === 'PAUSED') return 'status-paused'
  if (state === 'COOLDOWN') return 'status-cooldown'
  if (state === 'ENDED') return 'status-ended'
  if (state === 'IDLE' || state === SessionState.CLEANUP) {
    return 'status-idle'
  }
  return 'status-none'
}

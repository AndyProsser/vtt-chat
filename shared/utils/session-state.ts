import { SessionState } from '../types/index'

export type CampaignDisplayState = 'INACTIVE' | 'GREENROOM' | 'ACTIVE' | 'PAUSED'
export type SessionLifecycleState = SessionState | 'INACTIVE' | 'CLEANUP'

export function normalizeSessionState(
  state: SessionLifecycleState | null | undefined
): SessionState | null {
  if (!state) return null

  if (state === 'INACTIVE') return SessionState.IDLE
  if (state === 'CLEANUP') return SessionState.ENDED
  if (state === SessionState.IDLE) return SessionState.IDLE
  if (state === SessionState.ACTIVE) return SessionState.ACTIVE
  if (state === SessionState.PAUSED) return SessionState.PAUSED
  if (state === SessionState.ENDED) return SessionState.ENDED

  return null
}

export function isGreenroomSessionState(state: SessionLifecycleState | null | undefined): boolean {
  if (!state) return true

  return (
    state === SessionState.IDLE ||
    state === 'INACTIVE' ||
    state === SessionState.ENDED ||
    state === 'CLEANUP'
  )
}

export function deriveCampaignDisplayState(
  latestSessionState: SessionState | null | undefined
): CampaignDisplayState {
  if (!latestSessionState) return 'INACTIVE'
  if (latestSessionState === 'ACTIVE') return 'ACTIVE'
  if (latestSessionState === 'PAUSED') return 'PAUSED'
  return 'GREENROOM'
}

export function prettySessionState(state: SessionLifecycleState): string {
  if (state === 'IDLE' || state === 'INACTIVE') return 'Inactive'
  if (state === 'ACTIVE') return 'Active'
  if (state === 'PAUSED') return 'Paused'
  if (state === 'CLEANUP') return 'Cleanup'
  return 'Ended'
}

export function sessionStatusClass(state: SessionLifecycleState | 'NO_SESSION'): string {
  if (state === 'ACTIVE') return 'status-active'
  if (state === 'PAUSED') return 'status-paused'
  if (state === 'ENDED') return 'status-ended'
  if (state === 'IDLE' || state === 'INACTIVE' || state === 'CLEANUP') return 'status-idle'
  return 'status-none'
}

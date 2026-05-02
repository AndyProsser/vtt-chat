import type { SessionState } from '../index'

export function prettySessionState(state: SessionState): string {
  if (state === 'IDLE') return 'Idle'
  if (state === 'ACTIVE') return 'Active'
  if (state === 'PAUSED') return 'Paused'
  return 'Ended'
}

export function sessionStatusClass(state: SessionState | 'NO_SESSION'): string {
  if (state === 'ACTIVE') return 'status-active'
  if (state === 'PAUSED') return 'status-paused'
  if (state === 'ENDED') return 'status-ended'
  if (state === 'IDLE') return 'status-idle'
  return 'status-none'
}

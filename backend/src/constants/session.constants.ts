import { SessionState as SessionStateEnum } from '@shared'
import type { SessionState } from '@shared'

export const SESSION_STATE_TRANSITIONS: Readonly<Record<SessionState, readonly SessionState[]>> = {
  [SessionStateEnum.IDLE]: [SessionStateEnum.ACTIVE],
  [SessionStateEnum.ACTIVE]: [SessionStateEnum.PAUSED, SessionStateEnum.ENDED],
  [SessionStateEnum.PAUSED]: [SessionStateEnum.ACTIVE, SessionStateEnum.ENDED],
  [SessionStateEnum.ENDED]: [SessionStateEnum.CLEANUP],
  [SessionStateEnum.CLEANUP]: [],
}

export const SESSION_COOLDOWN_EXTENSION_MIN_MS = 60_000
export const SESSION_COOLDOWN_EXTENSION_MAX_MS = 3_600_000
export const SESSION_COOLDOWN_EXTENSION_STEP_MS = 60_000

export const SESSION_COOLDOWN_FORCE_EXPIRE_OFFSET_MS = 4_000_000
export const STANDALONE_SESSION_COOLDOWN_MS = 300_000

export function isSessionActiveOrPaused(state: string | null | undefined): boolean {
  return state === SessionStateEnum.ACTIVE || state === SessionStateEnum.PAUSED
}

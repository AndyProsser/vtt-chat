import { useMemo } from 'react'
import { Role, SessionState } from '@shared'
import {
  LEAVE_SESSION_WARNING_ACTIVE_PLAY,
  LEAVE_SESSION_WARNING_WRAP_UP,
} from '@/constants/sessionWarnings.constants'

export function useSessionLeaveWarning(
  role: Role,
  sessionState: SessionState | null | undefined
): string | null {
  return useMemo(() => {
    if (role !== Role.DM) {
      return null
    }

    if (sessionState === SessionState.ACTIVE || sessionState === SessionState.PAUSED) {
      return LEAVE_SESSION_WARNING_ACTIVE_PLAY
    }

    if (sessionState === SessionState.COOLDOWN) {
      return LEAVE_SESSION_WARNING_WRAP_UP
    }

    return null
  }, [role, sessionState])
}

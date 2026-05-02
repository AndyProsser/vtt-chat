import type { SessionBoundaryType } from '@/types/session-boundary.types'

const boundaryTemplates: Record<SessionBoundaryType, (sessionName: string) => string> = {
  SESSION_STARTED: (sessionName) => `[Session Started] ${sessionName}`,
  SESSION_PAUSED: (sessionName) => `[Session Paused] ${sessionName}`,
  SESSION_RESUMED: (sessionName) => `[Session Resumed] ${sessionName}`,
  SESSION_ENDED: (sessionName) => `[Session Ended] ${sessionName}`,
}

export function buildSessionBoundaryMessage(
  boundaryType: SessionBoundaryType,
  sessionName: string
): string {
  return boundaryTemplates[boundaryType](sessionName)
}

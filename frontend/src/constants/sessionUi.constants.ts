import { SessionState } from '@shared'

export type LateJoinPolicy = 'OPEN' | 'SCREENED' | 'BLOCKED'

export const SESSION_STATE_LABELS: Record<SessionState, string> = {
  [SessionState.IDLE]: 'Greenroom',
  [SessionState.ACTIVE]: 'Active',
  [SessionState.PAUSED]: 'Paused',
  [SessionState.ENDED]: 'Ended',
  [SessionState.CLEANUP]: 'Cleanup',
  [SessionState.COOLDOWN]: 'Cooldown',
}

export const SESSION_TIMER_COPY = {
  ariaLabelPrefix: 'Session timer',
  hoverForDetails: 'Hover for details.',
  detailsAriaLabel: 'Session timer details',
  startedLabel: 'Started',
  activeTimeLabel: 'Active time',
  pausedForLabel: 'Paused for',
  totalPauseTimeLabel: 'Total pause time',
  timesPausedLabel: 'Times paused',
  cooldownLeftLabel: 'Cooldown left',
} as const

export const LATE_JOIN_POLICY_LABELS: Record<LateJoinPolicy, string> = {
  OPEN: 'Open',
  SCREENED: 'Screened',
  BLOCKED: 'Blocked',
}

export const LATE_JOIN_POLICY_OPTIONS: readonly LateJoinPolicy[] = [
  'OPEN',
  'SCREENED',
  'BLOCKED',
] as const

export const SPECTATOR_WAIT_SCREEN_COPY = {
  idle: {
    title: 'Please wait',
    body: 'The DM is setting the stage. Spectator view will open once the session starts.',
  },
  paused: {
    title: 'Please wait',
    body: 'The DM has paused the session for intermission. The curtain will rise again shortly.',
  },
  cooldown: {
    title: "That's a wrap!",
    bodyPrefix: 'The session has ended. Post-session chat is open for',
    countdownSuffix: 'remaining',
    hint: 'Use the chat panel to say farewell to the table.',
  },
  ended: {
    title: 'Session Closed',
    body: 'Thanks for watching. This session is closed and spectator viewing is no longer available.',
  },
} as const

export function getSessionStateLabel(state: SessionState | string): string {
  return SESSION_STATE_LABELS[state as SessionState] ?? toDisplayLabel(state)
}

export function getLateJoinPolicyLabel(policy: LateJoinPolicy): string {
  return LATE_JOIN_POLICY_LABELS[policy]
}

function toDisplayLabel(value: string): string {
  return value
    .split('_')
    .map((segment) => segment.charAt(0) + segment.slice(1).toLowerCase())
    .join(' ')
}

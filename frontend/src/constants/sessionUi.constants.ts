import { SessionState } from '@shared'
import type {
  CampaignVisibility,
  ExtensionSyncPolicy,
  LateJoinPolicy,
  SupportedPlatform,
} from '@/constants/sessionUi.types'

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

export const CAMPAIGN_VISIBILITY_LABELS: Record<CampaignVisibility, string> = {
  PUBLIC: 'Public',
  PRIVATE: 'Private',
}

export const EXTENSION_SYNC_POLICY_LABELS: Record<ExtensionSyncPolicy, string> = {
  ALLOW: 'All players',
  DM_ONLY: 'DM only',
  NONE: 'Disabled',
}

export const LATE_JOIN_POLICY_OPTIONS: readonly LateJoinPolicy[] = [
  'OPEN',
  'SCREENED',
  'BLOCKED',
] as const

export const CAMPAIGN_VISIBILITY_OPTIONS: readonly CampaignVisibility[] = [
  'PUBLIC',
  'PRIVATE',
] as const

export const EXTENSION_SYNC_POLICY_OPTIONS: readonly ExtensionSyncPolicy[] = [
  'ALLOW',
  'DM_ONLY',
  'NONE',
] as const

export const SUPPORTED_PLATFORM_OPTIONS: readonly SupportedPlatform[] = [
  'ANY',
  'DDB',
  'ROLL20',
  'FOUNDRY',
] as const

export const SUPPORTED_PLATFORM_LABELS: Record<SupportedPlatform, string> = {
  ANY: 'Any',
  DDB: 'D&D Beyond',
  ROLL20: 'Roll20',
  FOUNDRY: 'Foundry VTT',
}

export const SUPPORTED_PLATFORM_TRUNCATED_LABELS: Record<SupportedPlatform, string> = {
  ANY: 'Any',
  DDB: 'D&D Bey...',
  ROLL20: 'Roll20',
  FOUNDRY: 'Foundry...',
}

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

export const BOOLEAN_TOGGLE_COPY = {
  on: 'ON',
  off: 'OFF',
} as const

export function getSessionStateLabel(state: SessionState | string): string {
  return SESSION_STATE_LABELS[state as SessionState] ?? toDisplayLabel(state)
}

export function getLateJoinPolicyLabel(policy: LateJoinPolicy): string {
  return LATE_JOIN_POLICY_LABELS[policy]
}

export function getCampaignVisibilityLabel(visibility: CampaignVisibility): string {
  return CAMPAIGN_VISIBILITY_LABELS[visibility]
}

export function getExtensionSyncPolicyLabel(policy: ExtensionSyncPolicy): string {
  return EXTENSION_SYNC_POLICY_LABELS[policy]
}

export function getSupportedPlatformLabel(platform: SupportedPlatform): string {
  return SUPPORTED_PLATFORM_LABELS[platform]
}

export function getSupportedPlatformTruncatedLabel(platform: SupportedPlatform): string {
  return SUPPORTED_PLATFORM_TRUNCATED_LABELS[platform]
}

export function getBooleanToggleLabel(value: boolean): string {
  return value ? BOOLEAN_TOGGLE_COPY.on : BOOLEAN_TOGGLE_COPY.off
}

function toDisplayLabel(value: string): string {
  return value
    .split('_')
    .map((segment) => segment.charAt(0) + segment.slice(1).toLowerCase())
    .join(' ')
}

import type { EmailCheckStatus, InviteCampaignDisplayState } from '@/types/invite'

export function isValidEmailFormat(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function getStateLabel(state: InviteCampaignDisplayState): string {
  if (state === 'ACTIVE') return 'Active'
  if (state === 'PAUSED') return 'Paused'
  if (state === 'GREENROOM') return 'Greenroom'
  return 'Inactive'
}

export function getEmailStatusIcon(status: EmailCheckStatus): string {
  if (status === 'checking') return 'hourglass_top'
  if (status === 'guest') return 'badge'
  if (status === 'full') return 'verified_user'
  if (status === 'invalid' || status === 'error') return 'error'
  return 'help'
}

export function getEmailStatusLabel(status: EmailCheckStatus): string {
  if (status === 'checking') return 'Checking email status'
  if (status === 'guest') return 'GUEST account detected'
  if (status === 'full') return 'FULL account detected'
  if (status === 'invalid') return 'Email format is invalid'
  if (status === 'error') return 'Email check failed'
  return 'NONE detected yet'
}

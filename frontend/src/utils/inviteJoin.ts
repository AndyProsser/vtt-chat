import type { Role, UUID } from '@shared'
import type { EmailCheckStatus, InviteCampaignDisplayState } from '@/types/invite'
import {
  LOBBY_AUTO_ENTER_CAMPAIGN_STORAGE_KEY,
  LOBBY_CAMPAIGN_FOCUS_STORAGE_KEY,
  LOBBY_NOTICE_STORAGE_KEY,
} from '@/constants/inviteJoin.constants'

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

export interface JoinCharacterPayload {
  name: string
  race?: string
  class?: string
  level: number
  avatarUrl?: string
}

type AuthenticatedUser = { id: UUID; username: string; role: Role }

/** Navigates to the campaign session after joining. */
export function continueToCampaignSession(campaignId: string) {
  sessionStorage.setItem(LOBBY_CAMPAIGN_FOCUS_STORAGE_KEY, campaignId)
  sessionStorage.setItem(LOBBY_AUTO_ENTER_CAMPAIGN_STORAGE_KEY, campaignId)
  sessionStorage.removeItem(LOBBY_NOTICE_STORAGE_KEY)
  window.history.pushState({}, '', '/')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/** Joins a campaign as an already-authenticated user. Returns the resolved campaign ID. */
export async function joinAuthenticatedUserApi(params: {
  apiUrl: string
  authToken: string
  campaignId: string
  inviteCode: string
  character?: JoinCharacterPayload
}): Promise<string> {
  const { apiUrl, authToken, campaignId, inviteCode, character } = params

  const joinResponse = await fetch(`${apiUrl}/api/campaigns/${campaignId}/join`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inviteCode }),
  })

  const joinData = await joinResponse.json().catch(() => ({}))
  if (!joinResponse.ok) {
    throw new Error((joinData as { message?: string }).message || 'Failed to join campaign')
  }

  if (character?.name) {
    await fetch(`${apiUrl}/api/campaigns/${campaignId}/characters`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: character.name,
        race: character.race,
        class: character.class,
        avatarUrl: character.avatarUrl,
        metadata: { level: character.level },
        isActive: true,
      }),
    })
  }

  return campaignId
}

/** Joins a campaign as a new or returning guest player. Returns the resolved campaign ID. */
export async function joinAsGuestApi(params: {
  apiUrl: string
  campaignId: string
  inviteCode: string
  email: string
  displayName: string
  character?: JoinCharacterPayload
  onAuthenticated?: (token: string, user: AuthenticatedUser) => void
}): Promise<string> {
  const { apiUrl, campaignId, inviteCode, email, displayName, character, onAuthenticated } = params

  const response = await fetch(`${apiUrl}/api/auth/join/guest/player`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inviteCode, email, displayName, externalSystem: 'none', character }),
  })

  const data = (await response.json().catch(() => ({}))) as {
    token?: string
    user?: { id: string; username: string; role: 'PLAYER' }
    message?: string
    code?: string
  }

  if (!response.ok) {
    throw new Error(data.message || 'Unable to create player account for this invite')
  }

  if (data.token && data.user) {
    onAuthenticated?.(data.token, {
      id: data.user.id as UUID,
      username: data.user.username,
      role: data.user.role as Role,
    })
  }

  return campaignId
}

/** Signs in with a full account and joins the campaign. Returns the resolved campaign ID. */
export async function joinAsFullAccountApi(params: {
  apiUrl: string
  inviteCode: string
  email: string
  password: string
  campaignId: string
  onAuthenticated?: (token: string, user: AuthenticatedUser) => void
}): Promise<string> {
  const { apiUrl, inviteCode, email, password, campaignId, onAuthenticated } = params

  const response = await fetch(`${apiUrl}/api/auth/join/full/player`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inviteCode, email, password }),
  })

  const data = (await response.json().catch(() => ({}))) as {
    token?: string
    user?: { id: string; username: string; role: 'DM' | 'PLAYER' | 'SPECTATOR' }
    campaignId?: string
    message?: string
  }

  if (!response.ok) {
    throw new Error((data as { message?: string }).message || 'Failed to sign in and join campaign')
  }

  if (data.token && data.user) {
    onAuthenticated?.(data.token, {
      id: data.user.id as UUID,
      username: data.user.username,
      role: data.user.role as Role,
    })
  }

  return data.campaignId || campaignId
}

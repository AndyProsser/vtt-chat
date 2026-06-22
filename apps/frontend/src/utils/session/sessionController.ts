/**
 * Session Controller
 * Orchestrates campaign settings, character management, and session lifecycle API calls.
 * Decouples API logic from component state management.
 */

import type { CharacterClassEntry, UUID } from '@shared'
import type { CampaignSettingsPayload, CampaignSettingsHomeTab } from '@/types/session/campaign'
import type { Session as SessionRecord } from '@/types/session'
import type { UserCharacterRecord } from '@/hooks/useCharacterSettings'
import { DEFAULT_CHARACTER_SETTINGS } from '@/hooks/useCharacterSettings'

const inFlightDmVoiceTargetingRequests = new Map<string, Promise<boolean | null>>()

export interface SessionControllerContext {
  apiUrl: string
  token: string
  fetchWithAuthGuard: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

export interface CampaignSettingsConfig {
  onSettingsLoaded?: (settings: CampaignSettingsPayload) => void
  onDmVoiceTargetingLoaded?: (enabled: boolean) => void
  onSessionsLoaded?: (sessions: SessionRecord[]) => void
  onError?: (message: string) => void
  onNotice?: (message: string) => void
}

export interface CharacterSettingsConfig {
  onCharactersLoaded?: (characters: UserCharacterRecord[]) => void
  onCharacterSaved?: () => void
  onError?: (message: string) => void
  onNotice?: (message: string) => void
}

/**
 * Helper: normalize session record timestamps
 */
export function normalizeTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      return numeric
    }

    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return undefined
}

export function normalizeSessionRecord(raw: SessionRecord): SessionRecord {
  const createdAt = normalizeTimestamp((raw as SessionRecord & { createdAt?: unknown }).createdAt)
  const startedAt = normalizeTimestamp((raw as SessionRecord & { startedAt?: unknown }).startedAt)
  const pausedAt = normalizeTimestamp((raw as SessionRecord & { pausedAt?: unknown }).pausedAt)
  const endedAt = normalizeTimestamp((raw as SessionRecord & { endedAt?: unknown }).endedAt)
  const updatedAt = normalizeTimestamp((raw as SessionRecord & { updatedAt?: unknown }).updatedAt)

  return {
    ...raw,
    createdAt: createdAt ?? Date.now(),
    startedAt,
    pausedAt,
    endedAt,
    updatedAt,
  }
}

/**
 * Helper: validate and clamp stat value
 */
export function toValidStat(value: unknown, fallback = 8): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.max(1, Math.min(30, Math.round(parsed)))
}

/**
 * Helper: validate and clamp post-session duration
 */
export function toValidPostSessionDurationMinutes(value: unknown, fallback = 5): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.max(1, Math.min(15, Math.round(parsed)))
}

/**
 * Build character draft from record or default
 */
export function buildCharacterDraft(character: UserCharacterRecord | null) {
  if (!character) {
    return { ...DEFAULT_CHARACTER_SETTINGS }
  }

  const metadata = character.metadata || {}

  const characterClasses: CharacterClassEntry[] =
    Array.isArray(character.classes) && character.classes.length > 0
      ? (character.classes as CharacterClassEntry[])
      : character.class
        ? [
            {
              name: [character.class, character.subclass].filter(Boolean).join(' / '),
              level: Math.max(1, Math.min(20, Number(metadata.level) || 1)),
            },
          ]
        : [{ name: 'Fighter', level: 1 }]

  const primaryClassName = characterClasses[0]?.name ?? character.class ?? 'Fighter'
  const totalLevel =
    characterClasses.length > 1
      ? characterClasses.reduce((sum, c) => sum + c.level, 0)
      : Math.max(1, Math.min(20, Number(metadata.level) || 1))

  return {
    name: character.name || '',
    race: character.race || 'Human',
    className: primaryClassName,
    classes: characterClasses,
    avatarUrl: character.avatarUrl || '',
    level: totalLevel,
    strength: toValidStat(metadata.strength),
    dexterity: toValidStat(metadata.dexterity),
    constitution: toValidStat(metadata.constitution),
    intelligence: toValidStat(metadata.intelligence),
    wisdom: toValidStat(metadata.wisdom),
    charisma: toValidStat(metadata.charisma),
  }
}

/**
 * Campaign Settings API Controller
 */
export const createCampaignSettingsController = (ctx: SessionControllerContext) => ({
  async loadCampaignSettings(campaignId: UUID, config?: CampaignSettingsConfig) {
    try {
      const response = await ctx.fetchWithAuthGuard(
        `${ctx.apiUrl}/api/campaigns/${campaignId}/settings`,
        {
          headers: {
            Authorization: `Bearer ${ctx.token}`,
          },
        }
      )

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to load campaign settings')
      }

      const payload = (await response.json()) as { campaign: CampaignSettingsPayload }
      config?.onSettingsLoaded?.(payload.campaign)
      return payload.campaign
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load campaign settings'
      config?.onError?.(message)
      return null
    }
  },

  async loadDmVoiceTargetingSetting(campaignId: UUID, config?: CampaignSettingsConfig) {
    const requestKey = `${ctx.apiUrl}|${ctx.token}|${campaignId}`
    let request = inFlightDmVoiceTargetingRequests.get(requestKey)

    if (!request) {
      request = (async () => {
        try {
          const response = await ctx.fetchWithAuthGuard(
            `${ctx.apiUrl}/api/campaigns/${campaignId}/settings/dm-voice-targeting`,
            {
              headers: {
                Authorization: `Bearer ${ctx.token}`,
              },
            }
          )

          if (!response.ok) {
            return null
          }

          const payload = (await response.json()) as {
            campaignId: UUID
            dmAutoTargetOnFirstPlayerJoin: boolean
          }

          return payload.dmAutoTargetOnFirstPlayerJoin !== false
        } catch {
          return null
        }
      })()

      inFlightDmVoiceTargetingRequests.set(requestKey, request)
      request.finally(() => {
        if (inFlightDmVoiceTargetingRequests.get(requestKey) === request) {
          inFlightDmVoiceTargetingRequests.delete(requestKey)
        }
      })
    }

    const enabled = await request
    if (enabled !== null) {
      config?.onDmVoiceTargetingLoaded?.(enabled)
    }
    return enabled
  },

  async saveDmVoiceTargetingSetting(
    campaignId: UUID,
    enabled: boolean,
    config?: CampaignSettingsConfig
  ) {
    try {
      const response = await ctx.fetchWithAuthGuard(
        `${ctx.apiUrl}/api/campaigns/${campaignId}/settings/dm-voice-targeting`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ctx.token}`,
          },
          body: JSON.stringify({
            dmAutoTargetOnFirstPlayerJoin: enabled,
          }),
        }
      )

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to save DM targeting setting')
      }

      const payload = (await response.json()) as {
        campaignId: UUID
        dmAutoTargetOnFirstPlayerJoin: boolean
      }

      const savedEnabled = payload.dmAutoTargetOnFirstPlayerJoin !== false
      config?.onNotice?.('DM voice targeting preference saved.')
      return savedEnabled
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save DM targeting setting'
      config?.onError?.(message)
      return null
    }
  },

  async fetchCampaignSessions(campaignId: UUID): Promise<SessionRecord[]> {
    const response = await ctx.fetchWithAuthGuard(
      `${ctx.apiUrl}/api/campaigns/${campaignId}/sessions`,
      {
        headers: {
          Authorization: `Bearer ${ctx.token}`,
        },
      }
    )

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(payload.message || 'Failed to load campaign sessions')
    }

    const data = (await response.json()) as { sessions?: SessionRecord[] }
    return Array.isArray(data.sessions) ? data.sessions.map(normalizeSessionRecord) : []
  },
})

/**
 * Character Settings API Controller
 */
export const createCharacterSettingsController = (ctx: SessionControllerContext) => ({
  async loadUserCharacters(
    campaignId: UUID | '',
    config?: CharacterSettingsConfig
  ): Promise<UserCharacterRecord[]> {
    if (!campaignId) {
      return []
    }

    try {
      const response = await ctx.fetchWithAuthGuard(`${ctx.apiUrl}/api/users/me/characters`, {
        headers: {
          Authorization: `Bearer ${ctx.token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to load character settings')
      }

      const payload = (await response.json()) as { characters?: UserCharacterRecord[] }
      const characters = Array.isArray(payload.characters)
        ? payload.characters.filter((character) => character.campaignId === campaignId)
        : []

      config?.onCharactersLoaded?.(characters)
      return characters
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load characters'
      config?.onError?.(message)
      return []
    }
  },

  async saveCharacterSettings(
    campaignId: UUID,
    selectedCharacterId: UUID | '',
    characterDraft: typeof DEFAULT_CHARACTER_SETTINGS,
    config?: CharacterSettingsConfig
  ) {
    try {
      const endpoint = selectedCharacterId
        ? `${ctx.apiUrl}/api/campaigns/${campaignId}/characters/${selectedCharacterId}`
        : `${ctx.apiUrl}/api/campaigns/${campaignId}/characters`
      const method = selectedCharacterId ? 'PATCH' : 'POST'

      const metadata = {
        level: Math.max(1, Math.min(20, Math.round(characterDraft.level))),
        strength: toValidStat(characterDraft.strength),
        dexterity: toValidStat(characterDraft.dexterity),
        constitution: toValidStat(characterDraft.constitution),
        intelligence: toValidStat(characterDraft.intelligence),
        wisdom: toValidStat(characterDraft.wisdom),
        charisma: toValidStat(characterDraft.charisma),
        hpCurrent: Math.max(0, Math.min(999, Math.round(Number(characterDraft.hpCurrent) || 0))),
        hpMax: Math.max(0, Math.min(999, Math.round(Number(characterDraft.hpMax) || 0))),
        ac: Math.max(0, Math.min(30, Math.round(Number(characterDraft.ac) || 0))),
        initiative: Math.max(-10, Math.min(20, Math.round(Number(characterDraft.initiative) || 0))),
        passivePerception: Math.max(
          1,
          Math.min(30, Math.round(Number(characterDraft.passivePerception) || 10))
        ),
        speed: Math.max(0, Math.min(120, Math.round(Number(characterDraft.speed) || 30))),
      }

      const response = await ctx.fetchWithAuthGuard(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ctx.token}`,
        },
        body: JSON.stringify({
          name: characterDraft.name.trim() || 'Adventurer',
          race: characterDraft.race.trim() || 'Human',
          class:
            (characterDraft.classes?.[0]?.name ?? characterDraft.className.trim()) || 'Fighter',
          classes: characterDraft.classes ?? null,
          avatarUrl: characterDraft.avatarUrl.trim() || null,
          metadata,
          isActive: true,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to save character settings')
      }

      config?.onNotice?.('Character settings saved.')
      config?.onCharacterSaved?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save character settings'
      config?.onError?.(message)
    }
  },
})

/**
 * Session Membership API Controller
 */
export const createSessionMembershipController = (ctx: SessionControllerContext) => ({
  async ensureSessionMembership(sessionId: UUID) {
    try {
      const response = await ctx.fetchWithAuthGuard(
        `${ctx.apiUrl}/api/session/${sessionId}/members/join`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ctx.token}`,
          },
        }
      )

      if (!response.ok && response.status !== 409) {
        return null
      }

      // Both 200 (new join) and 409 (already a member) are success paths.
      // Read the body in both cases — the server may return the session record
      // for either status so callers can bind to server-authoritative state.
      const payload = await response.json().catch(() => ({}))
      return (payload as { session?: SessionRecord }).session ?? null
    } catch {
      return null
    }
  },
})

import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  normalizeTimestamp,
  normalizeSessionRecord,
  toValidStat,
  toValidPostSessionDurationMinutes,
  buildCharacterDraft,
  createCampaignSettingsController,
  createCharacterSettingsController,
  createSessionMembershipController,
} from '../../src/utils/session/sessionController'
import { DEFAULT_CHARACTER_SETTINGS } from '../../src/hooks/useCharacterSettings'
import type { UUID } from '@shared'

const CAMPAIGN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID
const SESSION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as UUID
const CHARACTER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' as UUID

// ─── normalizeTimestamp ───────────────────────────────────────────────────────

describe('normalizeTimestamp', () => {
  it('returns finite number as-is', () => {
    expect(normalizeTimestamp(1700000000000)).toBe(1700000000000)
  })

  it('returns 0 as-is (finite number)', () => {
    expect(normalizeTimestamp(0)).toBe(0)
  })

  it('parses a numeric string', () => {
    expect(normalizeTimestamp('1700000000000')).toBe(1700000000000)
  })

  it('parses an ISO date string', () => {
    const iso = '2024-01-15T12:00:00.000Z'
    expect(normalizeTimestamp(iso)).toBe(Date.parse(iso))
  })

  it('returns undefined for non-finite number', () => {
    expect(normalizeTimestamp(NaN)).toBeUndefined()
    expect(normalizeTimestamp(Infinity)).toBeUndefined()
  })

  it('returns undefined for non-numeric string', () => {
    expect(normalizeTimestamp('not-a-date')).toBeUndefined()
  })

  it('returns undefined for null', () => {
    expect(normalizeTimestamp(null)).toBeUndefined()
  })

  it('returns undefined for undefined', () => {
    expect(normalizeTimestamp(undefined)).toBeUndefined()
  })

  it('returns undefined for object', () => {
    expect(normalizeTimestamp({})).toBeUndefined()
  })
})

// ─── normalizeSessionRecord ───────────────────────────────────────────────────

describe('normalizeSessionRecord', () => {
  const baseSession = {
    id: SESSION_ID,
    name: 'Test Session',
    state: 'IDLE',
    dmId: 'dm-id' as UUID,
    campaignId: CAMPAIGN_ID,
  }

  it('preserves numeric timestamps', () => {
    const raw = { ...baseSession, createdAt: 1700000000000, startedAt: 1700001000000 }
    const result = normalizeSessionRecord(raw as any)
    expect(result.createdAt).toBe(1700000000000)
    expect(result.startedAt).toBe(1700001000000)
  })

  it('parses ISO string timestamps', () => {
    const iso = '2024-01-15T12:00:00.000Z'
    const raw = { ...baseSession, createdAt: iso, startedAt: iso }
    const result = normalizeSessionRecord(raw as any)
    expect(result.createdAt).toBe(Date.parse(iso))
    expect(result.startedAt).toBe(Date.parse(iso))
  })

  it('falls back createdAt to Date.now() if missing', () => {
    const before = Date.now()
    const result = normalizeSessionRecord({ ...baseSession, createdAt: undefined } as any)
    const after = Date.now()
    expect(result.createdAt).toBeGreaterThanOrEqual(before)
    expect(result.createdAt).toBeLessThanOrEqual(after)
  })

  it('leaves optional timestamps undefined when not provided', () => {
    const result = normalizeSessionRecord({ ...baseSession, createdAt: 1700000000000 } as any)
    expect(result.startedAt).toBeUndefined()
    expect(result.pausedAt).toBeUndefined()
    expect(result.endedAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('spreads all other fields through unchanged', () => {
    const raw = { ...baseSession, createdAt: 1700000000000, name: 'My Campaign' }
    const result = normalizeSessionRecord(raw as any)
    expect(result.name).toBe('My Campaign')
    expect(result.id).toBe(SESSION_ID)
  })
})

// ─── toValidStat ─────────────────────────────────────────────────────────────

describe('toValidStat', () => {
  it('returns value within range', () => {
    expect(toValidStat(15)).toBe(15)
  })

  it('clamps minimum to 1', () => {
    expect(toValidStat(0)).toBe(1)
    expect(toValidStat(-5)).toBe(1)
  })

  it('clamps maximum to 30', () => {
    expect(toValidStat(31)).toBe(30)
    expect(toValidStat(100)).toBe(30)
  })

  it('rounds to nearest integer', () => {
    expect(toValidStat(14.6)).toBe(15)
    expect(toValidStat(14.4)).toBe(14)
  })

  it('uses fallback for NaN', () => {
    expect(toValidStat(NaN)).toBe(8)
    expect(toValidStat('not-a-number')).toBe(8)
  })

  it('uses custom fallback', () => {
    expect(toValidStat(NaN, 12)).toBe(12)
  })

  it('handles string numbers', () => {
    expect(toValidStat('15')).toBe(15)
  })
})

// ─── toValidPostSessionDurationMinutes ───────────────────────────────────────

describe('toValidPostSessionDurationMinutes', () => {
  it('returns value within range', () => {
    expect(toValidPostSessionDurationMinutes(5)).toBe(5)
  })

  it('clamps minimum to 1', () => {
    expect(toValidPostSessionDurationMinutes(0)).toBe(1)
  })

  it('clamps maximum to 15', () => {
    expect(toValidPostSessionDurationMinutes(16)).toBe(15)
  })

  it('uses fallback 5 for NaN', () => {
    expect(toValidPostSessionDurationMinutes(NaN)).toBe(5)
  })

  it('uses custom fallback', () => {
    expect(toValidPostSessionDurationMinutes(NaN, 3)).toBe(3)
  })

  it('rounds to nearest integer', () => {
    expect(toValidPostSessionDurationMinutes(7.6)).toBe(8)
  })
})

// ─── buildCharacterDraft ─────────────────────────────────────────────────────

describe('buildCharacterDraft', () => {
  it('returns default settings for null character', () => {
    const draft = buildCharacterDraft(null)
    expect(draft).toEqual({ ...DEFAULT_CHARACTER_SETTINGS })
  })

  it('populates from character record', () => {
    const character = {
      id: CHARACTER_ID,
      campaignId: CAMPAIGN_ID,
      name: 'Aldric',
      race: 'Elf',
      class: 'Wizard',
      subclass: 'School of Evocation',
      avatarUrl: 'https://example.com/avatar.png',
      metadata: {
        level: 5,
        strength: 10,
        dexterity: 14,
        constitution: 12,
        intelligence: 18,
        wisdom: 13,
        charisma: 8,
      },
    }
    const draft = buildCharacterDraft(character as any)
    expect(draft.name).toBe('Aldric')
    expect(draft.race).toBe('Elf')
    expect(draft.className).toBe('Wizard')
    expect(draft.subclass).toBe('School of Evocation')
    expect(draft.level).toBe(5)
    expect(draft.strength).toBe(10)
    expect(draft.intelligence).toBe(18)
  })

  it('uses defaults for missing fields', () => {
    const character = {
      id: CHARACTER_ID,
      campaignId: CAMPAIGN_ID,
      name: '',
      race: '',
      class: '',
      subclass: '',
      avatarUrl: '',
      metadata: {},
    }
    const draft = buildCharacterDraft(character as any)
    expect(draft.name).toBe('')
    expect(draft.race).toBe('Human')
    expect(draft.className).toBe('Fighter')
    expect(draft.level).toBe(1)
    expect(draft.strength).toBe(8)
  })

  it('clamps level between 1 and 20', () => {
    const character = {
      id: CHARACTER_ID,
      campaignId: CAMPAIGN_ID,
      name: 'Test',
      race: 'Human',
      class: 'Rogue',
      metadata: { level: 25 },
    }
    const draft = buildCharacterDraft(character as any)
    expect(draft.level).toBe(20)
  })
})

// ─── createCampaignSettingsController ────────────────────────────────────────

describe('createCampaignSettingsController', () => {
  let fetchWithAuthGuard: ReturnType<typeof vi.fn>
  let ctx: { apiUrl: string; token: string; fetchWithAuthGuard: any }

  beforeEach(() => {
    fetchWithAuthGuard = vi.fn()
    ctx = {
      apiUrl: 'http://localhost:3001',
      token: 'test-token',
      fetchWithAuthGuard,
    }
  })

  describe('loadCampaignSettings', () => {
    it('returns campaign settings on success', async () => {
      const settings = { postSessionDurationMinutes: 5 }
      fetchWithAuthGuard.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ campaign: settings }),
      })
      const controller = createCampaignSettingsController(ctx)
      const result = await controller.loadCampaignSettings(CAMPAIGN_ID)
      expect(result).toEqual(settings)
    })

    it('calls onSettingsLoaded callback on success', async () => {
      const settings = { postSessionDurationMinutes: 5 }
      fetchWithAuthGuard.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ campaign: settings }),
      })
      const onSettingsLoaded = vi.fn()
      const controller = createCampaignSettingsController(ctx)
      await controller.loadCampaignSettings(CAMPAIGN_ID, { onSettingsLoaded })
      expect(onSettingsLoaded).toHaveBeenCalledWith(settings)
    })

    it('calls onError callback and returns null on non-ok response', async () => {
      fetchWithAuthGuard.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Not found' }),
      })
      const onError = vi.fn()
      const controller = createCampaignSettingsController(ctx)
      const result = await controller.loadCampaignSettings(CAMPAIGN_ID, { onError })
      expect(result).toBeNull()
      expect(onError).toHaveBeenCalledWith('Not found')
    })

    it('calls onError with default message when response has no message', async () => {
      fetchWithAuthGuard.mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      })
      const onError = vi.fn()
      const controller = createCampaignSettingsController(ctx)
      await controller.loadCampaignSettings(CAMPAIGN_ID, { onError })
      expect(onError).toHaveBeenCalledWith('Failed to load campaign settings')
    })

    it('calls onError on fetch error', async () => {
      fetchWithAuthGuard.mockRejectedValueOnce(new Error('Network failure'))
      const onError = vi.fn()
      const controller = createCampaignSettingsController(ctx)
      const result = await controller.loadCampaignSettings(CAMPAIGN_ID, { onError })
      expect(result).toBeNull()
      expect(onError).toHaveBeenCalledWith('Network failure')
    })
  })

  describe('loadDmVoiceTargetingSetting', () => {
    it('returns true when dmAutoTargetOnFirstPlayerJoin is true', async () => {
      fetchWithAuthGuard.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ campaignId: CAMPAIGN_ID, dmAutoTargetOnFirstPlayerJoin: true }),
      })
      const controller = createCampaignSettingsController(ctx)
      const result = await controller.loadDmVoiceTargetingSetting(CAMPAIGN_ID)
      expect(result).toBe(true)
    })

    it('returns false when dmAutoTargetOnFirstPlayerJoin is false', async () => {
      fetchWithAuthGuard.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ campaignId: CAMPAIGN_ID, dmAutoTargetOnFirstPlayerJoin: false }),
      })
      const controller = createCampaignSettingsController(ctx)
      const result = await controller.loadDmVoiceTargetingSetting(CAMPAIGN_ID)
      expect(result).toBe(false)
    })

    it('returns null on non-ok response', async () => {
      fetchWithAuthGuard.mockResolvedValueOnce({ ok: false })
      const controller = createCampaignSettingsController(ctx)
      const result = await controller.loadDmVoiceTargetingSetting(CAMPAIGN_ID)
      expect(result).toBeNull()
    })

    it('calls onDmVoiceTargetingLoaded when enabled is non-null', async () => {
      fetchWithAuthGuard.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ campaignId: CAMPAIGN_ID, dmAutoTargetOnFirstPlayerJoin: true }),
      })
      const onDmVoiceTargetingLoaded = vi.fn()
      const controller = createCampaignSettingsController(ctx)
      await controller.loadDmVoiceTargetingSetting(CAMPAIGN_ID, { onDmVoiceTargetingLoaded })
      expect(onDmVoiceTargetingLoaded).toHaveBeenCalledWith(true)
    })

    it('does not call onDmVoiceTargetingLoaded when result is null', async () => {
      fetchWithAuthGuard.mockResolvedValueOnce({ ok: false })
      const onDmVoiceTargetingLoaded = vi.fn()
      const controller = createCampaignSettingsController(ctx)
      await controller.loadDmVoiceTargetingSetting(CAMPAIGN_ID, { onDmVoiceTargetingLoaded })
      expect(onDmVoiceTargetingLoaded).not.toHaveBeenCalled()
    })

    it('deduplicates in-flight requests for same campaign', async () => {
      let resolveFirst!: (v: any) => void
      const deferred = new Promise<Response>((res) => {
        resolveFirst = res
      })
      fetchWithAuthGuard.mockReturnValueOnce(deferred)

      const controller = createCampaignSettingsController(ctx)
      const p1 = controller.loadDmVoiceTargetingSetting(CAMPAIGN_ID)
      const p2 = controller.loadDmVoiceTargetingSetting(CAMPAIGN_ID)

      resolveFirst({
        ok: true,
        json: async () => ({ campaignId: CAMPAIGN_ID, dmAutoTargetOnFirstPlayerJoin: true }),
      })

      const [r1, r2] = await Promise.all([p1, p2])
      expect(fetchWithAuthGuard).toHaveBeenCalledTimes(1)
      expect(r1).toBe(true)
      expect(r2).toBe(true)
    })
  })

  describe('saveDmVoiceTargetingSetting', () => {
    it('returns saved value on success', async () => {
      fetchWithAuthGuard.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ campaignId: CAMPAIGN_ID, dmAutoTargetOnFirstPlayerJoin: true }),
      })
      const controller = createCampaignSettingsController(ctx)
      const result = await controller.saveDmVoiceTargetingSetting(CAMPAIGN_ID, true)
      expect(result).toBe(true)
    })

    it('calls onNotice on success', async () => {
      fetchWithAuthGuard.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ campaignId: CAMPAIGN_ID, dmAutoTargetOnFirstPlayerJoin: true }),
      })
      const onNotice = vi.fn()
      const controller = createCampaignSettingsController(ctx)
      await controller.saveDmVoiceTargetingSetting(CAMPAIGN_ID, true, { onNotice })
      expect(onNotice).toHaveBeenCalledWith('DM voice targeting preference saved.')
    })

    it('calls onError and returns null on non-ok response', async () => {
      fetchWithAuthGuard.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Forbidden' }),
      })
      const onError = vi.fn()
      const controller = createCampaignSettingsController(ctx)
      const result = await controller.saveDmVoiceTargetingSetting(CAMPAIGN_ID, true, { onError })
      expect(result).toBeNull()
      expect(onError).toHaveBeenCalledWith('Forbidden')
    })

    it('calls onError with default message when json parse fails', async () => {
      fetchWithAuthGuard.mockResolvedValueOnce({
        ok: false,
        json: async () => {
          throw new Error('bad json')
        },
      })
      const onError = vi.fn()
      const controller = createCampaignSettingsController(ctx)
      await controller.saveDmVoiceTargetingSetting(CAMPAIGN_ID, true, { onError })
      expect(onError).toHaveBeenCalledWith('Failed to save DM targeting setting')
    })
  })

  describe('fetchCampaignSessions', () => {
    it('returns normalized sessions on success', async () => {
      const now = Date.now()
      fetchWithAuthGuard.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessions: [{ id: SESSION_ID, name: 'S1', state: 'ENDED', dmId: 'dm-id', createdAt: now }],
        }),
      })
      const controller = createCampaignSettingsController(ctx)
      const result = await controller.fetchCampaignSessions(CAMPAIGN_ID)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(SESSION_ID)
    })

    it('returns empty array when sessions is not an array', async () => {
      fetchWithAuthGuard.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })
      const controller = createCampaignSettingsController(ctx)
      const result = await controller.fetchCampaignSessions(CAMPAIGN_ID)
      expect(result).toEqual([])
    })

    it('throws on non-ok response', async () => {
      fetchWithAuthGuard.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Error loading sessions' }),
      })
      const controller = createCampaignSettingsController(ctx)
      await expect(controller.fetchCampaignSessions(CAMPAIGN_ID)).rejects.toThrow(
        'Error loading sessions'
      )
    })
  })
})

// ─── createCharacterSettingsController ───────────────────────────────────────

describe('createCharacterSettingsController', () => {
  let fetchWithAuthGuard: ReturnType<typeof vi.fn>
  let ctx: { apiUrl: string; token: string; fetchWithAuthGuard: any }

  beforeEach(() => {
    fetchWithAuthGuard = vi.fn()
    ctx = {
      apiUrl: 'http://localhost:3001',
      token: 'test-token',
      fetchWithAuthGuard,
    }
  })

  describe('loadUserCharacters', () => {
    it('returns empty array for empty campaignId', async () => {
      const controller = createCharacterSettingsController(ctx)
      const result = await controller.loadUserCharacters('')
      expect(result).toEqual([])
      expect(fetchWithAuthGuard).not.toHaveBeenCalled()
    })

    it('returns filtered characters for the campaign', async () => {
      fetchWithAuthGuard.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          characters: [
            { id: CHARACTER_ID, campaignId: CAMPAIGN_ID, name: 'Hero' },
            { id: 'other-id' as UUID, campaignId: 'other-campaign' as UUID, name: 'Villain' },
          ],
        }),
      })
      const controller = createCharacterSettingsController(ctx)
      const result = await controller.loadUserCharacters(CAMPAIGN_ID)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Hero')
    })

    it('calls onCharactersLoaded with filtered characters', async () => {
      fetchWithAuthGuard.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          characters: [{ id: CHARACTER_ID, campaignId: CAMPAIGN_ID, name: 'Hero' }],
        }),
      })
      const onCharactersLoaded = vi.fn()
      const controller = createCharacterSettingsController(ctx)
      await controller.loadUserCharacters(CAMPAIGN_ID, { onCharactersLoaded })
      expect(onCharactersLoaded).toHaveBeenCalledWith([
        { id: CHARACTER_ID, campaignId: CAMPAIGN_ID, name: 'Hero' },
      ])
    })

    it('returns empty array when payload.characters is not an array', async () => {
      fetchWithAuthGuard.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })
      const controller = createCharacterSettingsController(ctx)
      const result = await controller.loadUserCharacters(CAMPAIGN_ID)
      expect(result).toEqual([])
    })

    it('calls onError and returns empty on failed fetch', async () => {
      fetchWithAuthGuard.mockResolvedValueOnce({ ok: false })
      const onError = vi.fn()
      const controller = createCharacterSettingsController(ctx)
      const result = await controller.loadUserCharacters(CAMPAIGN_ID, { onError })
      expect(result).toEqual([])
      expect(onError).toHaveBeenCalledWith('Failed to load character settings')
    })
  })

  describe('saveCharacterSettings', () => {
    const draft = {
      name: 'Aldric',
      race: 'Elf',
      className: 'Wizard',
      subclass: '',
      avatarUrl: '',
      level: 5,
      strength: 10,
      dexterity: 14,
      constitution: 12,
      intelligence: 18,
      wisdom: 13,
      charisma: 8,
    }

    it('PATCHes existing character when selectedCharacterId provided', async () => {
      fetchWithAuthGuard.mockResolvedValueOnce({ ok: true })
      const controller = createCharacterSettingsController(ctx)
      await controller.saveCharacterSettings(CAMPAIGN_ID, CHARACTER_ID, draft)
      const [url, init] = fetchWithAuthGuard.mock.calls[0]
      expect(url).toContain(`/characters/${CHARACTER_ID}`)
      expect(init.method).toBe('PATCH')
    })

    it('POSTs new character when no selectedCharacterId', async () => {
      fetchWithAuthGuard.mockResolvedValueOnce({ ok: true })
      const controller = createCharacterSettingsController(ctx)
      await controller.saveCharacterSettings(CAMPAIGN_ID, '', draft)
      const [url, init] = fetchWithAuthGuard.mock.calls[0]
      expect(url).not.toContain(`/characters/`)
      expect(init.method).toBe('POST')
    })

    it('calls onNotice on success', async () => {
      fetchWithAuthGuard.mockResolvedValueOnce({ ok: true })
      const onNotice = vi.fn()
      const onCharacterSaved = vi.fn()
      const controller = createCharacterSettingsController(ctx)
      await controller.saveCharacterSettings(CAMPAIGN_ID, '', draft, { onNotice, onCharacterSaved })
      expect(onNotice).toHaveBeenCalledWith('Character settings saved.')
      expect(onCharacterSaved).toHaveBeenCalled()
    })

    it('calls onError on failure', async () => {
      fetchWithAuthGuard.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Validation error' }),
      })
      const onError = vi.fn()
      const controller = createCharacterSettingsController(ctx)
      await controller.saveCharacterSettings(CAMPAIGN_ID, '', draft, { onError })
      expect(onError).toHaveBeenCalledWith('Validation error')
    })

    it('sends null for blank subclass and avatarUrl', async () => {
      fetchWithAuthGuard.mockResolvedValueOnce({ ok: true })
      const controller = createCharacterSettingsController(ctx)
      await controller.saveCharacterSettings(CAMPAIGN_ID, '', {
        ...draft,
        subclass: '',
        avatarUrl: '',
      })
      const [, init] = fetchWithAuthGuard.mock.calls[0]
      const body = JSON.parse(init.body)
      expect(body.subclass).toBeNull()
      expect(body.avatarUrl).toBeNull()
    })
  })
})

// ─── createSessionMembershipController ───────────────────────────────────────

describe('createSessionMembershipController', () => {
  let fetchWithAuthGuard: ReturnType<typeof vi.fn>
  let ctx: { apiUrl: string; token: string; fetchWithAuthGuard: any }

  beforeEach(() => {
    fetchWithAuthGuard = vi.fn()
    ctx = {
      apiUrl: 'http://localhost:3001',
      token: 'test-token',
      fetchWithAuthGuard,
    }
  })

  it('calls the join endpoint', async () => {
    fetchWithAuthGuard.mockResolvedValueOnce({ ok: true, status: 200 })
    const controller = createSessionMembershipController(ctx)
    await controller.ensureSessionMembership(SESSION_ID)
    expect(fetchWithAuthGuard).toHaveBeenCalledWith(
      expect.stringContaining(`/api/session/${SESSION_ID}/members/join`),
      expect.any(Object)
    )
  })

  it('does not throw on 409 (already member)', async () => {
    fetchWithAuthGuard.mockResolvedValueOnce({ ok: false, status: 409 })
    const controller = createSessionMembershipController(ctx)
    await expect(controller.ensureSessionMembership(SESSION_ID)).resolves.toBeUndefined()
  })

  it('does not throw on network error', async () => {
    fetchWithAuthGuard.mockRejectedValueOnce(new Error('Network failure'))
    const controller = createSessionMembershipController(ctx)
    await expect(controller.ensureSessionMembership(SESSION_ID)).resolves.toBeUndefined()
  })
})

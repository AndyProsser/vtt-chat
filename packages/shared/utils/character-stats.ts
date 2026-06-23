/**
 * Canonical character-stats shape and normalizer.
 *
 * THE single source of truth for how character ability/combat stats are shaped
 * across the entire system — mock players, extension-synced players, live
 * presence broadcasts, and the offline party snapshot all store and read this
 * one flat shape. Any external/integration payload MUST be transformed through
 * `normalizeCharacterStats` at ingestion so there is exactly ONE format in the
 * database and over the wire. Readers must never special-case alternate shapes.
 */

/**
 * Canonical flat character stats. The index signature keeps it assignable to the
 * loose `Record<string, unknown>` shape used by presence payloads while still
 * giving autocomplete/typing for the known fields.
 */
export interface NormalizedCharacterStats {
  [key: string]: unknown
  level?: number
  proficiencyBonus?: number
  strength?: number
  dexterity?: number
  constitution?: number
  intelligence?: number
  wisdom?: number
  charisma?: number
  hpCurrent?: number
  hpMax?: number
  hpTemp?: number
  ac?: number
  initiative?: number
  passivePerception?: number
  speed?: number
  spellSlots?: unknown
  pactMagic?: unknown
  conditions?: unknown[]
}

/**
 * The stat-section keys of {@link NormalizedCharacterStats} — everything except
 * `level` and `conditions`, which are managed as their own metadata sections.
 *
 * Used to fully REPLACE the stats section on an extension overwrite: every key here
 * is cleared and then re-set from the incoming payload, so no stale ability/combat
 * value can survive a re-sync. The extension is the source of truth for stats.
 */
export const CHARACTER_STAT_KEYS = [
  'proficiencyBonus',
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
  'hpCurrent',
  'hpMax',
  'hpTemp',
  'ac',
  'initiative',
  'passivePerception',
  'speed',
  'spellSlots',
  'pactMagic',
] as const

/** Coerces a value to a finite number, or undefined when not numeric. */
function finiteNumber(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

/** Returns the value as a plain object record, or undefined for non-objects/arrays. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

/**
 * Normalizes any known character-stats input into the canonical flat shape.
 *
 * Accepts every shape that has historically existed in the system:
 *  - Extension/DNDBeyond stats payload:
 *      { abilityScores: { str, dex, con, int, wis, cha }, hp: { current, max, temp }, ac, initiative, ... }
 *  - Extension-stored character metadata (stats nested under `stats`):
 *      { level, stats: <above>, conditions, features, ... }
 *  - Mock/legacy flat metadata:
 *      { level, strength, dexterity, ..., hpCurrent, hpMax, ac, ... }
 *  - Already-canonical output (idempotent).
 *
 * Nested (extension) values win over flat siblings when both are present; flat is
 * the fallback so legacy rows still resolve. Returns null for empty/invalid input.
 *
 * Runs at extension-sync ingestion (to store canonical) and at every backend read
 * projection (to upgrade legacy rows transparently), so every consumer — online or
 * offline — sees identical data.
 */
export function normalizeCharacterStats(raw: unknown): NormalizedCharacterStats | null {
  const meta = asRecord(raw)
  if (!meta) return null

  // The "container" holds the rich stat fields: either a nested `stats` object
  // (extension metadata / wrapped payload) or the object itself (raw extension
  // payload and mock flat metadata both expose fields directly).
  const container = asRecord(meta.stats) ?? meta
  const ability = asRecord(container.abilityScores)
  const hp = asRecord(container.hp)

  const pick = (nestedVal: unknown, flatVal: unknown): number | undefined =>
    finiteNumber(nestedVal) ?? finiteNumber(flatVal)

  const out: NormalizedCharacterStats = {}
  const set = (key: keyof NormalizedCharacterStats, value: number | undefined): void => {
    if (value !== undefined) {
      out[key] = value
    }
  }

  set('level', finiteNumber(meta.level))
  set('proficiencyBonus', pick(container.proficiencyBonus, meta.proficiencyBonus))
  set('strength', pick(ability?.str, meta.strength))
  set('dexterity', pick(ability?.dex, meta.dexterity))
  set('constitution', pick(ability?.con, meta.constitution))
  set('intelligence', pick(ability?.int, meta.intelligence))
  set('wisdom', pick(ability?.wis, meta.wisdom))
  set('charisma', pick(ability?.cha, meta.charisma))
  set('hpCurrent', pick(hp?.current, meta.hpCurrent))
  set('hpMax', pick(hp?.max, meta.hpMax))
  set('hpTemp', pick(hp?.temp, meta.hpTemp))
  set('ac', pick(container.ac, meta.ac))
  set('initiative', pick(container.initiative, meta.initiative))
  set('passivePerception', pick(container.passivePerception, meta.passivePerception))
  set('speed', pick(container.speed, meta.speed))

  const spellSlots = container.spellSlots ?? meta.spellSlots
  if (spellSlots !== undefined && spellSlots !== null) {
    out.spellSlots = spellSlots
  }
  const pactMagic = container.pactMagic ?? meta.pactMagic
  if (pactMagic !== undefined && pactMagic !== null) {
    out.pactMagic = pactMagic
  }

  const conditions = Array.isArray(meta.conditions)
    ? meta.conditions
    : Array.isArray(container.conditions)
      ? container.conditions
      : undefined
  if (conditions) {
    out.conditions = conditions
  }

  return Object.keys(out).length > 0 ? out : null
}

/**
 * Applies an extension character payload onto existing character metadata with
 * section-wise OVERWRITE semantics. This is THE single way synced character data is
 * persisted — used by both ingestion points (the sync API and guest-auth login) so
 * behaviour is identical everywhere.
 *
 * The extension is the source of truth: each section PRESENT in `incoming` fully
 * replaces its counterpart. The stats section is reset wholesale (every
 * {@link CHARACTER_STAT_KEYS} entry cleared then re-set from the payload, and any
 * legacy nested `stats` key dropped) so no stale ability/combat value can survive a
 * re-sync. Sections ABSENT from `incoming` are preserved untouched — the extension
 * sends multiple packets and the first frequently omits stats, so a stats-less
 * packet must never wipe previously-synced stats.
 *
 * Pure: returns a new metadata object; callers persist the result.
 */
export function mergeCharacterMetadata(
  existing: unknown,
  incoming: {
    level?: number
    characterUrl?: string
    stats?: unknown
    conditions?: unknown
    features?: unknown
  }
): Record<string, unknown> {
  const next: Record<string, unknown> =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {}

  if (typeof incoming.level === 'number' && Number.isFinite(incoming.level)) {
    next.level = incoming.level
  }
  if (typeof incoming.characterUrl === 'string' && incoming.characterUrl.trim().length > 0) {
    next.characterUrl = incoming.characterUrl.trim()
  }
  if (incoming.stats !== undefined) {
    const normalized = normalizeCharacterStats(incoming.stats)
    // Only replace when the payload carried real stats — an empty/invalid stats
    // object (normalized === null) preserves the existing section.
    if (normalized) {
      delete next.stats
      for (const key of CHARACTER_STAT_KEYS) {
        if (normalized[key] !== undefined) {
          next[key] = normalized[key]
        } else {
          delete next[key]
        }
      }
    }
  }
  if (Array.isArray(incoming.conditions)) {
    next.conditions = incoming.conditions
  }
  if (Array.isArray(incoming.features)) {
    next.features = incoming.features
  }

  return next
}

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

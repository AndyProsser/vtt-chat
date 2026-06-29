/**
 * Inventory normalization utility.
 * Maps raw SRD API responses and DDB extension sync payloads to the canonical
 * ItemMetadata shape. Called at ingestion time on both backend and frontend so
 * every reader sees the same flat, normalized structure.
 *
 * See docs/subsystems/INVENTORY-SYSTEM.md §2.1c for field mapping rules.
 */

/** Extended item data stored in the metadata JSON column. */
export interface ItemMetadata {
  itemType?: string // e.g. 'Weapon', 'Armor', 'Adventuring Gear'
  itemSubtype?: string // e.g. 'Martial Melee', 'Light Armor'
  weight?: number // weight in lb
  costGp?: number // base cost normalised to GP
  description?: string // flavour text / mechanical description
  damage?: string // e.g. '1d8 slashing'
  properties?: string[] // e.g. ['Finesse', 'Light', 'Thrown (20/60)']
}

// ─── Known container type names ───────────────────────────────────────────────

const CONTAINER_NAMES = new Set(['backpack', 'chest', 'pouch', 'sack', 'basket'])

/** Returns true if the item name or srdKey matches a known container type. */
export function isKnownContainerType(name: string, srdKey?: string | null): boolean {
  const nameLower = name.trim().toLowerCase()
  const keyLower = (srdKey ?? '').toLowerCase()
  return CONTAINER_NAMES.has(nameLower) || CONTAINER_NAMES.has(keyLower)
}

// ─── Cost normalisation ───────────────────────────────────────────────────────

const GP_CONVERSION: Record<string, number> = {
  gp: 1,
  sp: 0.1,
  cp: 0.01,
  ep: 0.5,
  pp: 10,
}

function normaliseCost(quantity: number, unit: string): number | undefined {
  const factor = GP_CONVERSION[unit?.toLowerCase() ?? '']
  if (!factor || !Number.isFinite(quantity)) return undefined
  return Math.round(quantity * factor * 100) / 100
}

// ─── SRD API normalisation ────────────────────────────────────────────────────

/**
 * Raw response shape from the D&D 5e SRD API.
 *
 * The 2014 and 2024 endpoints return DIFFERENT schemas for the same item:
 *   - 2014: `equipment_category` (object), `weapon_category`/`armor_category`
 *     strings, `desc` for flavour text.
 *   - 2024: `equipment_categories` (ARRAY), category info only in that array,
 *     `description` for flavour text, and a `range` on melee weapons (5 ft reach).
 *
 * Both variants' fields are typed here; `normalizeFromSrd` reads whichever is
 * present. Damage, cost, weight, properties, throw_range, two_handed_damage and
 * armor_class are identical across both rulesets.
 */
export interface SrdItemApiResponse {
  name?: string
  // 2014 category fields
  equipment_category?: { name?: string }
  gear_category?: { name?: string }
  weapon_category?: string
  armor_category?: string
  // 2024 category field (array of {index,name}, most-/least-specific in varying order)
  equipment_categories?: Array<{ index?: string; name?: string }>
  weight?: number
  cost?: { quantity?: number; unit?: string }
  desc?: string | string[] // 2014
  description?: string | string[] // 2024
  damage?: { damage_dice?: string; damage_type?: { name?: string } }
  two_handed_damage?: { damage_dice?: string }
  armor_class?: { base?: number; dex_bonus?: boolean; max_bonus?: number | null }
  properties?: Array<{ name?: string }>
  range?: { normal?: number; long?: number | null }
  throw_range?: { normal?: number; long?: number | null }
  special?: string[]
}

// ─── 2024 category mapping ─────────────────────────────────────────────────────
// In 2024, category info lives only in the `equipment_categories[]` array. Map a
// known broad category (by index) to the clean singular label 2014 used directly.
const SRD_2024_PRIMARY_CATEGORY_LABELS: Record<string, string> = {
  weapon: 'Weapon',
  weapons: 'Weapon',
  armor: 'Armor',
  'adventuring-gear': 'Adventuring Gear',
  tools: 'Tools',
  'mounts-and-vehicles': 'Mounts and Vehicles',
  'mounts-and-other-animals': 'Mounts and Vehicles',
  'equipment-packs': 'Equipment Pack',
}

/** Strips a redundant trailing "Weapon(s)" so "Martial Melee Weapons" → "Martial Melee". */
function cleanSubtype(name: string): string {
  return name.replace(/\s+weapons?$/i, '').trim()
}

/**
 * Derives itemType / itemSubtype from a 2024 `equipment_categories[]` array.
 * itemType = a known broad category (clean label); itemSubtype = the most
 * specific (longest) remaining category name.
 */
function categoryFrom2024(categories: Array<{ index?: string; name?: string }>): {
  itemType?: string
  itemSubtype?: string
} {
  const cats = categories.filter((c) => c && c.name)
  if (cats.length === 0) return {}

  const primary = cats.find((c) => c.index && SRD_2024_PRIMARY_CATEGORY_LABELS[c.index])
  const itemType = primary?.index
    ? SRD_2024_PRIMARY_CATEGORY_LABELS[primary.index]
    : cats[cats.length - 1].name

  const subtypeCandidates = cats.filter((c) => c !== primary)
  const mostSpecific = subtypeCandidates.reduce<{ name?: string } | null>(
    (best, c) => (best && (best.name?.length ?? 0) >= (c.name?.length ?? 0) ? best : c),
    null
  )
  const itemSubtype = mostSpecific?.name ? cleanSubtype(mostSpecific.name) : undefined

  return { itemType, itemSubtype }
}

/** Normalises a raw SRD API item response (2014 or 2024) to canonical ItemMetadata. */
export function normalizeFromSrd(raw: SrdItemApiResponse): ItemMetadata {
  const meta: ItemMetadata = {}

  // itemType / itemSubtype — 2024 uses equipment_categories[], 2014 uses scalars
  if (Array.isArray(raw.equipment_categories) && raw.equipment_categories.length > 0) {
    const { itemType, itemSubtype } = categoryFrom2024(raw.equipment_categories)
    if (itemType) meta.itemType = itemType
    if (itemSubtype) meta.itemSubtype = itemSubtype
  } else {
    const equipCat = raw.equipment_category?.name
    if (equipCat) meta.itemType = equipCat
    const subcat = raw.gear_category?.name ?? raw.weapon_category ?? raw.armor_category
    if (subcat) meta.itemSubtype = subcat
  }

  // weight
  if (typeof raw.weight === 'number' && raw.weight >= 0) {
    meta.weight = raw.weight
  }

  // costGp
  if (raw.cost?.quantity !== undefined && raw.cost?.unit) {
    const gp = normaliseCost(raw.cost.quantity, raw.cost.unit)
    if (gp !== undefined) meta.costGp = gp
  }

  // description — 2014 `desc`, 2024 `description`; either may be a string or array
  const descSource = raw.description ?? raw.desc
  const descRaw = Array.isArray(descSource) ? descSource.join('\n') : descSource
  if (descRaw) meta.description = descRaw

  // damage
  if (raw.damage?.damage_dice) {
    const typeName = raw.damage.damage_type?.name
    meta.damage = typeName
      ? `${raw.damage.damage_dice} ${typeName.toLowerCase()}`
      : raw.damage.damage_dice
  }

  // properties[] — base weapon properties PLUS range/thrown/versatile/armor merged in order.
  // The base list names a property bare (e.g. 'Versatile', 'Thrown'); enriched entries
  // below REPLACE that bare entry in place rather than duplicating it.
  const props: string[] = []

  /** Replaces the bare-named property with its enriched label, or appends if absent. */
  const mergeProp = (bareName: string, enriched: string) => {
    const idx = props.findIndex((p) => p.toLowerCase() === bareName.toLowerCase())
    if (idx >= 0) props[idx] = enriched
    else props.push(enriched)
  }

  // 1. Base weapon properties
  if (Array.isArray(raw.properties)) {
    for (const p of raw.properties) {
      if (p.name) props.push(p.name)
    }
  }

  // 2. Range — only for genuinely ranged weapons. 2024 gives melee weapons a
  //    5 ft reach in `range.normal`; treat a long range or normal > 5 as ranged.
  if (raw.range?.normal && (raw.range.long || raw.range.normal > 5)) {
    const long = raw.range.long ? `/${raw.range.long}` : ''
    props.push(`Range (${raw.range.normal}${long})`)
  }

  // 3. Thrown range — replaces the bare 'Thrown' property
  if (raw.throw_range?.normal) {
    const long = raw.throw_range.long ? `/${raw.throw_range.long}` : ''
    mergeProp('Thrown', `Thrown (${raw.throw_range.normal}${long})`)
  }

  // 4. Versatile two-handed damage — replaces the bare 'Versatile' property
  if (raw.two_handed_damage?.damage_dice) {
    mergeProp('Versatile', `Versatile (${raw.two_handed_damage.damage_dice})`)
  }

  // 5. Armor class
  if (raw.armor_class?.base) {
    const armorLabel =
      raw.armor_category ?? meta.itemSubtype ?? raw.equipment_category?.name ?? 'Armor'
    props.push(`${armorLabel} (AC ${raw.armor_class.base})`)
  }

  if (props.length > 0) meta.properties = props

  return meta
}

// ─── DDB extension sync normalisation ────────────────────────────────────────

/**
 * Extended fields from a DDB extension sync item payload.
 * All fields are optional — omitting a field leaves the stored value unchanged.
 */
export interface DdbItemSyncFields {
  itemType?: string
  itemSubtype?: string
  weight?: number
  costGp?: number
  description?: string
  damage?: string
  properties?: string[]
}

/**
 * Normalises extended fields from a DDB extension sync payload to ItemMetadata.
 * Only defined keys are included in the result — undefined keys are excluded so
 * callers can merge (spread) without overwriting stored values with undefined.
 */
export function normalizeFromDdb(raw: DdbItemSyncFields): ItemMetadata {
  const meta: ItemMetadata = {}
  if (raw.itemType !== undefined) meta.itemType = raw.itemType
  if (raw.itemSubtype !== undefined) meta.itemSubtype = raw.itemSubtype
  if (raw.weight !== undefined && Number.isFinite(raw.weight)) meta.weight = raw.weight
  if (raw.costGp !== undefined && Number.isFinite(raw.costGp)) meta.costGp = raw.costGp
  if (raw.description !== undefined) meta.description = raw.description
  if (raw.damage !== undefined) meta.damage = raw.damage
  if (raw.properties !== undefined && Array.isArray(raw.properties))
    meta.properties = raw.properties
  return meta
}

/**
 * Merges a partial metadata update onto an existing metadata object.
 * A `null` value for any key explicitly clears that field.
 * An `undefined` value leaves the existing field unchanged.
 */
export function mergeItemMetadata(
  existing: ItemMetadata | null | undefined,
  update: Partial<Record<keyof ItemMetadata, unknown>>
): ItemMetadata {
  const base: ItemMetadata = existing ? { ...existing } : {}
  for (const key of Object.keys(update) as (keyof ItemMetadata)[]) {
    const val = update[key]
    if (val === null) {
      delete base[key]
    } else if (val !== undefined) {
      ;(base as Record<string, unknown>)[key] = val
    }
  }
  return base
}

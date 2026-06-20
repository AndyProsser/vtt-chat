/**
 * Loot List Parser
 * Pure utilities for parsing the /loot command's comma-separated argument string.
 * No side effects; safe to unit-test in isolation.
 */

import type { CurrencyDenomination } from '@/services/inventory/inventory.service'

/** Token that exactly matches `{digits}{denom}` with nothing else. */
const PURE_CURRENCY_RE = /^(\d+)(pp|gp|ep|sp|cp)$/i

export interface ParsedLootItem {
  /** Name as the user typed it — parenthetical notes preserved. */
  rawName: string
  quantity: number
}

export interface LootListResult {
  currencies: Partial<Record<CurrencyDenomination, number>>
  items: ParsedLootItem[]
  /** Number of blank tokens ignored during parsing. */
  skipped: number
}

/**
 * Split a loot arg string on commas while respecting parentheses.
 *   "1x sword, 2x gems (25gp), 3sp" → ["1x sword", "2x gems (25gp)", "3sp"]
 */
export function splitLootList(raw: string): string[] {
  const result: string[] = []
  let current = ''
  let depth = 0
  for (const ch of raw) {
    if (ch === '(') { depth++; current += ch }
    else if (ch === ')') { depth = Math.max(0, depth - 1); current += ch }
    else if (ch === ',' && depth === 0) {
      const trimmed = current.trim()
      if (trimmed) result.push(trimmed)
      current = ''
    } else {
      current += ch
    }
  }
  const last = current.trim()
  if (last) result.push(last)
  return result
}

/**
 * Parse a single item token into a name + quantity.
 * Supported formats (first match wins):
 *   "3x daggers"     — leading Nx
 *   "daggers x3"     — trailing xN
 *   "Potion 2"       — legacy bare trailing integer (backward compat)
 *   "Shortsword"     — singular, defaults to qty 1
 */
export function parseLootItemToken(token: string): ParsedLootItem {
  const t = token.trim()

  // Leading: "3x name" or "3 x name"
  let m = t.match(/^(\d+)\s*x\s+(.+)/i)
  if (m) {
    const qty = Math.min(Math.max(parseInt(m[1], 10), 1), 9999)
    return { rawName: m[2].trim(), quantity: qty }
  }

  // Trailing: "name x3"
  m = t.match(/^(.+)\s+x\s*(\d+)$/i)
  if (m) {
    const qty = Math.min(Math.max(parseInt(m[2], 10), 1), 9999)
    return { rawName: m[1].trim(), quantity: qty }
  }

  // Legacy: trailing bare integer — last word is all digits, more than one word
  const words = t.split(/\s+/)
  if (words.length > 1) {
    const last = words[words.length - 1]
    if (/^\d+$/.test(last)) {
      const qty = parseInt(last, 10)
      if (qty >= 1 && qty <= 9999) {
        return { rawName: words.slice(0, -1).join(' '), quantity: qty }
      }
    }
  }

  return { rawName: t, quantity: 1 }
}

/**
 * Parse a full /loot argument string into currency aggregates and an item list.
 * A token is currency-only when it matches `{digits}{denom}` exactly —
 * so "gems (25gp)" is never mistaken for currency.
 */
export function parseLootList(raw: string): LootListResult {
  const tokens = splitLootList(raw)
  const currencies: Partial<Record<CurrencyDenomination, number>> = {}
  const items: ParsedLootItem[] = []
  let skipped = 0

  for (const token of tokens) {
    const t = token.trim()
    if (!t) { skipped++; continue }

    const currencyMatch = t.match(PURE_CURRENCY_RE)
    if (currencyMatch) {
      const denom = currencyMatch[2].toLowerCase() as CurrencyDenomination
      const amount = parseInt(currencyMatch[1], 10)
      if (amount > 0) currencies[denom] = (currencies[denom] ?? 0) + amount
      continue
    }

    items.push(parseLootItemToken(t))
  }

  return { currencies, items, skipped }
}

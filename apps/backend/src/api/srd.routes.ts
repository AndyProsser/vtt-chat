/**
 * SRD Proxy Routes
 * Proxies item search to the D&D 5e SRD API with a 24h Redis cache.
 * Fails silently if the upstream is unreachable — the frontend degrades gracefully.
 */

import { Router } from 'express'
import type { Request, Response } from 'express'
import { getRedisClient } from '@/infra/redis'
import { logger } from '@/utils'

const router = Router()

const SRD_BASE = 'https://www.dnd5eapi.co/api'
const CACHE_TTL_S = 86400 // 24h

type SrdItem = { index: string; name: string }

/** Fetch the full equipment list from the upstream API (or return null on failure). */
async function fetchUpstreamEquipment(ruleset: '2014'): Promise<SrdItem[] | null> {
  try {
    const url = ruleset === '2014' ? `${SRD_BASE}/equipment` : `${SRD_BASE}/equipment`
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const data = (await res.json()) as { results?: SrdItem[] }
    return data.results ?? null
  } catch (err) {
    logger.warn('srd.routes', 'Upstream SRD fetch failed', { err })
    return null
  }
}

/** Return cached equipment list, populating from upstream if missing. */
async function getEquipmentList(ruleset: '2014'): Promise<SrdItem[]> {
  const cacheKey = `srd:equipment:${ruleset}`
  try {
    const redis = await getRedisClient()
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached) as SrdItem[]

    const items = await fetchUpstreamEquipment(ruleset)
    if (items && items.length > 0) {
      await redis.set(cacheKey, JSON.stringify(items), { EX: CACHE_TTL_S })
      return items
    }
  } catch (err) {
    logger.warn('srd.routes', 'Redis cache read/write failed', { err })
    // Fall through — try upstream directly
    const items = await fetchUpstreamEquipment(ruleset)
    if (items) return items
  }
  return []
}

// ─── GET /api/srd/items?q=sword&ruleset=2014 ─────────────────────────────────

router.get('/items', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim().toLowerCase()
  const ruleset = req.query.ruleset === '2024' ? '2014' : '2014' // 2024 falls back for now

  if (!q || q.length < 2) {
    return res.json({ results: [] })
  }

  const all = await getEquipmentList(ruleset)
  const results = all
    .filter((item) => item.name.toLowerCase().includes(q))
    .slice(0, 10)
    .map(({ index, name }) => ({ index, name }))

  return res.json({ results })
})

export default router

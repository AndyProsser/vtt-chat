/**
 * SRD Proxy Routes
 * Proxies D&D 5e SRD data from dnd5eapi.co with a 24h Redis cache.
 * Fails silently if the upstream is unreachable — the frontend degrades gracefully.
 * The 2024 ruleset falls back to 2014 SRD data until a 2024 upstream is available.
 */

import { Router } from 'express'
import type { Request, Response } from 'express'
import { getRedisClient } from '@/infra/redis'
import { logger } from '@/utils'

const router = Router()

const SRD_BASE = 'https://www.dnd5eapi.co/api'
const CACHE_TTL_S = 86400 // 24h

type SrdItem = { index: string; name: string }

type SrdRuleset = '2014' | '2024'

/** Normalise ruleset param — 2024 falls back to 2014 until a dedicated upstream is available. */
function normaliseRuleset(raw: unknown): SrdRuleset {
  return raw === '2014' ? '2014' : '2024'
}

/** Fetch a list resource from the upstream SRD API, returning null on failure. */
async function fetchUpstreamList(path: string): Promise<SrdItem[] | null> {
  try {
    const res = await fetch(`${SRD_BASE}${path}`, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const data = (await res.json()) as { results?: SrdItem[] }
    return data.results ?? null
  } catch (err) {
    logger.warn('srd.routes', 'Upstream SRD fetch failed', { path, err })
    return null
  }
}

/** Return a cached list, populating from upstream if missing. */
async function getCachedList(cacheKey: string, upstreamPath: string): Promise<SrdItem[]> {
  try {
    const redis = await getRedisClient()
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached) as SrdItem[]

    const items = await fetchUpstreamList(upstreamPath)
    if (items && items.length > 0) {
      await redis.set(cacheKey, JSON.stringify(items), { EX: CACHE_TTL_S })
      return items
    }
  } catch (err) {
    logger.warn('srd.routes', 'Redis cache read/write failed', { cacheKey, err })
    const items = await fetchUpstreamList(upstreamPath)
    if (items) return items
  }
  return []
}

// ─── GET /api/srd/items?q=sword&ruleset=2024 ──────────────────────────────────

router.get('/items', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim().toLowerCase()
  const ruleset = normaliseRuleset(req.query.ruleset)

  if (!q || q.length < 2) {
    return res.json({ results: [] })
  }

  const all = await getCachedList(`srd:equipment:${ruleset}`, '/equipment')
  const results = all
    .filter((item) => item.name.toLowerCase().includes(q))
    .slice(0, 10)
    .map(({ index, name }) => ({ index, name }))

  return res.json({ results })
})

// ─── GET /api/srd/races?ruleset=2024 ─────────────────────────────────────────

router.get('/races', async (req: Request, res: Response) => {
  const ruleset = normaliseRuleset(req.query.ruleset)
  const items = await getCachedList(`srd:races:${ruleset}`, '/races')
  return res.json({ results: items.map(({ index, name }) => ({ index, name })) })
})

// ─── GET /api/srd/classes?ruleset=2024 ───────────────────────────────────────

router.get('/classes', async (req: Request, res: Response) => {
  const ruleset = normaliseRuleset(req.query.ruleset)
  const items = await getCachedList(`srd:classes:${ruleset}`, '/classes')
  return res.json({ results: items.map(({ index, name }) => ({ index, name })) })
})

// ─── GET /api/srd/subclasses?class=fighter&ruleset=2024 ──────────────────────

router.get('/subclasses', async (req: Request, res: Response) => {
  const classIndex = String(req.query.class ?? '').trim().toLowerCase()
  const ruleset = normaliseRuleset(req.query.ruleset)

  if (!classIndex) {
    return res.json({ results: [] })
  }

  const items = await getCachedList(
    `srd:subclasses:${ruleset}:${classIndex}`,
    `/classes/${classIndex}/subclasses`
  )
  return res.json({ results: items.map(({ index, name }) => ({ index, name })) })
})

export default router

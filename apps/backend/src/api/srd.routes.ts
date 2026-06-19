/**
 * SRD Proxy Routes
 * Proxies D&D 5e SRD data from dnd5eapi.co with a 24h Redis cache.
 * Fails silently if the upstream is unreachable — the frontend degrades gracefully.
 *
 * URL differences by edition:
 *   2014 — /api/2014/races, /api/2014/classes, /api/2014/classes/{index}/subclasses
 *   2024 — /api/2024/species (renamed), /api/2024/classes, subclasses embedded in class detail
 */

import { Router } from 'express'
import type { Request, Response } from 'express'
import { getRedisClient } from '@/infra/redis'
import { logger } from '@/utils'

const router = Router()

const SRD_ORIGIN = 'https://www.dnd5eapi.co'
const CACHE_TTL_S = 86400 // 24h

type SrdRuleset = '2014' | '2024'
type SrdItem = { index: string; name: string }

function versionedPath(ruleset: SrdRuleset, path: string): string {
  return `/api/${ruleset}${path}`
}

/** Fetch a list resource from the upstream SRD API, returning null on failure. */
async function fetchUpstreamList(path: string): Promise<SrdItem[] | null> {
  try {
    const res = await fetch(`${SRD_ORIGIN}${path}`, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const data = (await res.json()) as { results?: SrdItem[] }
    return data.results ?? null
  } catch (err) {
    logger.warn('srd.routes', 'Upstream SRD fetch failed', { path, err })
    return null
  }
}

/** Fetch a single resource object from the upstream API, returning null on failure. */
async function fetchUpstreamObject(path: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${SRD_ORIGIN}${path}`, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    return (await res.json()) as Record<string, unknown>
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

/** Return a cached generic value, populating from upstream if missing. */
async function getCachedValue<T>(
  cacheKey: string,
  fetch: () => Promise<T | null>
): Promise<T | null> {
  try {
    const redis = await getRedisClient()
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached) as T

    const value = await fetch()
    if (value != null) {
      await redis.set(cacheKey, JSON.stringify(value), { EX: CACHE_TTL_S })
      return value
    }
  } catch (err) {
    logger.warn('srd.routes', 'Redis cache read/write failed', { cacheKey, err })
    return fetch()
  }
  return null
}

function normaliseRuleset(raw: unknown): SrdRuleset {
  return raw === '2014' ? '2014' : '2024'
}

// ─── GET /api/srd/items?q=sword&ruleset=2024 ──────────────────────────────────
// Both 2014 and 2024 use /api/{ruleset}/equipment

router.get('/items', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '')
    .trim()
    .toLowerCase()
  const ruleset = normaliseRuleset(req.query.ruleset)

  if (!q || q.length < 2) {
    return res.json({ results: [] })
  }

  const all = await getCachedList(`srd:equipment:${ruleset}`, versionedPath(ruleset, '/equipment'))
  const results = all
    .filter((item) => item.name.toLowerCase().includes(q))
    .slice(0, 10)
    .map(({ index, name }) => ({ index, name }))

  return res.json({ results })
})

// ─── GET /api/srd/magic-items?q=sword&ruleset=2024 ───────────────────────────
// Both 2014 and 2024 use /api/{ruleset}/magic-items

router.get('/magic-items', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '')
    .trim()
    .toLowerCase()
  const ruleset = normaliseRuleset(req.query.ruleset)

  if (!q || q.length < 2) {
    return res.json({ results: [] })
  }

  const all = await getCachedList(
    `srd:magic-items:${ruleset}`,
    versionedPath(ruleset, '/magic-items')
  )
  const results = all
    .filter((item) => item.name.toLowerCase().includes(q))
    .slice(0, 10)
    .map(({ index, name }) => ({ index, name }))

  return res.json({ results })
})

// ─── GET /api/srd/races?ruleset=2024 ─────────────────────────────────────────
// 2014 → /api/2014/races   2024 → /api/2024/species (term changed in 2024 rules)

router.get('/races', async (req: Request, res: Response) => {
  const ruleset = normaliseRuleset(req.query.ruleset)
  const upstreamPath =
    ruleset === '2024' ? versionedPath('2024', '/species') : versionedPath('2014', '/races')

  const items = await getCachedList(`srd:races:${ruleset}`, upstreamPath)
  return res.json({ results: items.map(({ index, name }) => ({ index, name })) })
})

// ─── GET /api/srd/classes?ruleset=2024 ───────────────────────────────────────

router.get('/classes', async (req: Request, res: Response) => {
  const ruleset = normaliseRuleset(req.query.ruleset)
  const items = await getCachedList(`srd:classes:${ruleset}`, versionedPath(ruleset, '/classes'))
  return res.json({ results: items.map(({ index, name }) => ({ index, name })) })
})

// ─── GET /api/srd/subclasses?class=fighter&ruleset=2024 ──────────────────────
// 2014 → GET /api/2014/classes/{index}/subclasses  (dedicated endpoint)
// 2024 → GET /api/2024/classes/{index}  then extract .subclasses[] (embedded)

router.get('/subclasses', async (req: Request, res: Response) => {
  const classIndex = String(req.query.class ?? '')
    .trim()
    .toLowerCase()
  const ruleset = normaliseRuleset(req.query.ruleset)

  if (!classIndex) {
    return res.json({ results: [] })
  }

  const cacheKey = `srd:subclasses:${ruleset}:${classIndex}`

  let items: SrdItem[] = []

  if (ruleset === '2014') {
    items = await getCachedList(
      cacheKey,
      versionedPath('2014', `/classes/${classIndex}/subclasses`)
    )
  } else {
    // 2024: subclasses are embedded in the class detail object
    const subclasses = await getCachedValue<SrdItem[]>(cacheKey, async () => {
      const classObj = await fetchUpstreamObject(versionedPath('2024', `/classes/${classIndex}`))
      if (!classObj) return null
      const raw = classObj.subclasses
      if (!Array.isArray(raw)) return []
      return (raw as Array<{ index?: string; name?: string }>)
        .filter((s) => s.index && s.name)
        .map((s) => ({ index: s.index as string, name: s.name as string }))
    })
    items = subclasses ?? []
  }

  return res.json({ results: items.map(({ index, name }) => ({ index, name })) })
})

export default router

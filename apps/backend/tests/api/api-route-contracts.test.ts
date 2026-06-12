import express, { Router } from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

function makeEmptyRouter() {
  return Router()
}

function makeAuthV1Router() {
  const router = Router()
  router.get('/validate', (_req, res) => {
    res.status(200).json({ scope: 'auth-current', route: 'validate' })
  })
  return router
}

function makeSessionRouter() {
  const router = Router()
  router.get('/:id/members', (req, res) => {
    res.status(200).json({ scope: 'session-current', sessionId: req.params.id, route: 'members' })
  })
  return router
}

function makePresenceRouter() {
  const router = Router()
  router.post('/:sessionId/recover', (req, res) => {
    res.status(200).json({
      scope: 'presence-current',
      sessionId: req.params.sessionId,
      route: 'recover',
    })
  })
  return router
}

function makeRoomsRouter() {
  const router = Router()
  router.get('/session/:sessionId', (req, res) => {
    res.status(200).json({ scope: 'rooms-current', sessionId: req.params.sessionId, route: 'list' })
  })
  return router
}

function makeAudioRouter() {
  const router = Router()
  router.get('/catalog/presets', (_req, res) => {
    res.status(200).json({ scope: 'audio-current', route: 'catalog/presets' })
  })
  return router
}

function makeLivekitRouter() {
  const router = Router()
  router.post('/token', (_req, res) => {
    res.status(200).json({ scope: 'livekit-current', route: 'token' })
  })
  return router
}

function makeIntegrationsRouter() {
  const router = Router()
  router.post('/external/sync', (_req, res) => {
    res.status(200).json({ scope: 'integrations-current', route: 'external/sync' })
  })
  return router
}

vi.mock('@/api/auth-join.routes', () => ({ default: makeAuthV1Router() }))
vi.mock('@/api/session.routes', () => ({ default: makeSessionRouter() }))
vi.mock('@/api/presence.routes', () => ({ default: makePresenceRouter() }))
vi.mock('@/api/rooms.routes', () => ({ default: makeRoomsRouter() }))
vi.mock('@/api/audio.routes', () => ({ default: makeAudioRouter() }))
vi.mock('@/api/livekit.routes', () => ({ default: makeLivekitRouter() }))
vi.mock('@/api/integrations.routes', () => ({ default: makeIntegrationsRouter() }))

vi.mock('@/api/auth.routes', () => ({ default: makeEmptyRouter() }))
vi.mock('@/api/chat.routes', () => ({ default: makeEmptyRouter() }))
vi.mock('@/api/admin.routes', () => ({ default: makeEmptyRouter() }))
vi.mock('@/api/notes.routes', () => ({ default: makeEmptyRouter() }))
vi.mock('@/api/campaign.routes', () => ({ default: makeEmptyRouter() }))
vi.mock('@/api/users.routes', () => ({ default: makeEmptyRouter() }))
vi.mock('@/api/telemetry.routes', () => ({ default: makeEmptyRouter() }))
vi.mock('@/api/platform.routes', () => ({ default: makeEmptyRouter() }))
vi.mock('@/api/metadata.routes', () => ({ default: makeEmptyRouter() }))

import apiRoutes from '../../src/api'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api', apiRoutes)
  return app
}

describe('api index current contracts', () => {
  it('mounts /api/auth/validate', async () => {
    const app = buildApp()
    const res = await request(app).get('/api/auth/validate')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ scope: 'auth-current', route: 'validate' })
  })

  it('mounts /api/session/:id/members', async () => {
    const app = buildApp()
    const res = await request(app).get('/api/session/session-123/members')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      scope: 'session-current',
      sessionId: 'session-123',
      route: 'members',
    })
  })

  it('mounts /api/presence/:sessionId/recover', async () => {
    const app = buildApp()
    const res = await request(app).post('/api/presence/session-123/recover')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      scope: 'presence-current',
      sessionId: 'session-123',
      route: 'recover',
    })
  })

  it('mounts /api/rooms/session/:sessionId', async () => {
    const app = buildApp()
    const res = await request(app).get('/api/rooms/session/session-123')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      scope: 'rooms-current',
      sessionId: 'session-123',
      route: 'list',
    })
  })

  it('mounts /api/audio/catalog/presets', async () => {
    const app = buildApp()
    const res = await request(app).get('/api/audio/catalog/presets')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ scope: 'audio-current', route: 'catalog/presets' })
  })

  it('mounts /api/livekit/token', async () => {
    const app = buildApp()
    const res = await request(app).post('/api/livekit/token')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ scope: 'livekit-current', route: 'token' })
  })

  it('mounts /api/integrations/external/sync', async () => {
    const app = buildApp()
    const res = await request(app).post('/api/integrations/external/sync')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ scope: 'integrations-current', route: 'external/sync' })
  })
})

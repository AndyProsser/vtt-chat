import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/api/auth-join.routes', async () => {
  const { Router } = await import('express')
  return { default: Router() }
})

vi.mock('../../src/api/session.routes', async () => {
  const { Router } = await import('express')
  return { default: Router() }
})

vi.mock('../../src/api/chat.routes', async () => {
  const { Router } = await import('express')
  return { default: Router() }
})

vi.mock('../../src/api/admin.routes', async () => {
  const { Router } = await import('express')
  return { default: Router() }
})

vi.mock('../../src/api/notes.routes', async () => {
  const { Router } = await import('express')
  return { default: Router() }
})

vi.mock('../../src/api/campaign.routes', async () => {
  const { Router } = await import('express')
  return { default: Router() }
})

vi.mock('../../src/api/campaign-discovery.routes', async () => {
  const { Router } = await import('express')
  return { default: Router() }
})

vi.mock('../../src/api/users.routes', async () => {
  const { Router } = await import('express')
  return { default: Router() }
})

vi.mock('../../src/api/rooms.routes', async () => {
  const { Router } = await import('express')
  return { default: Router() }
})

vi.mock('../../src/api/presence.routes', async () => {
  const { Router } = await import('express')
  return { default: Router() }
})

vi.mock('../../src/api/livekit.routes', async () => {
  const { Router } = await import('express')
  const router = Router()
  router.get('/health', (_req, res) => res.status(200).json({ ok: true }))
  return { default: router }
})

vi.mock('../../src/api/audio.routes', async () => {
  const { Router } = await import('express')
  return { default: Router() }
})

vi.mock('../../src/api/telemetry.routes', async () => {
  const { Router } = await import('express')
  return { default: Router() }
})

vi.mock('../../src/api/platform.routes', async () => {
  const { Router } = await import('express')
  return { default: Router() }
})

vi.mock('../../src/api/integrations.routes', async () => {
  const { Router } = await import('express')
  const router = Router()
  router.post('/external/sync', (_req, res) => res.status(401).json({ code: 'UNAUTHORIZED' }))
  return { default: router }
})

vi.mock('../../src/api/metadata.routes', async () => {
  const { Router } = await import('express')
  return { default: Router() }
})

vi.mock('../../src/api/dev.routes', async () => {
  const { Router } = await import('express')
  return { default: Router() }
})

async function buildApiApp() {
  vi.resetModules()

  const apiRoutes = (await import('../../src/api')).default
  const app = express()
  app.use(express.json())
  app.use('/api', apiRoutes)
  return app
}

describe('legacy livekit/integrations route retirement', () => {
  it('keeps canonical livekit/integrations/admin-integrations routes mounted', async () => {
    const app = await buildApiApp()

    const livekit = await request(app).get('/api/livekit/health')
    const integrations = await request(app).post('/api/integrations/external/sync').send({})
    const adminIntegrations = await request(app).get('/api/admin/integrations/systems')

    expect([200, 503]).toContain(livekit.status)
    expect(integrations.status).toBe(401)
    expect(adminIntegrations.status).toBe(401)
  })
})

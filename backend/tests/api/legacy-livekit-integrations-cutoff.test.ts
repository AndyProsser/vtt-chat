import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

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

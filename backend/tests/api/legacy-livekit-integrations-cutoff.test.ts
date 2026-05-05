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
  it('returns 404 for deprecated legacy livekit/integrations/admin-integrations routes', async () => {
    const app = await buildApiApp()

    const livekitLegacy = await request(app).get('/api/livekit/health')
    const integrationsLegacy = await request(app).post('/api/integrations/external/sync').send({})
    const adminIntegrationsLegacy = await request(app).get('/api/admin/integrations/systems')

    expect(livekitLegacy.status).toBe(404)
    expect(integrationsLegacy.status).toBe(404)
    expect(adminIntegrationsLegacy.status).toBe(404)
  })

  it('keeps v1 livekit/integrations/admin-integrations routes mounted', async () => {
    const app = await buildApiApp()

    const livekitV1 = await request(app).get('/api/v1/livekit/health')
    const integrationsV1 = await request(app).post('/api/v1/integrations/external/sync').send({})
    const adminIntegrationsV1 = await request(app).get('/api/admin/v1/integrations/systems')

    expect([200, 503]).toContain(livekitV1.status)
    expect(integrationsV1.status).toBe(401)
    expect(adminIntegrationsV1.status).toBe(401)
  })
})

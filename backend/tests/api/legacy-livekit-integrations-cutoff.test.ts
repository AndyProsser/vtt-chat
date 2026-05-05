import express from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'

const originalLegacyFlag = process.env.ENABLE_LEGACY_LIVEKIT_INTEGRATIONS_PATHS

async function buildApiAppWithLegacyFlag(flagValue: string | undefined) {
  if (flagValue === undefined) {
    delete process.env.ENABLE_LEGACY_LIVEKIT_INTEGRATIONS_PATHS
  } else {
    process.env.ENABLE_LEGACY_LIVEKIT_INTEGRATIONS_PATHS = flagValue
  }

  vi.resetModules()

  const apiRoutes = (await import('../../src/api')).default
  const app = express()
  app.use(express.json())
  app.use('/api', apiRoutes)
  return app
}

afterEach(() => {
  if (originalLegacyFlag === undefined) {
    delete process.env.ENABLE_LEGACY_LIVEKIT_INTEGRATIONS_PATHS
  } else {
    process.env.ENABLE_LEGACY_LIVEKIT_INTEGRATIONS_PATHS = originalLegacyFlag
  }
  vi.resetModules()
})

describe('legacy livekit/integrations cutoff flag', () => {
  it('returns 404 for legacy livekit/integrations routes when cutoff flag is disabled', async () => {
    const app = await buildApiAppWithLegacyFlag('0')

    const livekitLegacy = await request(app).get('/api/livekit/health')
    const integrationsLegacy = await request(app).post('/api/integrations/external/sync').send({})
    const adminIntegrationsLegacy = await request(app).get('/api/admin/integrations/systems')

    expect(livekitLegacy.status).toBe(404)
    expect(integrationsLegacy.status).toBe(404)
    expect(adminIntegrationsLegacy.status).toBe(404)
  })

  it('keeps v1 livekit/integrations routes mounted when cutoff flag is disabled', async () => {
    const app = await buildApiAppWithLegacyFlag('0')

    const livekitV1 = await request(app).get('/api/v1/livekit/health')
    const integrationsV1 = await request(app).post('/api/v1/integrations/external/sync').send({})
    const adminIntegrationsV1 = await request(app).get('/api/admin/v1/integrations/systems')

    expect([200, 503]).toContain(livekitV1.status)
    expect(integrationsV1.status).toBe(401)
    expect(adminIntegrationsV1.status).toBe(401)
  })
})

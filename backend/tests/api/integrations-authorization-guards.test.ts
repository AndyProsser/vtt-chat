import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resetExternalSystemsRegistryForTests,
  updateExternalSystem,
} from '../../src/services/integrations.service'

const mockPersistDiagnosticEvents = vi.fn()

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => ({
    user: {
      findUnique: vi.fn(),
    },
  }),
}))

vi.mock('@/repositories/campaign.repository', () => ({
  upsertUserAccount: vi.fn(),
}))

vi.mock('@/infra/http/rate-limit', () => ({
  createRateLimit: () => (_req: any, _res: any, next: any) => next(),
}))

vi.mock('@/infra/telemetry-store', () => ({
  persistTelemetryEvents: vi.fn(),
  persistDiagnosticEvents: (...args: unknown[]) => mockPersistDiagnosticEvents(...args),
}))

import authRoutes from '../../src/api/auth.routes'
import telemetryRoutes from '../../src/api/telemetry.routes'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/auth', authRoutes)
  app.use('/api/telemetry', telemetryRoutes)
  return app
}

describe('external systems authorization guardrails', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetExternalSystemsRegistryForTests()
    mockPersistDiagnosticEvents.mockResolvedValue([{ id: 'diag-1' }])
  })

  it('rejects guest-login for blocked systems', async () => {
    const app = buildApp()

    const response = await request(app).post('/api/auth/extension/guest-login').send({
      externalSystem: 'dndbeyond',
    })

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('INTEGRATION_NOT_AUTHORIZED')
  })

  it('returns not-implemented for authorized systems until Stage 13', async () => {
    const app = buildApp()

    updateExternalSystem('dndbeyond', { authorizationState: 'AUTHORIZED' })

    const response = await request(app).post('/api/auth/extension/guest-login').send({
      externalSystem: 'dndbeyond',
    })

    expect(response.status).toBe(501)
    expect(response.body.code).toBe('GUEST_AUTH_NOT_IMPLEMENTED')
  })

  it('rejects blocked systems for external log ingestion', async () => {
    const app = buildApp()

    const response = await request(app)
      .post('/api/telemetry/external/logs')
      .send({
        externalSystem: 'roll20',
        events: [{ message: 'hello' }],
      })

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('INTEGRATION_NOT_AUTHORIZED')
  })

  it('accepts LOG_ONLY systems for external log ingestion', async () => {
    const app = buildApp()

    updateExternalSystem('roll20', { authorizationState: 'LOG_ONLY' })

    const response = await request(app)
      .post('/api/telemetry/external/logs')
      .send({
        externalSystem: 'roll20',
        events: [{ message: 'sync heartbeat', severity: 'INFO' }],
      })

    expect(response.status).toBe(202)
    expect(response.body.ok).toBe(true)
    expect(mockPersistDiagnosticEvents).toHaveBeenCalledTimes(1)
  })
})

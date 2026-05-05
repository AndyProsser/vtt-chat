import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyAdminToken: vi.fn(),
  createInitialAdmin: vi.fn(),
  authenticateAdmin: vi.fn(),
  createAdminToken: vi.fn(),
  validatePassword: vi.fn(),
  issueHandoffToken: vi.fn(),
  consumeHandoffToken: vi.fn(),
  hashPassword: vi.fn(),
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  userUpdate: vi.fn(),
  adminInviteCreate: vi.fn(),
  adminInviteFindUnique: vi.fn(),
  adminInviteUpdate: vi.fn(),
  adminAuditCreate: vi.fn(),
}))

vi.mock('@/utils', () => ({
  verifyAdminToken: mocks.verifyAdminToken,
}))

vi.mock('@/utils/auth', () => ({
  createAdminToken: mocks.createAdminToken,
}))

vi.mock('@/utils/password', () => ({
  validatePassword: mocks.validatePassword,
}))

vi.mock('@/services/handoff.service', () => ({
  issueHandoffToken: mocks.issueHandoffToken,
  consumeHandoffToken: mocks.consumeHandoffToken,
}))

vi.mock('@/services/auth.service', () => ({
  hashPassword: mocks.hashPassword,
  extractTokenFromHeader: (authHeader?: string) => {
    if (!authHeader) return null
    return authHeader.replace(/^Bearer\s+/i, '')
  },
  verifyToken: vi.fn(),
}))

vi.mock('@/services/auth-user-context.service', () => ({
  validateUserAuthState: vi.fn(async () => ({ ok: true })),
}))

vi.mock('@/services/admin.service', () => ({
  AdminService: {
    adminUsersExist: vi.fn().mockResolvedValue(true),
    createInitialAdmin: mocks.createInitialAdmin,
    authenticateAdmin: mocks.authenticateAdmin,
    getAdminById: vi.fn(),
    getAdminUsers: vi.fn(),
    promoteUserAdminRole: vi.fn(),
  },
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => ({
    user: {
      findUnique: mocks.userFindUnique,
      create: mocks.userCreate,
      update: mocks.userUpdate,
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    adminInvite: {
      create: mocks.adminInviteCreate,
      findUnique: mocks.adminInviteFindUnique,
      update: mocks.adminInviteUpdate,
    },
    adminAuditLog: {
      create: mocks.adminAuditCreate,
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    appEventLog: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    campaign: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn(),
    },
    session: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    room: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    sessionMember: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    presenceSnapshot: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    importExportArtifact: {
      create: vi.fn(),
    },
    recordingMetadata: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
  }),
}))

import adminRoutes from '@/api/admin.routes'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/admin', adminRoutes)
  return app
}

describe('admin onboarding/invites/handoff routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.verifyAdminToken.mockReturnValue({
      userId: 'admin-1',
      username: 'admin-user',
      adminRole: 'SUPER_ADMIN',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    })

    mocks.userFindUnique.mockImplementation(
      async (args: { where: { id?: string; username?: string; email?: string } }) => {
        if (args.where.id === 'admin-1') {
          return {
            isActive: true,
            tokenInvalidBefore: null,
          }
        }

        if (args.where.id === 'handoff-user') {
          return {
            id: 'handoff-user',
            username: 'handoff-admin',
            email: 'handoff@example.com',
            role: 'DM',
            adminRole: null,
            password: 'hashed',
            isActive: true,
          }
        }

        return null
      }
    )

    mocks.validatePassword.mockReturnValue({ isValid: true, feedback: [], suggestions: [] })
    mocks.createAdminToken.mockReturnValue('admin-jwt')
    mocks.hashPassword.mockResolvedValue('hashed-password')

    mocks.createInitialAdmin.mockResolvedValue({
      id: 'u-1',
      username: 'root-admin',
      email: 'root@example.com',
    })

    mocks.authenticateAdmin.mockResolvedValue({
      id: 'u-2',
      username: 'ops',
      email: 'ops@example.com',
      adminRole: 'ADMIN',
    })

    mocks.adminInviteCreate.mockResolvedValue({
      token: 'invite-token',
      invitedRole: 'ADMIN',
      email: 'invitee@example.com',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })

    mocks.adminAuditCreate.mockResolvedValue({ id: 'audit-1' })

    mocks.issueHandoffToken.mockReturnValue({
      handoffToken: 'handoff-1',
      expiresInSec: 90,
    })

    mocks.consumeHandoffToken.mockReturnValue({
      userId: 'handoff-user',
      username: 'handoff-admin',
      target: 'admin',
    })
  })

  it('validates setup payload fields and email format', async () => {
    const app = buildApp()

    const missing = await request(app).post('/api/admin/setup').send({ email: 'a@b.com' })
    const badEmail = await request(app).post('/api/admin/setup').send({
      email: 'bad-email',
      username: 'rootadmin',
      password: 'ValidPassword!23',
      passwordConfirm: 'ValidPassword!23',
    })

    expect(missing.status).toBe(400)
    expect(missing.body.code).toBe('MISSING_FIELDS')
    expect(badEmail.status).toBe(400)
    expect(badEmail.body.code).toBe('INVALID_EMAIL')
  })

  it('rejects weak setup password and succeeds for valid setup', async () => {
    const app = buildApp()

    mocks.validatePassword.mockReturnValueOnce({
      isValid: false,
      feedback: ['too weak'],
      suggestions: ['add symbols'],
    })

    const weak = await request(app).post('/api/admin/setup').send({
      email: 'root@example.com',
      username: 'rootadmin',
      password: 'weak',
      passwordConfirm: 'weak',
    })

    const ok = await request(app).post('/api/admin/setup').send({
      email: 'root@example.com',
      username: 'rootadmin',
      password: 'ValidPassword!23',
      passwordConfirm: 'ValidPassword!23',
    })

    expect(weak.status).toBe(400)
    expect(weak.body.code).toBe('INVALID_PASSWORD')
    expect(ok.status).toBe(201)
    expect(ok.body.token).toBe('admin-jwt')
    expect(mocks.createInitialAdmin).toHaveBeenCalledTimes(1)
  })

  it('validates login credentials and succeeds with token', async () => {
    const app = buildApp()

    const missing = await request(app).post('/api/admin/login').send({ username: 'ops' })
    const ok = await request(app)
      .post('/api/admin/login')
      .send({ username: 'ops', password: 'ValidPassword!23' })

    expect(missing.status).toBe(400)
    expect(missing.body.code).toBe('MISSING_CREDENTIALS')
    expect(ok.status).toBe(200)
    expect(ok.body.token).toBe('admin-jwt')
    expect(mocks.authenticateAdmin).toHaveBeenCalledWith('ops', 'ValidPassword!23')
  })

  it('creates admin invites and validates token state', async () => {
    const app = buildApp()

    const created = await request(app)
      .post('/api/admin/invites')
      .set('Authorization', 'Bearer super-admin')
      .send({ email: 'invitee@example.com', adminRole: 'ADMIN', expiresInHours: 24 })

    mocks.adminInviteFindUnique.mockResolvedValueOnce({
      token: 'invite-token',
      invitedRole: 'ADMIN',
      email: 'invitee@example.com',
      expiresAt: new Date(Date.now() + 3600 * 1000),
      usedAt: null,
    })

    const validated = await request(app).get('/api/admin/invites/validate?token=invite-token')

    expect(created.status).toBe(201)
    expect(created.body.inviteToken).toBe('invite-token')
    expect(validated.status).toBe(200)
    expect(validated.body.valid).toBe(true)
  })

  it('rejects invite redeem identity conflicts and supports successful redeem', async () => {
    const app = buildApp()

    mocks.adminInviteFindUnique.mockResolvedValue({
      id: 'invite-id',
      token: 'invite-token',
      invitedRole: 'ADMIN',
      email: 'invitee@example.com',
      usedAt: null,
      expiresAt: new Date(Date.now() + 3600 * 1000),
    })

    mocks.userFindUnique
      .mockResolvedValueOnce({ id: 'email-user', username: 'old-email-user' })
      .mockResolvedValueOnce({ id: 'username-user', username: 'new-admin', email: null })

    const conflict = await request(app).post('/api/admin/invites/redeem').send({
      token: 'invite-token',
      username: 'new-admin',
      email: 'invitee@example.com',
      password: 'ValidPassword!23',
      passwordConfirm: 'ValidPassword!23',
    })

    expect(conflict.status).toBe(409)
    expect(conflict.body.code).toBe('IDENTITY_CONFLICT')

    mocks.userFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    mocks.userCreate.mockResolvedValueOnce({ id: 'created-user' })
    mocks.adminInviteUpdate.mockResolvedValueOnce({ id: 'invite-id' })

    const ok = await request(app).post('/api/admin/invites/redeem').send({
      token: 'invite-token',
      username: 'fresh-admin',
      email: 'invitee@example.com',
      password: 'ValidPassword!23',
      passwordConfirm: 'ValidPassword!23',
    })

    expect(ok.status).toBe(200)
    expect(ok.body.token).toBe('admin-jwt')
    expect(mocks.userCreate).toHaveBeenCalledTimes(1)
    expect(mocks.adminInviteUpdate).toHaveBeenCalledTimes(1)
  })

  it('issues handoff token and exchanges it for admin jwt', async () => {
    const app = buildApp()

    const handoff = await request(app)
      .post('/api/admin/handoff/app')
      .set('Authorization', 'Bearer super-admin')
      .send({})

    const exchanged = await request(app)
      .post('/api/admin/auth/handoff/exchange')
      .send({ handoffToken: 'handoff-1' })

    expect(handoff.status).toBe(200)
    expect(handoff.body.handoffToken).toBe('handoff-1')
    expect(exchanged.status).toBe(200)
    expect(exchanged.body.token).toBe('admin-jwt')
  })
})

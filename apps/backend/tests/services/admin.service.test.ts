import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userCount: vi.fn(),
  userFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  userCreate: vi.fn(),
  userUpdate: vi.fn(),
  userUpdateMany: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  isPasswordValid: vi.fn(),
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => ({
    user: {
      count: mocks.userCount,
      findUnique: mocks.userFindUnique,
      findFirst: mocks.userFindFirst,
      create: mocks.userCreate,
      update: mocks.userUpdate,
      updateMany: mocks.userUpdateMany,
    },
  }),
}))

vi.mock('@/utils/auth', () => ({
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword,
}))

vi.mock('@/utils/password', () => ({
  isPasswordValid: mocks.isPasswordValid,
}))

import { AdminService } from '@/services/admin.service'

describe('AdminService', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.hashPassword.mockResolvedValue('hashed')
    mocks.verifyPassword.mockResolvedValue(false)
    mocks.isPasswordValid.mockReturnValue(true)
    mocks.userCount.mockResolvedValue(0)
  })

  it('reports whether super admins exist', async () => {
    mocks.userCount.mockResolvedValueOnce(0).mockResolvedValueOnce(2)

    await expect(AdminService.adminUsersExist()).resolves.toBe(false)
    await expect(AdminService.adminUsersExist()).resolves.toBe(true)
  })

  it('creates a new initial admin when setup is open', async () => {
    mocks.userFindUnique.mockResolvedValue(null)
    mocks.userFindFirst.mockResolvedValue(null)
    mocks.userCreate.mockResolvedValue({
      id: 'u-1',
      email: 'root@example.com',
      username: 'root',
    })

    const result = await AdminService.createInitialAdmin(
      'root@example.com',
      'root',
      'ValidPassword!23'
    )

    expect(result).toEqual({ id: 'u-1', email: 'root@example.com', username: 'root' })
    expect(mocks.userCreate).toHaveBeenCalledTimes(1)
  })

  it('updates an existing user during initial admin setup', async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: 'existing-user',
      displayName: '',
    })
    mocks.userFindFirst.mockResolvedValue(null)
    mocks.userUpdate.mockResolvedValue({
      id: 'existing-user',
      email: 'root@example.com',
      username: 'root',
    })

    const result = await AdminService.createInitialAdmin(
      'root@example.com',
      'root',
      'ValidPassword!23'
    )

    expect(result.id).toBe('existing-user')
    expect(mocks.userUpdate).toHaveBeenCalledTimes(1)
  })

  it('rejects setup identity conflicts and invalid passwords', async () => {
    mocks.isPasswordValid.mockReturnValueOnce(false)

    await expect(
      AdminService.createInitialAdmin('root@example.com', 'root', 'weak')
    ).rejects.toMatchObject({ code: 'INVALID_PASSWORD' })

    mocks.isPasswordValid.mockReturnValue(true)
    mocks.userFindUnique.mockResolvedValueOnce({ id: 'u-1' })
    mocks.userFindFirst.mockResolvedValueOnce({ id: 'u-2' })

    await expect(
      AdminService.createInitialAdmin('root@example.com', 'root', 'ValidPassword!23')
    ).rejects.toMatchObject({ code: 'SETUP_IDENTITY_CONFLICT' })
  })

  it('authenticates admin users and supports DM fallback role', async () => {
    mocks.userFindUnique
      .mockResolvedValueOnce({
        id: 'dm-1',
        username: 'dm-user',
        email: 'dm@example.com',
        role: 'DM',
        adminRole: null,
        isActive: true,
        password: 'hashed',
      })
      .mockResolvedValueOnce({
        id: 'player-1',
        username: 'player-user',
        email: 'player@example.com',
        role: 'PLAYER',
        adminRole: null,
        isActive: true,
        password: 'hashed',
      })

    mocks.verifyPassword.mockResolvedValueOnce(true)

    const dm = await AdminService.authenticateAdmin('dm-user', 'ValidPassword!23')
    expect(dm.adminRole).toBe('CAMPAIGN_DM')

    await expect(
      AdminService.authenticateAdmin('player-user', 'ValidPassword!23')
    ).rejects.toMatchObject({ code: 'ADMIN_ACCESS_REQUIRED' })
  })

  it('rejects inactive, passwordless, and invalid-password admin auth attempts', async () => {
    mocks.userFindUnique
      .mockResolvedValueOnce({
        id: 'admin-1',
        username: 'admin',
        email: 'admin@example.com',
        role: 'PLAYER',
        adminRole: 'ADMIN',
        isActive: false,
        password: 'hashed',
      })
      .mockResolvedValueOnce({
        id: 'admin-1',
        username: 'admin',
        email: 'admin@example.com',
        role: 'PLAYER',
        adminRole: 'ADMIN',
        isActive: true,
        password: null,
      })
      .mockResolvedValueOnce({
        id: 'admin-1',
        username: 'admin',
        email: 'admin@example.com',
        role: 'PLAYER',
        adminRole: 'ADMIN',
        isActive: true,
        password: 'hashed',
      })

    await expect(AdminService.authenticateAdmin('admin', 'pw')).rejects.toMatchObject({
      code: 'ACCOUNT_DEACTIVATED',
    })
    await expect(AdminService.authenticateAdmin('admin', 'pw')).rejects.toMatchObject({
      code: 'PASSWORD_NOT_SET',
    })
    await expect(AdminService.authenticateAdmin('admin', 'pw')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    })
  })

  it('gets admin by id and hides non-admin users', async () => {
    mocks.userFindUnique
      .mockResolvedValueOnce({
        id: 'admin-1',
        username: 'admin',
        email: 'admin@example.com',
        role: 'PLAYER',
        adminRole: 'READ_ONLY',
        isActive: true,
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: 'player-1',
        username: 'player',
        email: 'player@example.com',
        role: 'PLAYER',
        adminRole: null,
        isActive: true,
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
      })

    const admin = await AdminService.getAdminById('admin-1')
    const missing = await AdminService.getAdminById('player-1')

    expect(admin?.adminRole).toBe('READ_ONLY')
    expect(missing).toBeNull()
  })

  it('updates admin password with required checks', async () => {
    mocks.userFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'admin-1',
        role: 'PLAYER',
        adminRole: 'ADMIN',
        password: null,
      })
      .mockResolvedValueOnce({
        id: 'admin-1',
        role: 'PLAYER',
        adminRole: null,
        password: 'hashed',
      })
      .mockResolvedValueOnce({
        id: 'admin-1',
        role: 'PLAYER',
        adminRole: 'ADMIN',
        password: 'hashed',
      })
      .mockResolvedValueOnce({
        id: 'admin-1',
        role: 'PLAYER',
        adminRole: 'ADMIN',
        password: 'hashed',
      })
      .mockResolvedValueOnce({
        id: 'admin-1',
        role: 'PLAYER',
        adminRole: 'ADMIN',
        password: 'hashed',
      })
      .mockResolvedValueOnce({
        id: 'admin-1',
        role: 'PLAYER',
        adminRole: 'ADMIN',
        password: 'hashed',
      })

    await expect(AdminService.updatePassword('admin-1', 'old', 'new')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(AdminService.updatePassword('admin-1', 'old', 'new')).rejects.toMatchObject({
      code: 'PASSWORD_NOT_SET',
    })
    await expect(AdminService.updatePassword('admin-1', 'old', 'new')).rejects.toMatchObject({
      code: 'ADMIN_ACCESS_REQUIRED',
    })

    await expect(AdminService.updatePassword('admin-1', 'old', 'new')).rejects.toMatchObject({
      code: 'INVALID_PASSWORD',
    })

    mocks.verifyPassword.mockResolvedValueOnce(true)
    mocks.isPasswordValid.mockReturnValueOnce(false)

    await expect(AdminService.updatePassword('admin-1', 'old', 'bad')).rejects.toMatchObject({
      code: 'INVALID_PASSWORD',
    })

    mocks.verifyPassword.mockResolvedValueOnce(true).mockResolvedValueOnce(true)
    mocks.isPasswordValid.mockReturnValueOnce(true)

    await expect(AdminService.updatePassword('admin-1', 'old', 'old')).rejects.toMatchObject({
      code: 'SAME_PASSWORD',
    })
  })

  it('rejects invalid admin role assignment', async () => {
    await expect(
      AdminService.promoteUserAdminRole({
        actorUserId: 'actor-1',
        targetUserId: 'target-1',
        adminRole: 'NOT_REAL' as any,
      })
    ).rejects.toMatchObject({ code: 'INVALID_ADMIN_ROLE' })
  })

  it('rejects promotion when actor lacks super admin access', async () => {
    mocks.userFindUnique.mockResolvedValueOnce({
      id: 'actor-1',
      role: 'PLAYER',
      adminRole: 'ADMIN',
    })

    await expect(
      AdminService.promoteUserAdminRole({
        actorUserId: 'actor-1',
        targetUserId: 'target-1',
        adminRole: 'ADMIN',
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects promotion when target user does not exist', async () => {
    mocks.userFindUnique
      .mockResolvedValueOnce({
        id: 'actor-1',
        role: 'PLAYER',
        adminRole: 'SUPER_ADMIN',
      })
      .mockResolvedValueOnce(null)

    await expect(
      AdminService.promoteUserAdminRole({
        actorUserId: 'actor-1',
        targetUserId: 'target-1',
        adminRole: 'ADMIN',
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('promotes users and ensures dm admin role fallback', async () => {
    mocks.userFindUnique
      .mockResolvedValueOnce({
        id: 'actor-1',
        role: 'PLAYER',
        adminRole: 'SUPER_ADMIN',
      })
      .mockResolvedValueOnce({
        id: 'target-1',
        username: 'target',
        email: 'target@example.com',
        role: 'PLAYER',
        adminRole: null,
      })

    mocks.userUpdate.mockResolvedValueOnce({
      id: 'target-1',
      username: 'target',
      email: 'target@example.com',
      role: 'PLAYER',
      adminRole: 'ADMIN',
    })

    const promoted = await AdminService.promoteUserAdminRole({
      actorUserId: 'actor-1',
      targetUserId: 'target-1',
      adminRole: 'ADMIN',
    })

    expect(promoted.adminRole).toBe('ADMIN')

    await AdminService.ensureDmAdminRole('dm-1')
    expect(mocks.userUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'dm-1',
        role: 'DM',
        adminRole: null,
      },
      data: {
        adminRole: 'CAMPAIGN_DM',
      },
    })
  })
})

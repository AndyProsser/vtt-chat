import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { adminAuthMiddleware } from '@/infra/http/middleware'
import { AuthService } from '@/core/auth/auth.service'
import { AdminService } from '@/core/admin/admin.service'
import { logger } from '@/utils/logger'

const router = Router()
const prisma = new PrismaClient()
const authService = new AuthService(prisma)
const adminService = new AdminService(prisma)

// ============================================================================
// Admin Authentication
// ============================================================================

/**
 * POST /api/admin/auth/login
 * Admin login endpoint
 * Body: { password }
 */
router.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { password } = req.body

    if (!password) {
      res.status(400).json({ error: 'Password required', code: 'INVALID_INPUT' })
      return
    }

    const result = await authService.adminLogin(password)
    res.status(200).json(result)
  } catch (error) {
    throw error
  }
})


// ============================================================================
// User Management
// ============================================================================

/**
 * GET /api/admin/users
 * List all users (players and DMs)
 * Query: { limit?, offset? }
 */
router.get('/users', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0)

    const result = await adminService.getAllUsers(limit, offset)

    res.status(200).json(result)
  } catch (error) {
    throw error
  }
})

/**
 * GET /api/admin/users/:userId
 * Get specific user details and statistics
 */
router.get('/users/:userId', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await adminService.getUserDetails(req.params.userId as string)

    res.status(200).json({ user })
  } catch (error) {
    throw error
  }
})

/**
 * PATCH /api/admin/users/:userId/status
 * Toggle user active/inactive status
 * Body: { isActive: boolean }
 */
router.patch('/users/:userId/status', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { isActive } = req.body

    if (typeof isActive !== 'boolean') {
      res.status(400).json({ error: 'isActive must be boolean', code: 'INVALID_INPUT' })
      return
    }

    const user = await adminService.toggleUserActive(req.params.userId as string, isActive)

    res.status(200).json({ user })
  } catch (error) {
    throw error
  }
})


// ============================================================================
// Campaign Management (Sessions)
// ============================================================================

/**
 * GET /api/admin/campaigns
 * List all campaigns (sessions) with metadata
 * Query: { limit?, offset? }
 */
router.get('/campaigns', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0)

    const result = await adminService.getAllSessions(limit, offset)

    res.status(200).json(result)
  } catch (error) {
    throw error
  }
})

/**
 * GET /api/admin/campaigns/:campaignId
 * Get specific campaign details
 */
router.get('/campaigns/:campaignId', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const campaign = await adminService.getSessionDetails(req.params.campaignId as string)

    res.status(200).json({ campaign })
  } catch (error) {
    throw error
  }
})

/**
 * POST /api/admin/campaigns/:campaignId/archive
 * Archive a campaign
 * Body: {} (empty)
 */
router.post('/campaigns/:campaignId/archive', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const campaignId = req.params.campaignId as string

    const session = await prisma.session.findUnique({
      where: { id: campaignId },
    })

    if (!session) {
      res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND' })
      return
    }

    const updated = await prisma.session.update({
      where: { id: campaignId },
      data: { isArchived: true },
    })

    res.status(200).json({ campaign: updated })
  } catch (error) {
    throw error
  }
})

/**
 * GET /api/admin/campaigns/:campaignId/export
 * Export campaign data as JSON
 */
router.get('/campaigns/:campaignId/export', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const exportData = await adminService.getSessionExportData(req.params.campaignId as string)

    res.status(200)
      .type('application/json')
      .attachment(`campaign_${req.params.campaignId as string}.json`)
      .send(JSON.stringify(exportData, null, 2))
  } catch (error) {
    throw error
  }
})

/**
 * POST /api/admin/campaigns/:campaignId/import
 * Import campaign data from JSON file
 * Body: { importData: object }
 */
router.post('/campaigns/:campaignId/import', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { importData } = req.body

    if (!importData || typeof importData !== 'object') {
      res.status(400).json({ error: 'Invalid import data', code: 'INVALID_INPUT' })
      return
    }

    // TODO: Implement import logic with validation and data restoration

    res.status(201).json({
      message: 'Campaign imported successfully',
      campaignId: req.params.campaignId as string,
    })
  } catch (error) {
    throw error
  }
})

/**
 * DELETE /api/admin/campaigns/:campaignId
 * Delete a campaign and all associated data (cascade)
 */
router.delete('/campaigns/:campaignId', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    await adminService.deleteSession(req.params.campaignId as string)

    res.status(200).json({ message: 'Campaign deleted successfully' })
  } catch (error) {
    throw error
  }
})


// ============================================================================
// Platform Status & Health
// ============================================================================

/**
 * GET /api/admin/status
 * Platform health and service status
 */
router.get('/status', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const status = await adminService.getPlatformStatus()

    res.status(200).json(status)
  } catch (error) {
    throw error
  }
})

// ============================================================================
// Analytics & Reporting
// ============================================================================

/**
 * GET /api/admin/analytics
 * Platform usage analytics
 * Query: { range? } - 7d, 30d, all (default: 7d)
 */
router.get('/analytics', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const analytics = await adminService.getAnalytics()

    res.status(200).json(analytics)
  } catch (error) {
    throw error
  }
})

// ============================================================================
// Logging & Monitoring
// ============================================================================

/**
 * GET /api/admin/logs
 * System and application logs (stub - ready for monitoring integration)
 * Query: { limit?, level?, service? }
 */
router.get('/logs', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    // TODO: Integrate with logging service (e.g., Winston, Pino)
    // Filter by level and service

    const logs: any[] = []

    res.status(200).json({ logs })
  } catch (error) {
    throw error
  }
})

export default router


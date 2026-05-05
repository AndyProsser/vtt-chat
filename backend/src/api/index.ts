import { Request, Response, Router } from 'express'
import authRoutes from './auth.routes'
import authV1Routes from './auth-v1.routes'
import sessionRoutes from './session.routes'
import chatRoutes from './chat.routes'
import adminRoutes from './admin.routes'
import notesRoutes from './notes.routes'
import campaignRoutes from './campaign.routes'
import usersRoutes from './users.routes'
import roomsRoutes from './rooms.routes'
import presenceRoutes from './presence.routes'
import liveKitRoutes from './livekit.routes'
import audioRoutes from './audio.routes'
import telemetryRoutes from './telemetry.routes'
import platformRoutes from './platform.routes'
import integrationsRoutes from './integrations.routes'
import metadataRoutes from './metadata.routes'

const router = Router()
const enableLegacyLivekitIntegrationsPaths =
  process.env.ENABLE_LEGACY_LIVEKIT_INTEGRATIONS_PATHS !== '0' &&
  process.env.ENABLE_LEGACY_LIVEKIT_INTEGRATIONS_PATHS !== 'false'

/**
 * Health check endpoint
 */
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    mode: 'standard',
    timestamp: new Date().toISOString(),
    message: 'Backend is running with auth, session, and websocket support',
  })
})

/**
 * Implemented routes
 */

/**
 * v1 API routes (normalized naming conventions)
 * Reference: docs/operations/W6-REFACTOR-PLAN.md
 */
router.use('/v1/auth', authV1Routes)
router.use('/v1/session', sessionRoutes)
router.use('/v1/presence', presenceRoutes)
router.use('/v1/rooms', roomsRoutes)
router.use('/v1/audio', audioRoutes)
router.use('/v1/livekit', liveKitRoutes)
router.use('/v1/integrations', integrationsRoutes)

/**
 * Legacy routes (maintained for backward compatibility)
 * These routes redirect to v1 equivalents in new client code
 */
router.use('/auth', authRoutes)
router.use('/platform', platformRoutes)
router.use('/session', sessionRoutes)
router.use('/chat', chatRoutes)
router.use('/admin', adminRoutes)
router.use('/notes', notesRoutes)
router.use('/campaigns', campaignRoutes)
router.use('/users', usersRoutes)
router.use('/rooms', roomsRoutes)
router.use('/presence', presenceRoutes)
router.use('/audio', audioRoutes)
router.use('/telemetry', telemetryRoutes)
router.use('/metadata', metadataRoutes)

if (enableLegacyLivekitIntegrationsPaths) {
  router.use('/livekit', liveKitRoutes)
  router.use('/integrations', integrationsRoutes)
}

export default router

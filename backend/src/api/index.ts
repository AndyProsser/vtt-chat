import { Request, Response, Router } from 'express'
import authRoutes from './auth.routes'
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
router.use('/livekit', liveKitRoutes)
router.use('/audio', audioRoutes)
router.use('/telemetry', telemetryRoutes)
router.use('/integrations', integrationsRoutes)
router.use('/metadata', metadataRoutes)

export default router

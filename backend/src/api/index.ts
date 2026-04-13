import { Router } from 'express'
import adminRoutes from './admin.routes'
import authRoutes from './auth.routes'
import campaignRoutes from './campaign.routes'
import healthRoutes from './health.routes'
import metadataRoutes from './metadata.routes'
import notesRoutes from './notes.routes'
import exportRoutes from './export.routes'

const router = Router()

// Mount all API routes
router.use('/health', healthRoutes)
router.use('/auth', authRoutes)
router.use('/campaigns', campaignRoutes)
router.use('/metadata', metadataRoutes)
router.use('/notes', notesRoutes)
router.use('/export', exportRoutes)
router.use('/admin', adminRoutes)

export default router

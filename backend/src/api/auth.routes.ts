import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { AuthService } from '@/core/auth/auth.service'
import { authMiddleware } from '@/infra/http/middleware'

const router = Router()
const prisma = new PrismaClient()
const authService = new AuthService(prisma)

// Register new player
// POST /api/auth/register
// Body: { username, password, email? }
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, password, email } = req.body
    const result = await authService.registerPlayer(username, password, email)
    res.status(201).json(result)
  } catch (error) {
    // Error handling done by global middleware
    throw error
  }
})

// Player login
// POST /api/auth/login
// Body: { username, password }
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body
    const result = await authService.loginPlayer(username, password)
    res.status(200).json(result)
  } catch (error) {
    throw error
  }
})

// Get current user
// GET /api/auth/me
// Headers: Authorization: Bearer <token>
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      return
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    })

    res.status(200).json({ user })
  } catch (error) {
    throw error
  }
})

export default router

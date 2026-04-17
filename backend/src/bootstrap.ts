import express, { Express, Request, Response, NextFunction } from 'express'
import { Server as HTTPServer, createServer } from 'http'
import { config } from '@/infra/config'
import { logger } from '@/utils'
import {
  requestLoggingMiddleware,
  corsMiddleware,
  securityHeadersMiddleware,
  errorHandler,
  validateJsonBody,
} from '@/infra/http/middleware'
import apiRouter from '@/api/index'
import { WebSocketManager } from '@/ws'

export interface BootstrapResult {
  app: Express
  server: HTTPServer
  wsManager: WebSocketManager
  start: () => Promise<void>
  stop: () => Promise<void>
}

/**
 * Bootstrap the Express server with middleware and routes
 */
export async function bootstrap(): Promise<BootstrapResult> {
  const app = express()
  app.set('trust proxy', 1)
  const server = createServer(app)
  const wsManager = new WebSocketManager(server)

  logger.info('bootstrap', 'Initializing VTT-Chat backend Stage 1')

  // ========================================================================
  // Middleware Setup
  // ========================================================================

  // Request logging
  app.use(requestLoggingMiddleware)

  // CORS
  app.use(corsMiddleware)

  // Security headers
  app.use(securityHeadersMiddleware)

  // Body parsing
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ limit: '10mb', extended: true }))

  // ========================================================================
  // Health Check Endpoint (no auth required)
  // ========================================================================

  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
    })
  })

  // ========================================================================
  // API Routes (baseline placeholders)
  // ========================================================================

  app.use('/api', apiRouter)

  // ========================================================================
  // 404 Handler
  // ========================================================================

  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not found',
      code: 'NOT_FOUND',
    })
  })

  // ========================================================================
  // Error Handler (must be last)
  // ========================================================================

  app.use(errorHandler)

  // ========================================================================
  // Server Lifecycle
  // ========================================================================

  const start = async (): Promise<void> => {
    return new Promise((resolve, reject) => {
      try {
        server.listen(config.port, '0.0.0.0', () => {
          logger.info('bootstrap', `Server started on port ${config.port}`, {
            environment: config.environment,
            nodeVersion: process.version,
          })
          resolve()
        })
      } catch (error) {
        logger.error('bootstrap', 'Failed to start server', error as Error)
        reject(error)
      }
    })
  }

  const stop = async (): Promise<void> => {
    return new Promise((resolve, reject) => {
      try {
        // Close WebSocket connections first
        wsManager.close().then(() => {
          logger.info('bootstrap', `WebSocket server closed (${wsManager.getConnectionCount()} connections closed)`)
        })

        server.close(() => {
          logger.info('bootstrap', 'Server stopped gracefully')
          resolve()
        })

        // Force close after 10 seconds
        setTimeout(() => {
          logger.warn('bootstrap', 'Forcing server shutdown after 10s timeout')
          process.exit(1)
        }, 10000)
      } catch (error) {
        logger.error('bootstrap', 'Error stopping server', error as Error)
        reject(error)
      }
    })
  }

  return { app, server, wsManager, start, stop }
}

/**
 * Setup graceful shutdown handlers
 */
export function setupGracefulShutdown(server: HTTPServer, stop: () => Promise<void>) {
  const shutdownHandler = async (signal: string) => {
    logger.info('bootstrap', `Received ${signal}, starting graceful shutdown`)

    try {
      await stop()
      logger.info('bootstrap', 'Graceful shutdown completed')
      process.exit(0)
    } catch (error) {
      logger.error('bootstrap', 'Error during graceful shutdown', error as Error)
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => shutdownHandler('SIGTERM'))
  process.on('SIGINT', () => shutdownHandler('SIGINT'))

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('bootstrap', 'Uncaught exception', error)
    shutdownHandler('uncaughtException')
  })

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason) => {
    logger.error('bootstrap', 'Unhandled rejection', reason as Error)
    shutdownHandler('unhandledRejection')
  })
}

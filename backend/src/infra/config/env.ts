import 'dotenv/config'
import {
  APP_NAME,
  APP_VERSION,
  DEFAULT_PORT,
  DEFAULT_HOST,
  DEFAULT_ENV,
  DEFAULT_JWT_EXPIRES_IN,
  DEFAULT_ADMIN_JWT_EXPIRES_IN,
  DATABASE_URL,
  REDIS_URL,
  LIVEKIT_URL,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
} from './constants'

export interface AppConfig {
  app: {
    name: string
    version: string
  }
  port: number
  host: string
  environment: string
  isDevelopment: boolean
  isProduction: boolean
  database: {
    url: string
  }
  redis: {
    url: string
  }
  jwt: {
    secret: string
    expiresIn: string
    adminSecret: string
    adminExpiresIn: string
  }
  livekit: {
    url: string
    apiKey: string
    apiSecret: string
  }
}

export const config: AppConfig = {
  app: {
    name: APP_NAME,
    version: APP_VERSION,
  },
  port: parseInt(process.env.PORT || String(DEFAULT_PORT), 10),
  host: process.env.HOST || DEFAULT_HOST,
  environment: process.env.NODE_ENV || DEFAULT_ENV,
  isDevelopment: (process.env.NODE_ENV || DEFAULT_ENV) === 'development',
  isProduction: (process.env.NODE_ENV || DEFAULT_ENV) === 'production',
  database: {
    url: process.env.DATABASE_URL || DATABASE_URL,
  },
  redis: {
    url: process.env.REDIS_URL || REDIS_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || DEFAULT_JWT_EXPIRES_IN,
    adminSecret: process.env.JWT_ADMIN_SECRET || 'dev-admin-secret-key',
    adminExpiresIn: process.env.JWT_ADMIN_EXPIRES_IN || DEFAULT_ADMIN_JWT_EXPIRES_IN,
  },
  livekit: {
    url: process.env.LIVEKIT_URL || LIVEKIT_URL,
    apiKey: process.env.LIVEKIT_API_KEY || LIVEKIT_API_KEY,
    apiSecret: process.env.LIVEKIT_API_SECRET || LIVEKIT_API_SECRET,
  },
}

// Validate required environment variables
const requiredEnvVars = ['JWT_SECRET', 'JWT_ADMIN_SECRET']

// Only validate in production
if (config.isProduction) {
  const missing = requiredEnvVars.filter((envVar) => !process.env[envVar])

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }

  const insecureJwtValues = new Set([
    'dev-secret-key',
    'dev-admin-secret-key',
    'your-secret-key-change-in-production',
    'your-admin-secret-key-change-in-production',
  ])

  if (insecureJwtValues.has(config.jwt.secret) || insecureJwtValues.has(config.jwt.adminSecret)) {
    throw new Error('Refusing to start in production with default JWT secrets')
  }

  const insecureLiveKitValues = new Set(['devkey', 'secret'])
  if (
    insecureLiveKitValues.has(config.livekit.apiKey) ||
    insecureLiveKitValues.has(config.livekit.apiSecret)
  ) {
    throw new Error('Refusing to start in production with default LiveKit credentials')
  }
}

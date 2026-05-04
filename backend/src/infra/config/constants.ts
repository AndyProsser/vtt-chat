export const APP_NAME = 'VTT-Chat'
export const APP_VERSION = '0.1.1'

// Server defaults
export const DEFAULT_PORT = 3000
export const DEFAULT_HOST = '0.0.0.0'
export const DEFAULT_ENV = 'development'

// JWT defaults
export const DEFAULT_JWT_EXPIRES_IN = '7d'
export const DEFAULT_ADMIN_JWT_EXPIRES_IN = '24h'

// Database
export const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost/vtt-chat'

// Redis
export const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

// LiveKit
export const LIVEKIT_URL = process.env.LIVEKIT_URL || 'ws://localhost:7880'
export const LIVEKIT_PUBLIC_URL = process.env.LIVEKIT_PUBLIC_URL || ''
export const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey'
export const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'secret'

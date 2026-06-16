export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000
export const AUTH_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Rolling 90-day inactivity window for extension device credentials (refreshed on every exchange)
export const DEVICE_CREDENTIAL_TTL_MS = 90 * 24 * 60 * 60 * 1000

// Max credential exchanges per deviceId per minute (prevents replay/brute-force of intercepted tokens)
export const DEVICE_CREDENTIAL_EXCHANGE_RATE_LIMIT = { windowMs: 60 * 1000, maxRequests: 10 }

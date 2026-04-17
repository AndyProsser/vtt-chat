/**
 * Error Model
 * Reference: docs/architecture/ERROR-MODEL.md
 *
 * Standardized error codes and formatting for all API responses and events.
 * Every error must have a code, message, and optional context.
 */

export enum ErrorCode {
  // ============ VALIDATION ============
  INVALID_INPUT = 'INVALID_INPUT',
  INVALID_EVENT = 'INVALID_EVENT',
  INVALID_PAYLOAD = 'INVALID_PAYLOAD',
  INVALID_SESSION = 'INVALID_SESSION',
  INVALID_ROOM = 'INVALID_ROOM',
  INVALID_USER = 'INVALID_USER',
  INVALID_MESSAGE_ID = 'INVALID_MESSAGE_ID',
  INVALID_NOTE_ID = 'INVALID_NOTE_ID',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // ============ AUTHORIZATION ============
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',

  // ============ RESOURCE NOT FOUND ============
  NOT_FOUND = 'NOT_FOUND',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  ROOM_NOT_FOUND = 'ROOM_NOT_FOUND',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  MESSAGE_NOT_FOUND = 'MESSAGE_NOT_FOUND',
  NOTE_NOT_FOUND = 'NOTE_NOT_FOUND',

  // ============ CONFLICT / STATE ============
  CONFLICT = 'CONFLICT',
  SESSION_ALREADY_ACTIVE = 'SESSION_ALREADY_ACTIVE',
  SESSION_ALREADY_ENDED = 'SESSION_ALREADY_ENDED',
  SESSION_NOT_ACTIVE = 'SESSION_NOT_ACTIVE',
  ROOM_ALREADY_CREATED = 'ROOM_ALREADY_CREATED',
  USER_ALREADY_IN_ROOM = 'USER_ALREADY_IN_ROOM',
  USER_NOT_IN_ROOM = 'USER_NOT_IN_ROOM',
  INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION',

  // ============ TRANSPORT / CONNECTION ============
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  WEBSOCKET_ERROR = 'WEBSOCKET_ERROR',
  TIMEOUT = 'TIMEOUT',
  DISCONNECTED = 'DISCONNECTED',

  // ============ SERVER ============
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR = 'DATABASE_ERROR',

  // ============ RATE LIMITING ============
  RATE_LIMITED = 'RATE_LIMITED',
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
}

/**
 * Standard error response shape.
 * Every API error, WebSocket error, and internal error uses this format.
 */
export interface AppError {
  code: ErrorCode
  message: string
  /** HTTP status code (for REST responses) */
  status?: number
  /** Additional context about the error */
  context?: Record<string, any>
  /** Unique error ID for logging and tracking */
  errorId?: string
  /** For development: stack trace (never sent to client in production) */
  stack?: string
}

/**
 * Error metadata for logging and monitoring.
 */
export interface ErrorMetadata {
  code: ErrorCode
  message: string
  userId?: string
  sessionId?: string
  roomId?: string
  timestamp: number
  duration?: number // milliseconds
  endpoint?: string
  method?: string
  statusCode?: number
}

/**
 * Error catalog: pre-defined errors with messages.
 * Use these to create AppError instances consistently.
 */
export const ERROR_CATALOG: Record<ErrorCode, { message: string; status: number }> = {
  // Validation
  INVALID_INPUT: {
    message: 'Invalid input provided',
    status: 400,
  },
  INVALID_EVENT: {
    message: 'Invalid event structure',
    status: 400,
  },
  INVALID_PAYLOAD: {
    message: 'Event payload does not match schema',
    status: 400,
  },
  INVALID_SESSION: {
    message: 'Invalid session ID',
    status: 400,
  },
  INVALID_ROOM: {
    message: 'Invalid room ID',
    status: 400,
  },
  INVALID_USER: {
    message: 'Invalid user ID',
    status: 400,
  },
  INVALID_MESSAGE_ID: {
    message: 'Invalid message ID',
    status: 400,
  },
  INVALID_NOTE_ID: {
    message: 'Invalid note ID',
    status: 400,
  },
  MISSING_REQUIRED_FIELD: {
    message: 'Missing required field',
    status: 400,
  },

  // Authorization
  UNAUTHORIZED: {
    message: 'Authentication required',
    status: 401,
  },
  FORBIDDEN: {
    message: 'You do not have permission to perform this action',
    status: 403,
  },
  PERMISSION_DENIED: {
    message: 'Permission denied',
    status: 403,
  },
  INVALID_TOKEN: {
    message: 'Invalid or malformed token',
    status: 401,
  },
  TOKEN_EXPIRED: {
    message: 'Token has expired',
    status: 401,
  },
  INSUFFICIENT_PERMISSIONS: {
    message: 'Insufficient permissions for this action',
    status: 403,
  },

  // Not Found
  NOT_FOUND: {
    message: 'Resource not found',
    status: 404,
  },
  SESSION_NOT_FOUND: {
    message: 'Session not found',
    status: 404,
  },
  ROOM_NOT_FOUND: {
    message: 'Room not found',
    status: 404,
  },
  USER_NOT_FOUND: {
    message: 'User not found',
    status: 404,
  },
  MESSAGE_NOT_FOUND: {
    message: 'Message not found',
    status: 404,
  },
  NOTE_NOT_FOUND: {
    message: 'Note not found',
    status: 404,
  },

  // Conflict / State
  CONFLICT: {
    message: 'Resource conflict',
    status: 409,
  },
  SESSION_ALREADY_ACTIVE: {
    message: 'Session is already active',
    status: 409,
  },
  SESSION_ALREADY_ENDED: {
    message: 'Session has already ended',
    status: 409,
  },
  SESSION_NOT_ACTIVE: {
    message: 'Session is not active',
    status: 409,
  },
  ROOM_ALREADY_CREATED: {
    message: 'Room already exists',
    status: 409,
  },
  USER_ALREADY_IN_ROOM: {
    message: 'User is already in this room',
    status: 409,
  },
  USER_NOT_IN_ROOM: {
    message: 'User is not in this room',
    status: 409,
  },
  INVALID_STATE_TRANSITION: {
    message: 'Invalid state transition',
    status: 409,
  },

  // Transport / Connection
  NETWORK_ERROR: {
    message: 'Network error',
    status: 503,
  },
  CONNECTION_FAILED: {
    message: 'Failed to establish connection',
    status: 503,
  },
  WEBSOCKET_ERROR: {
    message: 'WebSocket error',
    status: 503,
  },
  TIMEOUT: {
    message: 'Request timeout',
    status: 504,
  },
  DISCONNECTED: {
    message: 'Connection lost',
    status: 503,
  },

  // Server
  INTERNAL_ERROR: {
    message: 'Internal server error',
    status: 500,
  },
  NOT_IMPLEMENTED: {
    message: 'Feature not yet implemented',
    status: 501,
  },
  SERVICE_UNAVAILABLE: {
    message: 'Service is currently unavailable',
    status: 503,
  },
  DATABASE_ERROR: {
    message: 'Database error',
    status: 500,
  },

  // Rate Limiting
  RATE_LIMITED: {
    message: 'Rate limit exceeded',
    status: 429,
  },
  TOO_MANY_REQUESTS: {
    message: 'Too many requests',
    status: 429,
  },
}

/**
 * Factory function to create a standardized error.
 */
export function createError(code: ErrorCode, overrides?: Partial<AppError>): AppError {
  const catalog = ERROR_CATALOG[code]
  if (!catalog) {
    return {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Unknown error',
      status: 500,
      ...overrides,
    }
  }

  return {
    code,
    message: catalog.message,
    status: catalog.status,
    ...overrides,
  }
}

/**
 * Check if an error is a specific type.
 */
export function isError(value: any, code: ErrorCode): value is AppError {
  return value?.code === code
}

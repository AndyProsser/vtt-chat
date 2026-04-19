'use strict'
/**
 * Error Model
 * Reference: docs/architecture/ERROR-MODEL.md
 *
 * Standardized error codes and formatting for all API responses and events.
 * Every error must have a code, message, and optional context.
 */
Object.defineProperty(exports, '__esModule', { value: true })
exports.ERROR_CATALOG = exports.ErrorCode = void 0
exports.createError = createError
exports.isError = isError
var ErrorCode
;(function (ErrorCode) {
  // ============ VALIDATION ============
  ErrorCode['INVALID_INPUT'] = 'INVALID_INPUT'
  ErrorCode['INVALID_EVENT'] = 'INVALID_EVENT'
  ErrorCode['INVALID_PAYLOAD'] = 'INVALID_PAYLOAD'
  ErrorCode['INVALID_SESSION'] = 'INVALID_SESSION'
  ErrorCode['INVALID_ROOM'] = 'INVALID_ROOM'
  ErrorCode['INVALID_USER'] = 'INVALID_USER'
  ErrorCode['INVALID_MESSAGE_ID'] = 'INVALID_MESSAGE_ID'
  ErrorCode['INVALID_NOTE_ID'] = 'INVALID_NOTE_ID'
  ErrorCode['MISSING_REQUIRED_FIELD'] = 'MISSING_REQUIRED_FIELD'
  // ============ AUTHORIZATION ============
  ErrorCode['UNAUTHORIZED'] = 'UNAUTHORIZED'
  ErrorCode['FORBIDDEN'] = 'FORBIDDEN'
  ErrorCode['PERMISSION_DENIED'] = 'PERMISSION_DENIED'
  ErrorCode['INVALID_TOKEN'] = 'INVALID_TOKEN'
  ErrorCode['TOKEN_EXPIRED'] = 'TOKEN_EXPIRED'
  ErrorCode['INSUFFICIENT_PERMISSIONS'] = 'INSUFFICIENT_PERMISSIONS'
  // ============ RESOURCE NOT FOUND ============
  ErrorCode['NOT_FOUND'] = 'NOT_FOUND'
  ErrorCode['SESSION_NOT_FOUND'] = 'SESSION_NOT_FOUND'
  ErrorCode['ROOM_NOT_FOUND'] = 'ROOM_NOT_FOUND'
  ErrorCode['USER_NOT_FOUND'] = 'USER_NOT_FOUND'
  ErrorCode['MESSAGE_NOT_FOUND'] = 'MESSAGE_NOT_FOUND'
  ErrorCode['NOTE_NOT_FOUND'] = 'NOTE_NOT_FOUND'
  // ============ CONFLICT / STATE ============
  ErrorCode['CONFLICT'] = 'CONFLICT'
  ErrorCode['SESSION_ALREADY_ACTIVE'] = 'SESSION_ALREADY_ACTIVE'
  ErrorCode['SESSION_ALREADY_ENDED'] = 'SESSION_ALREADY_ENDED'
  ErrorCode['SESSION_NOT_ACTIVE'] = 'SESSION_NOT_ACTIVE'
  ErrorCode['ROOM_ALREADY_CREATED'] = 'ROOM_ALREADY_CREATED'
  ErrorCode['USER_ALREADY_IN_ROOM'] = 'USER_ALREADY_IN_ROOM'
  ErrorCode['USER_NOT_IN_ROOM'] = 'USER_NOT_IN_ROOM'
  ErrorCode['INVALID_STATE_TRANSITION'] = 'INVALID_STATE_TRANSITION'
  // ============ TRANSPORT / CONNECTION ============
  ErrorCode['NETWORK_ERROR'] = 'NETWORK_ERROR'
  ErrorCode['CONNECTION_FAILED'] = 'CONNECTION_FAILED'
  ErrorCode['WEBSOCKET_ERROR'] = 'WEBSOCKET_ERROR'
  ErrorCode['TIMEOUT'] = 'TIMEOUT'
  ErrorCode['DISCONNECTED'] = 'DISCONNECTED'
  // ============ SERVER ============
  ErrorCode['INTERNAL_ERROR'] = 'INTERNAL_ERROR'
  ErrorCode['NOT_IMPLEMENTED'] = 'NOT_IMPLEMENTED'
  ErrorCode['SERVICE_UNAVAILABLE'] = 'SERVICE_UNAVAILABLE'
  ErrorCode['DATABASE_ERROR'] = 'DATABASE_ERROR'
  // ============ RATE LIMITING ============
  ErrorCode['RATE_LIMITED'] = 'RATE_LIMITED'
  ErrorCode['TOO_MANY_REQUESTS'] = 'TOO_MANY_REQUESTS'
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}))
/**
 * Error catalog: pre-defined errors with messages.
 * Use these to create AppError instances consistently.
 */
exports.ERROR_CATALOG = {
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
function createError(code, overrides) {
  const catalog = exports.ERROR_CATALOG[code]
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
function isError(value, code) {
  return value?.code === code
}
//# sourceMappingURL=index.js.map

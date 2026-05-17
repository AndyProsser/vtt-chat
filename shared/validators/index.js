'use strict'
/**
 * Shared Validators
 * Used by backend (REST input validation, event validation) and frontend (pre-submit validation).
 * Validators are deterministic, side-effect-free, and return validation results.
 */
Object.defineProperty(exports, '__esModule', { value: true })
exports.isValidUUID = isValidUUID
exports.isValidUsername = isValidUsername
exports.isValidSessionName = isValidSessionName
exports.isValidRoomName = isValidRoomName
exports.isValidMessageContent = isValidMessageContent
exports.isValidNoteContent = isValidNoteContent
exports.isValidNoteTitle = isValidNoteTitle
exports.isValidTag = isValidTag
exports.isValidMessageType = isValidMessageType
exports.isValidNoteVisibility = isValidNoteVisibility
exports.isValidPresenceState = isValidPresenceState
exports.validateEventEnvelope = validateEventEnvelope
exports.isValidEventType = isValidEventType
exports.isValidTimestamp = isValidTimestamp
exports.validateFields = validateFields
exports.allFieldsValid = allFieldsValid
exports.getFieldErrors = getFieldErrors
const errors_1 = require('../errors')
/**
 * UUID validator: checks if string is a valid UUID v4.
 */
function isValidUUID(value) {
  if (typeof value !== 'string') return false
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(value)
}
/**
 * Username validator: alphanumeric + underscore, 3-32 chars.
 */
function isValidUsername(value) {
  if (typeof value !== 'string') return false
  const usernameRegex = /^[a-zA-Z0-9_]{3,32}$/
  return usernameRegex.test(value)
}
/**
 * Session name validator: 1-100 chars, no control characters.
 */
function isValidSessionName(value) {
  if (typeof value !== 'string') return false
  if (value.length < 1 || value.length > 100) return false
  // No control characters
  return !/[\x00-\x1F\x7F]/.test(value)
}
/**
 * Room name validator: 1-100 chars, no control characters.
 */
function isValidRoomName(value) {
  if (typeof value !== 'string') return false
  if (value.length < 1 || value.length > 100) return false
  return !/[\x00-\x1F\x7F]/.test(value)
}
/**
 * Message content validator: 1-4000 chars, no control characters.
 */
function isValidMessageContent(value) {
  if (typeof value !== 'string') return false
  if (value.length < 1 || value.length > 4000) return false
  return !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value)
}
/**
 * Note content validator: 1-50000 chars.
 */
function isValidNoteContent(value) {
  if (typeof value !== 'string') return false
  return value.length >= 1 && value.length <= 50000
}
/**
 * Note title validator: 1-200 chars.
 */
function isValidNoteTitle(value) {
  if (typeof value !== 'string') return false
  return value.length >= 1 && value.length <= 200
}
/**
 * Tag validator: 1-50 chars, alphanumeric + underscore/hyphen.
 */
function isValidTag(value) {
  if (typeof value !== 'string') return false
  if (value.length < 1 || value.length > 50) return false
  const tagRegex = /^[a-zA-Z0-9_-]+$/
  return tagRegex.test(value)
}
/**
 * Message type validator: must be one of allowed types.
 */
function isValidMessageType(value) {
  return (
    value === 'IC' || value === 'OOC' || value === 'WHISPER' || value === 'DM' || value === 'SYSTEM'
  )
}
/**
 * Note visibility validator.
 */
function isValidNoteVisibility(value) {
  return value === 'DM_ONLY' || value === 'PLAYERS_VISIBLE' || value === 'CUSTOM'
}
/**
 * Presence state validator.
 */
function isValidPresenceState(value) {
  return (
    value === 'ONLINE' ||
    value === 'TYPING' ||
    value === 'SPEAKING' ||
    value === 'IDLE' ||
    value === 'OFFLINE'
  )
}
/**
 * Event envelope structure validator.
 */
function validateEventEnvelope(event) {
  const errors = []
  if (!event || typeof event !== 'object') {
    return { valid: false, errors: ['Event must be an object'] }
  }
  const e = event
  // Check required fields
  if (!e.id || !isValidUUID(e.id)) {
    errors.push('Missing or invalid event id (must be UUID)')
  }
  if (!e.type || typeof e.type !== 'string') {
    errors.push('Missing or invalid event type')
  }
  if (e.version !== 1) {
    errors.push('Invalid event version (must be 1)')
  }
  if (!e.userId || !isValidUUID(e.userId)) {
    errors.push('Missing or invalid userId')
  }
  if (!e.userRole || !['DM', 'PLAYER', 'SPECTATOR', 'SYSTEM'].includes(e.userRole)) {
    errors.push('Missing or invalid userRole')
  }
  if (!e.sessionId || !isValidUUID(e.sessionId)) {
    errors.push('Missing or invalid sessionId')
  }
  if (e.roomId && !isValidUUID(e.roomId)) {
    errors.push('Invalid roomId (must be UUID or null)')
  }
  if (typeof e.timestamp !== 'number' || e.timestamp <= 0) {
    errors.push('Missing or invalid timestamp (must be positive number)')
  }
  if (!e.payload || typeof e.payload !== 'object') {
    errors.push('Missing or invalid payload')
  }
  return {
    valid: errors.length === 0,
    errors,
  }
}
/**
 * Event type name validator: must be DOMAIN:ACTION format.
 */
function isValidEventType(value) {
  if (typeof value !== 'string') return false
  const eventTypeRegex = /^[A-Z_]+:[A-Z_]+$/
  return eventTypeRegex.test(value)
}
/**
 * Timestamp validator: must be within acceptable skew (±5 minutes).
 */
function isValidTimestamp(timestamp, now = Date.now()) {
  const skew = 5 * 60 * 1000 // 5 minutes
  return Math.abs(timestamp - now) < skew
}
function validateFields(data, schema) {
  return Object.entries(schema).map(([field, validator]) => ({
    field,
    valid: validator(data[field]),
    error: validator(data[field]) ? undefined : `Invalid ${field}`,
  }))
}
/**
 * Check if all field validations passed.
 */
function allFieldsValid(validations) {
  return validations.every((v) => v.valid)
}
/**
 * Get all errors from field validations.
 */
function getFieldErrors(validations) {
  return validations
    .filter((v) => !v.valid)
    .map((v) => ({
      code: errors_1.ErrorCode.INVALID_INPUT,
      message: v.error || `Invalid ${v.field}`,
      field: v.field,
    }))
}
//# sourceMappingURL=index.js.map

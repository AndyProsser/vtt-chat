import { ValidationError } from '@/types'

// ============================================================================
// Validation Schemas
// ============================================================================

export const Validators = {
  isValidUsername(username: string): boolean {
    return /^[a-zA-Z0-9_-]{3,32}$/.test(username)
  },

  isValidPassword(password: string): boolean {
    // At least 8 chars, 1 uppercase, 1 lowercase, 1 number
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)
  },

  isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  },

  isValidUUID(uuid: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)
  },

  isValidSessionName(name: string): boolean {
    return !!(name && name.length >= 1 && name.length <= 255)
  },

  isValidMessageContent(content: string): boolean {
    return !!(content && content.length > 0 && content.length <= 2000)
  },

  isValidConditionName(condition: string): boolean {
    return /^[a-zA-Z0-9\s\-_]+$/.test(condition) && condition.length <= 100
  },
}

// ============================================================================
// Validation Assertions
// ============================================================================

export const validateUsername = (username: string): void => {
  if (!username) {
    throw new ValidationError('Username is required')
  }
  if (!Validators.isValidUsername(username)) {
    throw new ValidationError('Username must be 3-32 characters (alphanumeric, dash, underscore)')
  }
}

export const validatePassword = (password: string): void => {
  if (!password) {
    throw new ValidationError('Password is required')
  }
  if (!Validators.isValidPassword(password)) {
    throw new ValidationError(
      'Password must be at least 8 characters with uppercase, lowercase, and number'
    )
  }
}

export const validateEmail = (email: string): void => {
  if (!email) {
    throw new ValidationError('Email is required')
  }
  if (!Validators.isValidEmail(email)) {
    throw new ValidationError('Invalid email format')
  }
}

export const validateUUID = (id: string, fieldName: string = 'ID'): void => {
  if (!id) {
    throw new ValidationError(`${fieldName} is required`)
  }
  if (!Validators.isValidUUID(id)) {
    throw new ValidationError(`Invalid ${fieldName} format`)
  }
}

export const validateSessionName = (name: string): void => {
  if (!name) {
    throw new ValidationError('Session name is required')
  }
  if (!Validators.isValidSessionName(name)) {
    throw new ValidationError('Session name must be 1-255 characters')
  }
}

export const validateMessageContent = (content: string): void => {
  if (!content) {
    throw new ValidationError('Message content is required')
  }
  if (!Validators.isValidMessageContent(content)) {
    throw new ValidationError('Message must be 1-2000 characters')
  }
}

export const validateConditionName = (condition: string): void => {
  if (!condition) {
    throw new ValidationError('Condition name is required')
  }
  if (!Validators.isValidConditionName(condition)) {
    throw new ValidationError(
      'Condition name must contain only alphanumeric, spaces, dash, underscore'
    )
  }
}

export const validatePagination = (limit?: number, offset?: number): void => {
  if (limit !== undefined) {
    if (limit < 1 || limit > 100) {
      throw new ValidationError('Limit must be between 1 and 100')
    }
  }
  if (offset !== undefined) {
    if (offset < 0) {
      throw new ValidationError('Offset must be non-negative')
    }
  }
}

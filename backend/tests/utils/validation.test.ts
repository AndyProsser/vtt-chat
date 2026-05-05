import { describe, expect, it } from 'vitest'
import { ValidationError } from '@/types'
import {
  Validators,
  validateConditionName,
  validateEmail,
  validateMessageContent,
  validatePagination,
  validatePassword,
  validateSessionName,
  validateUUID,
  validateUsername,
} from '@/utils/validation'

describe('utils/validation', () => {
  it('Validators handle valid and invalid primitive formats', () => {
    expect(Validators.isValidUsername('dm_master')).toBe(true)
    expect(Validators.isValidUsername('x')).toBe(false)

    expect(Validators.isValidPassword('Abcd1234')).toBe(true)
    expect(Validators.isValidPassword('weakpass')).toBe(false)

    expect(Validators.isValidEmail('dm@example.com')).toBe(true)
    expect(Validators.isValidEmail('not-an-email')).toBe(false)

    expect(Validators.isValidUUID('11111111-1111-4111-8111-111111111111')).toBe(true)
    expect(Validators.isValidUUID('bad-uuid')).toBe(false)

    expect(Validators.isValidSessionName('Alpha Session')).toBe(true)
    expect(Validators.isValidSessionName('')).toBe(false)

    expect(Validators.isValidMessageContent('hello')).toBe(true)
    expect(Validators.isValidMessageContent('')).toBe(false)

    expect(Validators.isValidConditionName('Poisoned - Tier_2')).toBe(true)
    expect(Validators.isValidConditionName('Bad@Condition')).toBe(false)
  })

  it('validateUsername enforces required and format rules', () => {
    expect(() => validateUsername('')).toThrowError(ValidationError)
    expect(() => validateUsername('ab')).toThrowError('Username must be 3-32 characters')
    expect(() => validateUsername('valid_name')).not.toThrow()
  })

  it('validatePassword enforces required and complexity rules', () => {
    expect(() => validatePassword('')).toThrowError(ValidationError)
    expect(() => validatePassword('nocapital1')).toThrowError('Password must be at least 8')
    expect(() => validatePassword('SecurePass1')).not.toThrow()
  })

  it('validateEmail enforces required and email format', () => {
    expect(() => validateEmail('')).toThrowError(ValidationError)
    expect(() => validateEmail('bad-email')).toThrowError('Invalid email format')
    expect(() => validateEmail('player@example.com')).not.toThrow()
  })

  it('validateUUID supports custom field names', () => {
    expect(() => validateUUID('', 'Session ID')).toThrowError('Session ID is required')
    expect(() => validateUUID('invalid', 'Campaign ID')).toThrowError('Invalid Campaign ID format')
    expect(() => validateUUID('22222222-2222-4222-8222-222222222222', 'Campaign ID')).not.toThrow()
  })

  it('validateSessionName enforces required and length bounds', () => {
    expect(() => validateSessionName('')).toThrowError('Session name is required')
    const tooLong = 'x'.repeat(256)
    expect(() => validateSessionName(tooLong)).toThrowError('Session name must be 1-255 characters')
    expect(() => validateSessionName('Session One')).not.toThrow()
  })

  it('validateMessageContent enforces required and max length', () => {
    expect(() => validateMessageContent('')).toThrowError('Message content is required')
    const tooLong = 'a'.repeat(2001)
    expect(() => validateMessageContent(tooLong)).toThrowError('Message must be 1-2000 characters')
    expect(() => validateMessageContent('hello table')).not.toThrow()
  })

  it('validateConditionName enforces required and allowed charset', () => {
    expect(() => validateConditionName('')).toThrowError('Condition name is required')
    expect(() => validateConditionName('bad@name')).toThrowError('Condition name must contain only')
    expect(() => validateConditionName('Stunned_2')).not.toThrow()
  })

  it('validatePagination enforces limit and offset bounds', () => {
    expect(() => validatePagination(0, 0)).toThrowError('Limit must be between 1 and 100')
    expect(() => validatePagination(101, 0)).toThrowError('Limit must be between 1 and 100')
    expect(() => validatePagination(10, -1)).toThrowError('Offset must be non-negative')
    expect(() => validatePagination(undefined, undefined)).not.toThrow()
    expect(() => validatePagination(25, 0)).not.toThrow()
  })
})

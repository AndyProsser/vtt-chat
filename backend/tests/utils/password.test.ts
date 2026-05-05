import { describe, expect, it } from 'vitest'
import {
  getPasswordStrengthColor,
  getPasswordStrengthLabel,
  isPasswordValid,
  MIN_PASSWORD_LENGTH,
  validatePassword,
} from '@/utils/password'

describe('utils/password', () => {
  it('returns required-password feedback when empty', () => {
    const result = validatePassword('')

    expect(result.isValid).toBe(false)
    expect(result.score).toBe(0)
    expect(result.feedback).toContain('Password is required')
    expect(result.suggestions.length).toBeGreaterThan(0)
  })

  it('returns actionable feedback for weak passwords', () => {
    const result = validatePassword('short')

    expect(result.isValid).toBe(false)
    expect(result.score).toBeLessThan(3)
    expect(result.feedback.join(' ')).toContain('at least')
    expect(result.suggestions.join(' ')).toContain('uppercase')
  })

  it('accepts strong passwords and emits positive suggestion', () => {
    const password = 'VeryStrongPass!2026'
    const result = validatePassword(password)

    expect(password.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH)
    expect(result.isValid).toBe(true)
    expect(result.score).toBe(5)
    expect(result.feedback).toHaveLength(0)
    expect(result.suggestions[0]).toContain('Excellent')
    expect(isPasswordValid(password)).toBe(true)
    expect(isPasswordValid('weak')).toBe(false)
  })

  it('maps strength scores to labels', () => {
    expect(getPasswordStrengthLabel(0)).toBe('Weak')
    expect(getPasswordStrengthLabel(1)).toBe('Weak')
    expect(getPasswordStrengthLabel(2)).toBe('Fair')
    expect(getPasswordStrengthLabel(3)).toBe('Good')
    expect(getPasswordStrengthLabel(4)).toBe('Strong')
    expect(getPasswordStrengthLabel(5)).toBe('Very Strong')
    expect(getPasswordStrengthLabel(99)).toBe('Unknown')
  })

  it('maps strength scores to colors', () => {
    expect(getPasswordStrengthColor(0)).toBe('#dc2626')
    expect(getPasswordStrengthColor(1)).toBe('#dc2626')
    expect(getPasswordStrengthColor(2)).toBe('#f59e0b')
    expect(getPasswordStrengthColor(3)).toBe('#eab308')
    expect(getPasswordStrengthColor(4)).toBe('#84cc16')
    expect(getPasswordStrengthColor(5)).toBe('#22c55e')
    expect(getPasswordStrengthColor(999)).toBe('#6b7280')
  })
})

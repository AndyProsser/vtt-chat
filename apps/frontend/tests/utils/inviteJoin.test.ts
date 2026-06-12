import { describe, expect, it } from 'vitest'
import {
  getEmailStatusIcon,
  getEmailStatusLabel,
  getStateLabel,
  isValidEmailFormat,
} from '../../src/utils/inviteJoin'

describe('inviteJoin utils', () => {
  it('validates email formats', () => {
    expect(isValidEmailFormat('player@example.com')).toBe(true)
    expect(isValidEmailFormat('bad-email')).toBe(false)
  })

  it('maps invite campaign states to labels', () => {
    expect(getStateLabel('ACTIVE' as any)).toBe('Active')
    expect(getStateLabel('PAUSED' as any)).toBe('Paused')
    expect(getStateLabel('GREENROOM' as any)).toBe('Greenroom')
    expect(getStateLabel('ENDED' as any)).toBe('Inactive')
  })

  it('maps email statuses to icons', () => {
    expect(getEmailStatusIcon('checking' as any)).toBe('hourglass_top')
    expect(getEmailStatusIcon('guest' as any)).toBe('badge')
    expect(getEmailStatusIcon('full' as any)).toBe('verified_user')
    expect(getEmailStatusIcon('invalid' as any)).toBe('error')
    expect(getEmailStatusIcon('error' as any)).toBe('error')
    expect(getEmailStatusIcon('none' as any)).toBe('help')
  })

  it('maps email statuses to labels', () => {
    expect(getEmailStatusLabel('checking' as any)).toBe('Checking email status')
    expect(getEmailStatusLabel('guest' as any)).toBe('GUEST account detected')
    expect(getEmailStatusLabel('full' as any)).toBe('FULL account detected')
    expect(getEmailStatusLabel('invalid' as any)).toBe('Email format is invalid')
    expect(getEmailStatusLabel('error' as any)).toBe('Email check failed')
    expect(getEmailStatusLabel('none' as any)).toBe('NONE detected yet')
  })
})

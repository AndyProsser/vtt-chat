/**
 * Theme token parity tests
 * Validates that the theme.css file defines the expected CSS custom properties
 * for both light and dark mode token sets, ensuring dark/light parity.
 *
 * This acts as a regression guard: if a token is accidentally removed or
 * renamed, this test will fail and surface the gap immediately.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const CSS_PATH = resolve(__dirname, '../../styles/components/session/theme.css')

let cssSource: string

try {
  cssSource = readFileSync(CSS_PATH, 'utf-8')
} catch {
  cssSource = ''
}

const LIGHT_MODE_TOKENS = [
  '--color-surface',
  '--color-surface-subtle',
  '--color-border',
  '--color-text-primary',
  '--color-text-secondary',
  '--color-brand',
  '--color-success',
  '--color-success-surface',
  '--color-success-text',
  '--color-warn',
  '--color-warn-surface',
  '--color-warn-text',
  '--color-error',
  '--color-error-surface',
  '--color-error-text',
  '--color-info',
  '--color-info-surface',
  '--color-info-text',
  '--color-ws-connected',
  '--color-ws-reconnecting',
  '--color-ws-disconnected',
  '--duration-fast',
  '--duration-normal',
  '--duration-slow',
  '--ease-out',
  '--ease-in-out',
]

const DARK_MODE_TOKENS = [
  '--color-surface',
  '--color-surface-subtle',
  '--color-border',
  '--color-text-primary',
  '--color-text-secondary',
  '--color-brand',
  '--color-success-surface',
  '--color-success-text',
  '--color-warn-surface',
  '--color-warn-text',
  '--color-error-surface',
  '--color-error-text',
  '--color-info-surface',
  '--color-info-text',
]

const REQUIRED_KEYFRAMES = ['toast-slide-in', 'spinner-spin']

describe('theme.css — light mode token parity', () => {
  it('css file exists and is non-empty', () => {
    expect(cssSource.length).toBeGreaterThan(0)
  })

  for (const token of LIGHT_MODE_TOKENS) {
    it(`defines ${token}`, () => {
      expect(cssSource).toContain(token)
    })
  }
})

describe('theme.css — dark mode token parity', () => {
  it('includes a prefers-color-scheme: dark media query', () => {
    expect(cssSource).toContain('prefers-color-scheme: dark')
  })

  for (const token of DARK_MODE_TOKENS) {
    it(`redefines ${token} in dark mode`, () => {
      // The token must appear at least twice — once in :root, once in dark media block.
      const occurrences = (cssSource.match(new RegExp(token.replace('--', '--'), 'g')) ?? []).length
      expect(occurrences).toBeGreaterThanOrEqual(2)
    })
  }
})

describe('theme.css — keyframe definitions', () => {
  for (const name of REQUIRED_KEYFRAMES) {
    it(`defines @keyframes ${name}`, () => {
      expect(cssSource).toContain(`@keyframes ${name}`)
    })
  }
})

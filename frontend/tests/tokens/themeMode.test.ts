import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initFrontendThemeMode } from '../../src/tokens/themeMode'

type ChangeListener = () => void

describe('themeMode', () => {
  const originalMatchMedia = window.matchMedia
  const originalLocalStorage = window.localStorage
  let storage: Record<string, string>

  beforeEach(() => {
    storage = {}
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage[key] ?? null,
        setItem: (key: string, value: string) => {
          storage[key] = value
        },
        removeItem: (key: string) => {
          delete storage[key]
        },
        clear: () => {
          storage = {}
        },
      },
    })
    document.documentElement.className = ''
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    })
    vi.restoreAllMocks()
  })

  function installMatchMedia(matchesDark: boolean) {
    let listener: ChangeListener | null = null
    const addEventListener = vi.fn((event: string, cb: ChangeListener) => {
      void event
      listener = cb
    })
    const removeEventListener = vi.fn((event: string, cb: ChangeListener) => {
      void event
      void cb
    })

    window.matchMedia = vi.fn().mockReturnValue({
      matches: matchesDark,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener,
      removeEventListener,
      dispatchEvent: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }) as any

    return {
      fireChange: () => listener?.(),
      addEventListener,
      removeEventListener,
    }
  }

  it('applies system light mode when no stored value', () => {
    installMatchMedia(false)
    const cleanup = initFrontendThemeMode()
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    cleanup()
  })

  it('applies system dark mode when no stored value', () => {
    installMatchMedia(true)
    const cleanup = initFrontendThemeMode()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
    cleanup()
  })

  it('prefers stored theme over system theme', () => {
    window.localStorage.setItem('vtt-theme-mode', 'light')
    installMatchMedia(true)
    const cleanup = initFrontendThemeMode()
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    cleanup()
  })

  it('updates on media query change when no stored preference', () => {
    const media = installMatchMedia(false)
    const cleanup = initFrontendThemeMode()
    expect(document.documentElement.classList.contains('light')).toBe(true)

    // Flip mocked matcher to dark and trigger change callback
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: media.addEventListener,
      removeEventListener: media.removeEventListener,
      dispatchEvent: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }) as any

    media.fireChange()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    cleanup()
  })

  it('does not update on media query change when stored preference exists', () => {
    window.localStorage.setItem('vtt-theme-mode', 'light')
    const media = installMatchMedia(true)
    const cleanup = initFrontendThemeMode()
    expect(document.documentElement.classList.contains('light')).toBe(true)

    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: media.addEventListener,
      removeEventListener: media.removeEventListener,
      dispatchEvent: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }) as any

    media.fireChange()
    expect(document.documentElement.classList.contains('light')).toBe(true)
    cleanup()
  })

  it('returns cleanup that unsubscribes listener', () => {
    const media = installMatchMedia(false)
    const cleanup = initFrontendThemeMode()
    expect(media.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    cleanup()
    expect(media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })
})

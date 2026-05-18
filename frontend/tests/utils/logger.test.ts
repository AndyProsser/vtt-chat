import { beforeEach, describe, expect, it, vi } from 'vitest'
import { logger } from '../../src/utils/logger'

describe('logger controls', () => {
  beforeEach(() => {
    logger.resetForTests()
    logger.clearPersistedLevel()
    delete window.__VTT_LOG_LEVEL__
    vi.restoreAllMocks()
  })

  it('supports explicit setLevel/getLevel', () => {
    logger.setLevel('WARN')
    expect(logger.getLevel()).toBe('WARN')

    logger.setLevel('DEBUG')
    expect(logger.getLevel()).toBe('DEBUG')
  })

  it('respects precedence: runtime override > localStorage > env/fallback', () => {
    logger.setLevel('INFO')
    expect(logger.getLevel()).toBe('INFO')

    delete window.__VTT_LOG_LEVEL__
    const storage = {
      getItem: vi.fn().mockReturnValue('WARN'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }
    vi.stubGlobal('localStorage', storage)
    expect(logger.getLevel()).toBe('WARN')

    window.__VTT_LOG_LEVEL__ = 'ERROR'
    expect(logger.getLevel()).toBe('ERROR')

    vi.unstubAllGlobals()
  })

  it('mutes all console output when console is disabled', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    logger.setLevel('DEBUG')
    logger.enableConsole(false)

    logger.info('test', 'info')
    logger.warn('test', 'warn')
    logger.error('test', 'error')
    logger.debug('test', 'debug')

    expect(logSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    expect(debugSpy).not.toHaveBeenCalled()
  })

  it('applies level threshold deterministically', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    logger.enableConsole(true)
    logger.setLevel('WARN')

    logger.debug('test', 'debug')
    logger.info('test', 'info')
    logger.warn('test', 'warn')
    logger.error('test', 'error')

    expect(debugSpy).not.toHaveBeenCalled()
    expect(logSpy).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('ignores invalid runtime and storage overrides and falls back safely', () => {
    window.__VTT_LOG_LEVEL__ = 'LOUD'
    const storage = {
      getItem: vi.fn().mockReturnValue('NOPE'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }
    vi.stubGlobal('localStorage', storage)

    expect(logger.getLevel()).toBe('INFO')

    vi.unstubAllGlobals()
  })

  it('persists setLevel to localStorage when available', () => {
    const storage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }
    vi.stubGlobal('localStorage', storage)

    logger.setLevel('ERROR')

    expect(window.__VTT_LOG_LEVEL__).toBe('ERROR')
    expect(storage.setItem).toHaveBeenCalledWith('vtt.log.level', 'ERROR')

    vi.unstubAllGlobals()
  })

  it('tolerates storage write failures in setLevel', () => {
    const storage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(() => {
        throw new Error('blocked')
      }),
      removeItem: vi.fn(),
    }
    vi.stubGlobal('localStorage', storage)

    expect(() => logger.setLevel('WARN')).not.toThrow()
    expect(window.__VTT_LOG_LEVEL__).toBe('WARN')

    vi.unstubAllGlobals()
  })

  it('clearPersistedLevel removes runtime and storage overrides', () => {
    const storage = {
      getItem: vi.fn().mockReturnValue('DEBUG'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }
    vi.stubGlobal('localStorage', storage)
    window.__VTT_LOG_LEVEL__ = 'DEBUG'

    logger.clearPersistedLevel()

    expect(window.__VTT_LOG_LEVEL__).toBeUndefined()
    expect(storage.removeItem).toHaveBeenCalledWith('vtt.log.level')

    vi.unstubAllGlobals()
  })

  it('tolerates storage removal failures in clearPersistedLevel', () => {
    const storage = {
      getItem: vi.fn().mockReturnValue('DEBUG'),
      setItem: vi.fn(),
      removeItem: vi.fn(() => {
        throw new Error('blocked')
      }),
    }
    vi.stubGlobal('localStorage', storage)
    window.__VTT_LOG_LEVEL__ = 'DEBUG'

    expect(() => logger.clearPersistedLevel()).not.toThrow()
    expect(window.__VTT_LOG_LEVEL__).toBeUndefined()

    vi.unstubAllGlobals()
  })

  it('tracks console enabled state explicitly', () => {
    logger.enableConsole(false)
    expect(logger.isConsoleEnabled()).toBe(false)

    logger.enableConsole(true)
    expect(logger.isConsoleEnabled()).toBe(true)
  })

  it('resetForTests restores defaults', () => {
    logger.enableConsole(false)
    logger.setLevel('ERROR')

    logger.resetForTests()

    expect(logger.isConsoleEnabled()).toBe(true)
    expect(logger.getLevel()).toBe('INFO')
  })
})

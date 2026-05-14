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
})

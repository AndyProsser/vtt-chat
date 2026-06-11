import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function loadLoggerForLevel(level?: string) {
  vi.resetModules()

  if (level === undefined) {
    delete process.env.LOG_LEVEL
  } else {
    process.env.LOG_LEVEL = level
  }

  return import('@/infra/logging/logger')
}

describe('logger', () => {
  const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
  const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  beforeEach(() => {
    debugSpy.mockClear()
    infoSpy.mockClear()
    warnSpy.mockClear()
    errorSpy.mockClear()
    delete process.env.LOG_LEVEL
  })

  afterEach(() => {
    delete process.env.LOG_LEVEL
  })

  it('logs info and warn by default but suppresses debug', async () => {
    const { logger } = await loadLoggerForLevel()

    logger.debug('debug hidden')
    logger.info('info visible', { ok: true })
    logger.warn('warn visible')

    expect(debugSpy).not.toHaveBeenCalled()
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('[INFO] info visible'))
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('"ok": true'))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[WARN] warn visible'))
  })

  it('logs debug when LOG_LEVEL is debug', async () => {
    const { logger } = await loadLoggerForLevel('debug')

    logger.debug('debug visible', { traceId: 'abc' })

    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('[DEBUG] debug visible'))
    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('"traceId": "abc"'))
  })

  it('suppresses info and warn when LOG_LEVEL is error', async () => {
    const { logger } = await loadLoggerForLevel('error')

    logger.info('info hidden')
    logger.warn('warn hidden')

    expect(infoSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('always logs errors regardless of configured level', async () => {
    const { logger } = await loadLoggerForLevel('error')

    logger.error('error visible', { fatal: true })

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[ERROR] error visible'))
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('"fatal": true'))
  })
})

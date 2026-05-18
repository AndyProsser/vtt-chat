import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logger } from '../../src/utils/logger'
import {
  bumpLoopCounter,
  isLoopDiagnosticsEnabled,
  resetLoopDiagnostics,
} from '../../src/utils/loopDiagnostics'

describe('loopDiagnostics', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetLoopDiagnostics()
    delete window.__VTT_DEBUG_WS_LOOP__
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    resetLoopDiagnostics()
    delete window.__VTT_DEBUG_WS_LOOP__
    vi.unstubAllEnvs()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('is disabled by default', () => {
    expect(isLoopDiagnosticsEnabled()).toBe(false)
  })

  it('enables diagnostics via runtime window flag', () => {
    window.__VTT_DEBUG_WS_LOOP__ = true
    expect(isLoopDiagnosticsEnabled()).toBe(true)
  })

  it('enables diagnostics via env flag', () => {
    vi.stubEnv('VITE_DEBUG_WS_LOOP', '1')
    expect(isLoopDiagnosticsEnabled()).toBe(true)
  })

  it('does not schedule a reporter when diagnostics are disabled', () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval')

    bumpLoopCounter('ws.incoming.raw')

    expect(setIntervalSpy).not.toHaveBeenCalled()
  })

  it('schedules the reporter only once across multiple bumps', () => {
    window.__VTT_DEBUG_WS_LOOP__ = true
    const setIntervalSpy = vi.spyOn(window, 'setInterval')

    bumpLoopCounter('ws.incoming.raw')
    bumpLoopCounter('ws.incoming.raw')
    bumpLoopCounter('ws.outgoing.raw')

    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
  })

  it('logs an info report when counters advanced during the interval', () => {
    window.__VTT_DEBUG_WS_LOOP__ = true
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {})
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})

    bumpLoopCounter('alpha', 2)
    bumpLoopCounter('beta', 1)
    vi.advanceTimersByTime(5000)

    expect(infoSpy).toHaveBeenCalledTimes(1)
    expect(infoSpy).toHaveBeenCalledWith('loop.diag', '5s counter window', {
      totalDelta: 3,
      uniqueCounters: 2,
      top: ['alpha=2', 'beta=1'],
    })
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('does not log when there is no delta in the current window', () => {
    window.__VTT_DEBUG_WS_LOOP__ = true
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {})

    bumpLoopCounter('alpha', 2)
    vi.advanceTimersByTime(5000)
    expect(infoSpy).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(5000)
    expect(infoSpy).toHaveBeenCalledTimes(1)
  })

  it('warns when one counter dominates the interval', () => {
    window.__VTT_DEBUG_WS_LOOP__ = true
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {})
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})

    bumpLoopCounter('dominant', 120)
    bumpLoopCounter('other', 20)
    vi.advanceTimersByTime(5000)

    expect(infoSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith('loop.diag', 'Possible tight loop signature detected', {
      dominantCounter: 'dominant',
      dominantDelta: 120,
      totalDelta: 140,
    })
  })

  it('tracks deltas relative to the previous report window', () => {
    window.__VTT_DEBUG_WS_LOOP__ = true
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {})

    bumpLoopCounter('alpha', 2)
    vi.advanceTimersByTime(5000)

    bumpLoopCounter('alpha', 3)
    vi.advanceTimersByTime(5000)

    expect(infoSpy).toHaveBeenNthCalledWith(2, 'loop.diag', '5s counter window', {
      totalDelta: 3,
      uniqueCounters: 1,
      top: ['alpha=3'],
    })
  })

  it('reset clears counters and cancels the reporter', () => {
    window.__VTT_DEBUG_WS_LOOP__ = true
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval')
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {})

    bumpLoopCounter('alpha', 5)
    resetLoopDiagnostics()
    vi.advanceTimersByTime(5000)

    expect(clearIntervalSpy).toHaveBeenCalledTimes(1)
    expect(infoSpy).not.toHaveBeenCalled()
  })
})

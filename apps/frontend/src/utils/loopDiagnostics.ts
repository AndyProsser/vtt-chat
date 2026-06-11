import { logger } from './logger'

declare global {
  interface Window {
    __VTT_DEBUG_WS_LOOP__?: boolean
  }
}

type CounterSnapshot = Record<string, number>

const REPORT_INTERVAL_MS = 5000

let counters: Record<string, number> = {}
let previous: CounterSnapshot = {}
let reporterId: number | null = null

export function isLoopDiagnosticsEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const runtimeEnabled = window.__VTT_DEBUG_WS_LOOP__ === true
  const envEnabled = import.meta.env.VITE_DEBUG_WS_LOOP === '1'

  return runtimeEnabled || envEnabled
}

export function bumpLoopCounter(counterName: string, amount = 1): void {
  if (!isLoopDiagnosticsEnabled()) {
    return
  }

  counters[counterName] = (counters[counterName] || 0) + amount
  ensureReporter()
}

function ensureReporter(): void {
  if (typeof window === 'undefined' || reporterId !== null) {
    return
  }

  reporterId = window.setInterval(() => {
    emitLoopDiagnosticsReport()
  }, REPORT_INTERVAL_MS)
}

function emitLoopDiagnosticsReport(): void {
  const deltas: Array<[name: string, count: number]> = []
  let totalDelta = 0

  for (const [name, currentCount] of Object.entries(counters)) {
    const previousCount = previous[name] || 0
    const delta = currentCount - previousCount

    if (delta > 0) {
      deltas.push([name, delta])
      totalDelta += delta
    }
  }

  previous = { ...counters }

  if (totalDelta === 0) {
    return
  }

  deltas.sort((a, b) => b[1] - a[1])
  const top = deltas.slice(0, 12).map(([name, count]) => `${name}=${count}`)

  logger.info('loop.diag', '5s counter window', {
    totalDelta,
    uniqueCounters: deltas.length,
    top,
  })

  const hottest = deltas[0]
  if (hottest && hottest[1] >= 100 && hottest[1] / totalDelta >= 0.6) {
    logger.warn('loop.diag', 'Possible tight loop signature detected', {
      dominantCounter: hottest[0],
      dominantDelta: hottest[1],
      totalDelta,
    })
  }
}

export function resetLoopDiagnostics(): void {
  counters = {}
  previous = {}

  if (typeof window !== 'undefined' && reporterId !== null) {
    window.clearInterval(reporterId)
  }

  reporterId = null
}

import { useEffect, useRef } from 'react'
import {
  WORKSPACES_MEMORY_PRESSURE_RELOAD_STORAGE_KEY,
  WORKSPACES_MEMORY_PRESSURE_TOAST_ID,
} from '@/constants/workspaces.constants'
import {
  formatMemoryPressureReloadSeconds,
  getRandomMemoryPressureHumorMessage,
  getWorkspacesMemoryPressureGuardConfig,
} from '@/constants/workspacesMemoryPressure.constants'
import { dismissToast, type ShowToastInput } from '@/state/toastCenter'
import { telemetryClient } from '@/utils/telemetry'
import { logger } from '@/utils/logger'

type UseWorkspacesMemoryPressureGuardParams = {
  enabled: boolean
  showToast: (input: ShowToastInput) => void
}

type BrowserMemoryReading = {
  bytes: number
  source: 'measureUserAgentSpecificMemory' | 'performance.memory' | 'simulated'
  simulated: boolean
}

type PerformanceWithMemory = Performance & {
  memory?: {
    usedJSHeapSize?: number
  }
  measureUserAgentSpecificMemory?: () => Promise<{ bytes?: number }>
}

/**
 * Watches for sustained browser memory pressure and performs a guarded refresh before the tab crashes.
 * Runs at the workspace shell so server rehydration can restore the UI after a short reload.
 */
export function useWorkspacesMemoryPressureGuard({
  enabled,
  showToast,
}: UseWorkspacesMemoryPressureGuardParams): void {
  const reloadTimerRef = useRef<number | null>(null)
  const isToastVisibleRef = useRef(false)
  const isReloadingRef = useRef(false)
  const latestHighReadingRef = useRef<BrowserMemoryReading | null>(null)
  const latestHumorIndexRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) {
      return
    }

    let cancelled = false
    const config = getWorkspacesMemoryPressureGuardConfig()
    const reloadGraceSeconds = formatMemoryPressureReloadSeconds(config.reloadGraceMs)

    const clearReloadTimer = () => {
      if (reloadTimerRef.current !== null) {
        window.clearTimeout(reloadTimerRef.current)
        reloadTimerRef.current = null
      }
    }

    const dismissMemoryToast = () => {
      if (!isToastVisibleRef.current) {
        return
      }

      isToastVisibleRef.current = false
      dismissToast(WORKSPACES_MEMORY_PRESSURE_TOAST_ID)
    }

    const readLastReloadAt = (): number | null => {
      try {
        const raw = window.sessionStorage.getItem(WORKSPACES_MEMORY_PRESSURE_RELOAD_STORAGE_KEY)
        if (!raw) {
          return null
        }

        const parsed = Number(raw)
        return Number.isFinite(parsed) ? parsed : null
      } catch {
        return null
      }
    }

    const canAutoReload = (): boolean => {
      const lastReloadAt = readLastReloadAt()
      if (lastReloadAt === null) {
        return true
      }

      return Date.now() - lastReloadAt >= config.reloadCooldownMs
    }

    const markReloadNow = () => {
      try {
        window.sessionStorage.setItem(
          WORKSPACES_MEMORY_PRESSURE_RELOAD_STORAGE_KEY,
          String(Date.now())
        )
      } catch {
        // Ignore storage failures in locked-down/private contexts.
      }
    }

    const refreshPage = (reason: 'auto' | 'manual') => {
      if (isReloadingRef.current) {
        return
      }

      const latestReading = latestHighReadingRef.current
      isReloadingRef.current = true
      clearReloadTimer()
      dismissMemoryToast()
      markReloadNow()
      telemetryClient.track('UI_MEMORY_PRESSURE_REFRESH_TRIGGERED', {
        reason,
        bytes: latestReading?.bytes,
        thresholdBytes: config.thresholdBytes,
        source: latestReading?.source,
        simulated: latestReading?.simulated ?? false,
        reloadGraceMs: config.reloadGraceMs,
        reloadCooldownMs: config.reloadCooldownMs,
        humorIndex: latestHumorIndexRef.current,
      })
      logger.warn(
        'workspaces.memory-pressure',
        'Refreshing page due to sustained memory pressure',
        {
          reason,
          bytes: latestReading?.bytes,
          source: latestReading?.source,
          simulated: latestReading?.simulated ?? false,
        }
      )
      window.location.reload()
    }

    const showMemoryToast = (reading: BrowserMemoryReading) => {
      if (isToastVisibleRef.current) {
        return
      }

      const usageGb = (reading.bytes / 1_000_000_000).toFixed(2)
      const autoReloadAllowed = canAutoReload()
      const humor = getRandomMemoryPressureHumorMessage()
      latestHighReadingRef.current = reading
      latestHumorIndexRef.current = humor.index
      const message = autoReloadAllowed
        ? `${humor.text} This tab is using about ${usageGb} GB of memory. VTT-Chat will refresh in ${reloadGraceSeconds} seconds to avoid a browser crash and then rehydrate the session.`
        : `${humor.text} This tab is using about ${usageGb} GB of memory. Refresh now to avoid a browser crash. Automatic refresh is cooling down from a recent recovery.`

      isToastVisibleRef.current = true
      showToast({
        id: WORKSPACES_MEMORY_PRESSURE_TOAST_ID,
        variant: 'error',
        message,
        actionLabel: 'Refresh now',
        onAction: () => {
          refreshPage('manual')
        },
        durationMs: null,
      })

      telemetryClient.track('UI_MEMORY_PRESSURE_WARNING_SHOWN', {
        bytes: reading.bytes,
        thresholdBytes: config.thresholdBytes,
        source: reading.source,
        simulated: reading.simulated,
        autoReloadAllowed,
        reloadGraceMs: config.reloadGraceMs,
        pollMs: config.pollMs,
        humorIndex: humor.index,
      })

      logger.warn('workspaces.memory-pressure', 'Detected high browser memory usage', {
        bytes: reading.bytes,
        source: reading.source,
        simulated: reading.simulated,
        autoReloadAllowed,
        reloadGraceMs: config.reloadGraceMs,
      })
    }

    const readBrowserMemory = async (): Promise<BrowserMemoryReading | null> => {
      if (config.simulationMode !== 'off') {
        return {
          bytes: config.thresholdBytes + 64_000_000,
          source: 'simulated',
          simulated: true,
        }
      }

      const performanceApi = window.performance as PerformanceWithMemory

      if (typeof performanceApi.measureUserAgentSpecificMemory === 'function') {
        try {
          const result = await performanceApi.measureUserAgentSpecificMemory()
          if (Number.isFinite(result.bytes)) {
            return {
              bytes: result.bytes as number,
              source: 'measureUserAgentSpecificMemory',
              simulated: false,
            }
          }
        } catch (error) {
          logger.debug(
            'workspaces.memory-pressure',
            'measureUserAgentSpecificMemory unavailable; falling back if possible',
            error
          )
        }
      }

      const heapBytes = performanceApi.memory?.usedJSHeapSize
      if (Number.isFinite(heapBytes)) {
        return {
          bytes: heapBytes as number,
          source: 'performance.memory',
          simulated: false,
        }
      }

      return null
    }

    const scheduleReloadCheck = () => {
      if (
        reloadTimerRef.current !== null ||
        (!canAutoReload() && config.simulationMode !== 'reload')
      ) {
        return
      }

      reloadTimerRef.current = window.setTimeout(() => {
        reloadTimerRef.current = null

        void (async () => {
          const reading = await readBrowserMemory()
          if (cancelled || !reading) {
            return
          }

          if (reading.bytes >= config.thresholdBytes) {
            refreshPage('auto')
            return
          }

          latestHighReadingRef.current = null
          latestHumorIndexRef.current = null
          dismissMemoryToast()
        })()
      }, config.reloadGraceMs)
    }

    const checkMemoryPressure = async () => {
      const reading = await readBrowserMemory()
      if (cancelled || !reading || isReloadingRef.current) {
        return
      }

      if (reading.bytes >= config.thresholdBytes) {
        latestHighReadingRef.current = reading
        showMemoryToast(reading)
        scheduleReloadCheck()
        return
      }

      latestHighReadingRef.current = null
      latestHumorIndexRef.current = null
      clearReloadTimer()
      dismissMemoryToast()
    }

    void checkMemoryPressure()
    const intervalId = window.setInterval(() => {
      void checkMemoryPressure()
    }, config.pollMs)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      clearReloadTimer()
      dismissMemoryToast()
    }
  }, [enabled, showToast])
}

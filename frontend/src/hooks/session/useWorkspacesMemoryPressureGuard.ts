import { useEffect, useRef } from 'react'
import {
  WORKSPACES_MEMORY_PRESSURE_POLL_MS,
  WORKSPACES_MEMORY_PRESSURE_RELOAD_COOLDOWN_MS,
  WORKSPACES_MEMORY_PRESSURE_RELOAD_GRACE_MS,
  WORKSPACES_MEMORY_PRESSURE_RELOAD_STORAGE_KEY,
  WORKSPACES_MEMORY_PRESSURE_THRESHOLD_BYTES,
  WORKSPACES_MEMORY_PRESSURE_TOAST_ID,
} from '@/constants/workspaces.constants'
import { dismissToast, type ShowToastInput } from '@/state/toastCenter'
import { logger } from '@/utils/logger'

type UseWorkspacesMemoryPressureGuardParams = {
  enabled: boolean
  showToast: (input: ShowToastInput) => void
}

type BrowserMemoryReading = {
  bytes: number
  source: 'measureUserAgentSpecificMemory' | 'performance.memory'
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

  useEffect(() => {
    if (!enabled) {
      return
    }

    let cancelled = false

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

      return Date.now() - lastReloadAt >= WORKSPACES_MEMORY_PRESSURE_RELOAD_COOLDOWN_MS
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

      isReloadingRef.current = true
      clearReloadTimer()
      dismissMemoryToast()
      markReloadNow()
      logger.warn(
        'workspaces.memory-pressure',
        'Refreshing page due to sustained memory pressure',
        {
          reason,
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
      const message = autoReloadAllowed
        ? `This tab is using about ${usageGb} GB of memory. VTT-Chat will refresh in 15 seconds to avoid a browser crash and then rehydrate the session.`
        : `This tab is using about ${usageGb} GB of memory. Refresh now to avoid a browser crash. Automatic refresh is cooling down from a recent recovery.`

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

      logger.warn('workspaces.memory-pressure', 'Detected high browser memory usage', {
        bytes: reading.bytes,
        source: reading.source,
        autoReloadAllowed,
      })
    }

    const readBrowserMemory = async (): Promise<BrowserMemoryReading | null> => {
      const performanceApi = window.performance as PerformanceWithMemory

      if (typeof performanceApi.measureUserAgentSpecificMemory === 'function') {
        try {
          const result = await performanceApi.measureUserAgentSpecificMemory()
          if (Number.isFinite(result.bytes)) {
            return {
              bytes: result.bytes as number,
              source: 'measureUserAgentSpecificMemory',
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
        }
      }

      return null
    }

    const scheduleReloadCheck = () => {
      if (reloadTimerRef.current !== null || !canAutoReload()) {
        return
      }

      reloadTimerRef.current = window.setTimeout(() => {
        reloadTimerRef.current = null

        void (async () => {
          const reading = await readBrowserMemory()
          if (cancelled || !reading) {
            return
          }

          if (reading.bytes >= WORKSPACES_MEMORY_PRESSURE_THRESHOLD_BYTES) {
            refreshPage('auto')
            return
          }

          dismissMemoryToast()
        })()
      }, WORKSPACES_MEMORY_PRESSURE_RELOAD_GRACE_MS)
    }

    const checkMemoryPressure = async () => {
      const reading = await readBrowserMemory()
      if (cancelled || !reading || isReloadingRef.current) {
        return
      }

      if (reading.bytes >= WORKSPACES_MEMORY_PRESSURE_THRESHOLD_BYTES) {
        showMemoryToast(reading)
        scheduleReloadCheck()
        return
      }

      clearReloadTimer()
      dismissMemoryToast()
    }

    void checkMemoryPressure()
    const intervalId = window.setInterval(() => {
      void checkMemoryPressure()
    }, WORKSPACES_MEMORY_PRESSURE_POLL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      clearReloadTimer()
      dismissMemoryToast()
    }
  }, [enabled, showToast])
}

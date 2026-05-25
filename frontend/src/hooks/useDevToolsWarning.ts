/**
 * useDevToolsWarning
 * Detects when browser DevTools are opened by measuring the difference between
 * the outer and inner window dimensions (docked DevTools reduce inner size).
 *
 * When detected during an active session, shows a persistent toast warning that
 * DevTools can cause elevated memory usage with the mock simulation running.
 *
 * Detection fires at most once per mount — re-dismissed state is not persisted,
 * so the warning returns on page reload if DevTools remain open.
 */

import { useEffect, useRef } from 'react'
import { showToast } from '@/state/toastCenter'

const DEVTOOLS_DIMENSION_THRESHOLD_PX = 160
const POLL_INTERVAL_MS = 3000
const DEVTOOLS_TOAST_ID = 'devtools-open-warning'

function isDevToolsOpen(): boolean {
  const heightDiff = window.outerHeight - window.innerHeight
  const widthDiff = window.outerWidth - window.innerWidth
  return heightDiff > DEVTOOLS_DIMENSION_THRESHOLD_PX || widthDiff > DEVTOOLS_DIMENSION_THRESHOLD_PX
}

/**
 * Polls for open DevTools and shows a dismissible toast warning if detected.
 * Safe to call in any component; no-ops after the first toast is shown per mount.
 *
 * @param enabled - Set to false to skip detection (e.g. outside active sessions).
 */
export function useDevToolsWarning(enabled: boolean = true): void {
  const hasWarnedRef = useRef(false)

  useEffect(() => {
    if (!enabled) {
      return
    }

    function check(): void {
      if (!hasWarnedRef.current && isDevToolsOpen()) {
        hasWarnedRef.current = true
        showToast({
          id: DEVTOOLS_TOAST_ID,
          message:
            'DevTools are open. Leaving them open during active mock simulations can cause elevated memory usage. Close DevTools when not actively debugging.',
          variant: 'warn',
          durationMs: null, // persistent until dismissed
        })
      }
    }

    // Run once immediately in case DevTools were already open on mount.
    check()

    const intervalId = window.setInterval(check, POLL_INTERVAL_MS)
    return () => {
      window.clearInterval(intervalId)
    }
  }, [enabled])
}

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  APP_SPLASH_KICKERS,
  APP_SPLASH_LINES,
  APP_SPLASH_TITLES,
} from '@/constants/appMainRoute.constants'

interface AppSplashOverlayProps {
  active: boolean
  sessionSurfaceReady: boolean
  resetKey: string
}

function pickRandomIndex(length: number): number {
  if (length <= 1) {
    return 0
  }

  return Math.floor(Math.random() * length)
}

const LINE_SWAP_INTERVAL_MS = 2500
const LINE_SWAP_FADE_MS = 220
const OVERLAY_FADE_OUT_MS = 1000

function SplashCycle({
  sessionSurfaceReady,
  onFadeComplete,
}: {
  sessionSurfaceReady: boolean
  onFadeComplete: () => void
}) {
  const lineSwapTimeoutRef = useRef<number | null>(null)

  const [splashLineIndex, setSplashLineIndex] = useState(() =>
    pickRandomIndex(APP_SPLASH_LINES.length)
  )
  const [splashKickerIndex] = useState(() => pickRandomIndex(APP_SPLASH_KICKERS.length))
  const [splashTitleIndex] = useState(() => pickRandomIndex(APP_SPLASH_TITLES.length))
  const [isSplashLineVisible, setIsSplashLineVisible] = useState(true)

  useEffect(() => {
    if (sessionSurfaceReady) {
      return
    }

    const cycleIntervalId = window.setInterval(() => {
      if (lineSwapTimeoutRef.current !== null) {
        window.clearTimeout(lineSwapTimeoutRef.current)
      }

      setIsSplashLineVisible(false)

      lineSwapTimeoutRef.current = window.setTimeout(() => {
        setSplashLineIndex((previous) => {
          if (APP_SPLASH_LINES.length <= 1) {
            return previous
          }

          let next = pickRandomIndex(APP_SPLASH_LINES.length)
          if (next === previous) {
            next = (previous + 1) % APP_SPLASH_LINES.length
          }

          return next
        })

        setIsSplashLineVisible(true)
        lineSwapTimeoutRef.current = null
      }, LINE_SWAP_FADE_MS)
    }, LINE_SWAP_INTERVAL_MS)

    return () => {
      if (lineSwapTimeoutRef.current !== null) {
        window.clearTimeout(lineSwapTimeoutRef.current)
      }

      window.clearInterval(cycleIntervalId)
    }
  }, [sessionSurfaceReady])

  useEffect(() => {
    if (!sessionSurfaceReady) {
      return
    }

    const fadeTimeoutId = window.setTimeout(onFadeComplete, OVERLAY_FADE_OUT_MS)

    return () => {
      window.clearTimeout(fadeTimeoutId)
    }
  }, [sessionSurfaceReady, onFadeComplete])

  const splashLine = APP_SPLASH_LINES[splashLineIndex] || APP_SPLASH_LINES[0] || ''
  const splashKicker = APP_SPLASH_KICKERS[splashKickerIndex] || APP_SPLASH_KICKERS[0] || ''
  const splashTitle = APP_SPLASH_TITLES[splashTitleIndex] || APP_SPLASH_TITLES[0] || ''

  return (
    <div
      className={`app-splash-overlay ${sessionSurfaceReady ? 'is-fading-out' : 'is-visible'}`}
      aria-live="polite"
      aria-busy="true"
    >
      <div className="app-splash-card">
        <img
          src="/branding/app-logo.png"
          alt="VTT Chat dragon emblem"
          className="app-splash-logo"
          loading="eager"
          decoding="async"
        />
        <p className="app-splash-kicker">{splashKicker}</p>
        <h3 className="app-splash-title">{splashTitle}</h3>
        <p
          className={`app-splash-line splash-line ${isSplashLineVisible ? 'is-visible' : 'is-hidden'}`}
        >
          {splashLine}
        </p>
      </div>
    </div>
  )
}

export function AppSplashOverlay({ active, sessionSurfaceReady, resetKey }: AppSplashOverlayProps) {
  const cycleKey = `${resetKey}:${active ? '1' : '0'}`
  const [dismissedCycleKey, setDismissedCycleKey] = useState<string | null>(null)

  const isDismissed = dismissedCycleKey === cycleKey
  if (!active || isDismissed) {
    return null
  }

  return createPortal(
    <SplashCycle
      key={cycleKey}
      sessionSurfaceReady={sessionSurfaceReady}
      onFadeComplete={() => setDismissedCycleKey(cycleKey)}
    />,
    document.body
  )
}

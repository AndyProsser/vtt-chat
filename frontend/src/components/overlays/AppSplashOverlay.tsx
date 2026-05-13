import { useEffect, useMemo, useRef, useState } from 'react'
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

export function AppSplashOverlay({ active, sessionSurfaceReady, resetKey }: AppSplashOverlayProps) {
  const lineSwapTimeoutRef = useRef<number | null>(null)

  const [splashLineIndex, setSplashLineIndex] = useState(() =>
    pickRandomIndex(APP_SPLASH_LINES.length)
  )
  const [splashKickerIndex, setSplashKickerIndex] = useState(() =>
    pickRandomIndex(APP_SPLASH_KICKERS.length)
  )
  const [splashTitleIndex, setSplashTitleIndex] = useState(() =>
    pickRandomIndex(APP_SPLASH_TITLES.length)
  )
  const [isSplashLineVisible, setIsSplashLineVisible] = useState(true)
  const [isSplashMounted, setIsSplashMounted] = useState(false)
  const [isSplashFadingOut, setIsSplashFadingOut] = useState(false)

  useEffect(() => {
    if (!active) {
      setIsSplashMounted(false)
      setIsSplashFadingOut(false)
      setIsSplashLineVisible(true)
      return
    }

    setSplashLineIndex(pickRandomIndex(APP_SPLASH_LINES.length))
    setSplashKickerIndex(pickRandomIndex(APP_SPLASH_KICKERS.length))
    setSplashTitleIndex(pickRandomIndex(APP_SPLASH_TITLES.length))
    setIsSplashMounted(true)
    setIsSplashFadingOut(false)
    setIsSplashLineVisible(true)
  }, [active, resetKey])

  useEffect(() => {
    if (!active || !sessionSurfaceReady || !isSplashMounted || isSplashFadingOut) {
      return
    }

    setIsSplashFadingOut(true)
  }, [active, sessionSurfaceReady, isSplashMounted, isSplashFadingOut])

  useEffect(() => {
    if (!isSplashFadingOut || !isSplashMounted) {
      return
    }

    const fadeTimeoutId = window.setTimeout(() => {
      setIsSplashMounted(false)
    }, 1000)

    return () => {
      window.clearTimeout(fadeTimeoutId)
    }
  }, [isSplashFadingOut, isSplashMounted])

  useEffect(() => {
    if (!isSplashMounted) {
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
      }, 220)
    }, 2500)

    return () => {
      if (lineSwapTimeoutRef.current !== null) {
        window.clearTimeout(lineSwapTimeoutRef.current)
      }

      window.clearInterval(cycleIntervalId)
    }
  }, [isSplashMounted])

  const splashLine = APP_SPLASH_LINES[splashLineIndex] || APP_SPLASH_LINES[0] || ''
  const splashKicker = APP_SPLASH_KICKERS[splashKickerIndex] || APP_SPLASH_KICKERS[0] || ''
  const splashTitle = APP_SPLASH_TITLES[splashTitleIndex] || APP_SPLASH_TITLES[0] || ''

  if (!active || !isSplashMounted) {
    return null
  }

  return createPortal(
    <div
      className={`app-splash-overlay ${isSplashFadingOut ? 'is-fading-out' : 'is-visible'}`}
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
    </div>,
    document.body
  )
}

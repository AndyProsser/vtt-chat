import { useCallback, useState } from 'react'
import { FRONTEND_THEME_CLASSES, type FrontendThemeMode } from '@/tokens'
import { safeLocalStorageSetItem } from '@/utils/session/sessionInit'

/**
 * Manages frontend theme detection and toggling in one place.
 * Reads the current document class on first render and persists user overrides.
 */
export function useFrontendThemeMode() {
  const [themeMode, setThemeMode] = useState<FrontendThemeMode>(() => {
    if (typeof document === 'undefined') {
      return 'light'
    }

    return document.documentElement.classList.contains(FRONTEND_THEME_CLASSES.dark)
      ? 'dark'
      : 'light'
  })

  const toggleThemeMode = useCallback(() => {
    const nextTheme: FrontendThemeMode = themeMode === 'dark' ? 'light' : 'dark'
    document.documentElement.classList.remove(
      FRONTEND_THEME_CLASSES.light,
      FRONTEND_THEME_CLASSES.dark
    )
    document.documentElement.classList.add(FRONTEND_THEME_CLASSES[nextTheme])
    safeLocalStorageSetItem('vtt-theme-mode', nextTheme)
    setThemeMode(nextTheme)
  }, [themeMode])

  return {
    themeMode,
    toggleThemeMode,
  }
}

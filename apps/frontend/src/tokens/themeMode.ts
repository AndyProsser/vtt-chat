import { FRONTEND_THEME_CLASSES, type FrontendThemeMode } from './index'

const STORAGE_KEY = 'vtt-theme-mode'

function applyRootThemeClass(mode: FrontendThemeMode) {
  const root = document.documentElement
  root.classList.remove(FRONTEND_THEME_CLASSES.light, FRONTEND_THEME_CLASSES.dark)
  root.classList.add(FRONTEND_THEME_CLASSES[mode])
}

function getStoredThemeMode(): FrontendThemeMode | null {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === FRONTEND_THEME_CLASSES.light || stored === FRONTEND_THEME_CLASSES.dark) {
    return stored
  }
  return null
}

function getSystemThemeMode(): FrontendThemeMode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function initFrontendThemeMode(): () => void {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

  const applyEffectiveMode = () => {
    const stored = getStoredThemeMode()
    applyRootThemeClass(stored ?? getSystemThemeMode())
  }

  applyEffectiveMode()

  const onChange = () => {
    if (getStoredThemeMode()) {
      return
    }
    applyEffectiveMode()
  }

  mediaQuery.addEventListener('change', onChange)

  return () => {
    mediaQuery.removeEventListener('change', onChange)
  }
}

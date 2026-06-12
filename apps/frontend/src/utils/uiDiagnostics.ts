declare global {
  interface Window {
    __VTT_DEBUG_UI__?: boolean
  }
}

const STORAGE_KEY = 'vtt-debug-ui'
const QUERY_PARAM = 'debugUi'

function parseBooleanFlag(rawValue: string | null): boolean | undefined {
  if (!rawValue) {
    return undefined
  }

  const normalized = rawValue.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes') {
    return true
  }

  if (normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no') {
    return false
  }

  return undefined
}

function readStoredFlag(): boolean | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  try {
    return parseBooleanFlag(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return undefined
  }
}

function clearStoredFlag(): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore storage write failures in private/incognito contexts.
  }
}

function persistFlag(enabled: boolean): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    // Ignore storage write failures in private/incognito contexts.
  }
}

function readQueryFlag(): boolean | 'toggle' | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  const params = new URLSearchParams(window.location.search)
  const raw = params.get(QUERY_PARAM)
  if (!raw) {
    return undefined
  }

  const normalized = raw.trim().toLowerCase()
  if (normalized === 'toggle') {
    return 'toggle'
  }

  return parseBooleanFlag(raw)
}

function applyRootClass(enabled: boolean): void {
  if (typeof document === 'undefined') {
    return
  }

  const root = document.documentElement
  root.classList.toggle('debug-ui', enabled)
  root.dataset.debugUi = enabled ? '1' : '0'
}

export function isUiDiagnosticsEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  if (typeof window.__VTT_DEBUG_UI__ === 'boolean') {
    return window.__VTT_DEBUG_UI__
  }

  return Boolean(import.meta.env.VITE_DEBUG_UI === '1')
}

export function setUiDiagnosticsEnabled(enabled: boolean): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  window.__VTT_DEBUG_UI__ = enabled
  clearStoredFlag()
  applyRootClass(enabled)
  return enabled
}

export function initUiDiagnosticsFlag(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const envEnabled = import.meta.env.VITE_DEBUG_UI === '1'
  const runtimeOverride = window.__VTT_DEBUG_UI__
  const queryFlag = readQueryFlag()

  const defaultValue = typeof runtimeOverride === 'boolean' ? runtimeOverride : envEnabled

  const resolvedEnabled =
    queryFlag === 'toggle'
      ? !defaultValue
      : typeof queryFlag === 'boolean'
        ? queryFlag
        : defaultValue

  window.__VTT_DEBUG_UI__ = resolvedEnabled
  clearStoredFlag()
  applyRootClass(resolvedEnabled)

  if (queryFlag === 'toggle') {
    const params = new URLSearchParams(window.location.search)
    params.delete(QUERY_PARAM)
    const query = params.toString()
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
    window.history.replaceState({}, '', nextUrl)
  }

  return resolvedEnabled
}

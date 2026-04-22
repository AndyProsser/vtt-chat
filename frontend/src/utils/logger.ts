/**
 * Frontend Logger Utility
 * Stage 9.3: explicit log-level controls with runtime/browser/env precedence.
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

declare global {
  interface Window {
    __VTT_LOG_LEVEL__?: LogLevel | string
  }
}

const LOG_LEVEL_KEY = 'vtt.log.level'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
}

function normalizeLevel(level?: string | null): LogLevel | null {
  if (!level) return null
  const value = level.trim().toUpperCase()
  if (value === 'DEBUG' || value === 'INFO' || value === 'WARN' || value === 'ERROR') {
    return value
  }
  return null
}

function getRuntimeLevelOverride(): LogLevel | null {
  if (typeof window === 'undefined') return null
  return normalizeLevel(window.__VTT_LOG_LEVEL__)
}

function getPersistedLevelOverride(): LogLevel | null {
  if (typeof window === 'undefined') return null
  try {
    return normalizeLevel(window.localStorage.getItem(LOG_LEVEL_KEY))
  } catch {
    return null
  }
}

function getEnvLevelDefault(): LogLevel | null {
  return normalizeLevel(import.meta.env.VITE_LOG_LEVEL)
}

function getSafeFallbackLevel(): LogLevel {
  return import.meta.env.DEV ? 'DEBUG' : 'INFO'
}

class Logger {
  private level: LogLevel
  private consoleEnabled = true

  constructor() {
    this.level = this.resolveLevel()
  }

  private resolveLevel(): LogLevel {
    return (
      getRuntimeLevelOverride() ||
      getPersistedLevelOverride() ||
      getEnvLevelDefault() ||
      getSafeFallbackLevel()
    )
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.consoleEnabled) return false
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.level]
  }

  private refreshLevelFromOverrides(): void {
    this.level = this.resolveLevel()
  }

  setLevel(level: LogLevel): void {
    this.level = level
    if (typeof window !== 'undefined') {
      window.__VTT_LOG_LEVEL__ = level
      try {
        window.localStorage.setItem(LOG_LEVEL_KEY, level)
      } catch {
        // Ignore storage failures in private/locked-down contexts.
      }
    }
  }

  getLevel(): LogLevel {
    this.refreshLevelFromOverrides()
    return this.level
  }

  enableConsole(enabled: boolean): void {
    this.consoleEnabled = enabled
  }

  isConsoleEnabled(): boolean {
    return this.consoleEnabled
  }

  clearPersistedLevel(): void {
    if (typeof window === 'undefined') return
    delete window.__VTT_LOG_LEVEL__
    try {
      window.localStorage.removeItem(LOG_LEVEL_KEY)
    } catch {
      // Ignore storage failures.
    }
  }

  resetForTests(): void {
    this.consoleEnabled = true
    this.level = getSafeFallbackLevel()
    if (typeof window !== 'undefined') {
      delete window.__VTT_LOG_LEVEL__
    }
  }

  info(context: string, message: string, data?: any) {
    this.refreshLevelFromOverrides()
    if (this.shouldLog('INFO')) {
      console.log(`[${context}] ${message}`, data)
    }
  }

  warn(context: string, message: string, data?: any) {
    this.refreshLevelFromOverrides()
    if (this.shouldLog('WARN')) {
      console.warn(`[${context}] ${message}`, data)
    }
  }

  error(context: string, message: string, data?: any) {
    this.refreshLevelFromOverrides()
    if (this.shouldLog('ERROR')) {
      console.error(`[${context}] ${message}`, data)
    }
  }

  debug(context: string, message: string, data?: any) {
    this.refreshLevelFromOverrides()
    if (this.shouldLog('DEBUG')) {
      console.debug(`[${context}] ${message}`, data)
    }
  }
}

export const logger = new Logger()

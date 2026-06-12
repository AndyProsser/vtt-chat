// Simple logger utility for VTT-Chat backend
// Supports log levels: debug, info, warn, error
// Extendable for file logging or external log aggregation

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const CURRENT_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info'

function format(level: LogLevel, message: string, meta?: unknown) {
  const ts = new Date().toISOString()
  let out = `[${ts}] [${level.toUpperCase()}] ${message}`
  if (meta) out += `\n${JSON.stringify(meta, null, 2)}`
  return out
}

export const logger = {
  debug(message: string, meta?: unknown) {
    if (LOG_LEVELS[CURRENT_LEVEL] <= LOG_LEVELS.debug) {
      console.debug(format('debug', message, meta))
    }
  },
  info(message: string, meta?: unknown) {
    if (LOG_LEVELS[CURRENT_LEVEL] <= LOG_LEVELS.info) {
      console.info(format('info', message, meta))
    }
  },
  warn(message: string, meta?: unknown) {
    if (LOG_LEVELS[CURRENT_LEVEL] <= LOG_LEVELS.warn) {
      console.warn(format('warn', message, meta))
    }
  },
  error(message: string, meta?: unknown) {
    // Always log errors
    console.error(format('error', message, meta))
  },
}

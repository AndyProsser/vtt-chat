// ============================================================================
// Logger Utility
// ============================================================================

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LOG_LEVEL_NAMES = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
}

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
}

class Logger {
  private minLevel: LogLevel

  constructor(minLevel: LogLevel = LogLevel.INFO) {
    this.minLevel = minLevel
  }

  private formatTimestamp(): string {
    const now = new Date()
    return now.toISOString()
  }

  private formatMessage(level: LogLevel, context: string, message: string, meta?: any): string {
    const timestamp = this.formatTimestamp()
    const levelName = LOG_LEVEL_NAMES[level]
    const levelColor = this.getLevelColor(level)

    let formatted = `${COLORS.gray}${timestamp}${COLORS.reset} ${levelColor}${levelName.padEnd(
      5
    )}${COLORS.reset} ${COLORS.bright}[${context}]${COLORS.reset} ${message}`

    if (meta) {
      formatted += ` ${COLORS.dim}${JSON.stringify(meta)}${COLORS.reset}`
    }

    return formatted
  }

  private getLevelColor(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return `${COLORS.gray}`
      case LogLevel.INFO:
        return `${COLORS.cyan}`
      case LogLevel.WARN:
        return `${COLORS.yellow}`
      case LogLevel.ERROR:
        return `${COLORS.red}`
    }
  }

  private log(level: LogLevel, context: string, message: string, meta?: any): void {
    if (level < this.minLevel) {
      return
    }

    const formatted = this.formatMessage(level, context, message, meta)

    if (level >= LogLevel.ERROR) {
      console.error(formatted)
    } else if (level === LogLevel.WARN) {
      console.warn(formatted)
    } else {
      console.log(formatted)
    }
  }

  debug(context: string, message: string, meta?: any): void {
    this.log(LogLevel.DEBUG, context, message, meta)
  }

  info(context: string, message: string, meta?: any): void {
    this.log(LogLevel.INFO, context, message, meta)
  }

  warn(context: string, message: string, meta?: any): void {
    this.log(LogLevel.WARN, context, message, meta)
  }

  error(context: string, message: string, error?: Error | any): void {
    const meta = error instanceof Error ? { message: error.message, stack: error.stack } : error
    this.log(LogLevel.ERROR, context, message, meta)
  }

  setMinLevel(level: LogLevel): void {
    this.minLevel = level
  }
}

const isDevelopment = process.env.NODE_ENV === 'development'
const minLevel = isDevelopment ? LogLevel.DEBUG : LogLevel.INFO

export const logger = new Logger(minLevel)

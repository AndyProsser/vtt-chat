type Level = 'info' | 'warn' | 'error' | 'debug'

function log(level: Level, domain: string, message: string, meta?: Record<string, unknown>): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    domain,
    message,
    ...(meta ?? {}),
  }
  const output = JSON.stringify(entry)
  if (level === 'error' || level === 'warn') {
    console.error(output)
  } else {
    console.log(output)
  }
}

export const logger = {
  info: (domain: string, message: string, meta?: Record<string, unknown>) =>
    log('info', domain, message, meta),
  warn: (domain: string, message: string, meta?: Record<string, unknown>) =>
    log('warn', domain, message, meta),
  error: (domain: string, message: string, meta?: Record<string, unknown>) =>
    log('error', domain, message, meta),
  debug: (domain: string, message: string, meta?: Record<string, unknown>) =>
    log('debug', domain, message, meta),
}

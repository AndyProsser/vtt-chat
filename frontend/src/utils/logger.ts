/**
 * Frontend Logger Utility
 * Simple console-based logging for frontend
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

class Logger {
  private isDevelopment = import.meta.env.DEV

  info(context: string, message: string, data?: any) {
    if (this.isDevelopment) {
      console.log(`[${context}] ${message}`, data)
    }
  }

  warn(context: string, message: string, data?: any) {
    console.warn(`[${context}] ${message}`, data)
  }

  error(context: string, message: string, data?: any) {
    console.error(`[${context}] ${message}`, data)
  }

  debug(context: string, message: string, data?: any) {
    if (this.isDevelopment) {
      console.debug(`[${context}] ${message}`, data)
    }
  }
}

export const logger = new Logger()

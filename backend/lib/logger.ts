import type { Logger } from '../types.ts';

/**
 * Create a structured JSON logger for server operations
 *
 * Produces JSON log entries to console methods. In development, pretty-prints
 * JSON; in production, emits compact single-line JSON. Debug level is suppressed
 * in production.
 *
 * @param isProd - Production flag or predicate evaluated per log call
 * @returns Logger with error, warn, info, and debug methods
 */
export function createLogger(isProd: boolean | (() => boolean)): Logger {
  const isProduction = (): boolean => (typeof isProd === 'function' ? isProd() : isProd);

  return {
    error: (message, meta = {}) => {
      const logEntry = {
        level: 'ERROR',
        timestamp: new Date().toISOString(),
        message,
        ...meta
      };
      console.error(!isProduction() ? JSON.stringify(logEntry, null, 2) : JSON.stringify(logEntry));
    },

    warn: (message, meta = {}) => {
      const logEntry = {
        level: 'WARN',
        timestamp: new Date().toISOString(),
        message,
        ...meta
      };
      console.warn(!isProduction() ? JSON.stringify(logEntry, null, 2) : JSON.stringify(logEntry));
    },

    info: (message, meta = {}) => {
      const logEntry = {
        level: 'INFO',
        timestamp: new Date().toISOString(),
        message,
        ...meta
      };
      console.log(!isProduction() ? JSON.stringify(logEntry, null, 2) : JSON.stringify(logEntry));
    },

    debug: (message, meta = {}) => {
      if (isProduction()) return;
      const logEntry = {
        level: 'DEBUG',
        timestamp: new Date().toISOString(),
        message,
        ...meta
      };
      console.log(JSON.stringify(logEntry, null, 2));
    }
  };
}

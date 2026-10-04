/**
 * ============================================================================
 * SERVICES / LOGGER
 * ----------------------------------------------------------------------------
 * Yapılandırılmış (structured) loglama portu.
 * Üretimde Cloud Logging, lokalde konsol. Domain ve use-case katmanları
 * doğrudan `console` çağırmaz; hep bu servisi kullanır (tek çıktı formatı).
 * ============================================================================
 */

import { logger } from 'firebase-functions';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ILogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

const emitter = {
  debug: (entry: Record<string, unknown>): void => logger.debug('[api]', entry),
  info: (entry: Record<string, unknown>): void => logger.info('[api]', entry),
  warn: (entry: Record<string, unknown>): void => logger.warn('[api]', entry),
  error: (entry: Record<string, unknown>): void => logger.error('[api]', entry),
} as const;

/** Firebase Functions Logger ile çalışan varsayılan implementasyon. */
export class StructuredLogger implements ILogger {
  public debug(message: string, context: Record<string, unknown> = {}): void {
    emitter.debug({ message, ...context });
  }

  public info(message: string, context: Record<string, unknown> = {}): void {
    emitter.info({ message, ...context });
  }

  public warn(message: string, context: Record<string, unknown> = {}): void {
    emitter.warn({ message, ...context });
  }

  public error(message: string, context: Record<string, unknown> = {}): void {
    emitter.error({ message, ...context });
  }
}

/** Testlerde kullanılabilir, çıktı üretmeyen (null object) logger. */
export class NoopLogger implements ILogger {
  public debug(): void {
    /* no-op */
  }
  public info(): void {
    /* no-op */
  }
  public warn(): void {
    /* no-op */
  }
  public error(): void {
    /* no-op */
  }
}

export const appLogger: ILogger = new StructuredLogger();
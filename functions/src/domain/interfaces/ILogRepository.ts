/**
 * ============================================================================
 * DOMAIN / INTERFACES / I LOG REPOSITORY
 * ----------------------------------------------------------------------------
 * Aktivite kayıtlarının yazılması, use-case'lerden ayrıştırılmış bir port.
 * ============================================================================
 */

import type { ActivityLog, AppendLogInput, LogId } from '../entities/Log';
import type { LogStatus, MessageDirection } from '../entities/Log';

export interface ListLogsQuery {
  readonly ownerId: string;
  readonly limit?: number;
  readonly status?: LogStatus | null;
  readonly direction?: MessageDirection | null;
}

export interface ILogRepository {
  /** Yeni aktivite kaydı ekler. */
  append(input: AppendLogInput): Promise<LogId>;

  /** Birden çok kaydı tek seferde ekler (batch). */
  appendMany(inputs: readonly AppendLogInput[]): Promise<void>;

  /** Sahibin loglarını en yeniden eskiye doğru listeler. */
  list(query: ListLogsQuery): Promise<readonly ActivityLog[]>;

  /** Bir otomasyona ait toplam istatistikleri döndürür (dashboard için). */
  aggregateStats(ownerId: string): Promise<{
    totalLogs: number;
    deliveredCount: number;
    failedCount: number;
    ignoredCount: number;
  }>;
}
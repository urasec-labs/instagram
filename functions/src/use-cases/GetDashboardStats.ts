/**
 * ============================================================================
 * USE-CASES / GET DASHBOARD STATS
 * ----------------------------------------------------------------------------
 * Dashboard ana ekranının analitik kartları için toplulaştırılmış veri.
 *
 * Not: Gerçek ölçekte bu veri Firestore aggregation query veya BigQuery ile
 * hesaplanır. Burada repository'nin `aggregateStats` portu kullanılır ki
 * veri kaynağı değişse use-case değişmesin (DIP).
 * ============================================================================
 */

import type { Automation } from '../domain/entities/Automation';
import { LogStatus } from '../domain/entities/Log';
import type { IAutomationRepository } from '../domain/interfaces/IAutomationRepository';
import type { ILogRepository } from '../domain/interfaces/ILogRepository';

/** Dashboard'da gösterilen hesaplanmış metrikler. */
export interface DashboardStats {
  readonly totalAutomations: number;
  readonly activeAutomations: number;
  readonly deliveredMessages: number;
  readonly failedMessages: number;
  readonly ignoredMessages: number;
  /** Başarı oranı (%). delivered / (delivered + failed) */
  readonly deliveryRate: number;
  readonly lastActivityAt: Date | null;
}

export interface GetDashboardStatsResponse {
  readonly stats: DashboardStats;
  /** Ana ekranda gösterilen "son 5 aktivite" listesi. */
  readonly recentLogs: Awaited<ReturnType<ILogRepository['list']>>;
}

export class GetDashboardStatsUseCase {
  public constructor(
    private readonly automations: IAutomationRepository,
    private readonly logs: ILogRepository,
  ) {}

  public async execute(ownerId: string): Promise<GetDashboardStatsResponse> {
    const [automations, logStats, recentLogs] = await Promise.all([
      // Tek sorguda hem aktif hem toplam sayı: liste zaten filtrelenebilir.
      this.automations.list({ ownerId, limit: 200 }),
      this.logs.aggregateStats(ownerId),
      this.logs.list({ ownerId, limit: 5 }),
    ]);

    return {
      stats: this.buildStats(automations, logStats),
      recentLogs,
    };
  }

  private buildStats(
    automations: readonly Automation[],
    logStats: {
      totalLogs: number;
      deliveredCount: number;
      failedCount: number;
      ignoredCount: number;
    },
  ): DashboardStats {
    const totalAttempts = logStats.deliveredCount + logStats.failedCount;

    return {
      totalAutomations: automations.length,
      activeAutomations: automations.filter((item) => item.status === 'ACTIVE').length,
      deliveredMessages: logStats.deliveredCount,
      failedMessages: logStats.failedCount,
      ignoredMessages: logStats.ignoredCount,
      // Guard clause: bölme sıfır hatasını önle.
      deliveryRate:
        totalAttempts === 0
          ? 0
          : Math.round((logStats.deliveredCount / totalAttempts) * 100),
      lastActivityAt: this.findLastActivity(automations),
    };
  }

  private findLastActivity(automations: readonly Automation[]): Date | null {
    const timestamps = automations
      .map((item) => item.stats.lastTriggeredAt)
      .filter((value): value is Date => value instanceof Date);

    // Guard clause: hiç tetiklenmemiş otomasyon varsa null.
    if (timestamps.length === 0) {
      return null;
    }

    return new Date(Math.max(...timestamps.map((date) => date.getTime())));
  }
}

/** Log durumları için dashboard renk eşlemesi (tek doğruluk kaynağı). */
export const LOG_STATUS_TONE: Readonly<Record<LogStatus, 'success' | 'destructive' | 'muted'>> = {
  [LogStatus.DELIVERED]: 'success',
  [LogStatus.FAILED]: 'destructive',
  [LogStatus.IGNORED]: 'muted',
  [LogStatus.PROCESSED]: 'muted',
};
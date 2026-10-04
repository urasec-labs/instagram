/**
 * ============================================================================
 * APP / DASHBOARD / PAGE — ANALİTİK & HIZLI LOGLAR
 * ----------------------------------------------------------------------------
 * Ana panel. Bölümler:
 *  1. Karşılama başlığı + hızlı eylem butonu
 *  2. İstatistik kartları (otomasyon sayısı, yanıt/hata/anahtar kelime kaçırma)
 *  3. Son aktivite akışı (canlı)
 *
 * Veri kaynağı: `useDashboardStats` + `useLogs` hook'ları (Firestore canlı
 * dinleyicileri). Sunucu bileşeni değil — `onSnapshot` tarayıcıda çalışır.
 * ============================================================================
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  Plus,
  Send,
  Sparkles,
  TrendingUp,
  Workflow,
} from 'lucide-react';

import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/providers/AuthProvider';
import { useDashboardStats, useLogs } from '@/lib/firestore-hooks';
import { formatRelativeTime } from '@/lib/utils';

export default function DashboardPage(): JSX.Element {
  const { user } = useAuth();
  const ownerId = user?.uid ?? null;

  // --- Canlı veri kaynakları ------------------------------------------------
  const { data: stats, recentLogs, loading: statsLoading } = useDashboardStats(ownerId);
  const { data: logs, loading: logsLoading } = useLogs(ownerId, 20);

  const firstName = user?.displayName?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there';

  /** Tüm loglardan canlı sayaçlar türetilir. */
  const counters = React.useMemo(() => {
    const delivered = logs.filter((log) => log.status === 'DELIVERED').length;
    const failed = logs.filter((log) => log.status === 'FAILED').length;
    const ignored = logs.filter((log) => log.status === 'IGNORED').length;
    const attempts = delivered + failed;

    return {
      delivered,
      failed,
      ignored,
      deliveryRate: attempts === 0 ? 0 : Math.round((delivered / attempts) * 100),
    };
  }, [logs]);

  return (
    <div className="space-y-6">
      {/* ======================================================================
          1) BAŞLIK
          ====================================================================== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Merhaba, {firstName} 👋</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {stats?.lastActivityAt != null
              ? `Son aktivite ${formatRelativeTime(stats.lastActivityAt)}`
              : 'Henüz aktivite yok — bir otomasyon oluşturarak başlayın.'}
          </p>
        </div>

        <Button asChild>
          <Link href="/dashboard/automations">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Yeni Otomasyon
          </Link>
        </Button>
      </div>

      {/* ======================================================================
          2) İSTATİSTİK KARTLARI
          ====================================================================== */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title="Toplam Otomasyon"
          value={stats?.totalAutomations ?? 0}
          icon={Workflow}
          tone="primary"
          loading={statsLoading}
          description={`${stats?.activeAutomations ?? 0} tanesi aktif`}
        />

        <StatsCard
          title="Gönderilen Yanıt"
          value={counters.delivered}
          icon={Send}
          tone="success"
          loading={logsLoading}
          description="Başarıyla iletilen DM'ler"
        />

        <StatsCard
          title="Başarı Oranı"
          value={counters.deliveryRate}
          format="percent"
          icon={TrendingUp}
          tone={counters.deliveryRate >= 80 ? 'success' : 'warning'}
          loading={logsLoading}
          description="Gönderilen / toplam deneme"
        />

        <StatsCard
          title="Eşleşmeyen Mesaj"
          value={counters.ignored}
          icon={AlertCircle}
          tone="muted"
          loading={logsLoading}
          description="Anahtar kelimeye denk gelmedi"
        />
      </div>

      {/* ======================================================================
          3) İÇERİK: Canlı akış + hızlı bağlantılar
          ====================================================================== */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* --- Sol: aktivite (2/3 genişlik) --- */}
        <div className="lg:col-span-2">
          <ActivityFeed
            logs={logs}
            loading={logsLoading}
            maxItems={15}
            emptyMessage="Instagram'dan bir mesaj geldiğinde veya otomasyon tetiklendiğinde burada anlık olarak görüntülenecek."
          />
        </div>

        {/* --- Sağ: hızlı işlemler + ipuçları --- */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Son Hareketler</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Henüz hareket yok.</p>
              ) : (
                recentLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 text-sm">
                    <Activity
                      className={
                        log.status === 'DELIVERED'
                          ? 'mt-0.5 h-3.5 w-3.5 shrink-0 text-success'
                          : 'mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground'
                      }
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{log.content || '—'}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatRelativeTime(log.createdAt)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* --- Başlangıç rehberi --- */}
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                Nasıl Başlanır?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p className="flex gap-2">
                <span className="font-semibold text-foreground">1.</span>
                Otomasyon oluşturun: tetikleyici kelime + yanıt mesajı girin.
              </p>
              <p className="flex gap-2">
                <span className="font-semibold text-foreground">2.</span>
                Meta Dashboard&apos;da webhook URL&apos;sini tanımlayın.
              </p>
              <p className="flex gap-2">
                <span className="font-semibold text-foreground">3.</span>
                Otomasyonu anahtar üstünden{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">Aktif</code> yapın.
              </p>

              <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                <Link href="/dashboard/automations">Otomasyonlara Git</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
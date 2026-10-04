/**
 * ============================================================================
 * APP / DASHBOARD / LOGS PAGE — CANLI AKTİVİTE AKIŞI
 * ----------------------------------------------------------------------------
 * Gönderim loglarının gerçek zamanlı listesi.
 *
 * ÖZELLİKLER:
 *  - Firestore `onSnapshot` → yeni mesaj anında ekranda (yenileme yok)
 *  - Duruma göre filtreleme (Tümü / Gönderildi / Hata / Eşleşmedi)
 *  - Yön filtresi (Gelen / Gönderilen)
 *  - Otomatik kaydırma takibi (yeni kayıt geldiğinde en üste çekme seçeneği)
 * ============================================================================
 */

'use client';

import * as React from 'react';
import { ArrowDown, Pause, Play, X } from 'lucide-react';

import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/providers/AuthProvider';
import { useLogs } from '@/lib/firestore-hooks';
import { cn, formatNumber } from '@/lib/utils';
import { LOG_STATUS, type ActivityLog, type LogStatus } from '@/lib/types';

/** Durum filtresi seçenekleri. */
type StatusFilter = 'ALL' | LogStatus;

const STATUS_FILTERS: readonly { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'Tümü' },
  { value: LOG_STATUS.DELIVERED, label: 'Gönderildi' },
  { value: LOG_STATUS.FAILED, label: 'Hata' },
  { value: LOG_STATUS.IGNORED, label: 'Eşleşmedi' },
];

/** Firestore'dan çekilecek azami kayıt sayısı. */
const MAX_LOGS = 200;

export default function LogsPage(): JSX.Element {
  const { user } = useAuth();
  const ownerId = user?.uid ?? null;

  const { data: logs, loading, error, refresh } = useLogs(ownerId, MAX_LOGS);

  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('ALL');
  const [inboundOnly, setInboundOnly] = React.useState<boolean>(false);
  const [outboundOnly, setOutboundOnly] = React.useState<boolean>(false);
  const [search, setSearch] = React.useState<string>('');
  const [paused, setPaused] = React.useState<boolean>(false);

  /**
   * Durum + yön + arama filtreleri.
   * `useMemo` → yalnızca girdiler değiştiğinde yeniden hesaplanır.
   */
  const filtered = React.useMemo<readonly ActivityLog[]>(() => {
    const query = search.trim().toLocaleLowerCase('tr-TR');

    return logs.filter((log) => {
      // Durum filtresi
      if (statusFilter !== 'ALL' && log.status !== statusFilter) {
        return false;
      }

      // Yön filtresi (ikisi birden seçilirse son seçilen geçerli olur)
      if (inboundOnly && log.direction !== 'INBOUND') {
        return false;
      }

      if (outboundOnly && log.direction !== 'OUTBOUND') {
        return false;
      }

      // Metin araması
      if (query.length === 0) {
        return true;
      }

      const haystack = [log.content, log.recipient ?? '', log.matchedKeyword ?? '']
        .join(' ')
        .toLocaleLowerCase('tr-TR');

      return haystack.includes(query);
    });
  }, [inboundOnly, logs, outboundOnly, search, statusFilter]);

  /** Filtreleme sırasında kaç kayıt gizlendi? */
  const hiddenCount = logs.length - filtered.length;

  /** Yön seçicilerini sıfırla (çift seçim durumunu temizler). */
  const handleInboundChange = (checked: boolean): void => {
    setInboundOnly(checked);

    if (checked) {
      setOutboundOnly(false);
    }
  };

  const handleOutboundChange = (checked: boolean): void => {
    setOutboundOnly(checked);

    if (checked) {
      setInboundOnly(false);
    }
  };

  /** Tüm filtreleri varsayılana döndürür. */
  const resetFilters = (): void => {
    setStatusFilter('ALL');
    setInboundOnly(false);
    setOutboundOnly(false);
    setSearch('');
  };

  return (
    <div className="space-y-6">
      {/* ======================================================================
          BAŞLIK
          ====================================================================== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Canlı Loglar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gelen mesajlar, eşleşmeler ve gönderim sonuçları anlık olarak burada görünür.
          </p>
        </div>

        {/* Canlı yayın göstergesi */}
        <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
          {paused ? (
            <>
              <Pause className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm text-muted-foreground">Duraklatıldı</span>
            </>
          ) : (
            <>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              <span className="text-sm font-medium">Canlı</span>
            </>
          )}

          <Switch checked={paused} onCheckedChange={setPaused} aria-label="Akışı duraklat" />

          <Button
            variant="ghost"
            size="icon"
            onClick={refresh}
            aria-label="Logları yenile"
            className="ml-1"
          >
            <Play className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ======================================================================
          FİLTRE PANELİ
          ====================================================================== */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          {/* --- Satır 1: durum filtreleri + arama --- */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div
              className="flex flex-wrap rounded-lg border p-0.5"
              role="group"
              aria-label="Durum filtresi"
            >
              {STATUS_FILTERS.map((item) => {
                const count =
                  item.value === 'ALL'
                    ? logs.length
                    : logs.filter((log) => log.status === item.value).length;

                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => {
                      setStatusFilter(item.value);
                    }}
                    aria-pressed={statusFilter === item.value}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      statusFilter === item.value
                        ? 'bg-secondary text-secondary-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {item.label}
                    <span className="rounded bg-background/60 px-1.5 text-xs tabular-nums">
                      {formatNumber(count)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex-1 lg:ml-auto">
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
                placeholder="Mesaj içeriği, kullanıcı veya kelime ara..."
                aria-label="Loglarda ara"
              />
            </div>
          </div>

          {/* --- Satır 2: yön filtreleri --- */}
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Switch
                checked={inboundOnly}
                onCheckedChange={handleInboundChange}
                aria-label="Sadece gelen mesajlar"
              />
              <span className="text-muted-foreground">Gelen mesajlar</span>
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Switch
                checked={outboundOnly}
                onCheckedChange={handleOutboundChange}
                aria-label="Sadece gönderilen yanıtlar"
              />
              <span className="text-muted-foreground">Gönderilen yanıtlar</span>
            </label>

            {/* Filtre özeti + sıfırlama */}
            {hiddenCount > 0 || search.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="ml-auto gap-1.5 text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Filtreleri temizle ({formatNumber(hiddenCount)} gizli)
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* ======================================================================
          HATA
          ====================================================================== */}
      {error !== null ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          Loglar yüklenemedi: {error.message}
        </div>
      ) : null}

      {/* ======================================================================
          LOG AKIŞI
          ====================================================================== */}
      <ActivityFeed
        logs={paused ? [] : filtered}
        loading={loading}
        maxItems={MAX_LOGS}
        onRefresh={refresh}
        emptyMessage={
          logs.length === 0
            ? 'Henüz log kaydı yok. Instagram webhook\'u bir mesaj gönderdiğinde burası dolacak.'
            : 'Seçtiğiniz filtrelere uyan kayıt yok.'
        }
      />

      {/* --- Bilgi notu --- */}
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ArrowDown className="h-3 w-3" aria-hidden="true" />
        En fazla {MAX_LOGS} kayıt gösterilir. Loglar{' '}
        <span className="font-medium">LOG_RETENTION_DAYS</span> (varsayılan 30 gün) sonra
        otomatik temizlenir.
      </p>
    </div>
  );
}
/**
 * ============================================================================
 * DASHBOARD / ACTIVITY FEED
 * ----------------------------------------------------------------------------
 * Canlı gönderim log akışı (Firestore `onSnapshot` ile güncellenir).
 *
 * TASARIM KARARLARI:
 *  - Yeni kayıtlar `animate-log-in` ile belirir → kullanıcı "şu an bir şey
 *    oldu" fark eder.
 *  - Durum rengi: yeşil (başarılı), kırmızı (hata), gri (eşleşmedi).
 *  - Uzun mesajlar kısaltılır, tamamı `title` özniteliğinde durur.
 * ============================================================================
 */

'use client';

import * as React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Hash,
  Inbox,
  MessageCircle,
  RefreshCw,
  Send,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatRelativeTime, formatTime, truncate } from '@/lib/utils';
import { LOG_STATUS, type ActivityLog, type LogStatus } from '@/lib/types';

export interface ActivityFeedProps {
  readonly logs: readonly ActivityLog[];
  readonly loading?: boolean;
  /** Boş durumda gösterilecek özel içerik. */
  readonly emptyMessage?: string;
  /** Yenileme butonu. */
  readonly onRefresh?: () => void;
  /** Maksimum gösterilecek kayıt sayısı. */
  readonly maxItems?: number;
}

/** Log durumu → görsel gösterim. */
const STATUS_VIEW: Record<LogStatus, { icon: typeof CheckCircle2; className: string; label: string }> = {
  [LOG_STATUS.DELIVERED]: {
    icon: CheckCircle2,
    className: 'text-success',
    label: 'Gönderildi',
  },
  [LOG_STATUS.FAILED]: {
    icon: AlertCircle,
    className: 'text-destructive',
    label: 'Hata',
  },
  [LOG_STATUS.IGNORED]: {
    icon: Inbox,
    className: 'text-muted-foreground',
    label: 'Eşleşmedi',
  },
  [LOG_STATUS.PROCESSED]: {
    icon: MessageCircle,
    className: 'text-muted-foreground',
    label: 'İşlendi',
  },
};

export function ActivityFeed({
  logs,
  loading = false,
  emptyMessage = 'Henüz aktivite yok. Bir webhook tetiklendiğinde burada belirecek.',
  onRefresh,
  maxItems = 50,
}: ActivityFeedProps): JSX.Element {
  const visibleLogs = React.useMemo(() => logs.slice(0, maxItems), [logs, maxItems]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="relative flex h-2 w-2">
            {/* Canlı yayın göstergesi */}
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          Canlı Aktivite
        </CardTitle>

        {onRefresh !== undefined ? (
          <Button variant="ghost" size="icon" onClick={onRefresh} aria-label="Yenile">
            <RefreshCw className="h-4 w-4" />
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="p-0">
        {/* --- Yükleme iskeleti --- */}
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-start gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* --- Boş durum --- */}
        {!loading && visibleLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
            <p className="max-w-xs text-sm text-muted-foreground">{emptyMessage}</p>
          </div>
        ) : null}

        {/* --- Liste --- */}
        {!loading && visibleLogs.length > 0 ? (
          <ul className="divide-y">
            {visibleLogs.map((log, index) => (
              <ActivityFeedItem key={log.id} log={log} isNew={index === 0 && !loading} />
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Tek bir log satırı (SRP: satır mantığı ayrı bileşende). */
function ActivityFeedItem({ log, isNew }: { log: ActivityLog; isNew: boolean }): JSX.Element {
  const statusView = STATUS_VIEW[log.status];
  const StatusIcon = statusView.icon;

  const isInbound = log.direction === 'INBOUND';

  return (
    <li
      className={cn(
        'flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40',
        // Yalnızca ilk satır animasyon alır → her render'da tüm liste titremez.
        isNew && 'animate-log-in',
      )}
    >
      {/* --- Durum ikonu --- */}
      <div className="mt-0.5 shrink-0">
        <StatusIcon className={cn('h-4.5 w-4.5', statusView.className)} aria-hidden="true" />
      </div>

      {/* --- İçerik --- */}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* Yön rozeti */}
          <Badge variant={isInbound ? 'outline' : 'secondary'} className="gap-1 font-normal">
            {isInbound ? (
              <Inbox className="h-2.5 w-2.5" aria-hidden="true" />
            ) : (
              <Send className="h-2.5 w-2.5" aria-hidden="true" />
            )}
            {isInbound ? 'Gelen' : 'Gönderilen'}
          </Badge>

          {/* Eşleşen kelime */}
          {log.matchedKeyword !== null ? (
            <Badge variant="secondary" className="gap-1 font-normal">
              <Hash className="h-2.5 w-2.5" aria-hidden="true" />
              {log.matchedKeyword}
            </Badge>
          ) : null}

          {/* Karşı taraf */}
          {log.recipient !== null ? (
            <span className="text-xs font-medium text-muted-foreground">
              @{log.recipient.replace(/^@/, '')}
            </span>
          ) : null}

          {/* Zaman */}
          <time
            className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground"
            dateTime={log.createdAt.toISOString()}
            title={formatTime(log.createdAt)}
          >
            {formatRelativeTime(log.createdAt)}
          </time>
        </div>

        {/* Mesaj içeriği */}
        <p className="truncate text-sm text-foreground" title={log.content}>
          {log.content.length > 0 ? truncate(log.content, 160) : <em className="text-muted-foreground">—</em>}
        </p>

        {/* Hata / gecikme bilgisi */}
        {log.status === LOG_STATUS.FAILED && log.errorMessage !== null ? (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{log.errorMessage}</span>
          </p>
        ) : null}

        {log.latencyMs !== null && log.status === LOG_STATUS.DELIVERED ? (
          <p className="text-xs tabular-nums text-muted-foreground">{log.latencyMs} ms</p>
        ) : null}
      </div>
    </li>
  );
}
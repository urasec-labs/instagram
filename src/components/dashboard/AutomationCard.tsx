/**
 * ============================================================================
 * DASHBOARD / AUTOMATION CARD
 * ----------------------------------------------------------------------------
 * Otomasyonun mobil/kart görünümü. Masaüstünde tablo kullanılır ama dar
 * ekranlarda bu kart listelenir (responsive).
 *
 * Sorumluluk: TEK bir otomasyonu görüntülemek + durum değiştirmek.
 * Form mantığı bu bileşende DEĞİLDİR (Modal'da yaşar).
 * ============================================================================
 */

'use client';

import * as React from 'react';
import { Hash, MessageSquare, MoreVertical, Pencil, Send, Trash2, Zap } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { cn, formatNumber, formatRelativeTime, truncate } from '@/lib/utils';
import { AUTOMATION_STATUS, type Automation, type AutomationStatus } from '@/lib/types';

export interface AutomationCardProps {
  readonly automation: Automation;
  /** Durum değiştirildiğinde çağrılır. */
  readonly onToggle: (id: string, status: AutomationStatus) => Promise<void>;
  /** Düzenleme modalını açar. */
  readonly onEdit: (automation: Automation) => void;
  /** Kalıcı silme. */
  readonly onDelete: (automation: Automation) => void;
}

/** Durum badge'inin görünümü — tek yerde tanımlı. */
export function statusBadgeVariant(status: AutomationStatus): 'success' | 'muted' {
  return status === AUTOMATION_STATUS.ACTIVE ? 'success' : 'muted';
}

export function statusBadgeLabel(status: AutomationStatus): string {
  return status === AUTOMATION_STATUS.ACTIVE ? 'Aktif' : 'Pasif';
}

/** Eşleşme modunun okunabilir karşılığı. */
function matchModeLabel(mode: Automation['matchMode']): string {
  return mode === 'EXACT' ? 'Tam eşleşme' : 'İçinde geçen';
}

export function AutomationCard({
  automation,
  onToggle,
  onEdit,
  onDelete,
}: AutomationCardProps): JSX.Element {
  const [toggling, setToggling] = React.useState<boolean>(false);

  const isActive = automation.status === AUTOMATION_STATUS.ACTIVE;

  /**
   * Toggle işlemini çalıştırır.
   * `await` sırasında butonu devre dışı bırakır → hızlı tıklama iki yazma
   * isteği üretmez (race condition koruması).
   */
  const handleToggle = async (): Promise<void> => {
    setToggling(true);

    try {
      await onToggle(
        automation.id,
        isActive ? AUTOMATION_STATUS.PASSIVE : AUTOMATION_STATUS.ACTIVE,
      );
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = (): void => {
    // Tarayıcının yerleşik onayı — boş bir `window.confirm` yerine geçici
    // ama güvenli bir çözüm; ileride gerçek bir AlertDialog'e taşınabilir.
    if (typeof window !== 'undefined' && window.confirm(`"${automation.name}" otomasyonu silinsin mi?`)) {
      onDelete(automation);
    }
  };

  return (
    <Card className={cn('transition-colors', !isActive && 'opacity-70')}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="min-w-0 flex-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap
              className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')}
              aria-hidden="true"
            />
            <span className="truncate">{automation.name}</span>
          </CardTitle>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant={statusBadgeVariant(automation.status)}>
              {statusBadgeLabel(automation.status)}
            </Badge>
            <Badge variant="outline" className="font-normal">
              {matchModeLabel(automation.matchMode)}
            </Badge>
            <Badge variant="outline" className="font-normal">
              {automation.trigger === 'INBOUND_COMMENT' ? 'Yorum' : 'DM'}
            </Badge>
          </div>
        </div>

        <Switch
          checked={isActive}
          disabled={toggling}
          onCheckedChange={() => {
            void handleToggle();
          }}
          aria-label={`${automation.name} otomasyonunu ${isActive ? 'pasifleştir' : 'aktifleştir'}`}
        />
      </CardHeader>

      <CardContent className="space-y-3 pb-3">
        {/* --- Tetikleyici kelimeler --- */}
        <div className="flex flex-wrap gap-1">
          {automation.keywords.slice(0, 6).map((keyword) => (
            <Badge key={keyword} variant="secondary" className="gap-1 font-normal">
              <Hash className="h-2.5 w-2.5" aria-hidden="true" />
              {keyword}
            </Badge>
          ))}

          {/* 6'dan fazla kelime varsa kalan sayısını göster. */}
          {automation.keywords.length > 6 ? (
            <Badge variant="muted">+{automation.keywords.length - 6}</Badge>
          ) : null}
        </div>

        {/* --- Yanıt mesajı --- */}
        <div className="flex gap-2 rounded-md bg-muted/50 p-2.5 text-sm">
          <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-muted-foreground">{truncate(automation.replyMessage, 120)}</p>
        </div>
      </CardContent>

      <CardFooter className="justify-between border-t pt-3">
        {/* --- İstatistikler --- */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Send className="h-3 w-3" aria-hidden="true" />
            {formatNumber(automation.stats.replyCount)} yanıt
          </span>

          {automation.stats.failureCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-destructive">
              <MoreVertical className="h-3 w-3" aria-hidden="true" />
              {formatNumber(automation.stats.failureCount)} hata
            </span>
          ) : null}

          {automation.stats.lastTriggeredAt !== null ? (
            <span className="hidden sm:inline">
              {formatRelativeTime(automation.stats.lastTriggeredAt)}
            </span>
          ) : null}
        </div>

        {/* --- Aksiyonlar --- */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              onEdit(automation);
            }}
            aria-label="Düzenle"
          >
            <Pencil className="h-4 w-4" />
          </Button>

          <Button variant="ghost" size="icon" onClick={handleDelete} aria-label="Sil">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
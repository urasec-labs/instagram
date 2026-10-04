/**
 * ============================================================================
 * DASHBOARD / STATS CARD
 * ----------------------------------------------------------------------------
 * Dashboard'un üst kısmındaki tekil metrik kartı. Sunucudan tek bir veri
 * alır ve görselleştirir (sunucu, ikon veya renk mantığı içermez → SRP).
 * ============================================================================
 */

'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatNumber, formatPercent } from '@/lib/utils';

export interface StatsCardProps {
  readonly title: string;
  readonly value: number | string;
  /** Değeri biçimlendiren fonksiyon (sayı değilse doğrudan gösterilir). */
  readonly format?: 'number' | 'percent' | 'text';
  readonly icon: LucideIcon;
  /** Vurgu rengi (kart kenarı / ikon zemini). */
  readonly tone?: 'primary' | 'success' | 'warning' | 'muted';
  readonly description?: string;
  readonly loading?: boolean;
}

/** Ton → CSS sınıfları eşlemesi (tek yerde). */
const TONE_CLASSES: Record<NonNullable<StatsCardProps['tone']>, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  muted: 'bg-muted text-muted-foreground',
};

export function StatsCard({
  title,
  value,
  format = 'number',
  icon: Icon,
  tone = 'primary',
  description,
  loading = false,
}: StatsCardProps): JSX.Element {
  /** Değeri seçilen biçime göre string'e çevirir. */
  const formatted = React.useMemo<string>(() => {
    if (typeof value === 'string') {
      return value;
    }

    switch (format) {
      case 'percent':
        return formatPercent(value);
      case 'text':
        return String(value);
      default:
        return formatNumber(value);
    }
  }, [format, value]);

  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        {/* --- İkon rozeti --- */}
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
            TONE_CLASSES[tone],
          )}
          aria-hidden="true"
        >
          <Icon className="h-5 w-5" />
        </div>

        {/* --- Metin --- */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </p>

          {loading ? (
            <Skeleton className="mt-1.5 h-7 w-20" />
          ) : (
            <p className="mt-0.5 text-2xl font-semibold leading-none">{formatted}</p>
          )}

          {description !== undefined && !loading ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
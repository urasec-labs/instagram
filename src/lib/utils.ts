/**
 * ============================================================================
 * LIB / UTILS
 * ----------------------------------------------------------------------------
 * Shadcn UI'ın standart yardımcıları.
 * `cn()` = clsx (koşullu sınıf birleştirme) + tailwind-merge (çakışan
 * Tailwind sınıflarında sonuncunun kazanması).
 * ============================================================================
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Zaman damgasını göreli olarak biçimlendirir ("3 dk önce").
 * @param date  dönüştürülecek tarih
 * @param now   referans zaman (testte sabitlenebilir → deterministik çıktı)
 */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);

  // Guard clause: gelecek tarihler için "az önce" gösterilir (saat kayması).
  if (diffSeconds < 0) {
    return 'az önce';
  }

  if (diffSeconds < 60) {
    return 'şimdi';
  }

  const diffMinutes = Math.floor(diffSeconds / 60);

  if (diffMinutes < 60) {
    return `${diffMinutes} dk önce`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} saat önce`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays < 30) {
    return `${diffDays} gün önce`;
  }

  return formatDate(date);
}

/** `12 Mart 2024, 14:32` biçiminde yerelleştirilmiş tarih. */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** Yalnızca saat: `14:32` */
export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

/** Metni kısaltır: `Çok uzun bir mesaj...` */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trimEnd()}…`;
}

/** Sayıyı binlik ayraçlı gösterir: `12500` → `12.500` */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('tr-TR').format(value);
}

/** Yüzde gösterimi: `87` → `%87` */
export function formatPercent(value: number): string {
  return `%${value}`;
}

/**
 * Kullanıcının girdiği metni backend ile aynı kuralla normalize eder.
 * Bu, istemci tarafı doğrulama ile sunucu doğrulamasının tutarlı olmasını
 * sağlar (aynı `normalizeText` algoritması).
 */
export function normalizeKeyword(raw: string): string {
  return raw
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^#+/, '');
}

/** HTTP çağrılarının kökü. Boşsa relative path (Firebase Hosting rewrite). */
export function apiBaseUrl(): string {
  const base = process.env['NEXT_PUBLIC_API_BASE_URL'] ?? '';

  return base.replace(/\/$/, '');
}
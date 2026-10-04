/**
 * ============================================================================
 * DOMAIN / ENTITIES / AUTOMATION
 * ----------------------------------------------------------------------------
 * Bu dosya SAF İŞ MANTIĞIDIR (Pure Domain Model).
 *
 * Kurallar:
 *  - HİÇBİR kütüphane importu YOKTUR (firebase-admin, axios, vb. yasak).
 *  - HİÇBİR I/O yapılmaz (dosya, ağ, veritabanı yok).
 *  - Timestamp gibi altyapı tipleri burada GÖRÜNMEZ; repository sınırında
 *    `Date` ↔ Firestore `Timestamp` dönüşümü yapılır.
 * ============================================================================
 */

/** Firestore `automations` koleksiyonundaki belge kimliği. */
export type AutomationId = string;

/** Tetikleyici kelimenin nasıl eşleştirileceğini belirleyen strateji. */
export enum MatchMode {
  /** Normalize metin ile kelime birebir aynı olmalıdır. */
  EXACT = 'EXACT',
  /** Kelime, normalize metnin içinde geçmelidir (alt dize). */
  CONTAINS = 'CONTAINS',
}

/** Otomasyonun tetiklenebilir olup olmadığı. */
export enum AutomationStatus {
  ACTIVE = 'ACTIVE',
  PASSIVE = 'PASSIVE',
}

/** Hangi olay üzerinde çalışacağı. */
export enum AutomationTrigger {
  /** Gelen DM (Instagram Messaging API webhook). */
  INBOUND_MESSAGE = 'INBOUND_MESSAGE',
  /** Gelen yorum (Instagram Comments webhook). */
  INBOUND_COMMENT = 'INBOUND_COMMENT',
}

/** Otomasyonun toplam çalışma istatistikleri (dashboard analitiği için). */
export interface AutomationStats {
  readonly matchCount: number;
  readonly replyCount: number;
  readonly failureCount: number;
  readonly lastTriggeredAt: Date | null;
}

/**
 * Otomasyon Aggregate Root'u.
 * Tüm alanlar `readonly` → domain katmanında immutability (değişmezlik) korunur.
 * Durum değişiklikleri bu alanlara değil, ilgili factory fonksiyonlarına yapılır.
 */
export interface Automation {
  readonly id: AutomationId;
  readonly ownerId: string;
  readonly name: string;
  /** Normalize edilmiş tetikleyici kelimeler. */
  readonly keywords: readonly string[];
  readonly matchMode: MatchMode;
  readonly replyMessage: string;
  readonly trigger: AutomationTrigger;
  readonly status: AutomationStatus;
  readonly stats: AutomationStats;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Factory fonksiyonlarına verilen ham (kullanıcıdan gelen) girdi. */
export interface CreateAutomationInput {
  readonly id: AutomationId;
  readonly ownerId: string;
  readonly name: string;
  readonly keywords: readonly string[];
  readonly matchMode: MatchMode;
  readonly replyMessage: string;
  readonly trigger: AutomationTrigger;
  readonly now: Date;
}

/** İş kuralları sınırları (tek doğruluk kaynağı — config'den bağımsız). */
export const AUTOMATION_LIMITS = {
  /** Bir otomasyonda izin verilen azami tetikleyici kelime sayısı. */
  MAX_KEYWORDS: 30,
  /** Bir kelimenin azami uzunluğu. */
  MAX_KEYWORD_LENGTH: 60,
  /** Yanıt mesajının azami uzunluğu (Instagram DM limiti 1000 karakter). */
  MAX_REPLY_LENGTH: 1000,
  /** Otomasyon adının azami uzunluğu. */
  MAX_NAME_LENGTH: 80,
} as const;

/**
 * Metin normalize etme (DOMAIN seviyesinde, kütüphanesiz).
 *
 *  - Küçük harfe indirger (İ/ı, Ş/ş, Ğ/ğ, Ü/ü vb. Türkçe karakterler dahil)
 *  - Baştaki/sondaki boşlukları kırpır
 *  - Ardışık boşlukları tek boşluğa indirger
 *  - Gereksiz Unicode işaretlerini (zero-width vb.) temizler
 *
 * @returns normalize edilmiş metin. Girdi string değilse boş string döner.
 */
export function normalizeText(raw: string): string {
  if (typeof raw !== 'string' || raw.length === 0) {
    return '';
  }

  return raw
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Bir kelimeyi normalize eder ve gereksiz yüzde/emoji gibi gürültüyü temizler.
 * @returns normalize kelime veya boş string.
 */
export function normalizeKeyword(raw: string): string {
  const normalized = normalizeText(raw).replace(/^#+/, '');

  if (normalized.length === 0) {
    return '';
  }

  return normalized.slice(0, AUTOMATION_LIMITS.MAX_KEYWORD_LENGTH);
}

/**
 * Kelime listesini normalize eder, boşları atar, kopyalar ve tekrarları siler.
 * @returns benzersiz (korunmuş sırada) kelime dizisi.
 */
export function normalizeKeywords(rawKeywords: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of rawKeywords) {
    const keyword = normalizeKeyword(raw);

    // Guard clause: normalize edilemeyen kelimeleri sessizce at.
    if (keyword.length === 0 || seen.has(keyword)) {
      continue;
    }

    seen.add(keyword);
    result.push(keyword);
  }

  return result;
}
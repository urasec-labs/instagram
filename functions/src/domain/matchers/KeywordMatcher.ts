/**
 * ============================================================================
 * DOMAIN / MATCHERS / KEYWORD MATCHER
 * ----------------------------------------------------------------------------
 * PROJE'NİN KALBİ. Tamamen PURE fonksiyonlardan oluşur:
 *  - I/O yok, kütüphane yok, durum (state) yok → deterministik ve test edilebilir.
 *  - Eşleşme stratejisi (EXACT / CONTAINS) burada merkezileştirilir ki
 *    başka bir use-case de aynı mantığı kullansın.
 * ============================================================================
 */

import {
  AUTOMATION_LIMITS,
  MatchMode,
  type Automation,
  normalizeKeywords,
  normalizeText,
} from '../entities/Automation';

/** Tek bir eşleşmenin detayları. */
export interface KeywordMatch {
  /** Eşleşen kelime (normalize edilmiş hâli). */
  readonly keyword: string;
  /** Eşleşme gerçekleşen otomasyon. */
  readonly automation: Automation;
  /** Şablon içinde değiştirilebilir değişkenler (örn. {username}). */
  readonly variables: Readonly<Record<string, string>>;
}

/**
 * Tek bir kelimenin metne karşı eşleşip eşleşmediğini belirler.
 *
 * @param keyword  Normalize edilmiş kelime
 * @param text     Normalize edilmiş metin
 * @param mode     Eşleşme stratejisi
 */
export function doesKeywordMatch(
  keyword: string,
  text: string,
  mode: MatchMode,
): boolean {
  // Guard clause: normalize kelime ve metin zorunlu.
  if (keyword.length === 0 || text.length === 0) {
    return false;
  }

  if (mode === MatchMode.EXACT) {
    return text === keyword;
  }

  return text.includes(keyword);
}

/**
 * Verilen kelime listesinde metne uyan İLK kelimeyi döndürür.
 * @returns eşleşen kelime veya null
 */
export function findMatchingKeyword(
  keywords: readonly string[],
  text: string,
  mode: MatchMode,
): string | null {
  for (const keyword of keywords) {
    if (doesKeywordMatch(keyword, text, mode)) {
      return keyword;
    }
  }

  return null;
}

/**
 * Şablon değişkenlerini üretir.
 * Instagram API'si özel değişken sunmadığı için biz üretiyoruz:
 *  {username} → gönderen kullanıcı adı
 *  {keyword}  → tetikleyen kelime
 *  {timestamp}→ okunabilir zaman damgası
 */
export function buildTemplateVariables(
  username: string | null,
  keyword: string | null,
  now: Date,
): Readonly<Record<string, string>> {
  return {
    username: username ?? 'orada',
    keyword: keyword ?? '',
    date: now.toLocaleDateString('tr-TR'),
    time: now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
  };
}

/**
 * Yanıt mesajındaki `{degisken}` placeholder'larını gerçek değerlerle değiştirir.
 * Bilinmeyen placeholder'lar olduğu gibi bırakılır (sessiz veri kaybı olmaz).
 */
export function renderTemplate(
  template: string,
  variables: Readonly<Record<string, string>>,
): string {
  return template.replace(/\{(\w+)\}/g, (fullMatch, key: string) => {
    // Guard clause: bilinmeyen anahtarları koru.
    if (!Object.prototype.hasOwnProperty.call(variables, key)) {
      return fullMatch;
    }

    return variables[key] ?? '';
  });
}

/**
 * METİN BİÇİMİNDE tek eşleşen otomasyonu seçer.
 *
 * Öncelik kuralı (deterministiktir, rastgelelik yoktur):
 *  1. En uzun kelime kazanır  → "fiyat" ile "fiyat listesi" ayrışır
 *  2. Uzunluk eşitse isim sırası (kayıt sırası) belirleyicidir
 *
 * @returns kazanan eşleşme veya null
 */
export function selectMatchingAutomation(
  automations: readonly Automation[],
  rawText: string,
  senderUsername: string | null,
  now: Date,
): KeywordMatch | null {
  const text = normalizeText(rawText);

  // Guard clause: normalize metin veya otomasyon yoksa eşleşme yoktur.
  if (text.length === 0 || automations.length === 0) {
    return null;
  }

  let winner: KeywordMatch | null = null;

  for (const automation of automations) {
    // Yalnızca pasif otomasyonlar tetiklenmez (ikinci savunma hattı).
    if (automation.status !== 'ACTIVE') {
      continue;
    }

    const keywords = normalizeKeywords(automation.keywords);
    const matchedKeyword = findMatchingKeyword(keywords, text, automation.matchMode);

    if (matchedKeyword === null) {
      continue;
    }

    // Uzunluk önceliği: daha uzun (daha spesifik) kelime kazanır.
    if (winner === null || matchedKeyword.length > winner.keyword.length) {
      winner = {
        keyword: matchedKeyword,
        automation,
        variables: buildTemplateVariables(senderUsername, matchedKeyword, now),
      };
    }
  }

  return winner;
}

/**
 * Sözlük formundaki (kelime → mod) eşleşmeleri değerlendirir.
 * Birden fazla otomasyon farklı mod kullanıyorsa kullanılır.
 *
 * @returns en uzun eşleşen kelimenin modu ve kelimenin kendisi
 */
export function selectStrictestMatch(
  dictionary: ReadonlyMap<string, MatchMode>,
  rawText: string,
): { keyword: string; mode: MatchMode } | null {
  const text = normalizeText(rawText);

  if (text.length === 0 || dictionary.size === 0) {
    return null;
  }

  let winner: { keyword: string; mode: MatchMode } | null = null;

  for (const [rawKeyword, mode] of dictionary.entries()) {
    const keyword = normalizeText(rawKeyword);

    if (!doesKeywordMatch(keyword, text, mode)) {
      continue;
    }

    if (winner === null || keyword.length > winner.keyword.length) {
      winner = { keyword, mode };
    }
  }

  return winner;
}

/** Instagram DM metin uzunluğu limiti (Meta dokümanına göre 1000 karakter). */
export const INSTAGRAM_TEXT_LIMIT = AUTOMATION_LIMITS.MAX_REPLY_LENGTH;

/**
 * Metni Meta limitine göre kısaltır.
 * Kelime sınırında keser ve gerekirse "…" ekler → spam/kesilmiş mesaj görüntüsü önlenir.
 */
export function clampToInstagramLimit(text: string): string {
  const trimmed = text.trim();

  if (trimmed.length <= INSTAGRAM_TEXT_LIMIT) {
    return trimmed;
  }

  const sliced = trimmed.slice(0, INSTAGRAM_TEXT_LIMIT - 1);
  const lastSpaceIndex = sliced.lastIndexOf(' ');

  // Guard clause: kırpma noktasında boşluk yoksa karakter sınırında kes.
  const safeSlice = lastSpaceIndex > INSTAGRAM_TEXT_LIMIT * 0.5 ? sliced.slice(0, lastSpaceIndex) : sliced;

  return `${safeSlice.trimEnd()}…`;
}
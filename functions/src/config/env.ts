/**
 * ============================================================================
 * CONFIG / ENVIRONMENT
 * ----------------------------------------------------------------------------
 * "Zero Hardcoded Strings" ilkesinin merkezi.
 *
 * Hiçbir yerde doğrudan `process.env.X` okunmaz; her şey buradan, TEK ve
 * DOĞRULANMIŞ bir kaynaktan gelir. Eksik/hatalı bir değişken başlangıçta
 * (cold start) hata verir — çalışma zamanında sürpriz üretmez.
 *
 * NOT: Bu dosya domain'e BAĞLI değildir, domain'in bağımlı olduğu taraftadır
 * (bağımlılık yönü hep içeri doğrudur).
 * ============================================================================
 */

import { ConfigurationError } from '../domain/errors/DomainError';
import { FIRESTORE_COLLECTIONS, META_GRAPH_API } from './constants';

/** Uygulamanın okuduğu tüm ortam değişkenlerinin strongly-typed şeması. */
export interface AppEnvironment {
  readonly NODE_ENV: 'development' | 'production' | 'test';
  readonly FIREBASE_PROJECT_ID: string;
  readonly FIREBASE_REGION: string;
  readonly META_APP_ID: string;
  readonly META_APP_SECRET: string;
  readonly META_VERIFY_TOKEN: string;
  readonly META_GRAPH_VERSION: string;
  readonly META_ACCESS_TOKEN: string | null;
  readonly LOG_RETENTION_DAYS: number;
  readonly REQUEST_TIMEOUT_MS: number;
  readonly MAX_EVENTS_PER_REQUEST: number;
}

let cached: AppEnvironment | null = null;

/** Zorunlu string okur; yoksa ConfigurationError fırlatır. */
function requireEnv(key: keyof NodeJS.ProcessEnv & string): string {
  const value = process.env[key];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ConfigurationError(`Zorunlu ortam değişkeni eksik: ${key}`, { key });
  }

  return value.trim();
}

/** Opsiyonel string; yoksa null döner. */
function optionalEnv(key: string): string | null {
  const value = process.env[key];

  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Pozitif tam sayı okur; geçersizse fallback değere düşer. */
function numericEnv(key: string, fallback: number, min: number): number {
  const raw = process.env[key];

  if (raw === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed < min) {
    // Bozuk değer sessizce yutulmaz, loglanabilir şekilde fallback'e düşer.
    console.warn(`[config] "${key}" geçersiz (${raw}); ${fallback} kullanılıyor.`);
    return fallback;
  }

  return parsed;
}

/**
 * Doğrulanmış ortam nesnesini döndürür.
 * Sonuç bellekte önbelleklenir (her log'da yeniden okumaya gerek yok).
 */
export function getEnv(): AppEnvironment {
  if (cached !== null) {
    return cached;
  }

  const nodeEnv = process.env.NODE_ENV;

  cached = {
    NODE_ENV:
      nodeEnv === 'production' ? 'production' : nodeEnv === 'test' ? 'test' : 'development',
    FIREBASE_PROJECT_ID: requireEnv('FIREBASE_PROJECT_ID'),
    FIREBASE_REGION: requireEnv('FIREBASE_REGION'),
    META_APP_ID: requireEnv('META_APP_ID'),
    META_APP_SECRET: requireEnv('META_APP_SECRET'),
    META_VERIFY_TOKEN: requireEnv('META_VERIFY_TOKEN'),
    META_GRAPH_VERSION: optionalEnv('META_GRAPH_VERSION') ?? META_GRAPH_API.DEFAULT_VERSION,
    // Uzun ömürlü erişim token'ı: demo/smoke testleri için opsiyonel.
    // Üretimde her hesap `connections` koleksiyonunda kendi token'ını tutar.
    META_ACCESS_TOKEN: optionalEnv('META_ACCESS_TOKEN'),
    LOG_RETENTION_DAYS: numericEnv('LOG_RETENTION_DAYS', 30, 1),
    REQUEST_TIMEOUT_MS: numericEnv('REQUEST_TIMEOUT_MS', 10_000, 1_000),
    MAX_EVENTS_PER_REQUEST: numericEnv('MAX_EVENTS_PER_REQUEST', 50, 1),
  };

  return cached;
}

/** Testlerde önbelleği temizler. */
export function resetEnvCache(): void {
  cached = null;
}

/**
 * Meta Graph API için mutlak URL üretir (endpoint string'leri tek yerden).
 * @param path  Örn. `/{ig-user-id}/messages`
 */
export function graphUrl(path: string, version?: string): string {
  const env = getEnv();
  const apiVersion = version ?? env.META_GRAPH_VERSION;

  return `${META_GRAPH_API.BASE_URL}${apiVersion}${path}`;
}

/** Firestore koleksiyon adlarına tip güvenli erişim. */
export const collections = FIRESTORE_COLLECTIONS;
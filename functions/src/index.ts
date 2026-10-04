/**
 * ============================================================================
 * FUNCTIONS / ENTRY POINT
 * ----------------------------------------------------------------------------
 * Firebase Cloud Functions v2 tanımları.
 *
 * Sorumluluk sınırları:
 *  - Bu dosya SADECE platform bağlama (binding) yapar: hangi URL hangi
 *    controller'a gider, hangi seçeneklerle çalışır.
 *  - İş mantığı YOKTUR (use-case'lerde), HTTP ayrıntısı YOKTUR (adapter'da).
 *
 * DEPLOY KURALLARI:
 *  - runtime: 'nodejs20'
 *  - region: env.FIREBASE_REGION (varsayılan: europe-west1)
 *  - webhook fonksiyonu `region` ile `instance` arasında aynı olmalıdır,
 *    aksi halde Meta imzası doğrulanamaz.
 * ============================================================================
 */

import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';

import { buildContainer } from './container';
import { getEnv } from './config/env';
import { FIRESTORE_COLLECTIONS as C } from './config/constants';
import type { HttpRequest, HttpResponse } from './domain/interfaces/Http';
import { FirestoreLogRepository } from './services/FirestoreLogRepository';
import { isDomainError } from './domain/errors/DomainError';
import { handleNextWebRequest } from './adapters/http/nextWebServer';

// ---------------------------------------------------------------------------
// Global options: tüm fonksiyonlar için ortak ayarlar
// ---------------------------------------------------------------------------
setGlobalOptions({
  region: process.env['FIREBASE_REGION'] ?? 'europe-west1',
  maxInstances: 20,
  memory: '256MiB',
  timeoutSeconds: 60,
  // Secrets Manager kullanılıyorsa otomatik erişim açılır.
  // Secrets: ['META_APP_SECRET', 'META_VERIFY_TOKEN'],
});

// ---------------------------------------------------------------------------
// DI CONTAINER — cold start'ta bir kez kurulur, tüm invokasyonlarda paylaşılır
// ---------------------------------------------------------------------------
const container = buildContainer();
const region = getEnv().FIREBASE_REGION;

/**
 * Firebase `Request` nesnesini domain'in platformdan bağımsız `HttpRequest`
 * arayüzüne çevirir.
 *
 * NÖNEMLİ: `rawBody` parse EDİLMEMİŞ olmalıdır. Firebase Express integration'ı
 * JSON body'yi otomatik parse ederse imza doğrulaması her zaman başarısız olur.
 */
function toDomainRequest(request: { method: string; query: unknown; rawBody: unknown; headers: unknown }): HttpRequest {
  return {
    method: request.method,
    query: (request.query ?? {}) as HttpRequest['query'],
    rawBody: typeof request.rawBody === 'string' ? request.rawBody : safeStringify(request),
    headers: (request.headers ?? {}) as HttpRequest['headers'],
  };
}

/** rawBody yoksa son çare: gövdeyi JSON olarak yeniden stringify et. */
function safeStringify(request: unknown): string {
  try {
    return JSON.stringify(request);
  } catch {
    return '';
  }
}

/**
 * ============================================================================
 * 1) INSTAGRAM WEBHOOK
 * ============================================================================
 * • GET  /api/webhook → Meta challenge doğrulaması
 * • POST /api/webhook → Gelen mesaj/yorum olaylarının işlenmesi
 *
 * Meta Dashboard'da webhook callback URL olarak:
 *   https://<region>-<project>.cloudfunctions.net/api/webhook
 * ============================================================================
 */
export const apiWebhook = onRequest(
  {
    region,
    // Meta, IP doğrulaması için `X-Forwarded-For` gönderir; engellenmez.
    cors: false,
  },
  (request, response): void => {
    container.controllers.webhook.handle(
      toDomainRequest(request as unknown as Parameters<typeof toDomainRequest>[0]),
      response as unknown as HttpResponse,
    );
  },
);

/**
 * ============================================================================
 * 2) OTOMASYON CRUD API
 * ============================================================================
 * • GET    /api/automations        → listele
 * • POST   /api/automations        → oluştur
 * • PATCH  /api/automations/{id}   → aktif/pasif
 * • DELETE /api/automations/{id}   → sil
 * • GET    /api/stats              → dashboard metrikleri
 *
 * `path` alanı URL'in `/api/...` kısmını controller'a `__path` sorgu
 * parametresi olarak taşır (Next.js rewrites ile uyumlu kalması için).
 * ============================================================================
 */
export const apiAutomations = onRequest({ region, cors: true }, (request, response): void => {
  const domainRequest = toDomainRequest(request as unknown as Parameters<typeof toDomainRequest>[0]);

  // Firebase Hosting rewrites yönlendirmesinde `originalUrl` korunur; bu yüzden
  // gerçek endpoint yolunu oradan alırız (fonksiyon URL'si değil).
  // `HttpRequest.query` sözleşmesi `Readonly`'dır → mutation yerine kopyalama.
  const path = sanitizePath(extractPath(request as unknown as { originalUrl?: string; path?: string }));

  container.controllers.automation.handle(
    { ...domainRequest, query: { ...domainRequest.query, __path: path } },
    response as unknown as HttpResponse,
  );
});

/**
 * İstek yolunu ve `/api` önekini temizler.
 * `/api/automations/abc` → `automations/abc`
 * `..` ve benzeri traversal kalıntıları temizlenir (güvenlik).
 */
function extractPath(request: { originalUrl?: string; path?: string }): string {
  const raw = request.originalUrl ?? request.path ?? '';

  // Sorgu dizesini at.
  const withoutQuery = raw.split('?')[0] ?? '';
  const segments = withoutQuery.split('/').filter((segment) => segment.length > 0);

  // İlk segment `api` ise at (controller kendi routing'ini kendi yapar).
  if (segments[0] === 'api') {
    return segments.slice(1).join('/');
  }

  return segments.join('/');
}

/** Başlangıçtaki gereksiz eğik çizgileri ve traversal kalıntılarını temizler. */
function sanitizePath(path: string): string {
  return path.replace(/^\/+|\/+$/g, '').split('..').join('');
}

/**
 * ============================================================================
 * 3) CALLABLE: DASHBOARD İSTATİSTİKLERİ
 * ============================================================================
 * İstemci SDK'sı ile `getDashboardStatsFn({})` çağrılabilir.
 *
 * Callable fonksiyonlarda kimlik doğrulama Cloud Functions tarafından OTOMATİK
 * yapılır (token `request.auth` içinde gelir) → HTTP katmanına hiç uğramadan
 * doğrudan use-case çağrılır (SRP: kimlik doğrulama tek yerde).
 * ============================================================================
 */
export const getDashboardStatsFn = onCall({ region }, async (request): Promise<unknown> => {
  // Guard clause: Anonymous kullanıcı → HttpsError ile 401 döner.
  if (request.auth === undefined || request.auth === null) {
    throw new HttpsError('unauthenticated', 'Oturum açmanız gerekiyor.');
  }

  try {
    const result = await container.useCases.getDashboardStats.execute(request.auth.uid);

    return { ok: true, ...result };
  } catch (error: unknown) {
    logger.error('[callable:getDashboardStats] Hata.', { error: String(error) });

    throw new HttpsError(
      'internal',
      isDomainError(error) && error.expose ? error.message : 'İstatistikler alınamadı.',
    );
  }
});

/**
 * ============================================================================
 * 4) ZAMLANMIŞ GÖREV: LOG TEMİZLEME
 * ============================================================================
 * Cron: her gece 03:00 → `LOG_RETENTION_DAYS` gününden eski logları siler.
 * "Zero hardcoded strings": gün sayısı env'den okunur.
 * ============================================================================
 */
export const purgeOldLogs = onSchedule(
  { schedule: 'every 24 hours', timeZone: 'Europe/Istanbul', region },
  async (): Promise<void> => {
    const repository = new FirestoreLogRepository();
    const days = getEnv().LOG_RETENTION_DAYS;

    try {
      const deleted = await repository.purgeOlderThan(days);
      logger.info('[cron] Eski loglar temizlendi.', { days, deleted });
    } catch (error: unknown) {
      logger.error('[cron] Log temizleme başarısız.', { error: String(error) });
      throw error;
    }
  },
);

/**
 * ============================================================================
 * 5) HEALTH CHECK
 * ============================================================================
 * Cloud Functions'ın gerçekten ayakta olduğunu doğrulamak için.
 * ============================================================================
 */
export const healthCheck = onRequest({ region }, (_request, response): void => {
  response.setHeader('Cache-Control', 'no-store');
  response.status(200).json({
    ok: true,
    service: 'instagram-automation-platform',
    graphApiVersion: getEnv().META_GRAPH_VERSION,
    collections: C,
    runtime: process.version,
  });
});

/**
 * ============================================================================
 * 6) NEXT.JS DASHBOARD (SSR)
 * ============================================================================
 * `firebase.json` hosting yapılandırmasındaki son catch-all rewrite (`"**"`)
 * bu fonksiyona yönlendirilir → dashboard tüm sayfalarıyla servis edilir.
 *
 * Bu fonksiyonun varlığı, Next.js'in Firebase Hosting üzerinde SSR olarak
 * çalışmasını sağlar. Detaylar: `adapters/http/nextWebServer.ts`.
 * ============================================================================
 */
export const web = onRequest(
  {
    region,
    // SSR sayfaları asla cache'lenmemeli: kullanıcıya özel veri içerir.
    invoker: 'public',
  },
  (request, response): void => {
    const domainRequest = toDomainRequest(request as unknown as Parameters<typeof toDomainRequest>[0]);

    handleNextWebRequest(
      {
        ...domainRequest,
        query: {
          ...domainRequest.query,
          // Next.js kendi routing'ini yapabilsin diye ORIJINAL URL verilir.
          __originalUrl:
            (request as unknown as { originalUrl?: string }).originalUrl ?? '/',
        },
      },
      response as unknown as HttpResponse,
    );
  },
);
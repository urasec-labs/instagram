/**
 * ============================================================================
 * ADAPTERS / HTTP / NEXT WEB SERVER
 * ----------------------------------------------------------------------------
 * Next.js dashboard'unu Firebase Hosting üzerinden SSR ile yayınlar.
 *
 * NEDEN VAR?
 * `firebase.json` hosting kurallarında son catch-all rewrite (`"**"`) bir
 * Cloud Function'a yönlendirilir. Bu fonksiyon `next()` sunucusunu ayağa
 * kaldırır ve Next'in ürettiği sayfayı döndürür.
 *
 * Gereksinim: Next.js `output: 'standalone'` ile derlenmiş olmalı ve
 * `.next/standalone` çıktısı `functions/lib/web/standalone` altına kopyalanmalı
 * (bkz. `functions/package.json` → `prepare:web` script'i).
 *
 * Bu dosya bilinçli olarak MİMAL bir adapter katmanıdır: framework detayı
 * burada kalır, iş mantığı burada BULUNMAZ.
 * ============================================================================
 */

import * as path from 'node:path';
import { existsSync } from 'node:fs';

import type { HttpRequest, HttpResponse } from '../../domain/interfaces/Http';

/** Next sunucusunun beklenen kök dizini. */
const STANDALONE_DIR = path.join(__dirname, '..', '..', 'web', 'standalone');

/**
 * Next handler'ı yükler.
 * Next 13+ `next()` çağrısı build dizinine göre çalışır; bu yüzden `cwd`
 * doğru ayarlanmalıdır.
 */
async function loadNextHandler(): Promise<
  (request: NodeJS.Dict<unknown>, response: unknown) => Promise<void>
> {
  // Guard: standalone çıktı yoksa anlaşılır bir hata ver (sessiz 500 değil).
  if (!existsSync(STANDALONE_DIR)) {
    throw new Error(
      `Next.js standalone çıktısı bulunamadı: ${STANDALONE_DIR}\n` +
        'Düzeltme: kök dizinde `npm run build && npm run prepare:web` çalıştırın.',
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nextModule = await import('next') as unknown as {
    default: (options: { dev: boolean; dir: string }) => {
      prepare(): Promise<void>;
      getRequestHandler(): (req: NodeJS.Dict<unknown>, res: unknown) => Promise<void>;
    };
  };

  const app = nextModule.default({ dev: false, dir: STANDALONE_DIR });

  await app.prepare();

  return app.getRequestHandler();
}

/**
 * Next handler'ı süreç ömrü boyunca saklanır.
 * `prepare()` her istekte çağırmak ciddi performans maliyetindedir.
 */
let cachedHandler: Awaited<ReturnType<typeof loadNextHandler>> | null = null;

async function getHandler(): Promise<Awaited<ReturnType<typeof loadNextHandler>>> {
  if (cachedHandler !== null) {
    return cachedHandler;
  }

  cachedHandler = await loadNextHandler();

  return cachedHandler;
}

/**
 * Platformdan bağımsız `HttpRequest` → Next'in beklediği `req` nesnesi.
 *
 * KRİTİK: Gövde parse EDİLMEZ. Next, `req.url` üzerinden kendi routing'ini
 * yapar ve `req` nesnesini doğrudan Node HTTP nesnesi olarak kullanır.
 */
function toNextRequest(request: HttpRequest): NodeJS.Dict<unknown> {
  // `/api/webhook` gibi Next'e ait olmayan yollar zaten ayrı fonksiyonlara
  // rewrite edilir; yine de 404 dönebilmesi için URL'yi olduğu gibi geçiriyoruz.
  const url = request.query['__originalUrl'];

  return {
    url: typeof url === 'string' ? url : '/',
    method: request.method,
    headers: request.headers,
    query: request.query,
    // Next'in `bodyParser` devre dışı bırakılmış olmalıdır; biz gövdeyi
    // doğrudan `req.body` olarak geçiriyoruz.
    body: request.rawBody.length > 0 ? request.rawBody : undefined,
  } as unknown as NodeJS.Dict<unknown>;
}

/**
 * Firebase `onRequest` handler'ı.
 * Dashboard'un TÜM sayfaları bu fonksiyondan servis edilir.
 */
export function handleNextWebRequest(request: HttpRequest, response: HttpResponse): void {
  void (async (): Promise<void> => {
    try {
      const handler = await getHandler();

      await handler(toNextRequest(request), response);
    } catch (error: unknown) {
      // SSR katmanında hata → kullanıcıya genel mesaj, detay loga.
      console.error('[web] Next.js handler hatası.', error);

      response.setHeader('Cache-Control', 'no-store');
      response.status(500).json({
        ok: false,
        error: {
          code: 'WEB_RENDER_ERROR',
          message: 'Sayfa yüklenirken bir hata oluştu.',
        },
      });
    }
  })();
}
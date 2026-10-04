/**
 * ============================================================================
 * DOMAIN / INTERFACES / HTTP REQUEST & RESPONSE (ADAPTER SÖZLEŞMESİ)
 * ----------------------------------------------------------------------------
 * Controller katmanı, platformun (Firebase Functions / Express) HTTP tipine
 * BAĞIMLI OLMAMALIDIR. Bu iki ince arayüz sayesinde controller'lar hem
 * Cloud Functions `Request`/`Response` hem de Express `Request`/`Response`
 * ile çalışabilir; testlerde de düz obje (mock) kullanılabilir.
 * ============================================================================
 */

/** Platformdan bağımsız, okunabilir istek. */
export interface HttpRequest {
  readonly method: string;
  readonly query: Readonly<Record<string, string | string[] | undefined>>;
  readonly rawBody: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
}

/** Platformdan bağımsız yazılabilir yanıt. */
export interface HttpResponse {
  status(code: number): HttpResponse;
  json(body: unknown): void;
  send(body: string): void;
  setHeader(name: string, value: string): void;
}

/** `query` alanından güvenli string okuma yardımcısı. */
export function readQueryParam(
  request: HttpRequest,
  key: string,
): string | null {
  const value = request.query[key];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === 'string' ? value : null;
}

/** Header okuma yardımcısı (header adları Node'da küçük harfe iner). */
export function readHeader(request: HttpRequest, name: string): string | null {
  const value = request.headers[name.toLowerCase()];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === 'string' ? value : null;
}
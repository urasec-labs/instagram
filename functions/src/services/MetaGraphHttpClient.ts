/**
 * ============================================================================
 * SERVICES / META GRAPH HTTP CLIENT
 * ----------------------------------------------------------------------------
 * SRP: HTTP taşıması (transport) bu sınıfın tek işidir.
 * - URL inşa eder, Authorization header'ı ekler, zaman aşımı uygular.
 * - Hata gövdesini parse edip `MetaApiError` fırlatır.
 *
 * `MetaInstagramService` yalnızca iş kurallarını bilir; fetch, header ve
 * hata ayrıntıları burada kalır.
 * ============================================================================
 */

import { MetaApiError } from '../domain/errors/DomainError';
import { HTTP_HEADERS, HTTP_POLICY } from '../config/constants';
import { getEnv, graphUrl } from '../config/env';
import type { ILogger } from './Logger';

/** Meta'nın hata gövdesindeki tek alanlı yapı. */
interface MetaErrorPayload {
  readonly error?: {
    readonly message?: string;
    readonly type?: string;
    readonly code?: number;
    readonly subcode?: number;
    readonly error_subcode?: number;
    readonly fbtrace_id?: string;
  };
}

/** İstek parametreleri. */
export interface GraphRequest {
  /** URL yolu, örn. `/${igUserId}/messages` */
  readonly path: string;
  /** Graph API sürümü (opsiyonel, config'ten gelir). */
  readonly version?: string;
  /** Token. Verilmezse env'deki META_ACCESS_TOKEN kullanılır. */
  readonly accessToken?: string | null;
  /** JSON gövde. */
  readonly body?: Readonly<Record<string, unknown>>;
  /** Form-encoded gövde (Instagram READ_RECEIPTS gibi). */
  readonly formBody?: Readonly<Record<string, string>>;
  /** HTTP metodu. */
  readonly method?: 'GET' | 'POST' | 'DELETE';
  /** Sorgu parametreleri. */
  readonly query?: Readonly<Record<string, string | number>>;
}

/**
 * Meta Graph API için ince, tip güvenli HTTP istemcisi.
 * Node 20'nin yerleşik `fetch` implementasyonunu kullanır (ek bağımlılık yok).
 */
export class MetaGraphHttpClient {
  private readonly timeoutMs: number;

  public constructor(private readonly logger: ILogger) {
    this.timeoutMs = getEnv().REQUEST_TIMEOUT_MS;
  }

  /**
   * Graph API isteği yürütür ve parse edilmiş gövdeyi döndürür.
   * @throws MetaApiError 4xx/5xx ve ağ hatalarında
   */
  public async send<TResponse>(request: GraphRequest): Promise<TResponse> {
    const env = getEnv();
    const token = request.accessToken ?? env.META_ACCESS_TOKEN;

    // Guard clause: kimlik doğrulamasız Meta isteği her zaman başarısızdır.
    if (typeof token !== 'string' || token.length === 0) {
      throw new MetaApiError({
        message: 'Meta Graph API erişim token\'ı bulunamadı.',
        httpStatus: 401,
        context: { path: request.path },
      });
    }

    const url = this.buildUrl(request);

    // Timeout, platformun varsayılanına bırakılırsa request yasıp kalır.
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: request.method ?? 'POST',
        headers: this.buildHeaders(request, token),
        body: this.buildBody(request),
        signal: abortController.signal,
      });

      return await this.handleResponse<TResponse>(response, url);
    } catch (error: unknown) {
      // Zaman aşımı ve ağ hataları da MetaApiError olarak normalize edilir
      // → üst katmanlar tek tip hata sözleşmesiyle çalışır.
      throw this.normalizeTransportError(error, url);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  /** Sorgu dizesi + erişim token'ı ile tam URL kurar. */
  private buildUrl(request: GraphRequest): string {
    const base = graphUrl(request.path, request.version);
    const params = new URLSearchParams({ access_token: this.resolveToken(request) ?? '' });

    if (request.query !== undefined) {
      for (const [key, value] of Object.entries(request.query)) {
        params.set(key, String(value));
      }
    }

    return `${base}?${params.toString()}`;
  }

  private resolveToken(request: GraphRequest): string | null {
    return request.accessToken ?? getEnv().META_ACCESS_TOKEN ?? null;
  }

  private buildHeaders(
    request: GraphRequest,
    token: string,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };

    if (request.body !== undefined) {
      headers[HTTP_HEADERS.CONTENT_TYPE] = HTTP_POLICY.JSON_CONTENT_TYPE;
    }

    return headers;
  }

  private buildBody(request: GraphRequest): string | undefined {
    if (request.body !== undefined) {
      return JSON.stringify(request.body);
    }

    if (request.formBody !== undefined) {
      return new URLSearchParams(request.formBody).toString();
    }

    return undefined;
  }

  /** HTTP yanıtını domain hatasına veya parse edilmiş gövdeye çevirir. */
  private async handleResponse<TResponse>(response: Response, url: string): Promise<TResponse> {
    const rawText = await response.text();
    const parsed = this.safeJsonParse(rawText);

    if (response.ok) {
      return parsed as TResponse;
    }

    const errorPayload = (parsed as MetaErrorPayload | null)?.error;

    this.logger.error('Meta Graph API hata yanıtı döndü.', {
      status: response.status,
      url: url.replace(/access_token=[^&]+/, 'access_token=***'), // token sızdırma koruması
      metaCode: errorPayload?.code ?? null,
    });

    throw new MetaApiError({
      message: errorPayload?.message ?? `Meta Graph API ${response.status} döndü.`,
      httpStatus: response.status,
      metaErrorCode: errorPayload?.code ?? null,
      metaErrorSubcode: errorPayload?.error_subcode ?? errorPayload?.subcode ?? null,
      context: { path: url.split('?')[0] ?? url },
    });
  }

  /** JSON parse başarısızsa null döner (sessizce undefined'a düşmez). */
  private safeJsonParse(rawText: string): unknown {
    if (rawText.trim().length === 0) {
      return null;
    }

    try {
      return JSON.parse(rawText) as unknown;
    } catch {
      return { raw: rawText };
    }
  }

  /** Timeout / ağ hatalarını MetaApiError'a normalize eder. */
  private normalizeTransportError(error: unknown, url: string): MetaApiError {
    if (error instanceof MetaApiError) {
      return error;
    }

    const isAbort = error instanceof Error && error.name === 'AbortError';

    return new MetaApiError({
      message: isAbort
        ? `Meta Graph API isteği zaman aşımına uğradı (${this.timeoutMs}ms).`
        : `Meta Graph API'ye ulaşılamadı: ${error instanceof Error ? error.message : String(error)}`,
      httpStatus: isAbort ? 504 : 502,
      context: { path: url.split('?')[0] ?? url },
    });
  }
}
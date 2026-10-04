/**
 * ============================================================================
 * ADAPTERS / HTTP / ERROR MAPPER
 * ----------------------------------------------------------------------------
 * Domain hatalarını HTTP durum kodlarına çevirir.
 *
 * SRP: "hata → HTTP" eşlemesi TEK yerde. Controller'lar try/catch kalabalığı
 * yazmaz, sadece `respondWithError(response, error)` çağırır.
 *
 * GÜVENLİK: `DomainError.expose === false` olan hataların mesajı ASLA
 * istemciye sızdırılmaz → stack trace / iç yapı sızıntısı engellenir.
 * ============================================================================
 */

import {
  DomainError,
  MetaApiError,
  UnexpectedError,
  isDomainError,
} from '../../domain/errors/DomainError';
import { ERROR_MESSAGES } from '../../domain/errors/ErrorMessages';
import type { HttpResponse } from '../../domain/interfaces/Http';
import type { ILogger } from '../../services/Logger';

/** İstemciye gönderilecek standart hata gövdesi. */
export interface ErrorResponseBody {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

/** Domain hata sınıfı → HTTP durum kodu eşlemesi. */
function resolveStatus(error: DomainError): number {
  if (error instanceof MetaApiError) {
    // Meta 5xx/429 → 502 (Bad Gateway): hata bizim değil, upstream'de.
    return error.httpStatus === 429 ? 429 : 502;
  }

  switch (error.code) {
    case 'VALIDATION_ERROR':
      return 422;
    case 'AUTOMATION_NOT_FOUND':
    case 'ACCOUNT_NOT_LINKED':
      return 404;
    case 'INVALID_VERIFICATION_TOKEN':
      return 403;
    case 'INVALID_SIGNATURE':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'UNAUTHORIZED':
      return 401;
    case 'CONFIGURATION_ERROR':
    case 'UNEXPECTED_ERROR':
      return 500;
    default:
      return 500;
  }
}

/**
 * Hata nesnesini HTTP yanıtına dönüştürür.
 * @returns Yazılmış HTTP durum kodu (testlerde doğrulamak için)
 */
export function respondWithError(
  response: HttpResponse,
  error: unknown,
  logger: ILogger,
  context: Record<string, unknown> = {},
): number {
  // Bilinmeyen hatalar `UnexpectedError`'a sarılır → istemciye tek tip, güvenli
  // mesaj döner ve logger tek bir formatta çalışır (Strict Error Handling).
  const normalized: DomainError = isDomainError(error) ? error : new UnexpectedError(error);

  const status = resolveStatus(normalized);

  // 5xx ve 4xx'ün tamamı sunucu tarafında kaydedilir (izlenebilirlik).
  logger.error('HTTP isteği başarısız.', {
    code: normalized.code,
    status,
    message: normalized.message,
    ...context,
  });

  // Yalnızca `expose === true` olan domain hatalarında gerçek mesaj gösterilir.
  const clientMessage = normalized.expose
    ? normalized.message
    : ERROR_MESSAGES.INTERNAL;

  response.setHeader('Cache-Control', 'no-store');
  response.status(status).json({
    ok: false,
    error: {
      code: normalized.code,
      message: clientMessage,
    },
  } satisfies ErrorResponseBody);

  return status;
}

/** Başarılı JSON yanıtı yazmak için kısa yardımcı. */
export function respondWithJson(
  response: HttpResponse,
  status: number,
  body: unknown,
): void {
  response.setHeader('Cache-Control', 'no-store');
  response.status(status).json(body);
}
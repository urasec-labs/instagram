/**
 * ============================================================================
 * SERVICES / FIREBASE TOKEN VERIFIER
 * ----------------------------------------------------------------------------
 * `Authorization: Bearer <Firebase ID Token>` başlığını doğrular ve UID döner.
 *
 * Sorumluluk sınırı (SRP): Token doğrulama + kullanıcı kimliği çözümü.
 * İş yetkilendirme kararı use-case'lerde (ownerId karşılaştırması) verilir.
 * ============================================================================
 */

import { getAuth } from 'firebase-admin/auth';

import { getAdminApp } from '../config/firebaseAdmin';
import { ERROR_MESSAGES } from '../domain/errors/ErrorMessages';
import { UnauthorizedError } from '../domain/errors/DomainError';
import type { HttpRequest } from '../domain/interfaces/Http';
import type { ILogger } from './Logger';

/** Port: HTTP isteğinden doğrulanmış kullanıcı kimliği çıkarır. */
export interface ITokenVerifier {
  /** @returns doğrulanmış Firebase UID
   *  @throws UnauthorizedError başlık eksik/geçersiz/token süresi dolmuşsa
   */
  verify(request: HttpRequest): Promise<string>;
}

const AUTH_HEADER = 'authorization';
const BEARER_PREFIX = 'bearer ';

export class FirebaseTokenVerifier implements ITokenVerifier {
  public constructor(private readonly logger: ILogger) {}

  public async verify(request: HttpRequest): Promise<string> {
    const token = this.extractBearerToken(request);

    // Guard clause: başlık yoksa en erken noktada kes.
    if (token === null) {
      throw new UnauthorizedError(ERROR_MESSAGES.UNAUTHORIZED);
    }

    try {
      // `checkRevoked = false` → her istekte revocation kontrolüne gitmez
      // (daha hızlı). Token zaten expire olduğunda reddedilir.
      const decoded = await getAuth(getAdminApp()).verifyIdToken(token, false);

      return decoded.uid;
    } catch (error: unknown) {
      // Token bilgisi LOGA DÖKÜLMEZ (sadece hata sınıfı).
      this.logger.warn('ID token doğrulanamadı.', {
        error: error instanceof Error ? error.message : String(error),
      });

      throw new UnauthorizedError(ERROR_MESSAGES.UNAUTHORIZED);
    }
  }

  /** `Authorization: Bearer xyz` → `xyz` (yoksa null) */
  private extractBearerToken(request: HttpRequest): string | null {
    const raw = request.headers[AUTH_HEADER];
    const header = Array.isArray(raw) ? raw[0] : raw;

    if (typeof header !== 'string') {
      return null;
    }

    // Header adları Node'da küçük harfe iner ama Express farklı olabilir.
    const value = header.trim().toLowerCase().startsWith(BEARER_PREFIX)
      ? header.trim().slice(BEARER_PREFIX.length)
      : null;

    return value !== null && value.length > 0 ? value : null;
  }
}
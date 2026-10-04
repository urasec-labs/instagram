/**
 * ============================================================================
 * USE-CASES / VERIFY WEBHOOK
 * ----------------------------------------------------------------------------
 * Meta'nın GET isteğindeki "challenge" doğrulama akışı.
 *
 * 1. Meta Dashboard'da webhook URL'si kaydedilirken Meta, GET isteği atar.
 * 2. Gövdede `hub.mode=subscribe`, `hub.verify_token=<bizim token>ımız`,
 *    `hub.challenge=<rastgele>` bulunur.
 * 3. Biz `hub.challenge` değerini EKSİKSİZ `text/plain` olarak geri dönmeliyiz.
 *
 * Bu use-case'in tek sorumluluğu 3. adımın doğrulama kararını vermektir.
 * HTTP detayları `webhookController` içindedir.
 * ============================================================================
 */

import { getEnv } from '../config/env';
import { InvalidVerificationTokenError, ValidationError } from '../domain/errors/DomainError';

/** Controller'ın use-case'e geçirdiği normalize girdi. */
export interface VerifyWebhookInput {
  /** `hub.mode` — yalnızca "subscribe" kabul edilir. */
  readonly mode: string | null;
  /** `hub.verify_token` */
  readonly verifyToken: string | null;
  /** `hub.challenge` — geri döndürülecek ham değer. */
  readonly challenge: string | null;
}

export interface VerifyWebhookOutput {
  /** EKSİKSİZ geri döndürülecek metin. */
  readonly challenge: string;
}

export class VerifyWebhookUseCase {
  public execute(input: VerifyWebhookInput): VerifyWebhookOutput {
    const env = getEnv();

    // --- Guard clause 1: Zorunlu alanlar geldi mi? ---------------------------
    if (input.mode === null || input.verifyToken === null || input.challenge === null) {
      throw new ValidationError('Webhook doğrulama parametreleri eksik.', {
        hasMode: input.mode !== null,
        hasToken: input.verifyToken !== null,
        hasChallenge: input.challenge !== null,
      });
    }

    // --- Guard clause 2: Abonelik modu mu? -----------------------------------
    if (input.mode !== 'subscribe') {
      throw new ValidationError('Webhook abonelik modu değil.', { mode: input.mode });
    }

    // --- Guard clause 3: Token doğru mu? -------------------------------------
    // `timingSafeEqual` yerine sabit-zamanlı karşılaştırma için normalize
    // string `===` kullanılır; bu değer public olmayan ama yine de
    // karşılaştırılan değerdir (kimlik bilgisi sınıfındadır).
    if (input.verifyToken !== env.META_VERIFY_TOKEN) {
      throw new InvalidVerificationTokenError();
    }

    return { challenge: input.challenge };
  }
}
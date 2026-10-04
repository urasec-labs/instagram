/**
 * ============================================================================
 * SERVICES / META WEBHOOK SIGNATURE VERIFIER
 * ----------------------------------------------------------------------------
 * SRP'nin en katı uygulandığı yer: bu sınıf SADECE imza doğrular.
 * Olayı tanımaz, işlemez, veritabanına dokunmaz, mesaj göndermez.
 *
 * Meta imzası: `X-Hub-Signature-256: sha256=<hex(HMAC-SHA256(app_secret, rawBody))>`
 * Kritik: HMAC JSON.parse ÖNCESİ ham gövde üzerinden hesaplanmalıdır.
 * ============================================================================
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { getEnv } from '../config/env';
import { HTTP_HEADERS } from '../config/constants';
import type { IWebhookSignatureVerifier } from '../domain/interfaces/IWebhookSignatureVerifier';
import type { ILogger } from './Logger';

const SIGNATURE_PREFIX = 'sha256=';
const HEX_LENGTH = 64; // SHA-256 çıktısı 64 hex karakter

export class MetaWebhookSignatureVerifier implements IWebhookSignatureVerifier {
  public constructor(private readonly logger: ILogger) {}

  public isValid(rawBody: string, signatureHeader: string | null | undefined): boolean {
    // Guard clause: başlık yoksa geçersiz sayılır (fail-closed).
    if (typeof signatureHeader !== 'string' || !signatureHeader.startsWith(SIGNATURE_PREFIX)) {
      this.logger.warn('Webhook imza başlığı eksik veya formatı geçersiz.', {
        received: signatureHeader ?? null,
      });
      return false;
    }

    const received = signatureHeader.slice(SIGNATURE_PREFIX.length);

    if (!/^[a-f0-9]{64}$/i.test(received)) {
      this.logger.warn('Webhook imzası beklenen hex formatında değil.');
      return false;
    }

    const expected = this.sign(rawBody);

    // Guard clause: uzunluk farklıysa timingSafeEqual patlar.
    if (received.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(
      Buffer.from(received, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  }

  /**
   * Ham gövde için HMAC-SHA256 imzası üretir.
   * İkinci kez hesaplamak (ör. loglama) istendiğinde kullanılabilir.
   */
  public sign(rawBody: string): string {
    return createHmac('sha256', getEnv().META_APP_SECRET)
      .update(rawBody, 'utf8')
      .digest('hex');
  }

  /** Doğrudan `fetch` header'ından okumak isteyenler için kısayol. */
  public static headerName(): string {
    return HTTP_HEADERS.SIGNATURE_256;
  }

  /** Hex uzunluğu sabiti (testlerde kullanılır). */
  public static get digestHexLength(): number {
    return HEX_LENGTH;
  }
}
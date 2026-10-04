/**
 * ============================================================================
 * ADAPTERS / HTTP / WEBHOOK CONTROLLER
 * ----------------------------------------------------------------------------
 * Meta Instagram webhook endpoint'i — HTTP ADAPTÖRÜ (Controller).
 *
 * Sorumlulukleri (sadece bunlar):
 *   1. HTTP metodunu yönlendirmek (GET → doğrulama, POST → işleme)
 *   2. Query/header'ı okumak ve use-case'e DÜZ NESNE olarak geçirmek
 *   3. Use-case çıktısını HTTP'ye yazmak
 *   4. Hataları errorMapper ile HTTP'ye çevirmek
 *
 * İÇİNDE OLMAYANLAR (iş mantığı): token doğrulama, imza hesaplama, keyword
 * eşleştirme, mesaj gönderme — bunların hepsi use-case / domain katmanında.
 * ============================================================================
 */

import { HTTP_HEADERS, HTTP_POLICY, META_WEBHOOK_FIELDS as F } from '../../config/constants';
import { InvalidSignatureError } from '../../domain/errors/DomainError';
import {
  readHeader,
  readQueryParam,
  type HttpRequest,
  type HttpResponse,
} from '../../domain/interfaces/Http';
import type { IWebhookSignatureVerifier } from '../../domain/interfaces/IWebhookSignatureVerifier';
import type {
  HandleWebhookEventUseCase,
  HandleWebhookEventInput,
} from '../../use-cases/HandleWebhookEvent';
import type { VerifyWebhookUseCase } from '../../use-cases/VerifyWebhook';
import type { ILogger } from '../../services/Logger';
import { respondWithError, respondWithJson } from './errorMapper';

/** Controller'ın ihtiyaç duyduğu use-case'ler (DI ile enjekte edilir). */
export interface WebhookControllerDependencies {
  readonly verifyWebhook: VerifyWebhookUseCase;
  readonly handleWebhookEvent: HandleWebhookEventUseCase;
  readonly signatureVerifier: IWebhookSignatureVerifier;
  readonly logger: ILogger;
}

export class WebhookController {
  public constructor(private readonly deps: WebhookControllerDependencies) {}

  /**
   * Tek giriş noktası. Express ve Firebase Functions bu tek metodu çağırır.
   * Metod yönlendirmesi burada yapılır (route tanımı dosyalara dağılmaz).
   */
  public handle(request: HttpRequest, response: HttpResponse): void {
    const method = request.method.toUpperCase();

    // Guard clause: sadece GET ve POST desteklenir.
    if (method !== 'GET' && method !== 'POST') {
      response.setHeader('Allow', 'GET, POST');
      response.status(405).json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Yalnızca GET ve POST desteklenir.' } });
      return;
    }

    if (method === 'GET') {
      this.handleVerification(request, response);
      return;
    }

    this.handleEvent(request, response);
  }

  /**
   * GET /api/webhook → Meta challenge doğrulaması.
   *
   * Meta, `hub.challenge` değerini EKSİKSİZ ve `text/plain` içerik tipiyle
   * yanıtlamamızı bekler. Bu yüzden JSON değil, düz metin gönderilir.
   */
  private handleVerification(request: HttpRequest, response: HttpResponse): void {
    try {
      const result = this.deps.verifyWebhook.execute({
        mode: readQueryParam(request, F.VERIFY_MODE),
        verifyToken: readQueryParam(request, F.VERIFY_TOKEN),
        challenge: readQueryParam(request, F.CHALLENGE),
      });

      this.deps.logger.info('Meta webhook doğrulaması başarılı.');

      response.setHeader('Content-Type', HTTP_POLICY.TEXT_CONTENT_TYPE);
      response.setHeader('Cache-Control', HTTP_POLICY.NO_STORE);
      response.status(200).send(result.challenge);
    } catch (error: unknown) {
      respondWithError(response, error, this.deps.logger, { stage: 'webhook.verify' });
    }
  }

  /**
   * POST /api/webhook → Gelen olayların işlenmesi.
   *
   * Kritik davranış: Meta'ya daima HTTP 200 döneriz.
   *  - Doğrulama hatası → 401 (Meta bunu retry etmez)
   *  - İşleme hatası  → use-case içinde izole edilir, yine 200 dönülür
   * Böylece Meta'nın 5 kez retry mekanizması (aynı mesajı 5 kez gönderme)
   * kullanıcıya 5 kopya DM olarak yansımaz.
   */
  private handleEvent(request: HttpRequest, response: HttpResponse): void {
    // --- Adım 1: İmza doğrulama --------------------------------------------
    // Bu, mesaj işlemeden TAMAMEN AYRIDIR (SRP): controller yalnızca
    // "imza doğru mu?" sorusunu sorar, hesaplamayı servise bırakır.
    const signature = readHeader(request, HTTP_HEADERS.SIGNATURE_256);

    if (!this.deps.signatureVerifier.isValid(request.rawBody, signature)) {
      respondWithError(
        response,
        new InvalidSignatureError(),
        this.deps.logger,
        { stage: 'webhook.signature' },
      );
      return;
    }

    // --- Adım 2: Olayları işle ----------------------------------------------
    void this.processEvents(request, response);
  }

  /**
   * Asıl işleme. `HandleWebhookEvent` kendi içinde hata izolasyonu yapar;
   * burada sadece sonucu HTTP'ye çeviriyoruz.
   */
  private async processEvents(request: HttpRequest, response: HttpResponse): Promise<void> {
    try {
      const input: HandleWebhookEventInput = { rawBody: request.rawBody };
      const result = await this.deps.handleWebhookEvent.execute(input);

      respondWithJson(response, 200, { ok: true, ...result.summary, results: result.results });
    } catch (error: unknown) {
      // Buraya düşmek, use-case'in beklenmedik bir şekilde patlaması demektir.
      // Yine de Meta'ya 200 dönmeyi tercih ederiz; detay loglanır.
      this.deps.logger.error('Webhook işleme hatası.', { stage: 'webhook.process' });

      respondWithError(response, error, this.deps.logger, { stage: 'webhook.process' });
    }
  }
}
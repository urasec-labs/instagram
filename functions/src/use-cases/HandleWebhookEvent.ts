/**
 * ============================================================================
 * USE-CASES / HANDLE WEBHOOK EVENT
 * ----------------------------------------------------------------------------
 * İŞ AKIŞININ ORTAĞI ve ORCHESTRATOR'ı.
 *
 * Akış (tek bir olay için):
 *   1. Ham gövde → normalize olaylara ayrıştır   (IPayloadParser)
 *   2. Olayın platform tarafından desteklendiğini doğrula (IMessagingService)
 *   3. Hesabın hangi kullanıcıya ait olduğunu bul  (IAccountRepository)
 *   4. Sadece AKTİF otomasyonları getir            (IAutomationRepository)
 *   5. Kelime eşleştir                             (domain/KeywordMatcher)
 *   6. Şablonu render et + mesajı gönder          (IMessagingService)
 *   7. Sonucu log'a yaz                            (ILogRepository, ASENKRON)
 *
 * ── SOLID NOTLARI ───────────────────────────────────────────────────────────
 * SRP : Use-case bir "orkestratör"dür; eşleştirme/şablon/kural işleri
 *       domain fonksiyonlarına devredilmiştir.
 * OCP : Hangi servis kullanılacağına `supports()` üzerinden karar verilir;
 *       WhatsApp/Telegram eklendiğinde bu dosya değişmez.
 * DIP : Somut sınıflar değil, portlar (`I*Repository`) inject edilir.
 * ───────────────────────────────────────────────────────────────────────────
 * ============================================================================
 */

import { getEnv } from '../config/env';
import { AutomationTrigger, normalizeText, type Automation } from '../domain/entities/Automation';
import {
  InboundEventType,
  LogStatus,
  MessageDirection,
  SocialPlatform,
  type AppendLogInput,
  type InboundEvent,
} from '../domain/entities/Log';
import {
  isDomainError,
  MetaApiError,
  UnexpectedError,
} from '../domain/errors/DomainError';
import type { IAccountRepository } from '../domain/interfaces/IAccountRepository';
import type { IAutomationRepository } from '../domain/interfaces/IAutomationRepository';
import type { ILogRepository } from '../domain/interfaces/ILogRepository';
import type { IMessagingService, SendMessageResult } from '../domain/interfaces/IMessagingService';
import type { IPayloadParser } from '../domain/interfaces/IPayloadParser';
import {
  renderTemplate,
  selectMatchingAutomation,
  type KeywordMatch,
} from '../domain/matchers/KeywordMatcher';
import type { ILogger } from '../services/Logger';

/** Use-case girdisi. */
export interface HandleWebhookEventInput {
  /** JSON.parse EDİLMEMİŞ gövde (imza doğrulaması ve ayrıştırma burada yapılır). */
  readonly rawBody: string;
}

/** Tek bir olayın işlenmesinin sonucu (loglama ve test için). */
export interface ProcessedEventResult {
  readonly eventId: string;
  readonly outcome: 'REPLIED' | 'IGNORED_NO_KEYWORD' | 'IGNORED_EMPTY' | 'IGNORED_UNSUPPORTED' | 'FAILED';
  readonly matchedKeyword: string | null;
  readonly automationId: string | null;
}

export interface HandleWebhookEventOutput {
  readonly results: readonly ProcessedEventResult[];
  /** HTTP 200 dönebilmek için özet sayaçlar (Meta retry'ını tetiklemesin). */
  readonly summary: {
    total: number;
    replied: number;
    ignored: number;
    failed: number;
  };
}

export class HandleWebhookEventUseCase {
  /**
   * @param messagingService'ler çoklu platform desteği için dizi olarak verilir;
   *                     ileride WhatsApp/Telegram servisi eklemek tek satırlık
   *                     bir değişikliktir (OCP).
   */
  public constructor(
    private readonly parser: IPayloadParser,
    private readonly accounts: IAccountRepository,
    private readonly automations: IAutomationRepository,
    private readonly logs: ILogRepository,
    private readonly messagingServices: readonly IMessagingService[],
    private readonly logger: ILogger,
  ) {}

  public async execute(input: HandleWebhookEventInput): Promise<HandleWebhookEventOutput> {
    const events = this.parser.parse(input.rawBody);
    const maxEvents = getEnv().MAX_EVENTS_PER_REQUEST;

    // Guard clause: payload'da olay yoksa normal durumdur (200 dönmeliyiz).
    if (events.length === 0) {
      this.logger.debug('Webhook içinde işlenebilir olay bulunamadı.');
      return { results: [], summary: { total: 0, replied: 0, ignored: 0, failed: 0 } };
    }

    // Meta tek seferde çok sayıda olay gönderebilir; bellek koruması için
    // işlenen olay sayısı sınırlanır.
    const queue = events.slice(0, maxEvents);

    if (events.length > maxEvents) {
      this.logger.warn('Olay sayısı sınırı aşıldı, kısmi işleme yapılıyor.', {
        total: events.length,
        processed: maxEvents,
      });
    }

    const results: ProcessedEventResult[] = [];

    // SIRAYLI işleme bilinçli bir tercihtir: aynı kullanıcıdan gelen mesajlarda
    // sıra korunur (yanlış cevap/selam sırası gibi durumlar oluşmaz).
    for (const event of queue) {
      results.push(await this.processEventSafely(event));
    }

    return {
      results,
      summary: this.summarize(results),
    };
  }

  /**
   * TEK OLAYI İŞLE — Hata izolasyonu burada.
   *
   * Neden var? Meta, HTTP 200 dönmediğimizde isteği 5 kez yeniden dener.
   * Tek bir olayın patlaması, aynı payload'daki diğer mesajların kaybolmasına
   * yol açmamalıdır. Bu yüzden hatalar YUTULMAZ, yakalanıp loglanır ve
   * istemciye 200 döner.
   */
  private async processEventSafely(event: InboundEvent): Promise<ProcessedEventResult> {
    try {
      return await this.processEvent(event);
    } catch (error: unknown) {
      this.logger.error('Webhook olayı işlenirken hata oluştu.', {
        eventId: event.externalEventId,
        type: event.type,
        accountId: event.accountId,
        error: isDomainError(error) ? error.toJSON() : String(error),
      });

      return {
        eventId: event.externalEventId,
        outcome: 'FAILED',
        matchedKeyword: null,
        automationId: null,
      };
    }
  }

  /** Olayın gerçek işlenmesi — burada hata YUTULMAZ. */
  private async processEvent(event: InboundEvent): Promise<ProcessedEventResult> {
    // --- Adım 0: Desteklenen olay mı? --------------------------------------
    if (!this.isSupportedEvent(event)) {
      return this.skip(event, 'IGNORED_UNSUPPORTED');
    }

    // --- Adım 1: Metin normalize -------------------------------------------
    const normalizedText = normalizeText(event.rawText);

    // Attachment (fotoğraf/sticker) ve boş metinli mesajlar işlenmez.
    if (normalizedText.length === 0) {
      return this.skip(event, 'IGNORED_EMPTY');
    }

    // --- Adım 2: Hesabı çöz --------------------------------------------------
    const connection = await this.accounts.findByAccountId(event.accountId);

    // --- Adım 3: Aktif otomasyonları getir ----------------------------------
    const trigger = this.toTrigger(event.type);
    const automations = await this.automations.findTriggerable(connection.ownerId, trigger);

    // --- Adım 4: Kelime eşleştir -------------------------------------------
    const now = new Date();
    const match = selectMatchingAutomation(automations, event.rawText, event.senderUsername, now);

    if (match === null) {
      // Gelen mesajı "IGNORED" olarak kaydet: kullanıcı dashboard'da
      // hangi kelimelerin kaçırıldığını görebilsin.
      this.appendLogSafely({
        ownerId: connection.ownerId,
        automationId: null,
        platform: this.defaultPlatform(),
        direction: MessageDirection.INBOUND,
        eventType: event.type,
        status: LogStatus.IGNORED,
        matchedKeyword: null,
        recipient: event.senderUsername ?? event.senderId,
        content: event.rawText,
        externalMessageId: null,
        errorMessage: null,
        latencyMs: null,
        now,
      });

      return {
        eventId: event.externalEventId,
        outcome: 'IGNORED_NO_KEYWORD',
        matchedKeyword: null,
        automationId: null,
      };
    }

    // --- Adım 5: Şablonu render + gönder -----------------------------------
    const startedAt = Date.now();
    const sendResult = await this.dispatchReply(match, event, connection.ownerId, connection.accessToken);

    // --- Adım 6: Sonucu log'a yaz ------------------------------------------
    const delivered = sendResult.kind === 'SENT';
    const latencyMs = Date.now() - startedAt;

    this.appendLogSafely({
      ownerId: connection.ownerId,
      automationId: match.automation.id,
      platform: sendResult.kind === 'SENT' ? sendResult.result.platform : this.defaultPlatform(),
      direction: MessageDirection.OUTBOUND,
      eventType: event.type,
      status: delivered ? LogStatus.DELIVERED : LogStatus.FAILED,
      matchedKeyword: match.keyword,
      recipient: event.senderUsername ?? event.senderId,
      content: sendResult.content,
      externalMessageId: delivered ? sendResult.result.messageId : null,
      errorMessage: delivered ? null : sendResult.errorMessage,
      latencyMs,
      now: new Date(),
    });

    // Otomasyonun çalışma istatistiklerini güncelle (hata durumunda yutulur).
    this.recordAutomationRun(match.automation, delivered, now);

    if (!delivered) {
      // Gönderim başarısız → hata log'lanır ama PAYLOAD'a yansıtılmaz.
      this.logger.warn('Otomasyon yanıtı gönderilemedi.', {
        automationId: match.automation.id,
        eventId: event.externalEventId,
        error: sendResult.errorMessage,
      });

      return {
        eventId: event.externalEventId,
        outcome: 'FAILED',
        matchedKeyword: match.keyword,
        automationId: match.automation.id,
      };
    }

    return {
      eventId: event.externalEventId,
      outcome: 'REPLIED',
      matchedKeyword: match.keyword,
      automationId: match.automation.id,
    };
  }

  /**
   * Eşleşen otomasyona göre yanıtı gönderir.
   * Hata YUTMAZ — çağıran taraf loglayıp sonucu FAILED olarak işaretler.
   */
  private async dispatchReply(
    match: KeywordMatch,
    event: InboundEvent,
    ownerId: string,
    accessToken: string,
  ): Promise<DispatchOutcome> {
    const content = renderTemplate(match.automation.replyMessage, match.variables);

    // OCP: Doğru platform servisini çalışma anında seç.
    const service = this.messagingServices.find((candidate) => candidate.supports(event));

    if (service === undefined) {
      return {
        kind: 'FAILED' as const,
        content,
        errorMessage: 'Bu olay için uygun bir mesajlaşma servisi bulunamadı.',
      };
    }

    try {
      const result = await this.send(service, match, event, accessToken);

      return { kind: 'SENT' as const, content, result };
    } catch (error: unknown) {
      // Meta hatası → kullanıcıya anlamlı mesaj; bilinmeyen hata → genel mesaj.
      return {
        kind: 'FAILED' as const,
        content,
        errorMessage: this.describeError(error, ownerId),
      };
    }
  }

  /** Olay tipine göre doğru Meta çağrısını yapar (DM mi, yorum yanıtı mı). */
  private async send(
    service: IMessagingService,
    match: KeywordMatch,
    event: InboundEvent,
    accessToken: string,
  ): Promise<SendMessageResult> {
    if (event.type === InboundEventType.COMMENT) {
      // Guard clause: yorum yanıtı için yorum ID'si zorunludur.
      if (event.commentId === null) {
        throw new UnexpectedError('Yorum yanıtı için commentId bulunamadı.');
      }

      return service.sendCommentReply({
        commentId: event.commentId,
        accountId: event.accountId,
        text: match.automation.replyMessage,
        accessToken,
      });
    }

    return service.sendDirectMessage({
      accountId: event.accountId,
      recipientId: event.senderId,
      text: renderTemplate(match.automation.replyMessage, match.variables),
      accessToken,
    });
  }

  /** Hata nesnesini loglanabilir, sızdırmayan bir mesajeye çevirir. */
  private describeError(error: unknown, ownerId: string): string {
    if (error instanceof MetaApiError) {
      return `[Meta ${error.httpStatus}${error.metaErrorCode === null ? '' : `/${error.metaErrorCode}`}] ${error.message}`;
    }

    if (isDomainError(error)) {
      return `${error.code}: ${error.message}`;
    }

    return `Beklenmeyen hata (owner=${ownerId}).`;
  }

  /**
   * Log yazımı ASENKRON yapılır: kullanıcıya yanıt gecikmesi, log yazımından
   * daha önemlidir. Hata burada yutulur ama LOGA DÜŞER (sessiz kayıp yok).
   */
  private appendLogSafely(input: AppendLogInput): void {
    void this.logs.append(input).catch((error: unknown) => {
      this.logger.error('Log kaydı yazılamadı.', {
        error: error instanceof Error ? error.message : String(error),
        ownerId: input.ownerId,
      });
    });
  }

  /**
   * Otomasyonun çalışma istatistiklerini ASENKRON günceller.
   *
   * Neden asenkron? Sayaç yazma işlemi kullanıcıya dönen yanıtı geciktirmemeli.
   * Neden ayrı fonksiyon? Sayaç hatası asla mesaj gönderimini etkilemez.
   */
  private recordAutomationRun(automation: Automation, delivered: boolean, now: Date): void {
    void this.automations
      .recordRun(automation.id, delivered ? 'DELIVERED' : 'FAILED', now)
      .catch((error: unknown) => {
        this.logger.error('Otomasyon istatistikleri güncellenemedi.', {
          automationId: automation.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  /** Loglanmadan sessizce atlanan olaylar için kısa devre. */
  private skip(
    event: InboundEvent,
    outcome: 'IGNORED_UNSUPPORTED' | 'IGNORED_EMPTY',
  ): ProcessedEventResult {
    this.logger.debug('Olay işlenmeden atlandı.', { eventId: event.externalEventId, outcome });

    return { eventId: event.externalEventId, outcome, matchedKeyword: null, automationId: null };
  }

  /** Olay tipi destekleniyor mu? (Boş metinli mesajlar burada da elenir.) */
  private isSupportedEvent(event: InboundEvent): boolean {
    if (event.type === InboundEventType.UNKNOWN || event.type === InboundEventType.ATTACHMENT_MESSAGE) {
      return false;
    }

    return this.messagingServices.some((service) => service.supports(event));
  }

  private toTrigger(eventType: InboundEventType): AutomationTrigger {
    return eventType === InboundEventType.COMMENT
      ? AutomationTrigger.INBOUND_COMMENT
      : AutomationTrigger.INBOUND_MESSAGE;
  }

  /**
   * Log kaydında kullanılacak platform.
   * Servis listesi boşsa Instagram'a düşer → tip güvenli ve pratik.
   */
  private defaultPlatform(): SocialPlatform {
    return this.messagingServices[0]?.platform ?? SocialPlatform.INSTAGRAM;
  }

  private summarize(results: readonly ProcessedEventResult[]): HandleWebhookEventOutput['summary'] {
    return {
      total: results.length,
      replied: results.filter((item) => item.outcome === 'REPLIED').length,
      ignored: results.filter((item) => item.outcome.startsWith('IGNORED')).length,
      failed: results.filter((item) => item.outcome === 'FAILED').length,
    };
  }
}

/** Gönderim sonucunun ayrımı için ayrık tip. */
type DispatchOutcome =
  | { readonly kind: 'SENT'; readonly content: string; readonly result: SendMessageResult }
  | { readonly kind: 'FAILED'; readonly content: string; readonly errorMessage: string };
/**
 * ============================================================================
 * SERVICES / META INSTAGRAM SERVICE
 * ----------------------------------------------------------------------------
 * `IMessagingService` arayüzünün Instagram (Meta Graph API) implementasyonu.
 *
 * Sorumluluk sınırı (SRP): "Instagram'a nasıl mesaj gönderilir" işini bilir.
 * Token yönetimi, şablon render, keyword eşleştirme gibi konular burada YOK.
 *
 * Graph API v19.0 endpoint'leri:
 *   POST /{ig-user-id}/messages        → DM gönderme
 *   POST /{ig-comment-id}/replies      → yoruma yanıt
 * ============================================================================
 */

import { META_GRAPH_API } from '../config/constants';
import type {
  IMessagingService,
  SendCommentReplyCommand,
  SendDirectMessageCommand,
  SendMessageResult,
} from '../domain/interfaces/IMessagingService';
import { InboundEventType, SocialPlatform, type InboundEvent } from '../domain/entities/Log';
import { MetaApiError } from '../domain/errors/DomainError';
import { clampToInstagramLimit } from '../domain/matchers/KeywordMatcher';
import type { MetaGraphHttpClient } from './MetaGraphHttpClient';
import type { ILogger } from './Logger';

/** Instagram Messaging API'nin `messages` yanıtı. */
interface InstagramMessageResponse {
  readonly message_id?: string;
}

/** Instagram Comments API'nin `replies` yanıtı. */
interface InstagramReplyResponse {
  readonly id?: string;
  readonly comment_id?: string;
}

export class MetaInstagramService implements IMessagingService {
  public readonly platform = SocialPlatform.INSTAGRAM;

  public constructor(
    private readonly http: MetaGraphHttpClient,
    private readonly logger: ILogger,
  ) {}

  /**
   * Bir kullanıcıya doğrudan mesaj gönderir.
   * @throws MetaApiError Meta çağrısı başarısız olursa
   */
  public async sendDirectMessage(command: SendDirectMessageCommand): Promise<SendMessageResult> {
    const text = clampToInstagramLimit(command.text);

    // Guard clause: Meta boş metni kabul etmez.
    if (text.length === 0) {
      throw new MetaApiError({
        message: 'Gönderilecek mesaj metni boş.',
        httpStatus: 400,
        context: { recipientId: command.recipientId },
      });
    }

    const payload: Record<string, unknown> = {
      recipient: { id: command.recipientId },
      message: { text },
      messaging_type: command.humanAgentTagRequired === true ? 'MESSAGE' : 'RESPONSE',
    };

    // 24 saatlik pencere dışındaysa HUMAN_AGENT etiketi zorunludur.
    if (command.humanAgentTagRequired === true) {
      payload.tag = 'HUMAN_AGENT';
    }

    const response = await this.http.send<InstagramMessageResponse>({
      path: `/${encodeURIComponent(command.accountId)}/messages`,
      body: payload,
      accessToken: command.accessToken,
    });

    this.logger.debug('Instagram DM gönderildi.', {
      accountId: command.accountId,
      recipientId: command.recipientId,
      messageId: response.message_id ?? null,
    });

    return {
      messageId: response.message_id ?? `ig_${Date.now()}`,
      platform: this.platform,
      acceptedAt: new Date(),
    };
  }

  /**
   * Bir yoruma yanıt verir.
   * Not: Instagram yorum yanıtları için 24 saatlik pencere kısıtı YOKTUR.
   */
  public async sendCommentReply(command: SendCommentReplyCommand): Promise<SendMessageResult> {
    const text = clampToInstagramLimit(command.text);

    if (text.length === 0) {
      throw new MetaApiError({
        message: 'Gönderilecek yorum yanıtı boş.',
        httpStatus: 400,
        context: { commentId: command.commentId },
      });
    }

    const response = await this.http.send<InstagramReplyResponse>({
      path: `/${encodeURIComponent(command.commentId)}/replies`,
      body: { message: text },
      accessToken: command.accessToken,
    });

    this.logger.debug('Instagram yorum yanıtı gönderildi.', {
      commentId: command.commentId,
      replyId: response.id ?? null,
    });

    return {
      messageId: response.id ?? response.comment_id ?? `ig_reply_${Date.now()}`,
      platform: this.platform,
      acceptedAt: new Date(),
    };
  }

  /** Bu servis hangi olayları destekler? */
  public supports(event: InboundEvent): boolean {
    return (
      event.type === InboundEventType.TEXT_MESSAGE ||
      event.type === InboundEventType.COMMENT
    );
  }

  /**
   * Metin mesajlarında 24 saatlik standard messaging kuralı uygulanır;
   * yorum yanıtlarında uygulanmaz. Use-case bu bilgiyi buradan alır.
   */
  public get messagingWindowHours(): number {
    return META_GRAPH_API.HUMAN_AGENT_WINDOW_HOURS;
  }
}
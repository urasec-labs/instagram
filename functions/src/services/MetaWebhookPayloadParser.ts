/**
 * ============================================================================
 * SERVICES / META WEBHOOK PAYLOAD PARSER
 * ----------------------------------------------------------------------------
 * Meta'nın karmaşık ve sık değişen webhook JSON şemasını normalize edilmiş
 * domain olaylarına (`InboundEvent`) çevirir.
 *
 * Özellikler:
 *  - Tamamen savunmacı (defensive) yazım: her alan opsiyonel sayılır.
 *  - Tanınmayan olaylar THROW ETMEZ, `UNKNOWN` türüyle geçilir.
 *  - Bu sınıfın tek sorumluluğu JSON → Domain dönüşümüdür (SRP).
 *
 * Örnek DM payload'ı:
 * {
 *   "object":"instagram","entry":[{"id":"IG_ACCOUNT","time":1700000000,
 *     "messaging":[{"sender":{"id":"USER"},"recipient":{"id":"IG_ACCOUNT"},
 *       "timestamp":1700000000,"message":{"mid":"m_1","text":"fiyat"}}]}]
 * }
 * ============================================================================
 */

import { META_WEBHOOK_FIELDS as F } from '../config/constants';
import { InboundEventType, type InboundEvent } from '../domain/entities/Log';
import type { IPayloadParser } from '../domain/interfaces/IPayloadParser';
import type { ILogger } from './Logger';

/** `object` alanı: yalnızca Instagram destekleniyor. */
const SUPPORTED_OBJECT = 'instagram';

type Json = Readonly<Record<string, unknown>>;

/** JSON nesne mi diye güvenli kontrol. */
function asObject(value: unknown): Json | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Json;
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export class MetaWebhookPayloadParser implements IPayloadParser {
  public constructor(private readonly logger: ILogger) {}

  public parse(rawBody: string): readonly InboundEvent[] {
    let payload: Json | null;

    try {
      payload = asObject(JSON.parse(rawBody) as unknown);
    } catch (error: unknown) {
      this.logger.warn('Webhook gövdesi JSON olarak parse edilemedi.', {
        error: String(error),
        bodyLength: rawBody.length,
      });
      return [];
    }

    // Guard clause: parse edilemez veya beklenmeyen şema → boş sonuç.
    if (payload === null) {
      return [];
    }

    const objectType = asString(payload[F.OBJECT]);

    if (objectType !== SUPPORTED_OBJECT) {
      this.logger.info('Desteklenmeyen webhook nesnesi yok sayıldı.', { objectType });
      return [];
    }

    return asArray(payload[F.ENTRY]).flatMap((entry) => this.parseEntry(entry));
  }

  /** `entry` → olay listesi. */
  private parseEntry(entry: unknown): readonly InboundEvent[] {
    const entryObject = asObject(entry);

    if (entryObject === null) {
      return [];
    }

    const accountId = asString(entryObject[F.ID]);

    // Guard clause: hesap ID'si olmadan olay işlenemez.
    if (accountId === null) {
      return [];
    }

    const messagingEvents = this.parseMessaging(accountId, entryObject[F.MESSAGES]);
    const commentEvents = this.parseComments(accountId, entryObject[F.COMMENTS]);

    return [...messagingEvents, ...commentEvents];
  }

  /** DM olayları. */
  private parseMessaging(accountId: string, rawMessaging: unknown): readonly InboundEvent[] {
    return asArray(rawMessaging).flatMap((rawItem) => {
      const item = asObject(rawItem);

      if (item === null) {
        return [];
      }

      const message = asObject(item[F.MESSAGE]);
      const sender = message === null ? null : asObject(message[F.SENDER]);
      const senderId = sender === null ? null : asString(sender['id']);

      // Guard clause: gönderen bilgisi eksikse olay işlenemez.
      if (senderId === null) {
        return [];
      }

      const text = message === null ? null : asString(message[F.TEXT]);
      const timestamp = asString(item[F.TIME]);

      return [
        {
          type:
            text !== null && text.length > 0
              ? InboundEventType.TEXT_MESSAGE
              : InboundEventType.ATTACHMENT_MESSAGE,
          accountId,
          senderId,
          senderUsername: this.extractUsername(message),
          rawText: text ?? '',
          // Meta `mid` sağlamazsa gönderen + metin karmasından deterministik
          // bir kimlik türetilir (aynı mesajın iki kez sayılmasını önler).
          externalEventId: `msg_${senderId}_${hash(text ?? timestamp ?? senderId)}`,
          commentId: null,
        } satisfies InboundEvent,
      ];
    });
  }

  /** Yorum olayları. */
  private parseComments(accountId: string, rawComments: unknown): readonly InboundEvent[] {
    return asArray(rawComments).flatMap((rawItem) => {
      const item = asObject(rawItem);

      if (item === null) {
        return [];
      }

      const commentId = asString(item[F.COMMENT_ID]) ?? asString(item[F.ID]);
      const text = asString(item[F.TEXT]);

      // Guard clause: yorum ID'si veya metni yoksa yanıtlanamaz.
      if (commentId === null || text === null) {
        return [];
      }

      return [
        {
          type: InboundEventType.COMMENT,
          accountId,
          senderId: commentId, // yorum ID'si, yorum sahibinin değil
          senderUsername: asString(item['username']),
          rawText: text,
          externalEventId: `comment_${commentId}`,
          commentId,
        } satisfies InboundEvent,
      ];
    });
  }

  /**
   * Kullanıcı adını çıkarır.
   * Meta DM payload'ında username genelde yoktur; varsa `message.username`
   * veya `message.sender.username` alanından okunur.
   */
  private extractUsername(message: Json | null): string | null {
    if (message === null) {
      return null;
    }

    const direct = asString(message['username']);

    if (direct !== null) {
      return direct;
    }

    const sender = asObject(message[F.SENDER]);

    return sender === null ? null : asString(sender['username']);
  }
}

/**
 * Kısa, çakışma düşük deterministik hash (kimlik türetme amaçlı, güvenlik amaçlı değil).
 * Node crypto'yu payload parser'a taşımak yerine saf string hash yeterlidir.
 */
function hash(value: string): string {
  let h = 0;

  for (let index = 0; index < value.length; index += 1) {
    h = (h << 5) - h + value.charCodeAt(index);
    h |= 0; // 32-bit signed
  }

  return Math.abs(h).toString(36);
}
/**
 * ============================================================================
 * DOMAIN / INTERFACES / I MESSAGING SERVICE
 * ----------------------------------------------------------------------------
 * OPEN/CLOSED PRINCIPLE (OCP) sözleşmesi.
 *
 * Yeni bir platform (WhatsApp / Telegram / Messenger) eklemek için mevcut
 * hiçbir sınıfı DEĞİŞTİRMENİZ gerekmez: bu arayüzü uygulayıp DI container'a
 * kaydetmeniz yeterlidir. Use-case katmanı platform detaylarına hiç dokunmaz.
 * ============================================================================
 */

import type { InboundEvent, LogId, SocialPlatform } from '../entities/Log';

/** DM gönderme komutu. */
export interface SendDirectMessageCommand {
  /** Mesajın gönderileceği işletme hesabı (IG Business / Professional ID). */
  readonly accountId: string;
  /** Alıcının Instagram kullanıcı ID'si (IGSID). */
  readonly recipientId: string;
  readonly text: string;
  /**
   * Meta, 24 saatlik "standard messaging" penceresinin dışında gönderim için
   * `messaging_type: MESSAGE` + `tag: HUMAN_AGENT` ister. Use-case bunu
   * otomatik belirler, isteğe bağlıdır.
   */
  readonly humanAgentTagRequired?: boolean;
  /**
   * Hesabın uzun ömürlü erişim token'ı. Çoklu-hesap (multi-tenant) yapısında
   * her hesabın kendi token'ı vardır; verilmezse servis varsayılanı kullanır.
   */
  readonly accessToken?: string | null;
}

/** Yorum yanıtı komutu. */
export interface SendCommentReplyCommand {
  /** Yorumun kendi ID'si — Meta yanıt endpoint'i bunu kullanır. */
  readonly commentId: string;
  readonly accountId: string;
  readonly text: string;
  /** Hesabın uzun ömürlü erişim token'ı (DM ile aynı mantık). */
  readonly accessToken?: string | null;
}

/** Başarılı gönderim sonucu. */
export interface SendMessageResult {
  readonly messageId: LogId;
  readonly platform: SocialPlatform;
  readonly acceptedAt: Date;
}

/**
 * Platformdan bağımsız mesajlaşma port'u.
 * MetaInstagramService bunun bir implementasyonudur; başka platformlar için
 * WhatsAppService / TelegramService yazılır — use-case'ler değişmez.
 */
export interface IMessagingService {
  /** Hangi platformu temsil ettiği (loglama ve çoklu-platform routing için). */
  readonly platform: SocialPlatform;

  /** Bir kullanıcıya DM gönderir. */
  sendDirectMessage(command: SendDirectMessageCommand): Promise<SendMessageResult>;

  /** Bir yoruma yanıt verir. */
  sendCommentReply(command: SendCommentReplyCommand): Promise<SendMessageResult>;

  /** Olayın bu servis tarafından desteklenip desteklenmediğini bildirir. */
  supports(event: InboundEvent): boolean;
}
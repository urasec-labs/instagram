/**
 * ============================================================================
 * DOMAIN / ENTITIES / LOG
 * ----------------------------------------------------------------------------
 * Gönderim ve alım aktivite kayıtları. Dashboard "Canlı Akış" ekranı bu
 * koleksiyonu `onSnapshot` ile dinler.
 *
 * Yine SAF domain modeli: hiçbir altyapı bağımlılığı yoktur.
 * ============================================================================
 */

/** `logs` koleksiyonundaki belge kimliği. */
export type LogId = string;

/** Mesajın yönü. */
export enum MessageDirection {
  /** Kullanıcı → Bot (gelen). */
  INBOUND = 'INBOUND',
  /** Bot → Kullanıcı (giden). */
  OUTBOUND = 'OUTBOUND',
}

/** Kaydın nihai durumu. */
export enum LogStatus {
  /** Meta API'ye başarıyla iletildi. */
  DELIVERED = 'DELIVERED',
  /** Gönderim başarısız oldu (Meta API hatası). */
  FAILED = 'FAILED',
  /** Eşleşme bulunamadı / otomasyon pasif → sessizce yok sayıldı. */
  IGNORED = 'IGNORED',
  /** İşlenmiş ama gönderim gerektirmeyen olay (ör. read receipt). */
  PROCESSED = 'PROCESSED',
}

/** Desteklenen sosyal medya platformları (OCP için soyutlama). */
export enum SocialPlatform {
  INSTAGRAM = 'INSTAGRAM',
  WHATSAPP = 'WHATSAPP',
  TELEGRAM = 'TELEGRAM',
}

/** Ham webhook olayının normalize edilmiş hali. */
export enum InboundEventType {
  TEXT_MESSAGE = 'TEXT_MESSAGE',
  ATTACHMENT_MESSAGE = 'ATTACHMENT_MESSAGE',
  COMMENT = 'COMMENT',
  UNKNOWN = 'UNKNOWN',
}

/** Normalize edilmiş gelen olay. */
export interface InboundEvent {
  readonly type: InboundEventType;
  /** Olayın işlenmesini sağlayan işletme hesabı ID'si (IG Business Account ID). */
  readonly accountId: string;
  /** Mesajı yazan / yorumu yapan kullanıcının IG ID'si. */
  readonly senderId: string;
  /** Instagram kullanıcı adı (varsa). */
  readonly senderUsername: string | null;
  /** Mesaj metni (normalize edilmeden ÖNCE, ham hali). */
  readonly rawText: string;
  /** Meta'nın verdiği benzersiz olay kimliği (idempotency için). */
  readonly externalEventId: string;
  /** Yorum ise, yorumun kendi ID'si (yanıt endpoint'i için gerekir). */
  readonly commentId: string | null;
}

/** Log kaydının domain gösterimi. */
export interface ActivityLog {
  readonly id: LogId;
  readonly ownerId: string;
  readonly automationId: string | null;
  readonly platform: SocialPlatform;
  readonly direction: MessageDirection;
  readonly eventType: InboundEventType;
  readonly status: LogStatus;
  /** Eşleşen tetikleyici kelime (yoksa null). */
  readonly matchedKeyword: string | null;
  /** Karşı tarafın IG kullanıcı adı veya ID'si. */
  readonly recipient: string | null;
  /** Görüntülenebilir mesaj içeriği. */
  readonly content: string;
  /** Meta API mesaj ID'si (başarılı gönderimde döner). */
  readonly externalMessageId: string | null;
  /** Hata durumunda sanitize edilmiş hata mesajı. */
  readonly errorMessage: string | null;
  /** İşleme süresi (ms) — performans izleme. */
  readonly latencyMs: number | null;
  readonly createdAt: Date;
}

/** Yeni log kaydı oluştururken kullanılan girdi. */
export interface AppendLogInput {
  readonly ownerId: string;
  readonly automationId: string | null;
  readonly platform: SocialPlatform;
  readonly direction: MessageDirection;
  readonly eventType: InboundEventType;
  readonly status: LogStatus;
  readonly matchedKeyword: string | null;
  readonly recipient: string | null;
  readonly content: string;
  readonly externalMessageId: string | null;
  readonly errorMessage: string | null;
  readonly latencyMs: number | null;
  readonly now: Date;
}
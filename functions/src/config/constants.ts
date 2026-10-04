/**
 * ============================================================================
 * CONFIG / CONSTANTS
 * ----------------------------------------------------------------------------
 * Literal değerlerin (URL'ler, koleksiyon adları, webhook field'ları) tek
 * doğruluk kaynağı. Kodun geri kalanında hiçbir yerde string sabiti yazılmaz.
 * ============================================================================
 */

/** Meta Graph API yapılandırması. */
export const META_GRAPH_API = {
  /** Graph API kök URL'i (versiyon sonradan eklenir). */
  BASE_URL: 'https://graph.facebook.com/',
  /** Proje standardı: v19.0 */
  DEFAULT_VERSION: 'v19.0',
  /** Instagram Messaging API field listesi */
  FIELDS: {
    MESSAGES: 'id,message.sender.id,message.recipient.id,message.timestamp,message.message.text',
    COMMENTS: 'id,text,username,timestamp,media.id,media.product_type',
  },
  /** Webhook aboneliğine verilen `fields` parametresi değerleri */
  SUBSCRIPTION_FIELDS: ['messages', 'messaging_postbacks', 'comments'] as const,
  /** Meta Messaging Policy'nin izin verdiği max. mesaj penceresi (saat) */
  HUMAN_AGENT_WINDOW_HOURS: 24,
} as const;

/** Meta webhook gövdesindeki alan adları. */
export const META_WEBHOOK_FIELDS = {
  OBJECT: 'object',
  ENTRY: 'entry',
  ID: 'id',
  TIME: 'time',
  CHANGES: 'changes',
  VALUE: 'value',
  FIELD: 'field',
  MESSAGES: 'messages',
  MESSAGE: 'message',
  SENDER: 'sender',
  RECIPIENT: 'recipient',
  TEXT: 'text',
  ATTACHMENTS: 'attachments',
  COMMENTS: 'comments',
  COMMENT_ID: 'comment_id',
  VERIFY_TOKEN: 'hub.verify_token',
  VERIFY_MODE: 'hub.mode',
  CHALLENGE: 'hub.challenge',
} as const;

/** Firestore koleksiyon ve alan adları. */
export const FIRESTORE_COLLECTIONS = {
  AUTOMATIONS: 'automations',
  LOGS: 'logs',
  CONNECTIONS: 'connections',
  USERS: 'users',
} as const;

/** Firestore alan adları. */
export const FIRESTORE_FIELDS = {
  OWNER_ID: 'ownerId',
  KEYWORDS: 'keywords',
  STATUS: 'status',
  TRIGGER: 'trigger',
  CREATED_AT: 'createdAt',
  UPDATED_AT: 'updatedAt',
  LAST_TRIGGERED_AT: 'lastTriggeredAt',
} as const;

/** HTTP başlık adları. */
export const HTTP_HEADERS = {
  SIGNATURE_256: 'x-hub-signature-256',
  CONTENT_TYPE: 'content-type',
} as const;

/** CORS / önbellek politikaları. */
export const HTTP_POLICY = {
  NO_STORE: 'no-store',
  JSON_CONTENT_TYPE: 'application/json; charset=utf-8',
  TEXT_CONTENT_TYPE: 'text/plain; charset=utf-8',
} as const;
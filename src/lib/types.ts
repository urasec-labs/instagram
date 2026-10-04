/**
 * ============================================================================
 * LIB / TYPES
 * ----------------------------------------------------------------------------
 * Frontend'in kullandığı görüntü tipleri.
 *
 * NOT: Bu tipler backend `domain/entities` ile BİREBİR aynıdır ama frontend
 * `functions/src` klasörüne bağımlı OLMAZ. Bu bilinçli bir karardır:
 *  - İki tarafın derleme zamanı ve deploy döngüsü bağımsız kalır.
 *  - Backend'de alan adı değişirse frontend derlenmeye devam eder ve
 *    senkronizasyonu görev listesinde tutmak daha güvenlidir.
 * Backend değişikliklerinde BURAYA da bakın (tek doğruluk kaynağı değil).
 * ============================================================================
 */

/** Tetikleyici kelimenin eşleşme stratejisi. */
export const MATCH_MODE = {
  EXACT: 'EXACT',
  CONTAINS: 'CONTAINS',
} as const;

export type MatchMode = (typeof MATCH_MODE)[keyof typeof MATCH_MODE];

export const AUTOMATION_STATUS = {
  ACTIVE: 'ACTIVE',
  PASSIVE: 'PASSIVE',
} as const;

export type AutomationStatus = (typeof AUTOMATION_STATUS)[keyof typeof AUTOMATION_STATUS];

export const AUTOMATION_TRIGGER = {
  INBOUND_MESSAGE: 'INBOUND_MESSAGE',
  INBOUND_COMMENT: 'INBOUND_COMMENT',
} as const;

export type AutomationTrigger = (typeof AUTOMATION_TRIGGER)[keyof typeof AUTOMATION_TRIGGER];

export const LOG_STATUS = {
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  IGNORED: 'IGNORED',
  PROCESSED: 'PROCESSED',
} as const;

export type LogStatus = (typeof LOG_STATUS)[keyof typeof LOG_STATUS];

export type MessageDirection = 'INBOUND' | 'OUTBOUND';

export type InboundEventType =
  | 'TEXT_MESSAGE'
  | 'ATTACHMENT_MESSAGE'
  | 'COMMENT'
  | 'UNKNOWN';

/** Otomasyon istatistikleri. */
export interface AutomationStats {
  matchCount: number;
  replyCount: number;
  failureCount: number;
  lastTriggeredAt: Date | null;
}

/** Otomasyon belgesinin frontend görünümü. */
export interface Automation {
  id: string;
  ownerId: string;
  name: string;
  keywords: string[];
  matchMode: MatchMode;
  replyMessage: string;
  trigger: AutomationTrigger;
  status: AutomationStatus;
  stats: AutomationStats;
  createdAt: Date;
  updatedAt: Date;
}

/** Aktivite log'unun frontend görünümü. */
export interface ActivityLog {
  id: string;
  ownerId: string;
  automationId: string | null;
  platform: string;
  direction: MessageDirection;
  eventType: InboundEventType;
  status: LogStatus;
  matchedKeyword: string | null;
  recipient: string | null;
  content: string;
  externalMessageId: string | null;
  errorMessage: string | null;
  latencyMs: number | null;
  createdAt: Date;
}

/** Dashboard istatistikleri (Cloud Function `getDashboardStats` çıktısı). */
export interface DashboardStats {
  totalAutomations: number;
  activeAutomations: number;
  deliveredMessages: number;
  failedMessages: number;
  ignoredMessages: number;
  deliveryRate: number;
  lastActivityAt: Date | null;
}
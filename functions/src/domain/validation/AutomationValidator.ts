/**
 * ============================================================================
 * DOMAIN / VALIDATION / AUTOMATION VALIDATOR
 * ----------------------------------------------------------------------------
 * Domain kurallarının MERKEZİ doğrulama noktası.
 *
 * "Neden?" sorusu cevapsız kalmaz: doğrulama hem use-case'te hem de
 * controller'da çağrılabilir, tek uygulama vardır (DRY).
 * ============================================================================
 */

import {
  AUTOMATION_LIMITS,
  AutomationStatus,
  AutomationTrigger,
  MatchMode,
  normalizeKeywords,
  normalizeText,
  type Automation,
  type CreateAutomationInput,
} from '../entities/Automation';
import { ValidationError } from '../errors/DomainError';
import { VALIDATION_MESSAGES } from '../errors/ErrorMessages';

/** String alanın boş olmadığını doğrular (guard clause). */
function assertNonEmpty(value: string, message: string, maxLength: number): void {
  const normalized = normalizeText(value);

  if (normalized.length === 0) {
    throw new ValidationError(message);
  }

  if (value.trim().length > maxLength) {
    throw new ValidationError(message, { length: value.trim().length, maxLength });
  }
}

/** Enum değerinin geçerli olduğunu doğrular. */
function assertEnum<T extends string>(
  value: string,
  allowed: readonly T[],
  message: string,
): asserts value is T {
  if (!allowed.includes(value as T)) {
    throw new ValidationError(message, { value, allowed });
  }
}

/**
 * Otomasyon oluşturma girdisinin tüm kurallarını doğrular.
 * @throws ValidationError herhangi bir kural ihlalinde
 */
export function validateAutomationInput(input: CreateAutomationInput): void {
  assertNonEmpty(input.name, VALIDATION_MESSAGES.NAME_REQUIRED, AUTOMATION_LIMITS.MAX_NAME_LENGTH);

  if (input.replyMessage.trim().length === 0) {
    throw new ValidationError(VALIDATION_MESSAGES.REPLY_REQUIRED);
  }

  if (input.replyMessage.length > AUTOMATION_LIMITS.MAX_REPLY_LENGTH) {
    throw new ValidationError(VALIDATION_MESSAGES.REPLY_TOO_LONG, {
      length: input.replyMessage.length,
      maxLength: AUTOMATION_LIMITS.MAX_REPLY_LENGTH,
    });
  }

  const keywords = normalizeKeywords(input.keywords);

  if (keywords.length === 0) {
    throw new ValidationError(VALIDATION_MESSAGES.KEYWORDS_REQUIRED);
  }

  if (keywords.length > AUTOMATION_LIMITS.MAX_KEYWORDS) {
    throw new ValidationError(VALIDATION_MESSAGES.KEYWORDS_TOO_MANY, {
      count: keywords.length,
      max: AUTOMATION_LIMITS.MAX_KEYWORDS,
    });
  }

  assertEnum<MatchMode>(input.matchMode, Object.values(MatchMode), VALIDATION_MESSAGES.INVALID_MATCH_MODE);
  assertEnum<AutomationTrigger>(
    input.trigger,
    Object.values(AutomationTrigger),
    VALIDATION_MESSAGES.INVALID_TRIGGER,
  );
}

/**
 * Factory: doğrulama + normalize + varsayılanlarla yeni otomasyon üretir.
 * Use-case katmanındaki tek "yeni nesne oluşturma" noktasıdır.
 */
export function createAutomationEntity(input: CreateAutomationInput): Automation {
  validateAutomationInput(input);

  return {
    id: input.id,
    ownerId: input.ownerId,
    name: input.name.trim(),
    keywords: normalizeKeywords(input.keywords),
    matchMode: input.matchMode,
    replyMessage: input.replyMessage.trim(),
    trigger: input.trigger,
    status: AutomationStatus.PASSIVE, // güvenli varsayılan: kullanıcı aktifleştirir
    stats: { matchCount: 0, replyCount: 0, failureCount: 0, lastTriggeredAt: null },
    createdAt: input.now,
    updatedAt: input.now,
  };
}
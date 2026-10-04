/**
 * ============================================================================
 * DOMAIN / ERRORS / DOMAIN ERROR
 * ----------------------------------------------------------------------------
 * Strict Error Handling sözleşmesi.
 *
 * - Tüm hatalar `DomainError` sınıfından türetilir.
 * - `code` alanı makine tarafından okunabilir (log/analytics), `message` alanı
 *   geliştirici içindir.
 * - `expose` alanı HTTP controller'ın kullanıcıya gösterip göstermeyeceğine
 *   karar verir (iç hataların sızdırılmasını engeller).
 * ============================================================================
 */

export abstract class DomainError extends Error {
  public abstract readonly code: string;

  /** true → istemciye güvenli mesaj dönülebilir. */
  public readonly expose: boolean = true;

  /** Kontekstrel (hata ayıklama) bilgi — sadece loglara yazılır. */
  public readonly context: Readonly<Record<string, unknown>>;

  protected constructor(
    message: string,
    context: Readonly<Record<string, unknown>> = {},
    expose = true,
  ) {
    super(message);
    this.name = new.target.name; // constructor adını koru → stack trace okunur kalır
    this.context = context;
    this.expose = expose;
    Object.setPrototypeOf(this, new.target.prototype); // ES5 target için gerekli
    Error.captureStackTrace?.(this, new.target);
  }

  /** Log/JSON çıktısı için serileştirilmiş hata. */
  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
    };
  }
}

/** Girdi doğrulama / domain kuralı ihlali (422). */
export class ValidationError extends DomainError {
  public readonly code = 'VALIDATION_ERROR';

  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, context, true);
  }
}

/** Otomasyon bulunamadı (404). */
export class AutomationNotFoundError extends DomainError {
  public readonly code = 'AUTOMATION_NOT_FOUND';

  constructor(automationId: string) {
    super(`Otomasyon bulunamadı: ${automationId}`, { automationId });
  }
}

/** Instagram hesabı hiçbir kullanıcıya bağlanmamış (409). */
export class AccountNotLinkedError extends DomainError {
  public readonly code = 'ACCOUNT_NOT_LINKED';

  constructor(accountId: string) {
    super(`Instagram hesabı bağlı değil: ${accountId}`, { accountId });
  }
}

/** Webhook doğrulama token'ı eşleşmedi (403). */
export class InvalidVerificationTokenError extends DomainError {
  public readonly code = 'INVALID_VERIFICATION_TOKEN';

  constructor() {
    // Token'ın kendisi ASLA loglanmaz/mesajda geçmez.
    super('Meta doğrulama token\'ı eşleşmedi.', { tokenMatched: false }, true);
  }
}

/** Webhook imzası (HMAC) doğrulanamadı (401). */
export class InvalidSignatureError extends DomainError {
  public readonly code = 'INVALID_SIGNATURE';

  constructor() {
    super('X-Hub-Signature-256 başlığı eksik veya geçersiz.', {}, true);
  }
}

/** Meta Graph API hataları (502 / 429 / ...). */
export class MetaApiError extends DomainError {
  public readonly code: string = 'META_API_ERROR';

  public readonly httpStatus: number;
  public readonly metaErrorCode: number | null;
  public readonly metaErrorSubcode: number | null;
  public readonly isRateLimited: boolean;
  public readonly isTransient: boolean;

  constructor(params: {
    message: string;
    httpStatus: number;
    metaErrorCode?: number | null;
    metaErrorSubcode?: number | null;
    context?: Record<string, unknown>;
  }) {
    super(params.message, params.context ?? {}, false);

    this.httpStatus = params.httpStatus;
    this.metaErrorCode = params.metaErrorCode ?? null;
    this.metaErrorSubcode = params.metaErrorSubcode ?? null;
    // 429 ve 5xx geçici hatalardır → yeniden deneme (retry) mantığına girer.
    this.isRateLimited = params.httpStatus === 429;
    this.isTransient = params.httpStatus >= 500;
  }
}

/** Kimlik doğrulanmamış (401). Token eksik, hatalı veya süresi dolmuş. */
export class UnauthorizedError extends DomainError {
  public readonly code = 'UNAUTHORIZED';

  constructor(message: string = 'Yetkilendirme gerekli.') {
    super(message, {}, true);
  }
}

/** Yetki yok (403). Kaynak var ama kullanıcının erişimi yok (IDOR koruması). */
export class ForbiddenError extends DomainError {
  public readonly code = 'FORBIDDEN';

  constructor(message: string = 'Bu işlem için yetkiniz yok.') {
    super(message, {}, true);
  }
}

/** Sunucu/yapılandırma hataları (500). */
export class ConfigurationError extends DomainError {
  public readonly code = 'CONFIGURATION_ERROR';

  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, context, false);
  }
}

/** Beklenmeyen çalışma zamanı hatası (500). */
export class UnexpectedError extends DomainError {
  public readonly code = 'UNEXPECTED_ERROR';

  constructor(cause: unknown) {
    super('Beklenmeyen bir hata oluştu.', { cause: String(cause) }, false);
  }
}

/**
 * Type guard: `unknown` bir değerin DomainError olup olmadığını güvenle kontrol eder.
 * Controller katmanında "bu benim hatam mı, yoksa beklenmedik mi?" kararını bununla verir.
 */
export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}
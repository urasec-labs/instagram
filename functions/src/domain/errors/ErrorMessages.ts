/**
 * ============================================================================
 * DOMAIN / ERRORS / ERROR MESSAGES
 * ----------------------------------------------------------------------------
 * "Zero Hardcoded Strings" ilkesinin bir parçası: kullanıcıya dönük tüm metinler
 * tek merkezde toplanır. Değiştirmek isterseniz sadece burayı güncellemeniz yeterli.
 * ============================================================================
 */

export const ERROR_MESSAGES = {
  UNAUTHORIZED: 'Bu işlem için oturum açmanız gerekiyor.',
  FORBIDDEN: 'Bu kaynağa erişim yetkiniz yok.',
  INVALID_JSON: 'Gönderilen gövde geçerli bir JSON değil.',
  RATE_LIMITED: 'Çok fazla istek gönderildi, lütfen biraz bekleyin.',
  INTERNAL: 'Beklenmeyen bir sunucu hatası oluştu.',
  NOT_FOUND: 'Aradığınız kayıt bulunamadı.',
} as const;

export const VALIDATION_MESSAGES = {
  NAME_REQUIRED: 'Otomasyon adı zorunludur.',
  NAME_TOO_LONG: 'Otomasyon adı çok uzun.',
  KEYWORDS_REQUIRED: 'En az bir tetikleyici kelime eklemelisiniz.',
  KEYWORDS_TOO_MANY: 'Çok fazla tetikleyici kelime eklediniz.',
  KEYWORD_TOO_LONG: 'Bir tetikleyici kelime çok uzun.',
  REPLY_REQUIRED: 'Yanıt mesajı zorunludur.',
  REPLY_TOO_LONG: 'Yanıt mesajı çok uzun.',
  INVALID_MATCH_MODE: 'Geçersiz eşleşme modu.',
  INVALID_TRIGGER: 'Geçersiz tetikleyici tipi.',
} as const;
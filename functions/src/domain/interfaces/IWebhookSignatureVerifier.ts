/**
 * ============================================================================
 * DOMAIN / INTERFACES / I WEBHOOK SIGNATURE VERIFIER
 * ----------------------------------------------------------------------------
 * SRP: "İmza doğrulama" ve "mesaj işleme" kesinlikle AYRI sorumluluklardır.
 * Verifier yalnızca `isValid(...)` cevabı üretir; olayı tanımaz, veritabanına
 * dokunmaz, gönderim yapmaz.
 * ============================================================================
 */

export interface IWebhookSignatureVerifier {
  /**
   * @param rawBody Ham gövde (parse EDİLMEMİŞ — parse etmek imzayı bozar)
   * @param signatureHeader `X-Hub-Signature-256` başlığının değeri
   * @returns imza geçerliyse true
   */
  isValid(rawBody: string, signatureHeader: string | null | undefined): boolean;
}
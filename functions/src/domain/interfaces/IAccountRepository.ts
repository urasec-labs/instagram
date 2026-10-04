/**
 * ============================================================================
 * DOMAIN / INTERFACES / I ACCOUNT REPOSITORY
 * ----------------------------------------------------------------------------
 * Instagram işletme hesabı ↔ Firebase UID eşleşmesi.
 *
 * Webhook'ta gelen `accountId` üzerinden otomasyonların sahibini bulmak için
 * gereklidir. (Şu an "tek sayfa = tek IG hesabı" varsayımı; çoklu hesap
 * desteği için bu port yeterlidir, şema değişikliği gerektirmez.)
 * ============================================================================
 */

export interface InstagramConnection {
  /** Belge ID'si = Instagram Business Account ID. */
  readonly accountId: string;
  readonly ownerId: string;
  readonly instagramUserId: string;
  /** @ kullanıcı adı (loglarda gösterim için). */
  readonly username: string | null;
  /** Meta Graph API için şifreli/uzun ömürlü erişim token'ı. */
  readonly accessToken: string;
  readonly connectedAt: Date;
  readonly isActive: boolean;
}

export interface IAccountRepository {
  /** IG hesap ID'sinden bağlantıyı bulur. Bulunamazsa `AccountNotLinkedError`. */
  findByAccountId(accountId: string): Promise<InstagramConnection>;

  /** UID'ye bağlı tüm aktif hesapları listeler. */
  listByOwner(ownerId: string): Promise<readonly InstagramConnection[]>;

  /** Hesabı bir kullanıcıya bağlar (upsert). */
  upsert(connection: InstagramConnection): Promise<void>;
}
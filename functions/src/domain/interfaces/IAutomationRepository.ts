/**
 * ============================================================================
 * DOMAIN / INTERFACES / I AUTOMATION REPOSITORY
 * ----------------------------------------------------------------------------
 * DEPENDENCY INVERSION PRINCIPLE (DIP):
 * Use-case katmanı Firestore'u değil, bu arayüzü bilir.
 * FirestoreAutomationRepository bu arayüzün altyapı implementasyonudur;
 * istenirse InMemoryAutomationRepository ile test edilebilir.
 * ============================================================================
 */

import type {
  Automation,
  AutomationId,
  CreateAutomationInput,
  MatchMode,
  AutomationTrigger,
} from '../entities/Automation';

/** Liste/filtreleme kriterleri. */
export interface ListAutomationsQuery {
  readonly ownerId: string;
  /** null → tümü, aksi halde yalnızca bu durumdakiler. */
  readonly status?: 'ACTIVE' | 'PASSIVE' | null;
  /** Sonuç sınırı. */
  readonly limit?: number;
}

export interface IAutomationRepository {
  /** Belgeyi ID ile getirir. Bulunamazsa `AutomationNotFoundError` fırlatır. */
  findById(id: AutomationId): Promise<Automation>;

  /** Sahibine göre listeler. */
  list(query: ListAutomationsQuery): Promise<readonly Automation[]>;

  /**
   * Yalnızca TETİKLENEBİLİR (ACTIVE) otomasyonları getirir.
   * Webhook işleme sıcak yolunda bu kullanılır → pasif otomasyonlar
   * gereksiz yere belleğe/veritabanına çekilmez.
   */
  findTriggerable(
    ownerId: string,
    trigger: AutomationTrigger,
  ): Promise<readonly Automation[]>;

  /** Yeni otomasyon oluşturur. */
  create(input: CreateAutomationInput): Promise<Automation>;

  /** Mevcut otomasyonun belirli alanlarını günceller (kısmi güncelleme). */
  update(
    id: AutomationId,
    patch: Partial<
      Pick<Automation, 'name' | 'keywords' | 'matchMode' | 'replyMessage' | 'trigger' | 'updatedAt'>
    >,
  ): Promise<Automation>;

  /** Aktif/pasif durumunu değiştirir. */
  setStatus(id: AutomationId, status: Automation['status']): Promise<Automation>;

  /** Silme. */
  delete(id: AutomationId): Promise<void>;

  /** Aynı kelimeye sahip bir otomasyonun zaten var olup olmadığını kontrol eder. */
  existsWithKeyword(ownerId: string, keyword: string, matchMode: MatchMode): Promise<boolean>;

  /**
   * Çalışma istatistiklerini atomik olarak artırır (FieldValue.increment).
   * Webhook sıcak yolunda her tetiklemede çağrılır; ayrı bir "stats" servisi
   * yerine repository'nin sorumluluğunda tutulur (aggregate = write kaynağı).
   *
   * @param outcome başarılı gönderim mi, hatalı gönderim mi
   */
  recordRun(
    id: AutomationId,
    outcome: 'DELIVERED' | 'FAILED',
    triggeredAt: Date,
  ): Promise<void>;
}
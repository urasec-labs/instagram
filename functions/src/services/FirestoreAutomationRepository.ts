/**
 * ============================================================================
 * SERVICES / FIRESTORE AUTOMATION REPOSITORY
 * ----------------------------------------------------------------------------
 * `IAutomationRepository` portunun altyapı implementasyonu.
 *
 * Sorumluluk sınırı (SRP): yalnızca Firestore <-> Domain dönüşümü.
 * İş kuralları (validasyon, eşleştirme) burada BULUNMAZ; use-case katmanındadır.
 *
 * Timestamp dönüşümü BURADA yapılır: Domain saf `Date` görür, Firebase'e özgü
 * `Timestamp` sadece bu sınıfın bilgisindedir → bağımlılık yönü doğru kalır.
 * ============================================================================
 */

import { FieldValue, Timestamp, type DocumentData, type Query } from 'firebase-admin/firestore';

import { getDb } from '../config/firebaseAdmin';
import { FIRESTORE_COLLECTIONS as C, FIRESTORE_FIELDS as F } from '../config/constants';
import {
  AutomationStatus,
  normalizeKeywords,
  type Automation,
  type AutomationId,
  type CreateAutomationInput,
} from '../domain/entities/Automation';
import type {
  IAutomationRepository,
  ListAutomationsQuery,
} from '../domain/interfaces/IAutomationRepository';
import { AutomationNotFoundError } from '../domain/errors/DomainError';

/** Firestore Timestamp | Date | string | null → Date | null */
function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string' && value.length > 0) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

/** Firestore Timestamp | Date | undefined → Date (fallback epoch) */
function toRequiredDate(value: unknown): Date {
  return toDate(value) ?? new Date(0);
}

/** Ham belge → domain entity. */
function toDomain(documentId: string, data: DocumentData): Automation {
  return {
    id: documentId,
    ownerId: typeof data[F.OWNER_ID] === 'string' ? (data[F.OWNER_ID] as string) : '',
    name: typeof data['name'] === 'string' ? (data['name'] as string) : '',
    keywords: Array.isArray(data[F.KEYWORDS])
      ? (data[F.KEYWORDS] as unknown[]).filter((item): item is string => typeof item === 'string')
      : [],
    matchMode: (data['matchMode'] as Automation['matchMode']) ?? 'CONTAINS',
    replyMessage: typeof data['replyMessage'] === 'string' ? (data['replyMessage'] as string) : '',
    trigger: (data[F.TRIGGER] as Automation['trigger']) ?? 'INBOUND_MESSAGE',
    status: (data[F.STATUS] as Automation['status']) ?? AutomationStatus.PASSIVE,
    stats: {
      matchCount: toNumber(data['stats']?.['matchCount']),
      replyCount: toNumber(data['stats']?.['replyCount']),
      failureCount: toNumber(data['stats']?.['failureCount']),
      lastTriggeredAt: toDate(data['stats']?.[F.LAST_TRIGGERED_AT]),
    },
    createdAt: toRequiredDate(data[F.CREATED_AT]),
    updatedAt: toRequiredDate(data[F.UPDATED_AT]),
  };
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Domain entity → Firestore yazılabilir düz nesne. */
function toFirestore(automation: Automation): DocumentData {
  return {
    [F.OWNER_ID]: automation.ownerId,
    name: automation.name,
    [F.KEYWORDS]: [...automation.keywords],
    matchMode: automation.matchMode,
    replyMessage: automation.replyMessage,
    [F.TRIGGER]: automation.trigger,
    [F.STATUS]: automation.status,
    stats: {
      matchCount: automation.stats.matchCount,
      replyCount: automation.stats.replyCount,
      failureCount: automation.stats.failureCount,
      [F.LAST_TRIGGERED_AT]:
        automation.stats.lastTriggeredAt === null ? null : Timestamp.fromDate(automation.stats.lastTriggeredAt),
    },
    [F.CREATED_AT]: Timestamp.fromDate(automation.createdAt),
    [F.UPDATED_AT]: Timestamp.fromDate(automation.updatedAt),
  };
}

export class FirestoreAutomationRepository implements IAutomationRepository {
  private get collection() {
    return getDb().collection(C.AUTOMATIONS);
  }

  public async findById(id: AutomationId): Promise<Automation> {
    const snapshot = await this.collection.doc(id).get();

    // Guard clause: yoksa anlamlı bir domain hatası fırlat (controller 404 döner).
    if (!snapshot.exists) {
      throw new AutomationNotFoundError(id);
    }

    return toDomain(snapshot.id, snapshot.data() ?? {});
  }

  public async list(query: ListAutomationsQuery): Promise<readonly Automation[]> {
    let baseQuery: Query = this.collection.where(F.OWNER_ID, '==', query.ownerId);

    if (query.status !== undefined && query.status !== null) {
      baseQuery = baseQuery.where(F.STATUS, '==', query.status);
    }

    const snapshot = await baseQuery.orderBy(F.UPDATED_AT, 'desc').limit(query.limit ?? 100).get();

    return snapshot.docs.map((doc) => toDomain(doc.id, doc.data()));
  }

  public async findTriggerable(
    ownerId: string,
    trigger: Automation['trigger'],
  ): Promise<readonly Automation[]> {
    // Composite index gerektiren sorgu: (ownerId, status, trigger)
    // Bu indeks `firestore.indexes.json` dosyasında tanımlıdır.
    const snapshot = await this.collection
      .where(F.OWNER_ID, '==', ownerId)
      .where(F.STATUS, '==', AutomationStatus.ACTIVE)
      .where(F.TRIGGER, '==', trigger)
      .limit(200)
      .get();

    return snapshot.docs.map((doc) => toDomain(doc.id, doc.data()));
  }

  /**
   * Yeni otomasyonu oluşturur.
   *
   * Güvenli varsayılan: yeni otomasyon PASİF doğar. Kullanıcı dashboard'dan
   * açıkça aktifleştirir → "yanlışlıkla spam gönderme" riski ortadan kalkar.
   */
  public async create(input: CreateAutomationInput): Promise<Automation> {
    const created: Automation = {
      id: input.id,
      ownerId: input.ownerId,
      name: input.name.trim(),
      keywords: normalizeKeywords(input.keywords),
      matchMode: input.matchMode,
      replyMessage: input.replyMessage.trim(),
      trigger: input.trigger,
      status: AutomationStatus.PASSIVE,
      stats: { matchCount: 0, replyCount: 0, failureCount: 0, lastTriggeredAt: null },
      createdAt: input.now,
      updatedAt: input.now,
    };

    await this.collection.doc(created.id).create(toFirestore(created));

    return created;
  }

  public async update(
    id: AutomationId,
    patch: Partial<
      Pick<Automation, 'name' | 'keywords' | 'matchMode' | 'replyMessage' | 'trigger' | 'updatedAt'>
    >,
  ): Promise<Automation> {
    // Yazmadan önce varlığı doğrula → 404/500 karışıklığını önler.
    await this.findById(id);

    const document: DocumentData = {};

    if (patch.name !== undefined) {
      document['name'] = patch.name.trim();
    }

    if (patch.keywords !== undefined) {
      document[F.KEYWORDS] = [...patch.keywords];
    }

    if (patch.matchMode !== undefined) {
      document['matchMode'] = patch.matchMode;
    }

    if (patch.replyMessage !== undefined) {
      document['replyMessage'] = patch.replyMessage.trim();
    }

    if (patch.trigger !== undefined) {
      document[F.TRIGGER] = patch.trigger;
    }

    if (patch.updatedAt !== undefined) {
      document[F.UPDATED_AT] = Timestamp.fromDate(patch.updatedAt);
    }

    await this.collection.doc(id).update(document);

    return this.findById(id);
  }

  public async setStatus(id: AutomationId, status: Automation['status']): Promise<Automation> {
    await this.collection.doc(id).update({
      [F.STATUS]: status,
      [F.UPDATED_AT]: FieldValue.serverTimestamp(),
    });

    return this.findById(id);
  }

  public async delete(id: AutomationId): Promise<void> {
    await this.findById(id); // var olmayan kaydı sessizce silme
    await this.collection.doc(id).delete();
  }

  public async existsWithKeyword(
    ownerId: string,
    keyword: string,
    matchMode: Automation['matchMode'],
  ): Promise<boolean> {
    // `array-contains` yalnızca tam elman eşleşmesi yapar; normalize edilmiş
    // kelimeler storage'da zaten normalize durumda olduğu için doğrudur.
    const snapshot = await this.collection
      .where(F.OWNER_ID, '==', ownerId)
      .where(F.KEYWORDS, 'array-contains', keyword)
      .where('matchMode', '==', matchMode)
      .limit(1)
      .get();

    return !snapshot.empty;
  }

  /**
   * Webhook sıcak yolundan çağrılır.
   *
   * Neden FieldValue.increment? → Aynı otomasyon saniyeler içinde yüzlerce kez
   * tetiklenebilir. Önce oku-sonra-yaz (read-modify-write) yapılsaydı
   * yarış koşulunda sayaçlar kaybolurdu. `increment` sunucu tarafında
   * atomik çalışır.
   *
   * "matched" her tetiklemede artar (eşleşen ama gönderilemeyen de sayılır).
   */
  public async recordRun(
    id: AutomationId,
    outcome: 'DELIVERED' | 'FAILED',
    triggeredAt: Date,
  ): Promise<void> {
    await this.collection.doc(id).update({
      [`stats.${outcome === 'DELIVERED' ? 'replyCount' : 'failureCount'}`]: FieldValue.increment(1),
      'stats.matchCount': FieldValue.increment(1),
      [`stats.${F.LAST_TRIGGERED_AT}`]: Timestamp.fromDate(triggeredAt),
      [F.UPDATED_AT]: Timestamp.fromDate(triggeredAt),
    });
  }
}
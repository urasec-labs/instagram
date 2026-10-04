/**
 * ============================================================================
 * SERVICES / FIRESTORE LOG REPOSITORY
 * ----------------------------------------------------------------------------
 * `ILogRepository` portunun Firestore implementasyonu.
 *
 * Not: Log yazımı webhook işleme sırasında "en az bir kez" (at-least-once)
 * olmalıdır. Bu yüzden `append` idempotent değildir ama çağıran taraf
 * hata halinde gönderimi geri almaz (mesaj zaten gitmiştir) — bu bilinçli
 * bir trade-off'tur ve README'de belgelenmiştir.
 * ============================================================================
 */

import { Timestamp, type DocumentData } from 'firebase-admin/firestore';

import { getDb } from '../config/firebaseAdmin';
import { FIRESTORE_COLLECTIONS as C } from '../config/constants';
import {
  type ActivityLog,
  type AppendLogInput,
  type LogId,
  LogStatus,
  MessageDirection,
  InboundEventType,
  SocialPlatform,
} from '../domain/entities/Log';
import type { ILogRepository, ListLogsQuery } from '../domain/interfaces/ILogRepository';

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  return new Date();
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Ham belge → domain entity. */
function toDomain(documentId: string, data: DocumentData): ActivityLog {
  return {
    id: documentId,
    ownerId: asString(data['ownerId']),
    automationId: asNullableString(data['automationId']),
    platform: data['platform'] ?? SocialPlatform.INSTAGRAM,
    direction: data['direction'] ?? MessageDirection.OUTBOUND,
    eventType: data['eventType'] ?? InboundEventType.UNKNOWN,
    status: data['status'] ?? LogStatus.PROCESSED,
    matchedKeyword: asNullableString(data['matchedKeyword']),
    recipient: asNullableString(data['recipient']),
    content: asString(data['content']),
    externalMessageId: asNullableString(data['externalMessageId']),
    errorMessage: asNullableString(data['errorMessage']),
    latencyMs: asNumberOrNull(data['latencyMs']),
    createdAt: toDate(data['createdAt']),
  };
}

/** Domain girdi → Firestore yazılabilir düz nesne. */
function toFirestore(input: AppendLogInput): DocumentData {
  return {
    ownerId: input.ownerId,
    automationId: input.automationId,
    platform: input.platform,
    direction: input.direction,
    eventType: input.eventType,
    status: input.status,
    matchedKeyword: input.matchedKeyword,
    recipient: input.recipient,
    content: input.content.slice(0, 1000), // log şişmesini önle
    externalMessageId: input.externalMessageId,
    errorMessage: input.errorMessage === null ? null : input.errorMessage.slice(0, 500),
    latencyMs: input.latencyMs,
    createdAt: Timestamp.fromDate(input.now),
  };
}

export class FirestoreLogRepository implements ILogRepository {
  private get collection() {
    return getDb().collection(C.LOGS);
  }

  public async append(input: AppendLogInput): Promise<LogId> {
    const document = this.collection.doc();
    await document.create(toFirestore(input));

    return document.id;
  }

  public async appendMany(inputs: readonly AppendLogInput[]): Promise<void> {
    // Guard clause: Firestore batch en fazla 500 yazma kabul eder.
    if (inputs.length === 0) {
      return;
    }

    const batch = getDb().batch();

    for (const input of inputs.slice(0, 500)) {
      batch.create(this.collection.doc(), toFirestore(input));
    }

    await batch.commit();
  }

  public async list(query: ListLogsQuery): Promise<readonly ActivityLog[]> {
    const snapshot = await this.collection
      .where('ownerId', '==', query.ownerId)
      .orderBy('createdAt', 'desc')
      .limit(query.limit ?? 100)
      .get();

    const docs = snapshot.docs.map((doc) => toDomain(doc.id, doc.data()));

    // Durum/yön filtresi bellekte uygulanır: kullanıcıya özel indeks
    // patlaması yaşamamak için bu alanlara composite index tanımlanmaz.
    return docs.filter((log) => {
      if (query.status !== undefined && query.status !== null && log.status !== query.status) {
        return false;
      }

      if (
        query.direction !== undefined &&
        query.direction !== null &&
        log.direction !== query.direction
      ) {
        return false;
      }

      return true;
    });
  }

  public async aggregateStats(ownerId: string): Promise<{
    totalLogs: number;
    deliveredCount: number;
    failedCount: number;
    ignoredCount: number;
  }> {
    const snapshot = await this.collection
      .where('ownerId', '==', ownerId)
      .orderBy('createdAt', 'desc')
      .limit(1000)
      .get();

    const counts = {
      totalLogs: 0,
      deliveredCount: 0,
      failedCount: 0,
      ignoredCount: 0,
    };

    for (const doc of snapshot.docs) {
      const status = doc.data()['status'] as LogStatus | undefined;

      counts.totalLogs += 1;

      if (status === LogStatus.DELIVERED) {
        counts.deliveredCount += 1;
        continue;
      }

      if (status === LogStatus.FAILED) {
        counts.failedCount += 1;
        continue;
      }

      if (status === LogStatus.IGNORED) {
        counts.ignoredCount += 1;
      }
    }

    return counts;
  }

  /** Bakım işi: `LOG_RETENTION_DAYS` gününden eski logları siler. */
  public async purgeOlderThan(days: number): Promise<number> {
    const cutoff = Timestamp.fromMillis(Date.now() - days * 24 * 60 * 60 * 1000);

    const snapshot = await this.collection.where('createdAt', '<=', cutoff).limit(400).get();

    if (snapshot.empty) {
      return 0;
    }

    const batch = getDb().batch();

    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }

    await batch.commit();

    return snapshot.size;
  }
}
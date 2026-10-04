/**
 * ============================================================================
 * SERVICES / FIRESTORE ACCOUNT REPOSITORY
 * ----------------------------------------------------------------------------
 * `IAccountRepository` portunun Firestore implementasyonu.
 * `connections/{igAccountId}` şeması kullanılır.
 * ============================================================================
 */

import { Timestamp, type DocumentData } from 'firebase-admin/firestore';

import { getDb } from '../config/firebaseAdmin';
import { FIRESTORE_COLLECTIONS as C } from '../config/constants';
import { AccountNotLinkedError } from '../domain/errors/DomainError';
import type {
  IAccountRepository,
  InstagramConnection,
} from '../domain/interfaces/IAccountRepository';

function toDomain(documentId: string, data: DocumentData): InstagramConnection {
  return {
    accountId: documentId,
    ownerId: typeof data['ownerId'] === 'string' ? (data['ownerId'] as string) : '',
    instagramUserId: typeof data['instagramUserId'] === 'string' ? (data['instagramUserId'] as string) : '',
    username: typeof data['username'] === 'string' ? (data['username'] as string) : null,
    accessToken: typeof data['accessToken'] === 'string' ? (data['accessToken'] as string) : '',
    connectedAt:
      data['connectedAt'] instanceof Timestamp ? (data['connectedAt'] as Timestamp).toDate() : new Date(0),
    isActive: data['isActive'] === true,
  };
}

export class FirestoreAccountRepository implements IAccountRepository {
  private get collection() {
    return getDb().collection(C.CONNECTIONS);
  }

  public async findByAccountId(accountId: string): Promise<InstagramConnection> {
    const snapshot = await this.collection.doc(accountId).get();

    // Guard clause: bağlı olmayan hesapta webhook sessizce düşürülür.
    if (!snapshot.exists) {
      throw new AccountNotLinkedError(accountId);
    }

    const connection = toDomain(snapshot.id, snapshot.data() ?? {});

    if (!connection.isActive) {
      throw new AccountNotLinkedError(accountId);
    }

    return connection;
  }

  public async listByOwner(ownerId: string): Promise<readonly InstagramConnection[]> {
    const snapshot = await this.collection.where('ownerId', '==', ownerId).get();

    return snapshot.docs.map((doc) => toDomain(doc.id, doc.data()));
  }

  public async upsert(connection: InstagramConnection): Promise<void> {
    await this.collection.doc(connection.accountId).set(
      {
        ownerId: connection.ownerId,
        instagramUserId: connection.instagramUserId,
        username: connection.username,
        accessToken: connection.accessToken,
        connectedAt: Timestamp.fromDate(connection.connectedAt),
        isActive: connection.isActive,
      },
      { merge: true },
    );
  }
}
/**
 * ============================================================================
 * CONFIG / FIREBASE ADMIN BOOTSTRAP
 * ----------------------------------------------------------------------------
 * firebase-admin SDK'nın TEK örneğini üreten modül (Singleton).
 *
 * Birden fazla modülün ayrı ayrı `initializeApp()` çağırması "Firebase app
 * already exists" hatasına yol açar; bu dosya o sorunu ortadan kaldırır.
 * ============================================================================
 */

import { applicationDefault, initializeApp, getApps, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { getEnv } from './env';

let cachedApp: App | null = null;
let cachedDb: Firestore | null = null;

/** Admin SDK uygulamasını döndürür (idempotent). */
export function getAdminApp(): App {
  if (cachedApp !== null) {
    return cachedApp;
  }

  const env = getEnv();

  // `getApps()` kontrolü hot-reload ve testlerde tekrar initialize etmeyi
  // engeller (SRP: bu dosyanın tek işi "başlat").
  //
  // `applicationDefault()` sırasıyla: GOOGLE_APPLICATION_CREDENTIALS →
  // gcloud ADC → Cloud Functions metadata sunucusu sırasını dener.
  // Emulator Suite ve üretim ortamının ikisi de bu yolu kullanır.
  cachedApp =
    getApps()[0] ??
    initializeApp({
      credential: applicationDefault(),
      projectId: env.FIREBASE_PROJECT_ID,
    });

  return cachedApp;
}

/** Firestore instance'ını döndürür (idempotent). */
export function getDb(): Firestore {
  if (cachedDb !== null) {
    return cachedDb;
  }

  const db = getFirestore(getAdminApp());

  // Sunucusuz ortamda istemci kütüphanesi olmadığı için UTC varsayılandırılır.
  db.settings({ ignoreUndefinedProperties: true });

  cachedDb = db;
  logger.debug('[firebase] Firestore başlatıldı.');

  return cachedDb;
}
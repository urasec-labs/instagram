/**
 * ============================================================================
 * LIB / FIREBASE (CLIENT SDK)
 * ----------------------------------------------------------------------------
 * Tarayıcı tarafı Firebase istemci SDK'sının TEK kurulum noktası.
 *
 * "Zero Hardcoded Strings": tüm anahtarlar `NEXT_PUBLIC_*` ortam
 * değişkenlerinden gelir. Eksik değişken build'i durdurmamalı ama çalışma
 * zamanında açık bir hata vermeli (geliştiriciyi yanıltmayız).
 *
 * Singleton gerekçesi: Next.js App Router'da modül bir kez yüklenir ama
 * React StrictMode ve HMR altında `initializeApp` birden fazla çağrılabilir;
 * `getApps()` kontrolü bunu engeller.
 * ============================================================================
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

/**
 * Ortam değişkenlerinin strongly-typed şeması.
 * Next.js `process.env` değerlerini build time'da satır içine gömer; bu
 * yüzden burada `undefined` olamaz, boş string olabilir.
 */
interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

/**
 * Zorunlu alanları doğrulayarak config üretir.
 * @throws Error eksik ortam değişkeni varsa — sessizce boz app oluşturmak
 *         "Cannot read property of undefined" gibi anlaşılmaz hatalara yol açar.
 */
function readConfig(): FirebaseConfig {
  const config: FirebaseConfig = {
    apiKey: process.env['NEXT_PUBLIC_FIREBASE_API_KEY'] ?? '',
    authDomain: process.env['NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'] ?? '',
    projectId: process.env['NEXT_PUBLIC_FIREBASE_PROJECT_ID'] ?? '',
    storageBucket: process.env['NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'] ?? '',
    messagingSenderId: process.env['NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'] ?? '',
    appId: process.env['NEXT_PUBLIC_FIREBASE_APP_ID'] ?? '',
  };

  const missing = Object.entries(config)
    .filter(([, value]) => value.length === 0)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Firebase yapılandırması eksik: ${missing.join(', ')}. ` +
        'Proje kökünde `.env.local` dosyasını `.env.example`dan kopyalayıp doldurun.',
    );
  }

  return config;
}

/** Firebase uygulamasını döndürür (idempotent). */
export function getFirebaseApp(): FirebaseApp {
  // Guard: Sunucu tarafında (SSR) SDK'yı başlatma — `window` gerekir.
  if (typeof window === 'undefined') {
    throw new Error('Firebase Client SDK yalnızca tarayıcıda kullanılabilir.');
  }

  return getApps().length > 0 ? getApp() : initializeApp(readConfig());
}

/** Authentication örneği. */
export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

/**
 * Firestore örneği (offline-first / kalıcı önbellekli).
 *
 * Neden `initializeFirestore` ve `getFirestore` farkı?
 *  - `getFirestore`    → her zaman aynı instance'ı döner, önbellek ayarı yok.
 *  - `initializeFirestore` → önbellek ayarı verilebilir AMA ikinci kez
 *    çağrıldığında "already been initialized" hatası fırlatır.
 *
 * Bu yüzden modül yüklenirken (SSR dışında) kalıcı önbellekli instance
 * bir kez kurulur ve `getFirestoreDb` her zaman O instance'ı döner.
 * Böylece çevrimdışı kullanıcı sayfa yenilese bile verisini görür.
 */
let firestoreInstance: Firestore | null = null;

export function getFirestoreDb(): Firestore {
  // Guard: Sunucu tarafında SDK kullanılmaz (client-only bileşenler).
  if (typeof window === 'undefined') {
    throw new Error('Firestore Client SDK yalnızca tarayıcıda kullanılabilir.');
  }

  if (firestoreInstance !== null) {
    return firestoreInstance;
  }

  const app = getFirebaseApp();

  try {
    firestoreInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    // "already initialized" → mevcut instance'ı kullan.
    firestoreInstance = getFirestore(app);
  }

  return firestoreInstance;
}
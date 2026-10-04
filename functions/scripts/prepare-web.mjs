/**
 * ============================================================================
 * SCRIPTS / PREPARE WEB
 * ----------------------------------------------------------------------------
 * Next.js `standalone` derleme çıktısını Cloud Functions paketine kopyalar.
 *
 * NEDEN?
 * `firebase.json` hosting, dashboard sayfalarını bir Cloud Function'a
 * rewrite eder (`"**"` → `web`). Bu fonksiyon `next()` sunucusunu çalıştırır
 * ve derleme çıktısını `functions/lib/web/standalone` altında arar.
 *
 * Bu script o dizini oluşturur / günceller.
 *
 * KULLANIM:
 *   1) Proje kökünde:  npm run build          → .next/standalone üretilir
 *   2) Bu script:      npm run prepare:web --prefix functions
 *      (veya functions/ içinde: npm run prepare:web)
 *
 * Not: Deploy öncesi `firebase.json > functions.ignore` içinde `lib/` yoksa
 * derlenmiş JS paketlenir; `node_modules` cloudfunctions tarafından ayrıca
 * yüklenir.
 * ============================================================================
 */

import { cp, mkdir, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Bu script'in bulunduğu klasör: `<root>/functions/scripts` */
const FUNCTIONS_DIR = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(FUNCTIONS_DIR, '..');

/** Kaynak: Next.js standalone çıktısı */
const SOURCE_DIR = path.join(PROJECT_ROOT, '.next', 'standalone');

/** Hedef: Functions paket içindeki web dizini */
const TARGET_DIR = path.join(FUNCTIONS_DIR, 'lib', 'web');

/** Hedefin içine konacak alt dizin adı (nextWebServer.ts ile eşleşmeli) */
const STANDALONE_SUBDIR = 'standalone';

/** Statik dosyaların kopyalanacağı yerler. */
const STATIC_DIR = path.join(PROJECT_ROOT, '.next', 'static');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');

async function exists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  // --- Ön koşul: Next.js derlenmiş mi? ------------------------------------
  if (!(await exists(SOURCE_DIR))) {
    console.error(
      [
        '',
        'HATA: Next.js standalone çıktısı bulunamadı.',
        `  Beklenen: ${SOURCE_DIR}`,
        '',
        '  Çözüm: Proje kökünde şu komutları çalıştırın:',
        '    npm run build',
        '    npm run prepare:web --prefix functions',
        '',
      ].join('\n'),
    );

    // `predeploy` bu scripti tetiklediği için hata kod döndürerek deploy'u durdurur.
    process.exitCode = 1;
    return;
  }

  console.log('[prepare:web] Hedef hazırlanıyor…');

  // Eski çıktıyı temizle → stale dosya birikmesini önler.
  await rm(TARGET_DIR, { recursive: true, force: true });
  await mkdir(TARGET_DIR, { recursive: true });

  // --- 1) Sunucu kodu + bağımlılıklar --------------------------------------
  const destination = path.join(TARGET_DIR, STANDALONE_SUBDIR);

  console.log('[prepare:web] Standalone çıktısı kopyalanıyor…');
  await cp(SOURCE_DIR, destination, { recursive: true });

  // --- 2) Statik dosyalar ---------------------------------------------------
  // Next'in standalone çıktısı `.next/static` ve `public` klasörlerini
  // İÇERMEZ; ayrıca kopyalanmalıdır.
  if (await exists(STATIC_DIR)) {
    console.log('[prepare:web] .next/static kopyalanıyor…');
    await cp(STATIC_DIR, path.join(destination, '.next', 'static'), { recursive: true });
  }

  if (await exists(PUBLIC_DIR)) {
    console.log('[prepare:web] public/ kopyalanıyor…');
    await cp(PUBLIC_DIR, path.join(destination, 'public'), { recursive: true });
  }

  // --- 3) Ortam değişkeni notu ---------------------------------------------
  // Next build sırasında NEXT_PUBLIC_* değerlerini inline ettiği için
  // runtime'da değişiklik yapılamaz. Bu yüzden kullanıcıya hatırlatılır.
  const warningPath = path.join(destination, 'DEPLOY_NOTE.txt');

  await import('node:fs/promises').then(({ writeFile }) =>
    writeFile(
      warningPath,
      [
        'Bu dizin Next.js `standalone` derleme çıktısının kopyasıdır.',
        '',
        'ÖNEMLİ: NEXT_PUBLIC_* ortam değişkenleri build sırasında inline edilir.',
        'Firebase proje kimlik bilgilerini değiştirdiyseniz proje kökünde',
        '`npm run build` komutunu YENİDEN çalıştırıp bu scripti tekrar yürütün.',
        '',
      ].join('\n'),
      'utf8',
    ),
  );

  console.log(`[prepare:web] Tamamlandı → ${TARGET_DIR}`);
}

main().catch((error) => {
  console.error('[prepare:web] Başarısız:', error);
  process.exitCode = 1;
});
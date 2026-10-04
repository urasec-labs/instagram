# Instagram DM & Yorum Otomasyonu Platformu

Açık kaynaklı, **ManyChat alternatifi** Instagram otomasyon platformu.
Anahtar kelimeye tepki veren otomatik DM/yorum yanıtları, gerçek zamanlı
gönderim logları ve analitik dashboard.

> **Tech Stack:** Next.js 14 (App Router, TS) · Tailwind CSS · Shadcn UI · Firebase Cloud Functions v2 (Node 20, TS) · Firestore · Firebase Auth · Meta Graph API `v19.0`

---

## 📐 Mimari

Katmanlar arası bağımlılık **tek yöndedir** (bağımlılıklar daima içeri doğru akar):

```
┌──────────────────────────────────────────────────────────────┐
│  /src                      Next.js App Router (Frontend)     │
│  components/ ui/ · dashboard/ · lib/ · providers/            │
└──────────────────────────────────────────────────────────────┘
              │  fetch / onSnapshot
              ▼
┌──────────────────────────────────────────────────────────────┐
│  /functions/src                                               │
│                                                              │
│  adapters/http/     Controller — HTTP giriş/çıkış, routing  │
│      ▲                    (iş mantığı YOK)                   │
│      │                                                        
│  use-cases/         İş kurallarının orkestrasyonu             │
│      ▲                                                     │
│      │                                                     │
│  services/          Altyapı implementasyonları (DIP/DIP ⚡)  │
│      ▲  ── portlar (I*Repository, IMessagingService) ──┐     │
│      │                                                 │     │
│  domain/            Ssaf iş mantığı — 0 bağımlılık ◀────┘     │
│    entities/ matchers/ validation/ interfaces/ errors/        │
└──────────────────────────────────────────────────────────────┘
              │
              ▼
    Firestore · Meta Graph API
```

**`domain/` klasöründe hiçbir `import` yoktur** — kütüphane, SDK veya I/O bulunmaz.
Tüm bağımlılıklar `use-cases` ve `adapters` tarafından `container.ts` üzerinden enjekte edilir.

### SOLID karşılıkları

| İlke | Nerede | Nasıl |
|---|---|---|
| **SRP** | `MetaWebhookSignatureVerifier` | Sadece HMAC doğrular; olayı tanımaz, veri tabanına dokunmaz, mesaj göndermez |
| **OCP** | `IMessagingService` | WhatsApp/Telegram eklemek için yeni sınıf + container'a 1 satır; use-case'ler değişmez |
| **DIP** | `IAutomationRepository` vb. | Use-case somut `Firestore*` sınıfını görmez; fake ile test edilebilir |
| **Guard Clauses** | `use-cases/*` | Her fonksiyon önce `if (...) return` ile geçersiz durumları eler |
| **Strict Errors** | `domain/errors/DomainError.ts` | `ValidationError`, `AutomationNotFoundError`, `MetaApiError`… `expose` flag'i ile güvenli mesaj garantisi |

---

## 📂 Dosya Yapısı

```
.
├── firebase.json                  # Hosting rewrites + Functions + Emulator
├── firestore.rules                # Güvenlik kuralları (ownerId izolasyonu)
├── firestore.indexes.json         # Composite index tanımları
├── .env.example                   # Frontend ortam değişkenleri
├── .firebaserc
│
├── functions/
│   ├── package.json               # Node 20 · CommonJS
│   ├── tsconfig.json              # strict + noUncheckedIndexedAccess
│   ├── scripts/prepare-web.mjs    # Next standalone → Functions paketi
│   ├── .env.example
│   └── src/
│       ├── index.ts               # Fonksiyon tanımları (bağlama katmanı)
│       ├── container.ts           # COMPOSITION ROOT — tüm DI bağları
│       ├── config/                # env.ts · constants.ts · firebaseAdmin.ts
│       ├── domain/
│       │   ├── entities/          # Automation.ts · Log.ts
│       │   ├── interfaces/        # IMessagingService · I*Repository · Http.ts
│       │   ├── errors/            # DomainError.ts · ErrorMessages.ts
│       │   ├── matchers/          # KeywordMatcher.ts  ← iş mantığının kalbi
│       │   └── validation/        # AutomationValidator.ts
│       ├── services/              # MetaInstagramService · Firestore* · …
│       ├── use-cases/             # HandleWebhookEvent · VerifyWebhook · CRUD
│       ├── adapters/http/         # webhookController · automationController
│       └── tests/                 # node:test birim testleri
│
└── src/                           # Next.js Dashboard
    ├── app/
    │   ├── layout.tsx             # Root layout + AuthProvider + tema script'i
    │   ├── globals.css            # Shadcn CSS değişkenleri (light/dark)
    │   ├── (auth)/login/page.tsx  # Email/Password + Google girişi
    │   └── dashboard/
    │       ├── layout.tsx         # AuthGuard + Navbar + kabuk
    │       ├── page.tsx           # Analitik & hızlı loglar
    │       ├── automations/page.tsx  # CRUD tablosu + modal + toggle
    │       └── logs/page.tsx      # Canlı aktivite akışı
    ├── components/
    │   ├── ui/                    # button · input · table · switch · dialog …
    │   └── dashboard/             # AutomationCard · KeywordInput · Navbar …
    ├── lib/                       # firebase.ts · firestore-hooks.ts · types · utils
    └── providers/AuthProvider.tsx
```

---

## ⚡ Hızlı Başlangıç

### 0) Gereksinimler

- Node.js **20+**
- Firebase CLI: `npm i -g firebase-tools`
- Bir Firebase projesi (Blaze plan **zorunlu** — Cloud Functions + scheduling için)
- Instagram Business/Creator hesabı bağlı bir Meta App

### 1) Ortam değişkenleri

```bash
# Proje kökü (frontend)
cp .env.example .env.local
# Firebase Console > Project Settings > General > Your apps içinden değerleri yapıştır

# functions/
cp functions/.env.example functions/.env
# FIREBASE_PROJECT_ID · META_APP_ID · META_APP_SECRET · META_VERIFY_TOKEN
# değerlerini Meta for Developers > App Settings > Basic'den alın
```

`.firebaserc` içindeki `projects.default` alanını kendi proje ID'nizle güncelleyin.

### 2) Bağımlılıklar + tip kontrolü

```bash
npm install
npm install --prefix functions

npm run typecheck          # Frontend
npm run typecheck --prefix functions
npm run test --prefix functions
```

### 3) Yerel geliştirme

```bash
# Dashboard (port 3000)
npm run dev

# Functions Emulator (port 5001) + Firestore (8080) + Hosting (5000)
npm run serve --prefix functions
```

> Firebase Emulator Suite, `functions/.env` değerlerini otomatik okur.
> Firestore kuralları emülatörde de **aktif** olduğu için `ownerId` izolasyonu
> yerelde de test edilir.

### 4) Instagram hesabını bağlama

`connections` koleksiyonuna şu belgeyi ekleyin (`accountId` = Instagram Business Account ID):

```json
{
  "ownerId": "<Firebase UID>",
  "instagramUserId": "<IG Business ID>",
  "username": "hesabiniz",
  "accessToken": "<uzun ömürlü IG token>",
  "connectedAt": "<Timestamp>",
  "isActive": true
}
```

Bu belge olmadan webhook'lar `AccountNotLinkedError` (404) ile düşer.

### 5) Meta Webhook ayarı

Meta for Developers → App → **Webhooks → Instagram** → Callback URL:

```
https://<region>-<project>.cloudfunctions.net/api/webhook
```

- **Verify token:** `functions/.env` içindeki `META_VERIFY_TOKEN`
- **Subscribe to:** `messages`, `messaging_postbacks`, `comments`

`GET` doğrulaması `VerifyWebhookUseCase`, `POST` işlemesi `HandleWebhookEventUseCase` tarafından yapılır.

### 6) Deploy

```bash
npm run build                          # Next standalone
npm run prepare:web --prefix functions  # Çıktıyı Functions paketine kopyala
npm run build --prefix functions       # TS → lib/

npx firebase deploy --only functions
npx firebase deploy --only firestore:rules,firestore:indexes
npx firebase deploy --only hosting
```

`firebase.json` hosting rewrites zinciri:

| Kaynak | Hedef |
|---|---|
| `/api/webhook` | `apiWebhook` fonksiyonu |
| `/api/automations`, `/api/automations/**` | `apiAutomations` fonksiyonu |
| `/api/stats` | `apiAutomations` fonksiyonu |
| `/api/health` | `healthCheck` fonksiyonu |
| `**` (catch-all) | `web` fonksiyonu (Next.js SSR) |

---

## 🔄 Webhook İşleme Akışı

```
Meta  ──POST──▶  webhookController
                   │
                   ├─ GET  → VerifyWebhookUseCase      → challenge metni
                   │
                   └─ POST
                       ├─ 1. MetaWebhookSignatureVerifier.isValid()   ← SRP: ayrı sınıf
                       ├─ 2. MetaWebhookPayloadParser.parse()        ← JSON → InboundEvent
                       ├─ 3. IAccountRepository.findByAccountId()     ← ownerId çözümü
                       ├─ 4. IAutomationRepository.findTriggerable()  ← sadece ACTIVE'ler
                       ├─ 5. KeywordMatcher.selectMatchingAutomation()← EN UZUN kelime kazanır
                       ├─ 6. renderTemplate()                         ← {username} {date} {time}
                       ├─ 7. IMessagingService.sendDirectMessage()     ← Meta Graph API v19.0
                       ├─ 8. ILogRepository.append()  (asenkron)      ← log yazımı yanıtı geciktirmez
                       └─ 9. IAutomationRepository.recordRun()        ← FieldValue.increment
```

### Kritik tasarım kararları

**Meta'ya daima HTTP 200 dönülür.** Meta, 2xx dönmediğimizde isteği 5 kez
yeniden dener — bu, kullanıcıya 5 kopya DM olarak yansır. Tek bir olayın
patlaması diğerlerini etkilemesin diye `HandleWebhookEvent` **hata izolasyonu**
yapar (`processEventSafely`).

**İmza doğrulaması `rawBody` üzerinden yapılır.** JSON gövde parse
edildikten sonra imza hesaplanamaz. `firebase-admin` bunu otomatik sağlar.

**Log yazımı asenkrondur.** Kullanıcıya dönen yanıt, log yazımından
önceliklidir. Yazma hatası `IGNORED` edilmez — loga düşer (`appendLogSafely`).

**Pasif otomasyonlar iki kez korunur:** hem Firestore sorgusunda filtrelenir
(`findTriggerable`), hem `KeywordMatcher` içinde `status !== ACTIVE` kontrolü.

---

## 🔐 Güvenlik

| Katman | Önlem |
|---|---|
| Webhook | `X-Hub-Signature-256` HMAC + `timingSafeEqual` (fail-closed) |
| DoS | Olay başına zaman aşımı (`AbortController`), olay sayısı limiti (`MAX_EVENTS_PER_REQUEST`) |
| IDOR | Her use-case `existing.ownerId !== ownerId` kontrolü yapar → 403 |
| Token sızıntısı | `accessToken` loglarda maskelenir, `connections` client SDK ile **okunamaz** |
| Log sahteciliği | `firestore.rules`: `logs` koleksiyonuna client yazımı **`if false`** |
| Sayaç sahteciliği | Kurallar `stats` alanının değiştirilmesini reddeder |
| Aktif spam | Yeni otomasyon `PASSIVE` doğar; `create` kuralı `ACTIVE` kabul etmez |
| XSS / clickjacking | Hosting header'ları: `X-Frame-Options`, `nosniff`, `HSTS` |
| Hata sızıntısı | `DomainError.expose === false` → istemciye generic mesaj |

---

## 🧩 Yeni Platform Ekleme (WhatsApp / Telegram)

OCP sayesinde **hiçbir mevcut dosya değişmeden**:

1. `domain/interfaces/IMessagingService.ts` → zaten tanımlı, uygulanır
2. `services/WhatsAppService.ts` → `IMessagingService`'i uygular
3. `container.ts` → `messagingServices` dizisine bir eleman daha ekle

`HandleWebhookEvent`, controller'lar ve webhook akışı **aynen kalır**.

---

## 🧪 Test

```bash
npm run test --prefix functions
```

`functions/src/tests/KeywordMatcher.test.ts` — domain saf fonksiyonları için
21 test (normalize, eşleşme, öncelik, şablon, limit kırpma).
Node'un yerleşik `node:test` runner'ı kullanılır (sıfır bağımlılık).

---

## ⚠️ Üretim Notları

- **`NEXT_PUBLIC_*` değerleri build sırasında inline edilir.** Firebase kimlik
  bilgisi değiştirdiyseniz `npm run build && npm run prepare:web` çalıştırın.
- **Log temizleme** her gece 03:00'te `LOG_RETENTION_DAYS` (varsayılan 30) gününden
  eski kayıtları siler. `purgeOldLogs` fonksiyonu bunu yapar.
- **Instagram Messaging Policy:** 24 saatlik pencerenin dışında DM göndermek için
  `messaging_type: MESSAGE` + `tag: HUMAN_AGENT` gerekir. Yorum yanıtlarında bu
  kısıt yoktur. Platform politikalarına uyum kullanıcının sorumluluğundadır.
- **Firestore maliyeti:** Her webhook, eşleşme bulamasa bile bir `IGNORED` log
  yazar. Yüksek trafikte `logs` koleksiyonuna TTL veya BigQuery export düşünün.

---

## 📄 Lisans

MIT — açık kaynak, ticari kullanım serbest.
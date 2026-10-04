/**
 * ============================================================================
 * APP / ROOT LAYOUT
 * ----------------------------------------------------------------------------
 * Next.js App Router'da TEK zorunlu layout.
 *
 * Sorumlulukları:
 *  - `<html>`/`<body>` iskeleti
 *  - Metadata (SEO, title, description)
 *  - Global stiller
 *  - `AuthProvider` ile tüm ağaca auth bağlamını sağlamak
 *  - Varsayılan koyu tema uygulaması (FOUC önleme)
 * ============================================================================
 */

import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';

import { AuthProvider } from '@/providers/AuthProvider';
import './globals.css';

/**
 * Font: `next/font` yazı tipini build sırasında indirip yerelleştirir →
 * CLS (layout shift) ve performans sorunu olmaz, ayrıca font dosyası CDN'den
 * çekilmez.
 */
const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-sans',
});

const appName = process.env['NEXT_PUBLIC_APP_NAME'] ?? 'InstaFlow';

export const metadata: Metadata = {
  title: {
    default: `${appName} — Instagram Otomasyon Platformu`,
    template: `%s | ${appName}`,
  },
  description:
    'Instagram DM ve yorum otomasyonu platformu. Anahtar kelime tetikli otomatik yanıtlar, gerçek zamanlı gönderim logları ve analitik dashboard.',
  applicationName: appName,
  robots: {
    // Dashboard giriş gerektirir → indekslenmemeli.
    index: false,
    follow: false,
  },
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
  width: 'device-width',
  initialScale: 1,
};

/**
 * Koyu temayı erken uygulayan inline script.
 *
 * Neden gerekli? React yüklenene kadar tarayıcı varsayılanı (açık tema)
 * boyar; sonra `dark` sınıfı eklenir ve kullanıcı bir anlık beyaz parlama görür
 * (FOUC). Bu küçük script `beforeInteractive` stratejisiyle bunu engeller.
 */
const themeScript = `
(function() {
  try {
    var saved = localStorage.getItem('theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var isDark = saved ? saved === 'dark' : prefersDark;
    if (isDark) document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): JSX.Element {
  return (
    <html lang="tr" suppressHydrationWarning className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-background font-sans">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
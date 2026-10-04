/**
 * ============================================================================
 * APP / DASHBOARD / LAYOUT
 * ----------------------------------------------------------------------------
 * `/dashboard/*` altındaki TÜM sayfaları kapsayan layout.
 *
 * İki sorumluluğu vardır:
 *  1. Kimlik doğrulama koruması (`AuthGuard`)
 *  2. Ortak kabuk: navbar + içerik alanı
 * ============================================================================
 */

'use client';

import { AuthGuard } from '@/components/dashboard/AuthGuard';
import { Navbar } from '@/components/dashboard/Navbar';

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): JSX.Element {
  return (
    <AuthGuard requireAuth>
      <div className="flex min-h-screen flex-col">
        <Navbar />

        <main className="flex-1 container px-4 py-6 lg:px-6 lg:py-8">
          {children}
        </main>

        <footer className="border-t py-4 text-center text-xs text-muted-foreground">
          Instagram DM &amp; Yorum Otomasyonu Platformu — Meta Graph API v19.0
        </footer>
      </div>
    </AuthGuard>
  );
}
/**
 * ============================================================================
 * COMPONENTS / DASHBOARD / NAVBAR
 * ----------------------------------------------------------------------------
 * Üst menü: marka, sayfa linkleri (aktif durum vurgusu), kullanıcı menüsü.
 *
 * Aktif link tespiti `usePathname()` ile yapılır — `useRouter` yerine, çünkü
 * URL değişimini izlemek istiyoruz (tıklama değil).
 * ============================================================================
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, LayoutDashboard, LogOut, Sparkles, Workflow } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/AuthProvider';
import { cn } from '@/lib/utils';

/** Navigasyon tanımı — menü tek yerden yönetilir. */
const NAV_ITEMS = [
  { href: '/dashboard', label: 'Genel Bakış', icon: LayoutDashboard },
  { href: '/dashboard/automations', label: 'Otomasyonlar', icon: Workflow },
  { href: '/dashboard/logs', label: 'Loglar', icon: Activity },
] as const;

export function Navbar(): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = React.useState<boolean>(false);

  /**
   * Link'in aktif olup olmadığını belirler.
   * `/dashboard` için: tam eşleşme. Alt sayfalar için: önek eşleşme.
   */
  const isActive = (href: string): boolean =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href);

  const handleSignOut = async (): Promise<void> => {
    setSigningOut(true);

    try {
      await signOut();
      // useEffect ile yönlendirme de çalışır ama anlık geri bildirim verir.
      router.replace('/login');
    } finally {
      setSigningOut(false);
    }
  };

  const appName = process.env['NEXT_PUBLIC_APP_NAME'] ?? 'InstaFlow';

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center gap-4 px-4 lg:px-6">
        {/* --- Marka --- */}
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="hidden sm:inline">{appName}</span>
        </Link>

        {/* --- Sayfa linkleri --- */}
        <nav className="flex items-center gap-1" aria-label="Ana menü">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="hidden md:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* --- Kullanıcı menüsü --- */}
        <div className="ml-auto flex items-center gap-3">
          {user !== null ? (
            <>
              <span className="hidden max-w-[180px] truncate text-sm text-muted-foreground sm:inline">
                {user.displayName ?? user.email}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void handleSignOut();
                }}
                loading={signingOut}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Çıkış</span>
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <Link href="/login">Giriş Yap</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
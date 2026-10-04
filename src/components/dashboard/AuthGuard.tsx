/**
 * ============================================================================
 * COMPONENTS / DASHBOARD / AUTH GUARD
 * ----------------------------------------------------------------------------
 * Kimlik doğrulanmamış kullanıcıları login'e, oturumu olmayanları dashboard'dan
 * uzaklaştırır.
 *
 * "Loading" durumunda HİÇBİR şey render edilmez (beyaz ekran olmaması için
 * basit bir spinner gösterilir). Bu, Next.js'te en sık yapılan hatanın
 * (`user === null` henüz "çıkış yapmış" anlamına gelmez) önüne geçer.
 * ============================================================================
 */

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { useAuth } from '@/providers/AuthProvider';

export interface AuthGuardProps {
  readonly children: React.ReactNode;
  /** `true` → oturum açmış olmayı gerektirir. `false` → login sayfası. */
  readonly requireAuth?: boolean;
}

export function AuthGuard({ children, requireAuth = true }: AuthGuardProps): JSX.Element {
  const { user, loading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    // Guard clause: Firebase henüz cevap vermediyse karar verme.
    if (loading) {
      return;
    }

    if (requireAuth && user === null) {
      router.replace('/login');
      return;
    }

    if (!requireAuth && user !== null) {
      router.replace('/dashboard');
    }
  }, [loading, requireAuth, router, user]);

  // --- Bekleme ekranı -------------------------------------------------------
  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Yükleniyor" />
      </div>
    );
  }

  // --- Yönlendirme sırasında içeriği gizle ---------------------------------
  if (requireAuth && user === null) {
    return <div className="min-h-[50vh]" />;
  }

  if (!requireAuth && user !== null) {
    return <div className="min-h-[50vh]" />;
  }

  return <>{children}</>;
}
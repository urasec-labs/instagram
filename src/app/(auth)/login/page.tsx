/**
 * ============================================================================
 * APP / (auth) / LOGIN
 * ----------------------------------------------------------------------------
 * Route Group `(auth)`: URL'e yansımayan klasör grubudur.
 * Amaç: /dashboard'un da bu layout'u (navbar) DEĞİL kendi layout'unu
 * kullanmasını sağlamak. `(auth)/layout.tsx` yalnızca login'e uygulanır.
 * ============================================================================
 */

'use client';

import * as React from 'react';
import { AlertCircle, Sparkles } from 'lucide-react';

import { AuthGuard } from '@/components/dashboard/AuthGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/providers/AuthProvider';

/** Formun hangi amaçla kullanıldığı (tek state, iki mod). */
type AuthMode = 'signin' | 'signup';

/** E-posta biçim doğrulaması (sunucuya girmeden yakalamak için). */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Firebase minimum şifre uzunluğu. */
const MIN_PASSWORD_LENGTH = 6;

export default function LoginPage(): JSX.Element {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth();

  const [mode, setMode] = React.useState<AuthMode>('signin');
  const [name, setName] = React.useState<string>('');
  const [email, setEmail] = React.useState<string>('');
  const [password, setPassword] = React.useState<string>('');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [googleLoading, setGoogleLoading] = React.useState<boolean>(false);

  const isSignUp = mode === 'signup';

  /** İstemci tarafı doğrulama. Sunucu ayrıca doğrular (güvenlik sunucuda). */
  const validate = (): boolean => {
    if (!EMAIL_PATTERN.test(email)) {
      setError('Geçerli bir e-posta adresi girin.');
      return false;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır.`);
      return false;
    }

    if (isSignUp && name.trim().length === 0) {
      setError('Adınızı girin.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);

    if (!validate()) {
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        await signUpWithEmail(name, email, password);
      } else {
        await signInWithEmail(email, password);
      }

      // Başarılı girişte yönlendirme `AuthGuard`'ın `useEffect`'i ile yapılır.
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Giriş yapılamadı.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async (): Promise<void> => {
    setError(null);
    setGoogleLoading(true);

    try {
      await signInWithGoogle();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Google ile giriş yapılamadı.');
    } finally {
      setGoogleLoading(false);
    }
  };

  /** Mod değişiminde hata mesajını temizle (eski hata yeni formda yanıltır). */
  const toggleMode = (): void => {
    setMode(isSignUp ? 'signin' : 'signup');
    setError(null);
  };

  return (
    <AuthGuard requireAuth={false}>
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          {/* --- Marka --- */}
          <div className="mb-8 flex flex-col items-center text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Sparkles className="h-6 w-6" aria-hidden="true" />
            </span>
            <h1 className="text-xl font-semibold">
              {isSignUp ? 'Hesap oluştur' : 'Tekrar hoş geldiniz'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isSignUp
                ? 'Otomasyonlarınızı yönetmek için kaydolun.'
                : 'Otomasyonlarınızı yönetmek için giriş yapın.'}
            </p>
          </div>

          {/* --- Hata mesajı --- */}
          {error !== null ? (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          {/* --- Form --- */}
          <form
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
            className="space-y-4"
          >
            {isSignUp ? (
              <div className="space-y-2">
                <Label htmlFor="name">Ad Soyad</Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                  }}
                  placeholder="Adınız"
                  autoComplete="name"
                  disabled={loading}
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="email">E-posta</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
                placeholder="ornek@sirket.com"
                autoComplete="email"
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Şifre</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
                placeholder="••••••••"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                minLength={MIN_PASSWORD_LENGTH}
                required
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full" loading={loading}>
              {isSignUp ? 'Hesap Oluştur' : 'Giriş Yap'}
            </Button>
          </form>

          {/* --- Ayırıcı --- */}
          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-wider text-muted-foreground">veya</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          {/* --- Google girişi --- */}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              void handleGoogleSignIn();
            }}
            loading={googleLoading}
            disabled={loading}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.27-4.74 3.27-8.09Z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51Z"
              />
            </svg>
            Google ile devam et
          </Button>

          {/* --- Mod değiştir --- */}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {isSignUp ? 'Zaten hesabınız var mı?' : 'Hesabınız yok mu?'}{' '}
            <button
              type="button"
              onClick={toggleMode}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {isSignUp ? 'Giriş yapın' : 'Kaydolun'}
            </button>
          </p>
        </div>
      </div>
    </AuthGuard>
  );
}
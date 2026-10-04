/**
 * ============================================================================
 * PROVIDERS / AUTH PROVIDER
 * ----------------------------------------------------------------------------
 * Firebase Authentication durumunu React Context üzerinden sunar.
 *
 * Neden Provider? `onAuthStateChanged` aboneliği her bileşende ayrı ayrı
 * kurulursa: (a) gereksiz dinleyici sayısı, (b) "auth henüz çözülmedi"
 * durumunu her yerde tekrar ele almak. Tek kaynak (single source of truth).
 *
 * Üç durum yönetilir:
 *   - `loading` → Firebase kullanıcıyı henüz döndürmedi (sayfa koruması BEKLETİR)
 *   - `user === null` → oturum yok → login'e yönlendir
 *   - `user !== null` → giriş yapılmış → dashboard
 * ============================================================================
 */

'use client';

import * as React from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';

import { getFirebaseAuth } from '@/lib/firebase';

export interface AuthContextValue {
  readonly user: User | null;
  /** `true` → Firebase oturumu henüz belirlenmedi. */
  readonly loading: boolean;
  readonly signInWithEmail: (email: string, password: string) => Promise<void>;
  readonly signUpWithEmail: (name: string, email: string, password: string) => Promise<void>;
  readonly signInWithGoogle: () => Promise<void>;
  readonly signOut: () => Promise<void>;
  readonly sendReset: (email: string) => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

/**
 * Kullanıcıya gösterilecek Türkçe hata mesajları.
 * Firebase'in İngilizce hata kodlarını (`auth/invalid-credential` vb.)
 * kullanıcı dostu mesajlara çevirir.
 */
function toFriendlyError(error: unknown): Error {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return new Error('E-posta adresi veya şifre hatalı.');

    case 'auth/email-already-in-use':
      return new Error('Bu e-posta adresi zaten kayıtlı.');

    case 'auth/invalid-email':
      return new Error('Geçerli bir e-posta adresi girin.');

    case 'auth/weak-password':
      return new Error('Şifre en az 6 karakter olmalıdır.');

    case 'auth/popup-closed-by-user':
      return new Error('Google ile giriş penceresi kapatıldı.');

    case 'auth/too-many-requests':
      return new Error('Çok fazla deneme yapıldı. Lütfen biraz bekleyin.');

    case 'auth/network-request-failed':
      return new Error('Ağ bağlantısı kurulamadı.');

    default:
      return error instanceof Error ? error : new Error('Beklenmeyen bir hata oluştu.');
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);

  React.useEffect(() => {
    // `unsubscribe` döndürmek ZORUNLUDUR: aksi halde her mount'ta yeni bir
    // dinleyici kalır ve StrictMode'da çift çağrı oluşur.
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  /** Tüm auth aksiyonlarını tek noktadan sarmalayan factory. */
  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      loading,

      signInWithEmail: async (email, password) => {
        try {
          await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
        } catch (error: unknown) {
          throw toFriendlyError(error);
        }
      },

      signUpWithEmail: async (name, email, password) => {
        try {
          // 1) Hesabı oluştur
          const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);

          // 2) Görünen adı ayrıca set et (profil adı boş kalmasın)
          await updateProfile(credential.user, { displayName: name });
        } catch (error: unknown) {
          throw toFriendlyError(error);
        }
      },

      signInWithGoogle: async () => {
        try {
          const provider = new GoogleAuthProvider();
          // Hesap seçme ekranı her seferinde açılsın → kullanıcı kolayca
          // başka hesapla geçebilir.
          provider.setCustomParameters({ prompt: 'select_account' });

          await signInWithPopup(getFirebaseAuth(), provider);
        } catch (error: unknown) {
          throw toFriendlyError(error);
        }
      },

      signOut: async () => {
        await firebaseSignOut(getFirebaseAuth());
      },

      sendReset: async (email) => {
        try {
          await sendPasswordResetEmail(getFirebaseAuth(), email);
        } catch (error: unknown) {
          throw toFriendlyError(error);
        }
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Auth context'ine erişim hook'u.
 * Provider dışında kullanılırsa hata fırlatır (yanlış kullanımı erken yakalar).
 */
export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);

  if (context === null) {
    throw new Error('useAuth, <AuthProvider> içinde kullanılmalıdır.');
  }

  return context;
}
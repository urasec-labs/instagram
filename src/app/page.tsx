/**
 * ============================================================================
 * APP / ROOT PAGE
 * ----------------------------------------------------------------------------
 * Kök yol: kullanıcıyı doğru yere yönlendirir.
 *
 * Next.js 14+ `redirect()` sunucu bileşeninde çalışır ve HTTP 307 döner →
 * istemci tarafı JS yüklense bile doğru yere gider.
 * ============================================================================
 */

import { redirect } from 'next/navigation';

export default function RootPage(): never {
  redirect('/dashboard');
}
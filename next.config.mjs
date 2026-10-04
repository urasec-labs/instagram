/**
 * Next.js yapılandırması.
 *
 * `output: 'standalone'` → derleme çıktısı kendi içinde minimal bir Node
 * sunucusu barındırır. Firebase Hosting + Rewrites mimarisinde dashboard'un
 * SSR olarak `functions/src/adapters/http/nextServer.ts` üzerinden
 * yayınlanabilmesi için bu ayar ZORUNLUDUR.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  poweredByHeader: false,
  eslint: {
    // CI'da lint hatası derlemeyi düşürmesin, tip kontrolü ayrı bir adım.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
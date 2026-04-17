/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Retire le header "X-Powered-By: Next.js" — léger fingerprinting gratuit.
  poweredByHeader: false,
  // Compression gzip/br des réponses (activée par défaut, explicite ici).
  compress: true,
  // Pas de source maps JS en prod pour le client : gain de taille + on évite
  // de publier du code non-minifié.
  productionBrowserSourceMaps: false,
  // Tree-shaking plus agressif sur les gros packages — gain de bundle sans
  // effort côté code (imports du type `import { foo } from 'jspdf'` ne
  // ramènent plus tout le package).
  experimental: {
    optimizePackageImports: [
      'jspdf',
      'jspdf-autotable',
      '@anthropic-ai/sdk',
      '@tanstack/react-query',
      '@supabase/supabase-js',
      'react-markdown',
    ],
  },
  // Headers globaux pour améliorer sécurité et perf cache statique.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
      {
        // Les assets Next avec hash dans le nom peuvent être cache-immutable
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
}

module.exports = nextConfig

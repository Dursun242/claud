/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Retire le header "X-Powered-By: Next.js" — léger fingerprinting gratuit.
  poweredByHeader: false,
  // Tree-shaking plus agressif sur les gros packages — gain de bundle sans
  // effort côté code (imports du type `import { foo } from 'jspdf'` ne
  // ramènent plus tout le package).
  experimental: {
    optimizePackageImports: [
      'jspdf',
      'jspdf-autotable',
      '@anthropic-ai/sdk',
      '@tanstack/react-query',
    ],
  },
}

module.exports = nextConfig

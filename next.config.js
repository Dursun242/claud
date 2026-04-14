/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Retire le header "X-Powered-By: Next.js" — léger fingerprinting gratuit.
  poweredByHeader: false,
}

module.exports = nextConfig

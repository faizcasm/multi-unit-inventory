/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  images: {
    domains: ['localhost'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
}

nextConfig.redirects = async () => [
  { source: '/locations', destination: '/dashboard/locations', permanent: true },
  { source: '/products', destination: '/dashboard/products', permanent: true },
  { source: '/inventory', destination: '/dashboard/inventory', permanent: true },
  { source: '/transfers', destination: '/dashboard/transfers', permanent: true },
  { source: '/reports', destination: '/dashboard/reports', permanent: true },
  { source: '/settings', destination: '/dashboard/settings', permanent: true },
  { source: '/dashboard', destination: '/dashboard', permanent: false },
]
module.exports = nextConfig
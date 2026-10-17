/** @type {import('next').NextConfig} */

// NOTE: layout.tsx loads DM Sans/Manrope from Google Fonts via <link> (the
// redesign CSS references them by name), so CSP style-src/font-src must allow
// fonts.googleapis.com / fonts.gstatic.com. If fonts move to next/font later,
// those two origins can be dropped and the CSP tightened.
const csp = [
  "default-src 'self'",
  // 'unsafe-inline'/'unsafe-eval' are needed by React/Next in dev and by
  // inline hydration scripts today; replace with nonce-based script-src
  // ('unsafe-inline' removed) once the app is nonce-compatible.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  'img-src \'self\' data: blob: https:',
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Apply to every route
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains',
          },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ]
  },
  // No next/image remote sources: the app renders no remote <Image> URLs, so
  // the previous wildcard remotePatterns + deprecated domains entry are gone.
}

module.exports = nextConfig

import type { Metadata, Viewport } from 'next'
/* next/font would be nicer, but the redesign CSS references DM Sans/Manrope by
   name — loading them via <link> here is intentional and applies app-wide. */
/* eslint-disable @next/next/no-page-custom-font */
import './globals.css'
import './redesign.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: {
    default: 'Ricoz Inventory',
    template: '%s | Ricoz Inventory',
  },
  description:
    'Move stock with clarity and control. Ricoz brings your products, locations, and transfer workflows into one calmer, more accountable workspace.',
  keywords: ['inventory', 'warehouse', 'stock management', 'transfer', 'multi-location'],
  authors: [{ name: 'Ricoz Inventory' }],
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/favicon.ico', sizes: '32x32', type: 'image/x-icon' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Ricoz Inventory',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'Ricoz Inventory',
    title: 'Ricoz Inventory',
    description: 'Every location. One clear picture.',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f7fb' },
    { media: '(prefers-color-scheme: dark)', color: '#141126' },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

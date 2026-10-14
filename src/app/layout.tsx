import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: {
    default: 'Multi-Unit Inventory Hub',
    template: '%s | Multi-Unit Inventory Hub',
  },
  description: 'Manage products and stock across multiple stores, warehouses, and distribution centers.',
  keywords: ['inventory', 'warehouse', 'stock management', 'transfer', 'multi-location'],
  authors: [{ name: 'Multi-Unit Inventory Hub' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'Multi-Unit Inventory Hub',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
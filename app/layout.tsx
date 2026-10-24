import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import './palette.css'

export const metadata: Metadata = {
  title: 'Usahaku — Operasional usaha lebih teratur',
  description: 'Satu platform untuk mengelola usaha, pelanggan, dan pertumbuhan bisnis UMKM.',
  generator: 'v0.app',
  icons: {
    icon: { url: '/brand/usahaku-logo.png', type: 'image/png' },
    apple: '/brand/usahaku-logo.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#1c222e',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="id">
      <head>
        <link rel="preload" href="/fonts/inter/InterVariable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}

import 'server-only'

export function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (!configured && process.env.NODE_ENV === 'production') throw new Error('NEXT_PUBLIC_SITE_URL belum dikonfigurasi.')
  const url = new URL(configured || 'http://localhost:3000')
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL website tidak valid.')
  return url.origin
}

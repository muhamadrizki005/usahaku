import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

const cookieName = 'usahaku_recovery'
function signature(payload: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('Pemulihan akun belum dikonfigurasi pada server.')
  return createHmac('sha256', key).update(payload).digest('base64url')
}
export async function allowRecovery(userId: string) {
  const payload = `${userId}.${Date.now() + 10 * 60 * 1000}`
  const store = await cookies()
  store.set(cookieName, `${payload}.${signature(payload)}`, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/account', maxAge: 600 })
}
export async function hasRecovery(userId: string) {
  const token = (await cookies()).get(cookieName)?.value
  if (!token) return false
  const [id, expires, mac, ...rest] = token.split('.')
  if (rest.length || id !== userId || !mac || Number(expires) <= Date.now() || !Number.isFinite(Number(expires))) return false
  const expected = Buffer.from(signature(`${id}.${expires}`))
  const actual = Buffer.from(mac)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
export async function clearRecovery() {
  (await cookies()).set(cookieName, '', { path: '/account', maxAge: 0 })
}

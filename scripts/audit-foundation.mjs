// Read-only: no RPC invocation, migrations, or Auth writes.
import { createClient } from '@supabase/supabase-js'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('FAIL: konfigurasi server belum lengkap.'); process.exit(1) }
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
for (const [table, columns] of [
  ['businesses', 'id,owner_id,name,code,category,phone,address,created_at'],
  ['business_members', 'id,business_id,user_id,name,username,role,active,must_change_password,changed_by,created_at'],
  ['staff_audit_logs', 'id,business_id,member_id,actor_user_id,operation,details,created_at'],
]) {
  const { error, count } = await supabase.from(table).select(columns, { head: true, count: 'exact' })
  console.log(JSON.stringify({ table, accessible: !error, rowCount: count, errorCode: error?.code || null }))
  if (error) process.exitCode = 1
}
const demo = await supabase.from('businesses').select('id', { head: true, count: 'exact' }).in('code', ['F531258D', 'E792CF0F'])
console.log(JSON.stringify({ handoffDemoBusinessesFound: demo.count }))
console.log('NOTE: katalog grants/RLS dan migration history CLI memerlukan akses SQL terpisah; script ini hanya membaca REST.')

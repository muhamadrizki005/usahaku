import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !publicKey || !serverKey) {
  console.log('FAIL: satu atau lebih variabel Supabase belum diisi.');
  process.exit(1);
}
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serverKey, options);
const newClient = () => createClient(url, publicKey, options);
const users = [];
const businesses = [];
const demoCodes = ['F531258D', 'E792CF0F'];
let demoBefore;
async function demoSnapshot() {
  const rows = check(await admin.from('businesses').select('*').in('code', demoCodes).order('id'));
  const ids = rows.map(row => row.id);
  const members = check(await admin.from('business_members').select('*').in('business_id', ids).order('id'));
  const audit = check(await admin.from('staff_audit_logs').select('*').in('business_id', ids).order('id'));
  return JSON.stringify({ rows, members, audit });
}
let stage = 'memeriksa koneksi dan tabel';
let failed = false;
function check(result) {
  if (result.error) { const error = new Error('Supabase request failed'); error.code = result.error.code || result.error.status || 'unknown'; throw error; }
  return result.data;
}
async function makeUser(label, staff = false) {
  const email = `usahaku-test-${label}-${randomUUID()}@example.invalid`;
  const password = randomBytes(24).toString('base64url');
  const data = check(await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { account_type: staff ? 'staff' : 'owner' } }));
  users.push(data.user.id);
  const client = newClient();
  check(await client.auth.signInWithPassword({ email, password }));
  return { client, id: data.user.id, email, password };
}
try {
  demoBefore = await demoSnapshot();
  for (const table of ['businesses', 'business_members', 'staff_audit_logs']) check(await admin.from(table).select('id').limit(1));
  console.log('PASS: URL, public key, server key, dan ketiga tabel dapat diakses.');
  stage = 'membuat dua akun/toko sementara';
  const a = await makeUser('owner-a');
  const b = await makeUser('owner-b');
  for (const [label, user] of [['A', a], ['B', b]]) {
    const id = check(await user.client.rpc('create_business', { business_name: `[TEST SEMENTARA] Usahaku ${label}`, owner_name: `Test Owner ${label}` }));
    businesses.push(id); user.businessId = id;
  }
  console.log('PASS: autentikasi owner dan pembuatan usaha melalui RPC.');
  stage = 'memeriksa isolasi usaha';
  assert.equal(check(await a.client.from('businesses').select('id')).length, 1);
  assert.equal(check(await b.client.from('businesses').select('id')).length, 1);
  assert.equal(check(await a.client.from('businesses').select('id').eq('id', b.businessId)).length, 0);
  assert.equal(check(await a.client.from('business_members').select('id').eq('business_id', b.businessId)).length, 0);
  assert.equal(check(await a.client.from('staff_audit_logs').select('id').eq('business_id', b.businessId)).length, 0);
  console.log('PASS: dua toko tidak saling membaca profil, staf, atau audit.');
  stage = 'memeriksa staf dan pembatasan kata sandi';
  const staff = await makeUser('staff', true);
  check(await admin.from('business_members').insert({ business_id: a.businessId, user_id: staff.id, name: 'Test Kasir', username: `test_${randomBytes(4).toString('hex')}`, role: 'cashier', must_change_password: true, changed_by: a.id }));
  assert.equal(check(await staff.client.from('business_members').select('id')).length, 1);
  assert.equal(check(await staff.client.from('businesses').select('id')).length, 0);
  const escalation = await staff.client.from('business_members').update({ role: 'owner', must_change_password: false }).eq('user_id', staff.id);
  assert.ok(escalation.error, 'Staf tidak boleh menaikkan izin sendiri');
  const illicit = await staff.client.rpc('create_business', { business_name: 'Forbidden', owner_name: 'Staff' });
  assert.ok(illicit.error, 'Staf tidak boleh membuat usaha');
  console.log('PASS: staf wajib ganti kata sandi dan tidak dapat menaikkan izin.');
  stage = 'memeriksa perubahan kata sandi dan akses kasir';
  const newPassword = randomBytes(24).toString('base64url');
  check(await staff.client.auth.updateUser({ password: newPassword }));
  check(await admin.from('business_members').update({ must_change_password: false, changed_by: staff.id }).eq('user_id', staff.id));
  const loggedIn = newClient();
  check(await loggedIn.auth.signInWithPassword({ email: staff.email, password: newPassword }));
  assert.equal(check(await loggedIn.from('businesses').select('id')).length, 1);
  assert.equal(check(await loggedIn.from('businesses').select('id').eq('id', b.businessId)).length, 0);
  assert.equal(check(await loggedIn.from('business_members').select('id')).length, 1);
  const changed = check(await loggedIn.from('businesses').update({ name: 'Forbidden' }).eq('id', a.businessId).select('id'));
  assert.equal(changed.length, 0);
  console.log('PASS: ganti kata sandi, login ulang, dan pembatasan akses kasir.');
  stage = 'memeriksa penonaktifan sesi aktif';
  check(await admin.from('business_members').update({ active: false, changed_by: a.id }).eq('user_id', staff.id));
  assert.equal(check(await loggedIn.from('businesses').select('id')).length, 0);
  console.log('PASS: staf nonaktif kehilangan akses meski sesi masih terbuka.');
  stage = 'memeriksa role admin dan grants anonim';
  const adminStaff = await makeUser('admin', true);
  check(await admin.from('business_members').insert({ business_id: a.businessId, user_id: adminStaff.id, name: 'Test Admin', username: `admin_${randomBytes(4).toString('hex')}`, role: 'admin', changed_by: a.id }));
  assert.equal(check(await adminStaff.client.from('businesses').select('id')).length, 1);
  assert.equal(check(await adminStaff.client.from('business_members').select('id')).length, 1);
  assert.equal(check(await adminStaff.client.from('staff_audit_logs').select('id')).length, 0);
  assert.equal(check(await adminStaff.client.from('businesses').update({ name: 'Forbidden' }).eq('id', a.businessId).select('id')).length, 0);
  assert.ok((await adminStaff.client.from('business_members').insert({ business_id: a.businessId, user_id: b.id, name: 'Forbidden', role: 'cashier', username: 'forbidden' })).error);
  assert.ok((await newClient().from('businesses').select('id')).error);
  console.log('PASS: admin tidak mengelola staf/pengaturan sensitif; anonim ditolak.');
} catch (error) {
  failed = true;
  console.log(`FAIL: ${stage}; kode=${error.code || (error.name === 'AssertionError' ? 'ASSERTION' : 'NETWORK_OR_CONFIGURATION')}.`);
} finally {
  try {
    // Only exact IDs created by this run; never delete existing project data.
    if (businesses.length) {
      check(await admin.from('staff_audit_logs').delete().in('business_id', businesses));
      check(await admin.from('business_members').delete().in('business_id', businesses));
      check(await admin.from('businesses').delete().in('id', businesses));
    }
    for (const id of users) check(await admin.auth.admin.deleteUser(id));
    if (demoBefore) assert.equal(await demoSnapshot(), demoBefore, 'Data demo lama berubah');
    console.log('PASS: profil, anggota, dan audit kedua usaha demo lama tetap identik.');
    if (users.length) console.log('PASS: seluruh akun dan data sementara pengujian telah dibersihkan.');
  } catch {
    failed = true;
    console.log('FAIL: pembersihan data uji perlu diperiksa. ID data sementara: ' + JSON.stringify({ users, businesses }));
  }
}
process.exitCode = failed ? 1 : 0;

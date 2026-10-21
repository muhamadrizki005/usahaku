import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { defaultBusinessHours, businessHoursSchema, describeHours } from '../lib/business-profile'

test('hours allow overnight spans, reject overlaps across week boundaries and ambiguous 24h', () => {
  const schedule = defaultBusinessHours()
  schedule.Senin = { open: '22:00', close: '02:00', closed: false }
  assert.equal(businessHoursSchema.safeParse(schedule).success, true)
  assert.equal(describeHours(schedule.Senin), '22:00–02:00 (+1 hari)')
  schedule.Selasa = { open: '01:59', close: '10:00', closed: false }
  assert.equal(businessHoursSchema.safeParse(schedule).success, false)
  schedule.Selasa.open = '02:00'
  assert.equal(businessHoursSchema.safeParse(schedule).success, true)
  schedule.Senin.close = '22:00'
  assert.equal(businessHoursSchema.safeParse(schedule).success, false)
  const boundary = defaultBusinessHours()
  boundary.Minggu = { open: '22:00', close: '02:00', closed: false }
  boundary.Senin = { open: '01:00', close: '08:00', closed: false }
  assert.equal(businessHoursSchema.safeParse(boundary).success, false)
  assert.equal(businessHoursSchema.safeParse(defaultBusinessHours()).success, false)
})

test('profile migration enforces tenant/role isolation, revisions, hours, and safe logo lifecycle', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,raw_app_meta_data jsonb not null default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
      grant usage on schema auth to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated,service_role;
      grant select,insert,update,delete on storage.objects to authenticated;
      grant all on storage.objects,storage.buckets to service_role;`)
    await db.exec(await readFile('supabase/migrations/202610200001_foundation.sql', 'utf8'))
    const ownerA = randomUUID(), ownerB = randomUUID(), staff = randomUUID()
    await db.query('insert into auth.users(id) values($1),($2),($3)', [ownerA, ownerB, staff])
    const asUser = async (id: string) => { await db.exec('reset role'); await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [id]); await db.exec('set role authenticated') }
    const asService = async () => { await db.exec('reset role'); await db.exec('set role service_role') }
    await asUser(ownerA)
    const a = (await db.query<{ id: string }>(`select public.create_business('Warung Lama','Owner A','','Alamat lama') as id`)).rows[0].id
    await asUser(ownerB)
    const b = (await db.query<{ id: string }>(`select public.create_business('Toko B','Owner B') as id`)).rows[0].id
    await db.exec('reset role')
    const legacy = await db.query(`select id,name,phone,address,owner_id,code,category,created_at from public.businesses order by id`)
    await db.exec(await readFile('supabase/migrations/202610210001_profile_setup.sql', 'utf8'))
    assert.deepEqual((await db.query(`select id,name,phone,address,owner_id,code,category,created_at from public.businesses order by id`)).rows, legacy.rows)
    await db.query(`insert into public.business_members(business_id,user_id,name,username,role,changed_by) values($1,$2,'Staff','kasir','cashier',$3)`, [a, staff, ownerA])
    const save = (id: string, version: number | null) => db.query(`select public.save_business_profile($1,$2,'Warung Baru','081234567890','Jalan A','Bandung','Jawa Barat','Deskripsi')`, [id, version])
    await asUser(ownerA)
    await assert.rejects(save(b, 0), /access denied/)
    await assert.rejects(save(a, null), /Profile changed/)
    await save(a, 0)
    await assert.rejects(save(a, 0), /Profile changed/)
    await assert.rejects(db.query(`update public.businesses set name='bypass' where id=$1`, [a]), /permission denied/)
    const hours = defaultBusinessHours(); hours.Minggu = { open: '22:00', close: '02:00', closed: false }
    await db.query(`select public.save_business_hours($1,0,$2::jsonb)`, [a, JSON.stringify(hours)])
    await assert.rejects(db.query(`select public.save_business_hours($1,0,$2::jsonb)`, [a, JSON.stringify(hours)]), /Hours changed/)
    hours.Senin = { open: '01:00', close: '08:00', closed: false }
    assert.equal((await db.query<{ valid: boolean }>(`select public.valid_business_hours($1::jsonb) as valid`, [JSON.stringify(hours)])).rows[0].valid, false)
    for (const invalid of [{}, { ...defaultBusinessHours(), Senin: { closed: true, open: '10:00', wrong: '11:00' } }]) {
      assert.equal((await db.query<{ valid: boolean }>(`select public.valid_business_hours($1::jsonb) as valid`, [JSON.stringify(invalid)])).rows[0].valid, false)
    }
    await asUser(staff); await assert.rejects(save(a, 1), /access denied/)
    await assert.rejects(db.query(`select public.save_business_hours($1,1,$2::jsonb)`, [a, JSON.stringify(hours)]), /access denied/)
    await asUser(ownerA)
    const first = randomUUID(), second = randomUUID(), abandoned = randomUUID()
    const reserve = async (id: string) => (await db.query<{ path: string }>(`select public.reserve_business_logo($1,$2) as path`, [a, id])).rows[0].path
    const path1 = await reserve(first), path2 = await reserve(second), path3 = await reserve(abandoned)
    await assert.rejects(db.query(`select public.set_business_logo($1,1,$2)`, [a, first]), /upload is incomplete/)
    await asService()
    await db.query(`insert into storage.objects(bucket_id,name,metadata) values('business-logos',$1,'{"size":100,"mimetype":"image/png"}'),('business-logos',$2,'{"size":100,"mimetype":"image/png"}')`, [path1, path2])
    await asUser(ownerA); await db.query(`select public.set_business_logo($1,1,$2)`, [a, first])
    assert.equal((await db.query('select name from storage.objects')).rows.length, 1)
    await assert.rejects(db.query(`select public.claim_business_logo_cleanup($1)`, [first]), /permission denied/)
    await asUser(ownerB)
    assert.equal((await db.query('select name from storage.objects')).rows.length, 0)
    await assert.rejects(db.query(`select public.set_business_logo($1,2,$2)`, [a, second]), /access denied/)
    await asService()
    assert.equal((await db.query<{ path: string | null }>(`select public.claim_business_logo_cleanup($1) as path`, [first])).rows[0].path, null)
    assert.equal((await db.query<{ path: string | null }>(`select public.claim_business_logo_cleanup($1) as path`, [abandoned])).rows[0].path, null)
    await asUser(ownerA)
    await assert.rejects(db.query(`select public.set_business_logo($1,1,$2)`, [a, second]), /Profile changed/)
    await db.query(`select public.set_business_logo($1,2,$2)`, [a, second])
    await asService()
    assert.equal((await db.query<{ path: string }>(`select public.claim_business_logo_cleanup($1) as path`, [first])).rows[0].path, path1)
    await db.query(`update public.business_logo_assets set created_at=now()-interval '16 minutes' where id=$1`, [abandoned])
    assert.equal((await db.query<{ path: string }>(`select public.claim_business_logo_cleanup($1) as path`, [abandoned])).rows[0].path, path3)
    await asUser(ownerA)
    await assert.rejects(db.query(`select public.set_business_logo($1,3,$2)`, [a, first]), /not available/)
    await assert.rejects(db.query(`select public.set_business_logo($1,3,$2)`, [a, abandoned]), /not available/)
    await asService()
    await db.query(`update public.business_members set active=false where user_id=$1`, [ownerA])
    await asUser(ownerA); await assert.rejects(save(a, 3), /access denied/)
    assert.equal((await db.query('select name from storage.objects')).rows.length, 0)
  } finally { await db.close() }
})

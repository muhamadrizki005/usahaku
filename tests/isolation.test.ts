import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Real PostgreSQL engine, with only the Supabase auth schema/roles stubbed.
// This validates grants and RLS, not the hosted Auth service or HTTP layer.
test('database tenant isolation, role boundaries, forced-password changes, and deactivation', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key, raw_app_meta_data jsonb not null default '{}');
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
    `);
    await db.exec(await readFile('supabase/migrations/202610200001_foundation.sql', 'utf8'));
    const ownerA = '00000000-0000-4000-8000-000000000001';
    const ownerB = '00000000-0000-4000-8000-000000000002';
    const staffA = '00000000-0000-4000-8000-000000000003';
    const unassignedStaff = '00000000-0000-4000-8000-000000000004';
    await db.query('insert into auth.users(id) values ($1),($2)', [ownerA, ownerB]);
    await db.query(`insert into auth.users(id,raw_app_meta_data) values ($1,'{"account_type":"staff"}'),($2,'{"account_type":"staff"}')`, [staffA, unassignedStaff]);
    async function asUser(id: string) {
      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [id]);
      await db.exec('set role authenticated');
    }
    await asUser(ownerA);
    const a = (await db.query<{ id: string }>(`select public.create_business('Warung A','Owner A') as id`)).rows[0].id;
    await asUser(ownerB);
    const b = (await db.query<{ id: string }>(`select public.create_business('Toko B','Owner B') as id`)).rows[0].id;
    assert.notEqual(a, b);
    await assert.rejects(db.query(`select public.create_business('Toko Kedua','Owner B')`));
    await asUser(ownerA);
    assert.equal((await db.query('select id from public.businesses')).rows.length, 1);
    assert.equal((await db.query('select id from public.businesses where id=$1', [b])).rows.length, 0);
    assert.equal((await db.query('select id from public.business_members where business_id=$1', [b])).rows.length, 0);
    assert.equal((await db.query('select id from public.staff_audit_logs where business_id=$1', [b])).rows.length, 0);
    const ownAudit = (await db.query<{ actor_user_id: string }>('select actor_user_id from public.staff_audit_logs where business_id=$1', [a])).rows;
    assert.equal(ownAudit.length, 1);
    assert.equal(ownAudit[0].actor_user_id, ownerA);
    await assert.rejects(db.query('delete from public.staff_audit_logs'));
    await assert.rejects(db.query(`update public.businesses set owner_id=$1 where id=$2`, [ownerB, a]));
    assert.equal((await db.query(`update public.businesses set name='Hacked' where id=$1 returning id`, [b])).rows.length, 0);
    assert.equal((await db.query(`update public.businesses set name='Warung Baru' where id=$1 returning id`, [a])).rows.length, 1);
    await assert.rejects(db.query(`insert into public.business_members(business_id,user_id,name,role,username) values ($1,$2,'Budi','owner','budi')`, [a, staffA]));
    await db.exec('reset role');
    await db.query(`insert into public.business_members(business_id,user_id,name,role,username,must_change_password) values ($1,$2,'Budi','cashier','budi',true)`, [a, staffA]);
    await asUser(staffA);
    assert.equal((await db.query('select id from public.business_members')).rows.length, 1, 'forced-password staff can see own membership');
    assert.equal((await db.query('select id from public.businesses')).rows.length, 0, 'business access blocked until password changed');
    await assert.rejects(db.query(`update public.business_members set must_change_password=false where user_id=$1`, [staffA]));
    await db.exec('reset role');
    await db.query('update public.business_members set must_change_password=false where user_id=$1', [staffA]);
    await asUser(staffA);
    assert.equal((await db.query('select id from public.businesses')).rows.length, 1);
    assert.equal((await db.query('select id from public.business_members')).rows.length, 1, 'cashier cannot list colleagues');
    assert.equal((await db.query('select id from public.staff_audit_logs')).rows.length, 0, 'cashier cannot read staff audit');
    assert.equal((await db.query(`update public.businesses set name='Cashier changed' where id=$1 returning id`, [a])).rows.length, 0);
    await assert.rejects(db.query(`update public.business_members set role='owner' where user_id=$1`, [staffA]));
    await asUser(unassignedStaff);
    await assert.rejects(db.query(`select public.create_business('Illicit shop','Staff')`), /Staff cannot create/);
    await db.exec('reset role');
    await db.query(`update public.business_members set role='admin' where user_id=$1`, [staffA]);
    await asUser(staffA);
    assert.equal((await db.query(`update public.businesses set name='Admin changed' where id=$1 returning id`, [a])).rows.length, 0, 'admin cannot edit sensitive business settings');
    await db.exec('reset role');
    await db.query('update public.business_members set active=false where user_id=$1', [staffA]);
    await asUser(staffA);
    assert.equal((await db.query('select id from public.businesses')).rows.length, 0, 'old sessions lose access after deactivation');
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select * from public.businesses'));
    await assert.rejects(db.query(`select public.create_business('Anonymous','Anonymous')`));
  } finally { await db.close(); }
});

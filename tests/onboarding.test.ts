import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'

test('onboarding drafts, legacy access, owner-only completion and idempotency',async()=>{const db=new PGlite();try{
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

 const owner=randomUUID(),other=randomUUID(),staff=randomUUID();
 await db.query('insert into auth.users(id) values($1),($2),($3)',[owner,other,staff]);
 const as=async(id:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')};
 await as(owner);const old=(await db.query<{id:string}>("select public.create_business('Existing','Owner') id")).rows[0].id;
 await db.exec('reset role');await db.exec(await readFile('supabase/migrations/202610210001_profile_setup.sql','utf8'));
 const before=(await db.query('select id,name,code,phone,address from public.businesses')).rows;
 await db.exec(await readFile('supabase/migrations/202610230002_onboarding_completion.sql','utf8'));
 assert.deepEqual((await db.query('select id,name,code,phone,address from public.businesses')).rows,before);
 assert.ok((await db.query<any>('select onboarding_completed_at from public.businesses where id=$1',[old])).rows[0].onboarding_completed_at);
 await as(other);const draft=(await db.query<{id:string}>("select public.create_business_profile('Draft','Owner','081234567890','Street','City','Province','Saved draft') id")).rows[0].id;
 assert.equal((await db.query<any>('select onboarding_completed_at from public.businesses where id=$1',[draft])).rows[0].onboarding_completed_at,null);
 await assert.rejects(db.query('update public.businesses set onboarding_completed_at=now() where id=$1',[draft]),/permission denied/);
 await as(owner);await assert.rejects(db.query('select public.complete_business_onboarding($1)',[draft]),/Owner access required/);
 await db.exec('reset role');await db.query("insert into public.business_members(business_id,user_id,name,username,role,changed_by) values($1,$2,'Admin','admin','admin',$3)",[draft,staff,other]);
 await as(staff);await assert.rejects(db.query('select public.complete_business_onboarding($1)',[draft]),/Owner access required/);
 await as(other);const first=(await db.query<any>('select (public.complete_business_onboarding($1)).onboarding_completed_at done',[draft])).rows[0].done;
 assert.ok(first);assert.equal(String((await db.query<any>('select (public.complete_business_onboarding($1)).onboarding_completed_at done',[draft])).rows[0].done),String(first));
 await db.exec('reset role');await db.query('update public.business_members set active=false where user_id=$1',[other]);await as(other);await assert.rejects(db.query('select public.complete_business_onboarding($1)',[draft]),/Owner access required/);
}finally{await db.close()}})

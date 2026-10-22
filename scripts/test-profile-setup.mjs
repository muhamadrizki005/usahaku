import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import fs from 'node:fs'

const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(20000)})}}
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options)
const client=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,options)
const users=[],businesses=[],results=[]
let stage='snapshot',before,originalIds
const ok=({data,error})=>{if(error){const e=Error('Request failed');e.code=error.code||error.statusCode;throw e}return data}
const pass=message=>{results.push(message);console.log('PASS: '+message)}
async function snapshot(ids){const rows=ok(await admin.from('businesses').select('*').in('id',ids).order('id'));const members=ok(await admin.from('business_members').select('*').in('business_id',ids).order('id'));const audit=ok(await admin.from('staff_audit_logs').select('*').in('business_id',ids).order('id'));const assets=ok(await admin.from('business_logo_assets').select('*').in('business_id',ids).order('id'));return JSON.stringify({rows,members,audit,assets})}
async function owner(label){const email=`usahaku-profile-${label}-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url');const user=ok(await admin.auth.admin.createUser({email,password,email_confirm:true})).user;users.push(user.id);const c=client();ok(await c.auth.signInWithPassword({email,password}));const id=ok(await c.rpc('create_business_profile',{store_name:`Profile Test ${label}`,owner_name:'Profile Owner',store_phone:'081234567890',store_street:'Jalan Uji 1',store_city:'Bandung',store_province:'Jawa Barat',store_description:'Deskripsi persisten'}));businesses.push(id);return{c,id,user:user.id}}
const row=async a=>ok(await a.c.from('businesses').select('*').eq('id',a.id).single())
const profile=(id,revision,name='Profil Baru')=>({target_id:id,expected_revision:revision,new_name:name,new_phone:'081234567890',new_street:'Jalan Baru 2',new_city:'Jakarta',new_province:'DKI Jakarta',new_description:'Deskripsi baru'})
const hours=()=>Object.fromEntries(['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'].map(d=>[d,{open:'09:00',close:'21:00',closed:true}]))
const bucket='business-logos'
try{
  originalIds=ok(await admin.from('businesses').select('id')).map(r=>r.id);before=await snapshot(originalIds)
  stage='create profiles';const a=await owner('A'),b=await owner('B');let current=await row(a)
  assert.equal(current.city,'Bandung');assert.equal(current.description,'Deskripsi persisten');assert.equal(current.logo_path,null)
  pass('Dua profil baru tersimpan atomik; logo opsional; kota/provinsi/deskripsi persisten')
  stage='profile isolation/revisions';assert.equal(ok(await a.c.from('businesses').select('id').eq('id',b.id)).length,0)
  assert.ok((await b.c.rpc('save_business_profile',profile(a.id,current.profile_revision))).error)
  assert.ok((await a.c.from('businesses').update({name:'Forbidden'}).eq('id',a.id)).error)
  console.log('CHECK: profile write');const saved=ok(await a.c.rpc('save_business_profile',profile(a.id,current.profile_revision)))
  assert.equal(saved.address,'Jalan Baru 2, Jakarta, DKI Jakarta');assert.equal(saved.profile_revision,current.profile_revision+1)
  console.log('CHECK: stale revision');assert.ok((await a.c.rpc('save_business_profile',profile(a.id,current.profile_revision,'Stale'))).error)
  assert.equal((await row(a)).name,'Profil Baru');current=saved
  pass('Isolasi profil antarusaha, larangan direct UPDATE, dan konflik revisi aktual')
  stage='hours';let schedule=hours();schedule.Minggu={open:'22:00',close:'02:00',closed:false}
  const savedHours=ok(await a.c.rpc('save_business_hours',{target_id:a.id,expected_revision:0,schedule}));assert.deepEqual(savedHours.operating_hours,schedule)
  schedule.Senin={open:'01:00',close:'03:00',closed:false};assert.ok((await a.c.rpc('save_business_hours',{target_id:a.id,expected_revision:1,schedule})).error)
  schedule.Senin={open:'02:00',close:'03:00',closed:false};ok(await a.c.rpc('save_business_hours',{target_id:a.id,expected_revision:1,schedule}))
  assert.ok((await b.c.rpc('save_business_hours',{target_id:a.id,expected_revision:2,schedule})).error)
  assert.ok((await a.c.rpc('save_business_hours',{target_id:a.id,expected_revision:0,schedule})).error)
  schedule.Senin.close='02:00';assert.ok((await a.c.rpc('save_business_hours',{target_id:a.id,expected_revision:2,schedule})).error)
  pass('Jam lintas Minggu-Senin diterima; overlap, jam sama, revisi lama, dan usaha lain ditolak')
  stage='logo staging';const png=await sharp({create:{width:20,height:20,channels:4,background:'#1835d9'}}).png().toBuffer()
  async function candidate(){const id=randomUUID();const path=ok(await a.c.rpc('reserve_business_logo',{target_id:a.id,asset_id:id}));return{id,path}}
  async function upload(asset){ok(await admin.storage.from(bucket).upload(asset.path,png,{contentType:'image/png',upsert:false}))}
  const first=await candidate()
  assert.ok((await a.c.rpc('set_business_logo',{target_id:a.id,expected_revision:current.profile_revision,asset_id:first.id})).error)
  assert.ok((await a.c.storage.from(bucket).upload(first.path,png,{contentType:'image/png'})).error)
  await upload(first)
  assert.equal(ok(await admin.rpc('claim_business_logo_cleanup',{asset_id:first.id})),null)
  current=ok(await a.c.rpc('set_business_logo',{target_id:a.id,expected_revision:current.profile_revision,asset_id:first.id}))
  assert.equal(current.logo_path,first.path);assert.ok(ok(await a.c.storage.from(bucket).download(first.path)))
  assert.ok((await b.c.storage.from(bucket).download(first.path)).error)
  assert.ok((await client().storage.from(bucket).download(first.path)).error)
  assert.equal(ok(await admin.rpc('claim_business_logo_cleanup',{asset_id:first.id})),null)
  assert.ok((await a.c.rpc('claim_business_logo_cleanup',{asset_id:first.id})).error)
  ok(await a.c.storage.from(bucket).remove([first.path]));assert.ok(ok(await a.c.storage.from(bucket).download(first.path))) // Storage silently filters unauthorized deletes.
  pass('Logo aktif private; upload/delete langsung dan baca antarusaha/anonim ditolak; logo aktif terlindungi')
  stage='replacement/concurrency';const next=await candidate(),loser=await candidate();await upload(next);await upload(loser)
  const attempts=await Promise.all([next,loser].map(asset=>a.c.rpc('set_business_logo',{target_id:a.id,expected_revision:current.profile_revision,asset_id:asset.id})))
  assert.equal(attempts.filter(r=>!r.error).length,1);current=await row(a)
  assert.equal(ok(await admin.rpc('claim_business_logo_cleanup',{asset_id:first.id})),first.path)
  assert.ok((await a.c.rpc('set_business_logo',{target_id:a.id,expected_revision:current.profile_revision,asset_id:first.id})).error)
  ok(await admin.storage.from(bucket).remove([first.path]));ok(await admin.from('business_logo_assets').update({state:'deleted'}).eq('id',first.id))
  assert.ok(ok(await a.c.storage.from(bucket).download(current.logo_path)))
  pass('Dua penggantian bersamaan hanya satu berhasil; cleanup file lama tidak menghapus logo aktif')
  stage='staff/deactivation';const email=`usahaku-profile-staff-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url');console.log('CHECK: create staff');const staff=ok(await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{account_type:'staff'}})).user;users.push(staff.id)
  ok(await admin.from('business_members').insert({business_id:a.id,user_id:staff.id,name:'Profile Staff',username:'profile_staff',role:'admin',must_change_password:false,changed_by:a.user}))
  stage='staff password login';const sc=client();ok(await sc.auth.signInWithPassword({email,password}));stage='staff logo read';assert.ok(ok(await sc.storage.from(bucket).download(current.logo_path,{cacheNonce:randomUUID()})))
  stage='staff profile forbidden';assert.ok((await sc.rpc('save_business_profile',profile(a.id,current.profile_revision))).error)
  stage='staff logo forbidden';assert.ok((await sc.rpc('reserve_business_logo',{target_id:a.id,asset_id:randomUUID()})).error)
  stage='staff deactivate';ok(await admin.from('business_members').update({active:false,changed_by:a.user}).eq('user_id',staff.id));assert.ok((await sc.storage.from(bucket).download(current.logo_path,{cacheNonce:randomUUID()})).error)
  pass('Staf admin hanya membaca logo usaha sendiri; mutasi owner dan akses setelah nonaktif ditolak')
  stage='remove';current=ok(await a.c.rpc('set_business_logo',{target_id:a.id,expected_revision:current.profile_revision,asset_id:null}));assert.equal(current.logo_path,null)
  pass('Penghapusan logo mengosongkan pointer sebelum penghapusan fisik; fallback inisial tersedia')
}catch(error){console.log(`FAIL: ${stage}; code=${error.code||error.name}`);process.exitCode=1}
finally{
  try{
    if(businesses.length){const assets=ok(await admin.from('business_logo_assets').select('path').in('business_id',businesses));if(assets.length)ok(await admin.storage.from(bucket).remove(assets.map(a=>a.path)));ok(await admin.from('businesses').update({logo_path:null}).in('id',businesses));ok(await admin.from('business_logo_assets').delete().in('business_id',businesses));ok(await admin.from('staff_audit_logs').delete().in('business_id',businesses));ok(await admin.from('business_members').delete().in('business_id',businesses));ok(await admin.from('businesses').delete().in('id',businesses))}
    for(const id of users)ok(await admin.auth.admin.deleteUser(id))
    if(before)assert.equal(await snapshot(originalIds),before)
    pass('Seluruh data proyek sebelum tes tetap identik; akun/file/data yang dibuat tes dibersihkan')
  }catch(error){console.log('FAIL: cleanup or preservation; test IDs: '+JSON.stringify({users,businesses}));process.exitCode=1}
  fs.mkdirSync('artifacts/profile-setup',{recursive:true});fs.writeFileSync('artifacts/profile-setup/backend-results.json',JSON.stringify({date:new Date().toISOString(),passed:!process.exitCode,stage,results},null,2))
}

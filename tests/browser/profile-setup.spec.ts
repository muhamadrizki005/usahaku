import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

test('business profile, private logo and overnight hours through the real website', async ({browser,baseURL})=>{
  test.setTimeout(360000)
  const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url:RequestInfo|URL,init?:RequestInit)=>fetch(url,{...init,signal:AbortSignal.timeout(20000)})}}
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,options)
  const users:string[]=[],ids:string[]=[],contexts:BrowserContext[]=[],results:string[]=[]
  let stage='create accounts',before=''
  const ok=(r:any)=>{if(r.error)throw Error(`Backend failure at ${stage}: ${r.error.code||r.error.statusCode}`);return r.data}
  const pass=(s:string)=>{console.log('PASS: '+s);results.push(s)}
  const snapshot=async()=>{const rows=ok(await admin.from('businesses').select('*').in('code',['F531258D','E792CF0F']).order('id'));const members=ok(await admin.from('business_members').select('*').in('business_id',rows.map((r:any)=>r.id)).order('id'));return JSON.stringify({rows,members})}
  async function account(label:string){const email=`usahaku-profile-ui-${label}-${randomUUID()}@example.com`,secret=randomBytes(24).toString('base64url');const user=ok(await admin.auth.admin.createUser({email,password:secret,email_confirm:true})).user;users.push(user.id);return {email,secret,id:user.id}}
  async function page(){const c=await browser.newContext({baseURL,viewport:{width:1440,height:1000},deviceScaleFactor:1});contexts.push(c);return c.newPage()}
  async function login(p:Page,a:{email:string;secret:string}){await p.goto('/login');await p.getByLabel('Email',{exact:true}).fill(a.email);await p.getByLabel('Kata sandi',{exact:true}).fill(a.secret);await p.getByRole('button',{name:'Masuk',exact:true}).click();await expect(p).toHaveURL(/\/(onboarding|dashboard)$/)}
  async function profile(p:Page,name:string){await p.goto('/onboarding/identity');await p.getByLabel('Nama usaha *',{exact:true}).fill(name);await p.getByLabel('Alamat usaha *',{exact:true}).fill('Jalan Browser 1');await p.getByLabel('Kota/Kabupaten *',{exact:true}).fill('Bandung');await p.getByLabel('Provinsi *',{exact:true}).fill('Jawa Barat');await p.getByLabel('Nomor kontak usaha *',{exact:true}).fill('081234567890');await p.getByPlaceholder('Ceritakan singkat usaha Anda',{exact:true}).fill('Profil tersimpan dari browser')}
  async function current(id:string){return ok(await admin.from('businesses').select('*').eq('owner_id',id).single())}
  const png=await sharp({create:{width:60,height:60,channels:4,background:'#1835d9'}}).png().toBuffer()
  const screenshot=async(p:Page,name:string)=>{await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:`artifacts/profile-setup/${name}.png`,fullPage:true})}
  try{
    await mkdir('artifacts/profile-setup',{recursive:true});before=await snapshot()
    const a=await account('a'),b=await account('b'),p=await page();await login(p,a);await profile(p,'Browser Store A')
    await screenshot(p,'identity-before-save')
    await p.locator('input[type=file]').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:png})
    stage='create profile with logo';await p.getByRole('button',{name:'Simpan & lanjutkan'}).click();await expect(p).toHaveURL(/\/onboarding\/setup\?category=toko$/)
    const initial=await current(a.id);ids.push(initial.id);expect(initial.description).toBe('Profil tersimpan dari browser');expect(initial.logo_path).toBeTruthy()
    await p.reload();await expect(p.getByRole('heading',{name:/Siapkan Browser Store A/})).toBeVisible();pass('Pembuatan profil dan upload PNG melalui server action; persisten setelah reload')
    stage='overnight hours';await p.getByRole('button',{name:'Ubah jam',exact:true}).click();await p.getByRole('button',{name:'Senin dibuka',exact:true}).click()
    await p.locator('input[type=time]').nth(0).fill('22:00');await p.locator('input[type=time]').nth(1).fill('02:00');await p.getByRole('button',{name:'Simpan jam operasional',exact:true}).click();await expect(p.getByRole('heading',{name:'Ubah jam operasional',exact:true})).not.toBeVisible()
    await expect(p.locator('main')).toContainText('(+1 hari)');await p.reload();expect((await current(a.id)).operating_hours.Senin.close).toBe('02:00')
    await p.getByRole('button',{name:'Ubah jam',exact:true}).click();await p.getByRole('button',{name:'Selasa dibuka',exact:true}).click();await p.locator('input[type=time]').nth(2).fill('01:00');await p.locator('input[type=time]').nth(3).fill('03:00');await p.getByRole('button',{name:'Simpan jam operasional',exact:true}).click();await expect(p.getByText(/Jadwal Senin dan Selasa bertumpang tindih/)).toBeVisible()
    await p.getByRole('button',{name:'Selasa ditutup',exact:true}).click();await p.getByRole('button',{name:'Simpan jam operasional',exact:true}).click();await expect(p.getByRole('heading',{name:'Ubah jam operasional',exact:true})).not.toBeVisible();await screenshot(p,'setup-persisted');pass('Jam 22:00-02:00 tersimpan; overlap ditolak di modal; status checklist berasal dari DB')
    stage='summary';await p.getByRole('button',{name:'Masuk ke ringkasan'}).click();await expect(p.getByText('Profil tersimpan dari browser',{exact:true})).toBeVisible();await expect(p.getByText(/22:00.*02:00.*\(\+1 hari\)/)).toBeVisible();await expect(p.getByRole('img',{name:'Logo Browser Store A',exact:true})).toBeVisible();await screenshot(p,'summary-persisted')
    await p.getByRole('button',{name:'Buka dashboard'}).click();await expect(p.getByRole('img',{name:'Logo Browser Store A',exact:true})).toBeVisible();await screenshot(p,'dashboard-persisted')
    stage='independent session';const second=await page();await login(second,a);await second.goto('/dashboard/settings');await expect(second.getByPlaceholder('Ceritakan singkat usaha Anda',{exact:true})).toHaveValue('Profil tersimpan dari browser');await expect(second.getByLabel('Kota/Kabupaten *',{exact:true})).toHaveValue('Bandung');pass('Ringkasan, dashboard, dan login di sesi baru memakai profil/logo tersimpan')
    stage='profile concurrency';await p.goto('/dashboard/settings');await second.getByLabel('Nama usaha *',{exact:true}).fill('Browser Store Updated');await second.getByRole('button',{name:'Simpan perubahan'}).click();await expect(second.getByRole('status')).toContainText('Profil usaha tersimpan.')
    await p.getByLabel('Nama usaha *',{exact:true}).fill('Stale Store');await p.getByRole('button',{name:'Simpan perubahan'}).click();await expect(p.getByRole('alert')).toContainText('Muat ulang');expect((await current(a.id)).name).toBe('Browser Store Updated');pass('Dua tab tidak saling menimpa profil dengan revisi lama')
    stage='invalid and replacement logo';await p.reload();await p.locator('input[type=file]').setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('not an image')});await expect(p.getByText('Gunakan file PNG atau JPG.',{exact:true})).toBeVisible()
    await p.locator('input[type=file]').setInputFiles({name:'spoof.png',mimeType:'image/png',buffer:Buffer.from('invalid PNG')});await p.getByRole('button',{name:'Simpan perubahan'}).click();await expect(p.getByRole('alert')).toContainText('Isi gambar tidak valid');expect((await current(a.id)).logo_path).toBe(initial.logo_path)
    const png2=await sharp({create:{width:50,height:50,channels:4,background:'#0f766e'}}).png().toBuffer();await p.locator('input[type=file]').setInputFiles({name:'replacement.png',mimeType:'image/png',buffer:png2});await p.getByRole('button',{name:'Simpan perubahan'}).click();await expect(p.getByRole('status')).toContainText('Profil usaha tersimpan.');const updated=await current(a.id);expect(updated.logo_path).not.toBe(initial.logo_path);expect(ok(await admin.from('business_logo_assets').select('state').eq('path',initial.logo_path).single()).state).toBe('deleted');pass('MIME palsu ditolak server; logo lama tetap ada saat gagal; penggantian berhasil dan file lama dibersihkan')
    stage='tenant proxy protection';const pb=await page();await login(pb,b);await profile(pb,'Browser Store B');await pb.getByRole('button',{name:'Simpan & lanjutkan'}).click();await expect(pb).toHaveURL(/\/onboarding\/setup\?category=toko$/);const businessB=await current(b.id);ids.push(businessB.id)
    expect((await pb.context().request.get(`/api/business/${initial.id}/logo`)).status()).toBe(403);expect((await p.context().request.get(`/api/business/${initial.id}/logo`)).status()).toBe(200);const anon=await page();expect((await anon.context().request.get(`/api/business/${initial.id}/logo`)).status()).toBe(401)
    stage='remove logo';await p.getByRole('button',{name:'Remove logo',exact:true}).click();await p.getByRole('button',{name:'Simpan perubahan'}).click();await expect(p.getByRole('status')).toContainText('Profil usaha tersimpan.');expect((await current(a.id)).logo_path).toBeNull();await p.goto('/dashboard');await expect(p.locator('aside')).toContainText('BS');await expect(p.getByRole('img',{name:/Logo Browser Store/})).toHaveCount(0)
    pass('Proxy logo menolak usaha lain/anonim; hapus logo menghasilkan inisial; usaha tanpa logo tetap dapat dibuat')
  }finally{
    for(const c of contexts)await c.close()
    // Discover IDs only through owners created by this exact run, even if a UI assertion failed after commit.
    if(users.length){const found=ok(await admin.from('businesses').select('id').in('owner_id',users));for(const b of found)if(!ids.includes(b.id))ids.push(b.id)}
    if(ids.length){const assets=ok(await admin.from('business_logo_assets').select('path').in('business_id',ids));if(assets.length)ok(await admin.storage.from('business-logos').remove(assets.map((a:any)=>a.path)));ok(await admin.from('businesses').update({logo_path:null}).in('id',ids));ok(await admin.from('business_logo_assets').delete().in('business_id',ids));ok(await admin.from('staff_audit_logs').delete().in('business_id',ids));ok(await admin.from('business_members').delete().in('business_id',ids));ok(await admin.from('businesses').delete().in('id',ids))}
    for(const id of users)ok(await admin.auth.admin.deleteUser(id))
    if(before)expect(await snapshot()).toBe(before)
    await writeFile('artifacts/profile-setup/browser-results.json',JSON.stringify({date:new Date().toISOString(),stage,results,cleanup:true},null,2))
  }
})

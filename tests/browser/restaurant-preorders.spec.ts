import { test, expect, type BrowserContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { restaurantTestHours } from '../fixtures/restaurant-hours'
import { reservationLocalTime } from '../../lib/restaurant-reservations'

test('restaurant preorders: browser flow, live locks, owner settings, existing diners and mobile', async ({browser,baseURL})=>{
  test.setTimeout(360000)
  const options={auth:{persistSession:false,autoRefreshToken:false}}, make=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,options)
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,options)
  const ok=(r:any)=>{if(r.error)throw Error('Reservation fixture: '+r.error.code);return r.data}
  ok(await admin.from('restaurant_reservations').select('id').limit(1))
  const legacy=ok(await admin.from('businesses').select('id')).map((r:any)=>r.id), users:string[]=[], bids:string[]=[], contexts:BrowserContext[]=[], errors:string[]=[]
  async function snapshot(){const state:Record<string,unknown>={};for(const [table,key] of [['businesses','id'],['business_members','id'],['business_roles','id'],['catalog_products','id'],['stock_movements','id'],['pos_transactions','id'],['restaurant_reservations','id'],['restaurant_menu','id'],['restaurant_tables','id'],['restaurant_orders','id'],['restaurant_audit','id'],['restaurant_requests','request_id']]){const rows:any[]=[];for(let start=0;;start+=500){const chunk=ok(await admin.from(table).select('*').in(table==='businesses'?'id':'business_id',legacy).order(key).range(start,start+499));rows.push(...chunk);if(chunk.length<500)break}state[table]=rows}return createHash('sha256').update(JSON.stringify(state)).digest('hex')}
  const before=await snapshot(),dir='.cache/restaurant-preorders/browser';let passed=false,stage='fixture'
  async function account(role?:string,bid?:string){const code=bid?ok(await admin.from('businesses').select('code').eq('id',bid).single()).code:'',username='res'+randomBytes(4).toString('hex'),email=bid?`${code.toLowerCase()}.${username}@staff.usahaku.invalid`:`usahaku-res-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url'),uid=ok(await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{account_type:role?'staff':'owner'}})).user.id;users.push(uid);const client=make();ok(await client.auth.signInWithPassword({email,password}));if(bid)ok(await admin.from('business_members').insert({business_id:bid,user_id:uid,name:'Petugas Reservasi',username,role,must_change_password:false}));else{bid=ok(await client.rpc('create_business_profile_for_category',{business_category:'restaurant',store_name:'Restoran Uji Reservasi',owner_name:'Owner Reservasi',store_phone:'081234567890',store_street:'Jalan Uji',store_city:'Bandung',store_province:'Jawa Barat',store_description:''}));bids.push(bid!);ok(await client.rpc('save_business_hours',{target_id:bid,expected_revision:0,schedule:restaurantTestHours()}));ok(await client.rpc('complete_business_onboarding',{target_id:bid}))}return{client,bid:bid!,uid,username,email,password,code,role}}
  async function login(actor:Awaited<ReturnType<typeof account>>){const context=await browser.newContext({baseURL,viewport:{width:1440,height:1000}});contexts.push(context);const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(actor.role?'/login?mode=staff':'/login');if(actor.role){await page.getByLabel('Kode toko',{exact:true}).fill(actor.code);await page.getByLabel('Username',{exact:true}).fill(actor.username)}else await page.getByLabel('Email',{exact:true}).fill(actor.email);await page.getByLabel('Kata sandi',{exact:true}).fill(actor.password);await page.getByRole('button',{name:'Masuk',exact:true}).click();await expect(page).toHaveURL(/\/dashboard(?:\/pos)?$/);return page}
  try {
    await mkdir(dir,{recursive:true})
    const owner=await account(), a=await account('cashier',owner.bid), b=await account('cashier',owner.bid), manager=await account('admin',owner.bid), other=await account()
    const tid=randomUUID(),mid=randomUUID(),futureTable=randomUUID()
    for(const [resource,id,details] of [['table',tid,{name:'Meja Uji',capacity:4,active:true}],['table',futureTable,{name:'Meja Jadwal',capacity:4,active:true}],['menu',mid,{name:'Kopi Uji',category:'Minuman',price:'30000',active:true,available:true}]] as const)ok(await owner.client.rpc('save_restaurant_resource',{target_id:owner.bid,resource,item_id:id,expected_revision:null,operation_id:randomUUID(),details}))
    const iso=(minutes:number)=>new Date(Date.now()+minutes*60000).toISOString()
    const rid=randomUUID(),start=iso(123),end=new Date(Date.parse(start)+90*60000).toISOString(),day=reservationLocalTime(start).slice(0,10)
    const rdetails={tableId:tid,guests:2,customer:'Tamu Di Muka',phone:'081234567890',notes:'Uji',startsAt:start,endsAt:end}
    ok(await a.client.rpc('save_restaurant_reservation',{target_id:owner.bid,item_id:rid,expected_revision:null,operation_id:randomUUID(),details:rdetails}))
    const walk=randomUUID(),orderDetails={kind:'dine_in',tableId:tid,guests:2,customer:'Pelanggan umum',notes:'',stage:'new',lines:[{id:mid,quantity:1}]}
    ok(await b.client.rpc('save_restaurant_order',{target_id:owner.bid,item_id:walk,expected_revision:null,operation_id:randomUUID(),details:orderDetails}))
    stage='preorder UI';const page=await login(a)
    await page.goto('/dashboard/restaurant/reservations?day='+day)
    let row=page.getByTestId('reservation-'+rid)
    await row.getByRole('link',{name:'Tambah / ubah pesanan',exact:true}).click()
    let dialog=page.getByRole('dialog',{name:'Buat pesanan',exact:true})
    await expect(dialog).toContainText('Pesanan di muka tidak menandai meja terpakai')
    await dialog.getByLabel('Pilih menu',{exact:true}).selectOption(mid);await dialog.getByRole('button',{name:'Tambahkan menu',exact:true}).click();await dialog.getByRole('button',{name:'Simpan pesanan',exact:true}).click();await expect(dialog).toHaveCount(0)
    const preorder=ok(await a.client.from('restaurant_orders').select('*').eq('reservation_id',rid).single())
    expect(preorder.occupies_table).toBe(false);await expect(page.getByRole('button',{name:/^Bayar PSN-/})).toHaveCount(0);await expect(page.getByText('Pesanan di muka / belum datang',{exact:true})).toBeVisible()
    expect((await a.client.rpc('pay_restaurant_order',{target_id:owner.bid,item_id:preorder.id,expected_revision:0,operation_id:randomUUID(),details:{payment:'cash',received:'30000',discountKind:'none',discountValue:'0',confirmed:true}})).error?.message).toContain('Tandai pelanggan datang')
    stage='locked table and existing diner'
    ok(await admin.from('restaurant_reservations').update({starts_at:iso(119),ends_at:iso(209)}).eq('id',rid).eq('business_id',owner.bid))
    await page.goto('/dashboard/restaurant/reservations?day='+day)
    await row.getByRole('button',{name:'Tandai pelanggan datang',exact:true}).click()
    dialog=page.getByRole('dialog',{name:'Tandai pelanggan datang',exact:true});await dialog.getByRole('button',{name:'Konfirmasi kedatangan',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Meja masih terpakai');await page.keyboard.press('Escape')
    const blocked=await b.client.rpc('save_restaurant_order',{target_id:owner.bid,item_id:randomUUID(),expected_revision:null,operation_id:randomUUID(),details:orderDetails});expect(blocked.error?.message).toContain('dikunci')
    const bp=await login(b);await bp.getByRole('button',{name:/^Ubah PSN-/}).click();dialog=bp.getByRole('dialog',{name:'Ubah pesanan',exact:true});await dialog.getByLabel('Catatan pesanan',{exact:true}).fill('Masih bisa diubah setelah penguncian');await dialog.getByRole('button',{name:'Simpan pesanan',exact:true}).click();await expect(dialog).toHaveCount(0)
    await bp.getByRole('button',{name:/^Bayar PSN-/}).click();dialog=bp.getByRole('dialog',{name:/^Bayar PSN-/});await dialog.getByLabel('Uang diterima',{exact:true}).fill('30000');await dialog.getByLabel('Pembayaran sebesar total sudah diterima dan diperiksa.',{exact:true}).check();await dialog.getByRole('button',{name:'Catat pembayaran',exact:true}).click();await expect(bp).toHaveURL(/\/dashboard\/transactions\//)
    await page.goto('/dashboard/restaurant/reservations?day='+day);await row.getByRole('button',{name:'Tandai pelanggan datang',exact:true}).click();dialog=page.getByRole('dialog',{name:'Tandai pelanggan datang',exact:true});await dialog.getByRole('button',{name:'Konfirmasi kedatangan',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(row).toContainText('Sudah datang')
    stage='owner settings and refresh boundary'
    const op=await login(owner);await op.goto('/dashboard/restaurant/tables');await op.getByRole('button',{name:'Meja Uji',exact:true}).click();await expect(op.getByRole('dialog')).toContainText('Terpakai');await op.keyboard.press('Escape')
    await op.goto('/dashboard/settings');await expect(op.getByLabel('Penguncian sebelum kedatangan (menit)',{exact:true})).toHaveValue('120')
    await op.getByLabel('Penguncian sebelum kedatangan (menit)',{exact:true}).fill('180');await op.getByRole('button',{name:'Simpan pengaturan reservasi',exact:true}).click();await expect(op.getByRole('status').filter({hasText:'Waktu penguncian tersimpan'})).toBeVisible()
    await op.reload();await expect(op.getByLabel('Penguncian sebelum kedatangan (menit)',{exact:true})).toHaveValue('180')
    const fresh=await login(owner);await fresh.goto('/dashboard/settings');await expect(fresh.getByLabel('Penguncian sebelum kedatangan (menit)',{exact:true})).toHaveValue('180')
    for(const actor of [a,b,manager,other])expect((await actor.client.rpc('save_restaurant_lock_settings',{target_id:owner.bid,expected_revision:1,operation_id:randomUUID(),minutes:10})).error?.code).toBe('42501')
    expect((await b.client.rpc('arrive_restaurant_reservation',{target_id:owner.bid,item_id:rid,expected_revision:1,operation_id:randomUUID()})).error?.code).toBe('42501')
    const mp=await login(manager);await mp.goto('/dashboard/settings');await expect(mp).toHaveURL(/\/dashboard$/)
    const autoId=randomUUID(),autoStart=new Date(Date.now()+180*60000+15000).toISOString()
    ok(await owner.client.rpc('save_restaurant_reservation',{target_id:owner.bid,item_id:autoId,expected_revision:null,operation_id:randomUUID(),details:{...rdetails,tableId:futureTable,startsAt:autoStart,endsAt:new Date(Date.parse(autoStart)+90*60000).toISOString()}}))
    await op.goto('/dashboard/restaurant/tables');let tile=op.getByRole('group',{name:'Pilihan meja'}).getByRole('button',{name:'Meja Jadwal',exact:true});await expect(tile).not.toHaveClass(/opacity-60/);await expect(tile).toHaveClass(/opacity-60/,{timeout:25000});await tile.click();await expect(op.getByRole('dialog')).toContainText('Dikunci untuk reservasi');await op.keyboard.press('Escape')
    stage='mobile and tablet'
    for(const width of [320,390,768,1440]){
      await op.setViewportSize({width,height:900});await op.goto('/dashboard/settings');expect(await op.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(op.getByLabel('Penguncian sebelum kedatangan (menit)',{exact:true})).toBeVisible();await op.locator('section').filter({has:op.getByRole('heading',{name:'Pengaturan reservasi',exact:true})}).screenshot({path:dir+'/settings-'+width+'.png'})
      await op.goto('/dashboard/restaurant/reservations?day='+reservationLocalTime(autoStart).slice(0,10));expect(await op.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await op.getByTestId('reservation-'+autoId).getByRole('button',{name:'Tandai pelanggan datang',exact:true}).click();dialog=op.getByRole('dialog',{name:'Tandai pelanggan datang',exact:true});const box=(await dialog.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);await op.screenshot({path:dir+'/arrival-'+width+'.png',fullPage:true});await op.keyboard.press('Escape');await expect(dialog).toHaveCount(0)
    }
    stage='concurrent arrivals'
    const simultaneous=await Promise.all([owner,manager].map(actor=>actor.client.rpc('arrive_restaurant_reservation',{target_id:owner.bid,item_id:autoId,expected_revision:0,operation_id:randomUUID()})));expect(simultaneous.filter(r=>!r.error)).toHaveLength(1);expect(simultaneous.filter(r=>r.error?.code==='PT409')).toHaveLength(1)
    expect(errors).toEqual([]);passed=true
  }finally{
    for(const context of contexts)await context.close()
    for(const bid of bids){ok(await admin.from('staff_audit_logs').delete().eq('business_id',bid));ok(await admin.from('business_members').delete().eq('business_id',bid));ok(await admin.from('businesses').delete().eq('id',bid))}
    for(const uid of users)ok(await admin.auth.admin.deleteUser(uid))
    const unchanged=await snapshot()===before;expect(unchanged).toBe(true);await mkdir(dir,{recursive:true});await writeFile(`${dir}/results.json`,JSON.stringify({passed,stage,cleanup:true,legacyUnchanged:unchanged,pageErrors:errors},null,2))
  }
})

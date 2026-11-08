import { chooseSelect } from './helpers/select-option'
import { test, expect, type BrowserContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { calendarLabel } from '../../lib/calendar-date'
import { restaurantTestHours } from '../fixtures/restaurant-hours'
import { reservationLocalTime } from '../../lib/restaurant-reservations'
import {snapshotGuard} from './helpers/snapshot-state'

test('reservation booking: optional meals and DP, atomic retry, rollback, mobile and settlement',async({browser,baseURL})=>{
  test.setTimeout(360000)
  const options={auth:{persistSession:false,autoRefreshToken:false}}, make=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,options)
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,options)
  const ok=(r:any)=>{if(r.error)throw Error('Reservation fixture: '+r.error.code);return r.data}
  ok(await admin.from('restaurant_reservations').select('id').limit(1))
  const legacy=ok(await admin.from('businesses').select('id')).map((r:any)=>r.id), users:string[]=[], bids:string[]=[], contexts:BrowserContext[]=[], errors:string[]=[]
  const checkSnapshot=snapshotGuard()
  async function snapshot(){const state:Record<string,any[]>={};for(const [table,key] of [['businesses','id'],['business_members','id'],['business_roles','id'],['catalog_products','id'],['stock_movements','id'],['pos_transactions','id'],['restaurant_reservations','id'],['restaurant_menu','id'],['restaurant_tables','id'],['restaurant_orders','id'],['restaurant_audit','id'],['restaurant_requests','request_id']]){const rows:any[]=[];for(let start=0;;start+=500){const chunk=ok(await admin.from(table).select('*').in(table==='businesses'?'id':'business_id',legacy).order(key).range(start,start+499));rows.push(...chunk);if(chunk.length<500)break}state[table]=rows}return checkSnapshot(state)}
  const before=await snapshot(),dir='.cache/reservation-order-form/browser';let passed=false,stage='fixture'
  async function account(role?:string,bid?:string){const code=bid?ok(await admin.from('businesses').select('code').eq('id',bid).single()).code:'',username='res'+randomBytes(4).toString('hex'),email=bid?`${code.toLowerCase()}.${username}@staff.usahaku.invalid`:`usahaku-res-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url'),uid=ok(await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{account_type:role?'staff':'owner'}})).user.id;users.push(uid);const client=make();ok(await client.auth.signInWithPassword({email,password}));if(bid)ok(await admin.from('business_members').insert({business_id:bid,user_id:uid,name:'Petugas Reservasi',username,role,must_change_password:false}));else{bid=ok(await client.rpc('create_business_profile_for_category',{business_category:'restaurant',store_name:'Restoran Uji Reservasi',owner_name:'Owner Reservasi',store_phone:'081234567890',store_street:'Jalan Uji',store_city:'Bandung',store_province:'Jawa Barat',store_description:''}));bids.push(bid!);ok(await client.rpc('save_business_hours',{target_id:bid,expected_revision:0,schedule:restaurantTestHours()}));ok(await client.rpc('complete_business_onboarding',{target_id:bid}))}return{client,bid:bid!,uid,username,email,password,code,role}}
  async function login(actor:Awaited<ReturnType<typeof account>>){const context=await browser.newContext({baseURL,viewport:{width:1440,height:1000}});contexts.push(context);const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(actor.role?'/login?mode=staff':'/login');if(actor.role){await page.getByLabel('Kode toko',{exact:true}).fill(actor.code);await page.getByLabel('Username',{exact:true}).fill(actor.username)}else await page.getByLabel('Email',{exact:true}).fill(actor.email);await page.getByLabel('Kata sandi',{exact:true}).fill(actor.password);await page.getByRole('button',{name:'Masuk',exact:true}).click();await expect(page).toHaveURL(/\/dashboard(?:\/pos)?$/);return page}
  try{
    await mkdir(dir,{recursive:true});const owner=await account(),a=await account('cashier',owner.bid),b=await account('cashier',owner.bid),other=await account()
    const tid=randomUUID(),tid2=randomUUID(),mid=randomUUID()
    for(const [resource,id,details] of [['table',tid,{name:'Meja A',capacity:4,active:true}],['table',tid2,{name:'Meja B',capacity:4,active:true}],['menu',mid,{name:'Kopi Paket',category:'Minuman',price:'30000',active:true,available:true}]] as const)ok(await owner.client.rpc('save_restaurant_resource',{target_id:owner.bid,resource,item_id:id,expected_revision:null,operation_id:randomUUID(),details}))
    const startsAt=new Date(Date.now()+10*60000).toISOString(),local=reservationLocalTime(startsAt),day=local.slice(0,10)
    const page=await login(a);await page.goto('/dashboard/restaurant/reservations?day='+day)
    async function chooseDate(label:string,date:string,withTime?:string){await page.getByLabel(label,{exact:true}).click();const calendar=page.getByRole('dialog',{name:'Kalender '+label,exact:true});await chooseSelect(calendar.getByLabel('Tahun kalender',{exact:true}),date.slice(0,4));await chooseSelect(calendar.getByLabel('Bulan kalender',{exact:true}),String(Number(date.slice(5,7))-1));await calendar.getByRole('button',{name:calendarLabel(date),exact:true}).click();if(withTime){await calendar.getByLabel('Jam kedatangan (WIB)',{exact:true}).fill(withTime);await calendar.getByRole('button',{name:'Pilih tanggal dan jam',exact:true}).click()}await expect(calendar).toHaveCount(0)}

    async function openBooking(name:string,table:string){
      await page.getByRole('button',{name:'Buat reservasi',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Buat reservasi',exact:true})
      await chooseDate('Kedatangan (WIB)',day,local.slice(11,16));await dialog.getByRole('button',{name:'Periksa meja tersedia',exact:true}).click();await dialog.getByRole('button',{name:table,exact:true}).click()
      await dialog.getByLabel('Nama pelanggan',{exact:true}).fill(name);await dialog.getByLabel('Nomor kontak',{exact:true}).fill('081234567890')
      return dialog
    }
    stage='combined booking'
    let dialog=await openBooking('Tamu Paket','Meja A')
    await expect(dialog.getByLabel('Pesan makanan sekalian (opsional)',{exact:true})).not.toBeChecked()
    await dialog.getByLabel('Pesan makanan sekalian (opsional)',{exact:true}).check()
    await chooseSelect(dialog.getByLabel('Pilih menu reservasi',{exact:true}),mid);await dialog.getByRole('button',{name:'Tambahkan menu',exact:true}).click()
    await dialog.getByLabel('Jumlah Kopi Paket',{exact:true}).fill('');await expect(dialog.getByLabel('Jumlah Kopi Paket',{exact:true})).toHaveValue('');await dialog.getByLabel('Jumlah Kopi Paket',{exact:true}).fill('2')
    await chooseSelect(dialog.getByLabel('Pilih menu reservasi',{exact:true}),mid);await dialog.getByRole('button',{name:'Tambahkan menu',exact:true}).click();await expect(dialog.getByLabel('Jumlah Kopi Paket',{exact:true})).toHaveValue('3')
    await dialog.getByRole('button',{name:'Hapus Kopi Paket',exact:true}).click();await expect(dialog.getByLabel('Jumlah Kopi Paket',{exact:true})).toHaveCount(0);await expect(dialog).toContainText('Tambahkan minimal satu menu')
    await chooseSelect(dialog.getByLabel('Pilih menu reservasi',{exact:true}),mid);await dialog.getByRole('button',{name:'Tambahkan menu',exact:true}).click();await dialog.getByLabel('Jumlah Kopi Paket',{exact:true}).fill('2')
    await dialog.getByLabel('Catatan makanan',{exact:true}).fill('Tanpa es')
    await expect(dialog).toContainText('Subtotal makanan: Rp60.000')
    await dialog.getByLabel('Catat DP sekarang (opsional)',{exact:true}).check()
    await dialog.getByLabel('Nominal DP reservasi (Rp)',{exact:true}).fill('60001')
    await chooseSelect(dialog.getByLabel('Metode DP reservasi',{exact:true}),'transfer')
    await dialog.getByLabel('DP reservasi sudah diterima dan diperiksa.',{exact:true}).check()
    await dialog.getByRole('button',{name:'Simpan reservasi',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('DP tidak boleh melebihi subtotal')
    expect(ok(await a.client.from('restaurant_reservations').select('id').eq('business_id',owner.bid))).toHaveLength(0)
    await dialog.getByLabel('Nominal DP reservasi (Rp)',{exact:true}).fill('20000')
    await expect(dialog.getByRole('alert')).toHaveCount(0)
    for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
      await dialog.getByLabel('Catatan makanan',{exact:true}).scrollIntoViewIfNeeded();const box=(await dialog.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);await page.screenshot({path:dir+'/booking-'+width+'.png'})
    }
    let intercepted=false;await page.route('**/dashboard/restaurant/reservations**',async route=>{if(!intercepted&&route.request().method()==='POST'&&route.request().headers()['next-action']){intercepted=true;await route.fetch();await route.abort('failed')}else await route.continue()})
    await dialog.getByRole('button',{name:'Simpan reservasi',exact:true}).click();await expect(dialog.getByRole('button',{name:'Ulangi permintaan yang sama',exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Ulangi permintaan yang sama',exact:true}).click();await expect(dialog).toHaveCount(0);await page.unroute('**/dashboard/restaurant/reservations**')
    const reservation=ok(await a.client.from('restaurant_reservations').select('*').eq('business_id',owner.bid).single()),orders=ok(await a.client.from('restaurant_orders').select('*').eq('business_id',owner.bid))
    expect(orders).toHaveLength(1);const order=orders[0];expect(order.reservation_id).toBe(reservation.id);expect(order.lines[0].quantity).toBe(2);expect(order.subtotal).toBe(60000);expect(order.notes).toBe('Tanpa es');expect(order.occupies_table).toBe(false);expect(reservation.deposit_amount).toBe(20000)
    expect(ok(await a.client.from('pos_transactions').select('id').eq('business_id',owner.bid))).toHaveLength(0)
    const row=page.getByTestId('reservation-'+reservation.id);await expect(row).toContainText('Rp20.000');await page.reload();await expect(row).toContainText('Rp20.000')
    await row.getByRole('button',{name:'Ubah reservasi',exact:true}).click();dialog=page.getByRole('dialog',{name:'Ubah reservasi',exact:true});await expect(dialog.getByLabel('Pesan makanan sekalian (opsional)',{exact:true})).toHaveCount(0);await dialog.getByLabel('Catatan reservasi',{exact:true}).fill('Reservasi diubah');await dialog.getByRole('button',{name:'Periksa meja tersedia',exact:true}).click();await dialog.getByRole('button',{name:'Simpan reservasi',exact:true}).click();await expect(dialog).toHaveCount(0)
    expect(ok(await a.client.from('restaurant_orders').select('*').eq('id',order.id).single()).subtotal).toBe(60000)
    stage='arrival and settlement'
    await row.getByRole('link',{name:'Tambah / ubah pesanan',exact:true}).click();dialog=page.getByRole('region',{name:'Keranjang restoran',exact:true});await expect(dialog.getByLabel('Jumlah Kopi Paket',{exact:true})).toHaveValue('2');await expect(page.getByRole('button',{name:/^Bayar PSN-/})).toHaveCount(0)
    await page.goto('/dashboard/restaurant/reservations?day='+day);await row.getByRole('button',{name:'Tandai pelanggan datang',exact:true}).click();dialog=page.getByRole('dialog',{name:'Tandai pelanggan datang',exact:true});await dialog.getByRole('button',{name:'Konfirmasi kedatangan',exact:true}).click();await expect(dialog).toHaveCount(0)
    await page.goto('/dashboard/pos');await page.getByRole('button',{name:/^Bayar PSN-/}).click();dialog=page.getByRole('region',{name:'Pembayaran pesanan',exact:true});await expect(dialog).toContainText('Sisa pembayaran: Rp40.000');await dialog.getByLabel('Uang diterima',{exact:true}).fill('40000');await dialog.getByLabel('Sisa pembayaran sudah diterima dan diperiksa.',{exact:true}).check();await dialog.getByRole('button',{name:'Catat pembayaran',exact:true}).click();await expect(page).toHaveURL(/\/dashboard\/transactions\//)
    stage='rollback and optional food'
    await page.goto('/dashboard/restaurant/reservations?day='+day);dialog=await openBooking('Menu Berubah','Meja B')
    await dialog.getByLabel('Pesan makanan sekalian (opsional)',{exact:true}).check();await chooseSelect(dialog.getByLabel('Pilih menu reservasi',{exact:true}),mid);await dialog.getByRole('button',{name:'Tambahkan menu',exact:true}).click()
    await dialog.getByLabel('Catat DP sekarang (opsional)',{exact:true}).check();await dialog.getByLabel('Nominal DP reservasi (Rp)',{exact:true}).fill('10000');await dialog.getByLabel('DP reservasi sudah diterima dan diperiksa.',{exact:true}).check()
    ok(await owner.client.rpc('save_restaurant_resource',{target_id:owner.bid,resource:'menu',item_id:mid,expected_revision:0,operation_id:randomUUID(),details:{name:'Kopi Paket',category:'Minuman',price:'30000',active:true,available:false}}))
    await dialog.getByRole('button',{name:'Simpan reservasi',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('sedang habis')
    expect(ok(await a.client.from('restaurant_reservations').select('id').eq('business_id',owner.bid).eq('customer','Menu Berubah'))).toHaveLength(0)
    await dialog.getByLabel('Pesan makanan sekalian (opsional)',{exact:true}).uncheck();await dialog.getByRole('button',{name:'Simpan reservasi',exact:true}).click();await expect(dialog).toHaveCount(0)
    const withoutFood=ok(await a.client.from('restaurant_reservations').select('*').eq('business_id',owner.bid).eq('customer','Menu Berubah').single());expect(withoutFood.deposit_amount).toBe(10000);expect(ok(await a.client.from('restaurant_orders').select('id').eq('reservation_id',withoutFood.id))).toHaveLength(0)
    const fresh=await login(a);await fresh.goto('/dashboard/restaurant/reservations?day='+day);await expect(fresh.getByTestId('reservation-'+reservation.id)).toContainText('Selesai');await expect(fresh.getByTestId('reservation-'+withoutFood.id)).toContainText('Rp10.000')
    expect(ok(await b.client.from('restaurant_orders').select('id').eq('business_id',owner.bid))).toEqual([])
    expect(ok(await other.client.from('restaurant_reservations').select('id').eq('business_id',owner.bid))).toEqual([])
    const denied=await other.client.rpc('create_restaurant_reservation_bundle',{target_id:owner.bid,item_id:randomUUID(),operation_id:randomUUID(),details:{},meal:null,deposit:null});expect(denied.error?.code).toBe('42501')
    expect(errors).toEqual([]);passed=true
  }finally{
    for(const context of contexts)await context.close()
    for(const bid of bids){ok(await admin.from('staff_audit_logs').delete().eq('business_id',bid));ok(await admin.from('business_members').delete().eq('business_id',bid));ok(await admin.from('businesses').delete().eq('id',bid))}
    for(const uid of users)ok(await admin.auth.admin.deleteUser(uid))
    const unchanged=await snapshot()===before;expect(unchanged).toBe(true);await mkdir(dir,{recursive:true});await writeFile(`${dir}/results.json`,JSON.stringify({passed,stage,cleanup:true,legacyUnchanged:unchanged,pageErrors:errors},null,2))
  }
})

import {test,expect} from '@playwright/test'
import {createClient} from '@supabase/supabase-js'
import {randomUUID,randomBytes} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'

test('all page palettes, forms, dialogs and protected routes',async({browser,baseURL})=>{
  test.setTimeout(360000)
  const dir='artifacts/palette-app',options={auth:{persistSession:false,autoRefreshToken:false}}
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,options)
  const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,options)
  const ok=(r:any)=>{if(r.error)throw Error('Fixture failed: '+r.error.code);return r.data}
  const contexts:any[]=[],results:any[]=[],email=`usahaku-palette-${randomUUID()}@example.com`,secret=randomBytes(24).toString('base64url')
  let uid='',bid='',passed=false
  const legacy=ok(await admin.from('businesses').select('*').order('id'))
  try{
    await mkdir(dir,{recursive:true})
    uid=ok(await admin.auth.admin.createUser({email,password:secret,email_confirm:true,user_metadata:{full_name:'Pemilik Uji'}})).user.id
    ok(await client.auth.signInWithPassword({email,password:secret}))
    bid=ok(await client.rpc('create_business_profile',{store_name:'Toko Uji Palet',owner_name:'Pemilik Uji',store_phone:'081234567890',store_street:'Jalan Uji 1',store_city:'Bandung',store_province:'Jawa Barat',store_description:'Pengujian palet'}))
    const product=randomUUID(),customer=randomUUID()
    ok(await client.rpc('save_catalog_product',{target_id:bid,item_id:product,expected_version:null,operation_id:randomUUID(),details:{name:'Kopi Uji',category:'Minuman',unit:'pcs',sku:'PALET-01',barcode:'',price:'15000',minimum:'3',initialStock:'10',active:true}}))
    ok(await client.rpc('save_customer',{target_id:bid,item_id:customer,expected_version:null,operation_id:randomUUID(),details:{name:'Pelanggan Uji',phone:'081234567891',notes:'Catatan uji privat',active:true}}))
    const context=await browser.newContext({baseURL,viewport:{width:1440,height:1000},colorScheme:'light'});contexts.push(context);const page=await context.newPage()
    await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Kata sandi',{exact:true}).fill(secret);await page.getByRole('button',{name:'Masuk',exact:true}).click();await expect(page).toHaveURL(/\/onboarding\/summary$/)
    await page.goto('/dashboard');await expect(page).toHaveURL(/\/onboarding\/summary$/)
    await page.getByRole('button',{name:'Buka dashboard',exact:true}).click();await expect(page).toHaveURL(/\/dashboard$/)
    const sale=ok(await client.rpc('checkout_pos',{target_id:bid,operation_id:randomUUID(),details:{lines:[{id:product,quantity:'1',price:'15000',revision:0}],payment:'cash',received:'20000',discountKind:'none',discountValue:'0',customerId:customer,confirmed:true}}))
    const capture=async(p:any,url:string,name:string)=>{
      await p.setViewportSize({width:1440,height:1000});await p.goto(url);await p.evaluate(()=>document.fonts.ready);await expect(p.locator('main').first()).toBeVisible()
      const colors=await p.locator('main').first().evaluate((el:Element)=>{const s=getComputedStyle(el);return{background:s.backgroundColor,text:s.color,font:s.fontFamily}})
      expect(colors.background,name).toBe('rgb(28, 34, 46)');expect(colors.text,name).toBe('rgb(255, 255, 255)');expect(colors.font).toContain('Inter')
      await p.screenshot({path:`${dir}/${name}-desktop.png`,fullPage:true,animations:'disabled'})
      await p.setViewportSize({width:390,height:844});expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' mobile overflow').toBe(true)
      await p.emulateMedia({colorScheme:'dark'});expect(await p.locator('main').first().evaluate((el:Element)=>getComputedStyle(el).backgroundColor)).toBe(colors.background);await p.emulateMedia({colorScheme:'light'})
      await p.screenshot({path:`${dir}/${name}-mobile.png`,fullPage:true,animations:'disabled'});results.push({name,url:url.replace(sale.id,':sale').replace(customer,':customer'),...colors,mobileOverflow:false});console.log('PASS '+name)
    }
    const paths=['/onboarding','/onboarding/identity','/onboarding/setup','/onboarding/summary','/dashboard','/dashboard/products','/dashboard/inventory','/dashboard/pos','/dashboard/transactions','/dashboard/transactions/'+sale.id,'/dashboard/customers','/dashboard/customers/'+customer,'/dashboard/reports','/dashboard/settings','/dashboard/settings/staff','/dashboard/loyalty','/dashboard/assistant','/account','/account/password','/account/reset-password']
    for(let i=0;i<paths.length;i++)await capture(page,paths[i],'page-'+i)
    await page.setViewportSize({width:1440,height:1000});await page.goto('/dashboard/settings/staff');await page.getByRole('button',{name:'Tambah staf',exact:true}).click();await expect(page.getByLabel('Nama staf',{exact:true})).toBeVisible();expect(await page.getByLabel('Nama staf',{exact:true}).evaluate((el:Element)=>getComputedStyle(el).backgroundColor)).toBe('rgb(39, 50, 66)');await page.screenshot({path:dir+'/staff-dialog.png',fullPage:true,animations:'disabled'})
    await page.goto('/dashboard/products');await page.getByRole('button',{name:'Tambah produk',exact:true}).click();await expect(page.getByLabel('Nama produk *',{exact:true})).toBeVisible();await page.screenshot({path:dir+'/product-editor.png',fullPage:true,animations:'disabled'})
    await page.goto('/dashboard/customers');await page.getByRole('button',{name:'Tambah pelanggan',exact:true}).click();await expect(page.getByLabel('Nama pelanggan *',{exact:true})).toBeVisible();await page.screenshot({path:dir+'/customer-editor.png',fullPage:true,animations:'disabled'})
    await page.goto('/onboarding');await page.getByRole('button',{name:'Kembali',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await page.getByRole('button',{name:'Kebijakan Privasi',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.screenshot({path:dir+'/legal-dialog.png',fullPage:true,animations:'disabled'})
    const pub=await browser.newContext({baseURL,viewport:{width:1440,height:1000}});contexts.push(pub);const p=await pub.newPage()
    for(const [name,url]of [['landing','/'],['login','/login'],['staff-login','/login?mode=staff'],['signup','/signup'],['signup-success','/signup/success'],['recovery','/forgot-password'],['auth-error','/auth/error']])await capture(p,url,name)
    await p.evaluate(()=>{sessionStorage.setItem('usahaku_signup_email','palette-ui@example.com');sessionStorage.setItem('usahaku_signup_sent_at',String(Date.now()))});await capture(p,'/signup/verify','verify-otp');await expect(p.locator('input[inputmode="numeric"]')).toHaveCount(6)
    await p.goto('/dashboard');await expect(p).toHaveURL(/\/login$/)
    passed=true
  }finally{
    for(const c of contexts)await c.close()
    if(bid){for(const table of ['staff_audit_logs','business_members'])ok(await admin.from(table).delete().eq('business_id',bid));ok(await admin.from('businesses').delete().eq('id',bid))}
    if(uid)ok(await admin.auth.admin.deleteUser(uid))
    expect(ok(await admin.from('businesses').select('*').in('id',legacy.map((b:any)=>b.id)).order('id'))).toEqual(legacy)
    await writeFile(dir+'/results.json',JSON.stringify({passed,pages:results,cleanup:true,legacyBusinessesUnchanged:true},null,2))
  }
})

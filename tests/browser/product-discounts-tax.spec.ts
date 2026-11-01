import {test,expect,type BrowserContext} from '@playwright/test'
import {createClient} from '@supabase/supabase-js'
import {randomUUID,randomBytes,createHash} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'

test('product discounts and owner tax persist, cashier charges verified prices, receipt snapshots survive later edits',async({browser,baseURL})=>{
  test.setTimeout(240000)
  const options={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,options)
  const ok=(r:any)=>{if(r.error)throw Error('Backend test failed: '+r.error.code);return r.data}
  ok(await admin.from('catalog_products').select('discount_kind,discount_value').limit(1));ok(await admin.from('businesses').select('tax_rate,tax_revision').limit(1))
  const legacy=ok(await admin.from('businesses').select('id')).map((b:any)=>b.id)
  async function snapshot(){const data:Record<string,unknown>={};for(const table of ['businesses','business_members','catalog_products','stock_movements','pos_transactions']){const rows:unknown[]=[];for(let start=0;;start+=500){const batch=ok(await admin.from(table).select('*').in(table==='businesses'?'id':'business_id',legacy).order('id').range(start,start+499));rows.push(...batch);if(batch.length<500)break}data[table]=rows}return createHash('sha256').update(JSON.stringify(data)).digest('hex')}
  const before=await snapshot(),users:string[]=[],contexts:BrowserContext[]=[],errors:string[]=[],dir='.cache/product-discounts-tax'
  let bid='',otherBusiness='',passed=false
  async function account(role?:'admin'|'cashier'){
    const email=`usahaku-discount-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url'),uid=ok(await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{account_type:role?'staff':'owner'}})).user.id;users.push(uid)
    const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,options);ok(await client.auth.signInWithPassword({email,password}))
    if(role)ok(await admin.from('business_members').insert({business_id:bid,user_id:uid,name:'Uji '+role,username:role,role,must_change_password:false}))
    else{bid=ok(await client.rpc('create_business_profile',{store_name:'Toko Uji Diskon',owner_name:'Owner Uji Diskon',store_phone:'081234567890',store_street:'Jalan Uji',store_city:'Bandung',store_province:'Jawa Barat',store_description:''}));ok(await client.rpc('complete_business_onboarding',{target_id:bid}))}
    const context=await browser.newContext({baseURL,viewport:{width:1366,height:900}});contexts.push(context);const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Kata sandi',{exact:true}).fill(password);await page.getByRole('button',{name:'Masuk',exact:true}).click();await expect(page).toHaveURL(role==='cashier'?/\/dashboard\/pos$/:/\/dashboard$/)
    return{page,client,uid}
  }
  try{
    await mkdir(dir,{recursive:true})
    const owner=await account(),p=owner.page
    await p.goto('/dashboard/products');await p.getByRole('button',{name:'Tambah produk',exact:true}).click()
    let dialog=p.getByRole('dialog',{name:'Tambah produk',exact:true})
    await dialog.getByLabel('Unit stok *',{exact:true}).fill('kotak')
    await dialog.getByLabel('Nama produk *',{exact:true}).fill('Susu UHT Uji');await dialog.getByLabel('Kategori *',{exact:true}).click();await dialog.getByRole('option',{name:'Minuman',exact:true}).click();await dialog.getByLabel('Harga jual *',{exact:true}).fill('10000');await dialog.getByLabel('Stok fisik',{exact:true}).fill('20');await dialog.getByLabel('Minimum stok *',{exact:true}).fill('0')
    await dialog.getByLabel('Diskon produk',{exact:true}).check();await dialog.getByLabel('Nilai diskon produk',{exact:true}).fill('101');await dialog.getByRole('button',{name:'Simpan produk',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('maksimal 100%')
    await dialog.getByLabel('Nilai diskon produk',{exact:true}).fill('10');await expect(dialog).toContainText('Harga setelah diskon: Rp9.000');await dialog.getByRole('button',{name:'Simpan produk',exact:true}).click();await expect(dialog).toHaveCount(0)
    let product=ok(await admin.from('catalog_products').select('*').eq('business_id',bid).single());expect(product.discount_kind).toBe('percent');expect(Number(product.discount_value)).toBe(10)
    await p.reload();await p.getByRole('button',{name:'Ubah',exact:true}).click();dialog=p.getByRole('dialog',{name:'Ubah produk',exact:true});await expect(dialog.getByLabel('Diskon produk',{exact:true})).toBeChecked();await expect(dialog.getByLabel('Nilai diskon produk',{exact:true})).toHaveValue('10')
    await dialog.getByRole('button',{name:'Batal',exact:true}).click()
    await p.goto('/dashboard/pos');await p.getByRole('button',{name:'Tambah Susu UHT Uji',exact:true}).click();await p.getByText('Pengaturan pajak toko',{exact:true}).click();await p.getByLabel('Pajak toko (%)',{exact:true}).fill('11');await p.getByRole('button',{name:'Simpan pajak',exact:true}).click();await expect.poll(async()=>Number(ok(await admin.from('businesses').select('tax_rate').eq('id',bid).single()).tax_rate)).toBe(11)
    await p.reload();await p.getByRole('button',{name:'Tambah Susu UHT Uji',exact:true}).click();await expect(p.getByText('Pajak (11%)',{exact:true})).toBeVisible();const article=p.locator('article').filter({hasText:'Susu UHT Uji'});await expect(article.locator('del')).toHaveText('Rp10.000');await expect(article).toContainText('Rp9.000');await expect(p.getByLabel('Jenis diskon keseluruhan',{exact:true})).toBeVisible()
    await p.screenshot({path:dir+'/pos-desktop.png',fullPage:true})
    const staff=await account('admin');await staff.page.goto('/dashboard/pos');await expect(staff.page.getByText('Pengaturan pajak toko',{exact:true})).toHaveCount(0)
    expect((await staff.client.rpc('save_store_tax',{target_id:bid,expected_version:1,rate:0})).error?.code).toBe('42501')
    await staff.page.goto('/dashboard/products');await staff.page.getByRole('button',{name:'Ubah',exact:true}).click();const edit=staff.page.getByRole('dialog',{name:'Ubah produk',exact:true});await edit.getByLabel('Jenis diskon produk',{exact:true}).click();await edit.getByRole('option',{name:'Rupiah (Rp)',exact:true}).click();await edit.getByLabel('Nilai diskon produk',{exact:true}).fill('1000');await edit.getByRole('button',{name:'Simpan perubahan',exact:true}).click();await expect(edit).toHaveCount(0)
    product=ok(await admin.from('catalog_products').select('*').eq('id',product.id).single());expect(product.discount_kind).toBe('amount')
    const cashier=await account('cashier'),cp=cashier.page
    const productDetails={name:product.name,category:product.category,unit:product.unit,sku:product.sku,barcode:product.barcode,price:String(product.price),minimum:String(product.minimum_stock),initialStock:'0',active:true,discountKind:'none',discountValue:'0'}
    expect((await cashier.client.rpc('save_catalog_product',{target_id:bid,item_id:product.id,expected_version:product.revision,operation_id:randomUUID(),details:productDetails})).error?.code).toBe('42501')
    const otherEmail=`usahaku-tax-other-${randomUUID()}@example.com`,otherPassword=randomBytes(24).toString('base64url'),otherId=ok(await admin.auth.admin.createUser({email:otherEmail,password:otherPassword,email_confirm:true})).user.id;users.push(otherId)
    const other=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,options);ok(await other.auth.signInWithPassword({email:otherEmail,password:otherPassword}));otherBusiness=ok(await other.rpc('create_business_profile',{store_name:'Toko Isolasi Uji',owner_name:'Other Owner',store_phone:'081234567890',store_street:'Jalan Uji',store_city:'Bandung',store_province:'Jawa Barat',store_description:''}));ok(await other.rpc('complete_business_onboarding',{target_id:otherBusiness}))
    expect((await other.rpc('save_store_tax',{target_id:bid,expected_version:1,rate:0})).error?.code).toBe('42501');expect(ok(await other.from('catalog_products').select('id').eq('business_id',bid))).toHaveLength(0)
    expect((await other.rpc('save_catalog_product',{target_id:bid,item_id:product.id,expected_version:product.revision,operation_id:randomUUID(),details:productDetails})).error?.code).toBe('42501')
    await expect(cp.getByText('Pengaturan pajak toko',{exact:true})).toHaveCount(0);expect((await cashier.client.rpc('save_store_tax',{target_id:bid,expected_version:1,rate:0})).error?.code).toBe('42501')
    await cp.getByRole('button',{name:'Tambah Susu UHT Uji',exact:true}).click();await expect(cp.getByText('Rp9.990',{exact:true})).toBeVisible();await cp.getByLabel('Nominal tunai diterima',{exact:true}).fill('10000');await cp.getByRole('checkbox').check();await cp.getByRole('button',{name:'Konfirmasi & catat transaksi',exact:true}).click();await expect(cp.getByRole('status')).toContainText('berhasil dicatat')
    const sale=ok(await admin.from('pos_transactions').select('*').eq('business_id',bid).single());expect(Number(sale.total)).toBe(9990);expect(Number(sale.tax_amount)).toBe(990);expect(Number(sale.discount)).toBe(1000);expect(Number(sale.change)).toBe(10)
    await cp.goto('/dashboard/transactions/'+sale.id);const receipt=cp.locator('#pos-receipt');await expect(receipt).toContainText('Pajak (11%)');await expect(receipt.locator('del')).toHaveText('Rp10.000');await cp.reload();await expect(receipt).toContainText('Rp9.990')
    await p.goto('/dashboard/products');await p.getByRole('button',{name:'Ubah',exact:true}).click();dialog=p.getByRole('dialog',{name:'Ubah produk',exact:true});await dialog.getByLabel('Diskon produk',{exact:true}).uncheck();await dialog.getByRole('button',{name:'Simpan perubahan',exact:true}).click();await expect(dialog).toHaveCount(0)
    await p.goto('/dashboard/pos');await p.getByRole('button',{name:'Tambah Susu UHT Uji',exact:true}).click();await p.getByText('Pengaturan pajak toko',{exact:true}).click();await p.getByLabel('Pajak toko (%)',{exact:true}).fill('0');await p.getByRole('button',{name:'Simpan pajak',exact:true}).click();await expect.poll(async()=>Number(ok(await admin.from('businesses').select('tax_rate').eq('id',bid).single()).tax_rate)).toBe(0)
    await p.reload();await expect(p.locator('article').filter({hasText:'Susu UHT Uji'}).locator('del')).toHaveCount(0)
    await cp.reload();await expect(receipt).toContainText('Pajak (11%)');await expect(receipt).toContainText('Rp9.990')
    await p.setViewportSize({width:390,height:844});await expect(p.getByRole('button',{name:'Tambah Susu UHT Uji',exact:true})).toBeVisible();expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await p.screenshot({path:dir+'/pos-mobile.png',fullPage:true})
    expect(errors).toEqual([]);passed=true
  }finally{
    for(const context of contexts)await context.close()
    for(const businessId of [bid,otherBusiness].filter(Boolean)){ok(await admin.from('staff_audit_logs').delete().eq('business_id',businessId));ok(await admin.from('business_members').delete().eq('business_id',businessId));ok(await admin.from('businesses').delete().eq('id',businessId))}
    for(const id of users)ok(await admin.auth.admin.deleteUser(id))
    const unchanged=before===await snapshot();expect(unchanged).toBe(true)
    await mkdir(dir,{recursive:true});await writeFile(dir+'/results.json',JSON.stringify({passed,pageErrors:errors,cleanup:true,legacyUnchanged:unchanged},null,2))
  }
})

'use server'
import {randomUUID} from 'node:crypto'
import {revalidatePath} from 'next/cache'
import {requireBusiness} from '@/lib/access'
import {createAdminClient} from '@/lib/supabase/admin'
import {prepareBusinessLogo} from '@/lib/business-logo-server'
import {cleanupPaymentQrs,paymentQrBucket} from '@/lib/business-payments-server'
import {paymentSettingsSchema,paymentSettingsView,type PaymentSettingsRow,type PaymentSettings} from '@/lib/business-payments'
export type PaymentSettingsResult={settings?:PaymentSettings;error?:string;warning?:string;uncertain?:boolean}
export async function saveBusinessPayments(raw:unknown,revision:number,qrisImage:string):Promise<PaymentSettingsResult>{
  const {supabase,business}=await requireBusiness(['owner'],true)
  const parsed=paymentSettingsSchema.safeParse(raw)
  if(!parsed.success)return{error:parsed.error.issues[0].message}
  if(!['store', 'restaurant', 'barbershop'].includes(business.category)||!Number.isSafeInteger(revision)||revision<0||typeof qrisImage!=='string')return{error:'Pengaturan pembayaran tidak valid.'}
  const current=await supabase.from('business_payments').select('*').eq('business_id',business.id).maybeSingle()
  if(current.error)return{error:'Pengaturan pembayaran belum dapat dibaca. Muat ulang untuk memeriksa.'}
  const row=current.data as PaymentSettingsRow|null
  if((row?.revision||0)!==revision)return{error:'Pembayaran berubah di tab lain. Muat ulang sebelum menyimpan.'}
  let assetId:string|null=parsed.data.qris?row?.qris_asset||null:null
  if(parsed.data.qris&&qrisImage.startsWith('data:')){
    if(qrisImage.length>3*1024*1024)return{error:'Gambar QRIS maksimal 2 MB.'}
    const match=qrisImage.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/)
    if(!match)return{error:'Gunakan gambar PNG/JPG/WebP untuk QRIS.'}
    let content:Buffer
    try{content=await prepareBusinessLogo(new File([Buffer.from(match[2],'base64')],'qris',{type:match[1]}))}catch{return{error:'Gambar QRIS tidak valid. Gunakan PNG/JPG/WebP maksimal 2 MB.'}}
    assetId=randomUUID();const reserved=await supabase.rpc('reserve_payment_qr',{target_id:business.id,asset_id:assetId}).abortSignal(AbortSignal.timeout(15000)).retry(false)
    if(reserved.error||!reserved.data)return{error:'Gambar QRIS belum berhasil disiapkan. Konfigurasi lama tetap digunakan.'}
    const uploaded=await createAdminClient().storage.from(paymentQrBucket).upload(reserved.data,content,{contentType:'image/png',upsert:false,cacheControl:'0'})
    if(uploaded.error)return{error:'Gambar QRIS belum berhasil diunggah. Konfigurasi lama tetap digunakan.'}
  }else if(parsed.data.qris&&(!assetId||qrisImage!==paymentSettingsView(row).qrisImage))return{error:'Unggah gambar QRIS sebelum menyimpan metode QRIS.'}
  let saved:PaymentSettingsRow|null=null
  try{
    const result=await supabase.rpc('save_business_payments',{target_id:business.id,expected_revision:revision,details:parsed.data,asset_id:assetId}).abortSignal(AbortSignal.timeout(15000)).retry(false);
    if(result.data&&!result.error){
      saved=result.data;
    } else {
      console.error('save_business_payments RPC error:', result.error);
      if(result.error?.code === 'PT409') return { error: 'Pembayaran berubah di tab lain. Muat ulang sebelum menyimpan.' };
      if(result.error?.code === '42501') return { error: 'Akses ditolak.' };
      if(result.error?.message?.includes('ewallet') || result.error?.message?.includes('column') || result.error?.code === '42703') {
        return { error: 'Kolom atau fitur e-wallet belum aktif di database Supabase. Jalankan migrasi SQL e-wallet di Supabase SQL Editor.' };
      }
      if(result.error?.code === '22023') {
        if(parsed.data.ewallet) {
          return { error: 'Pengaturan e-wallet belum didukung oleh fungsi database Supabase saat ini. Jalankan migrasi SQL e-wallet di Supabase SQL Editor.' };
        }
        return { error: 'Pengaturan pembayaran ditolak. Periksa metode, rekening, dan gambar QRIS.' };
      }
    }
  }catch(err){
    console.error('save_business_payments RPC exception:', err);
  }
  if(!saved){const check=await supabase.from('business_payments').select('*').eq('business_id',business.id).maybeSingle();const value=check.data as PaymentSettingsRow|null;if(!check.error&&value&&value.revision===revision+1&&value.cash===parsed.data.cash&&value.qris===parsed.data.qris&&value.transfer===parsed.data.transfer&&value.ewallet===parsed.data.ewallet&&value.qris_asset===assetId&&JSON.stringify(value.banks)===JSON.stringify(parsed.data.banks)&&JSON.stringify(value.ewallets||[])===JSON.stringify(parsed.data.ewallets||[]))saved=value}
  if(!saved)return{error:'Status penyimpanan pembayaran belum pasti. Muat ulang untuk memeriksa sebelum mencoba lagi.',uncertain:true}
  let warning:string|undefined
  try{if(!await cleanupPaymentQrs(business.id))warning='Pengaturan tersimpan. Pembersihan gambar lama akan dicoba kembali.'}catch{warning='Pengaturan tersimpan. Pembersihan gambar lama akan dicoba kembali.'}
  revalidatePath('/dashboard','layout');revalidatePath('/onboarding','layout')
  return{settings:paymentSettingsView(saved),warning}
}

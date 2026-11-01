import {createClient} from '@/lib/supabase/server'
import {paymentQrBucket} from '@/lib/business-payments-server'
export async function GET(_request:Request,{params}:{params:Promise<{businessId:string}>}){
  const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}, {businessId}=await params
  if(!/^[0-9a-f-]{36}$/i.test(businessId))return new Response(null,{status:404,headers})
  const client=await createClient(),{data:{user},error}=await client.auth.getUser()
  if(error||!user)return new Response(null,{status:401,headers})
  const {data:settings}=await client.from('business_payments').select('qris_asset').eq('business_id',businessId).maybeSingle()
  if(!settings?.qris_asset)return new Response(null,{status:404,headers})
  const {data:asset}=await client.from('business_payment_assets').select('path').eq('id',settings.qris_asset).eq('business_id',businessId).maybeSingle()
  if(!asset)return new Response(null,{status:404,headers})
  const file=await client.storage.from(paymentQrBucket).download(asset.path)
  if(file.error||!file.data)return new Response(null,{status:404,headers})
  return new Response(await file.data.arrayBuffer(),{headers:{...headers,'Content-Type':'image/png'}})
}

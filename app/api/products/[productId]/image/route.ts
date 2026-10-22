import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
export async function GET(_:Request,{params}:{params:Promise<{productId:string}>}){
  const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}
  const {productId}=await params;if(!/^[\da-f-]{36}$/i.test(productId))return new Response(null,{status:404,headers})
  const client=await createClient();const {data:{user}}=await client.auth.getUser();if(!user)return new Response(null,{status:401,headers})
  const {data:member}=await client.from('business_members').select('business_id,active,must_change_password').eq('user_id',user.id).single()
  if(!member?.active||member.must_change_password)return new Response(null,{status:403,headers})
  const {data:p}=await client.from('catalog_products').select('image_path').eq('id',productId).eq('business_id',member.business_id).single()
  if(!p?.image_path)return new Response(null,{status:404,headers})
  const {data,error}=await client.storage.from('product-images').download(p.image_path,{cacheNonce:randomUUID()});if(error||!data)return new Response(null,{status:404,headers})
  return new Response(await data.arrayBuffer(),{headers:{...headers,'Content-Type':'image/png'}})
}

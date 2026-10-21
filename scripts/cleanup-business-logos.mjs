import { createClient } from '@supabase/supabase-js'

// Run only on a trusted server: node --env-file=.env.local scripts/cleanup-business-logos.mjs
// SQL claims lock the business and asset before tombstoning. Active logos cannot be claimed.
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const check=({data,error})=>{if(error)throw Error('Cleanup request failed');return data}
const rows=check(await admin.from('business_logo_assets').select('id,state,created_at').in('state',['retired','deleting','staging']).order('created_at').limit(100))
let removed=0,failed=0
for(const row of rows){
  if(row.state==='staging'&&Date.parse(row.created_at)>Date.now()-15*60*1000)continue
  try{
    const path=check(await admin.rpc('claim_business_logo_cleanup',{asset_id:row.id}))
    if(!path)continue
    check(await admin.storage.from('business-logos').remove([path]))
    check(await admin.from('business_logo_assets').update({state:'deleted',updated_at:new Date().toISOString()}).eq('id',row.id).eq('state','deleting'))
    removed++
  }catch{failed++}
}
console.log(JSON.stringify({removed,failed}))
if(failed)process.exitCode=1

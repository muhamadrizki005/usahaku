import {createHash} from 'node:crypto'

const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value

export function snapshotGuard(){
 let baseline:Record<string,any[]>|undefined
 return (state:Record<string,any[]>)=>{
  if(baseline){
   const changes=[]
   for(const[table,rows]of Object.entries(state)){
    const oldRows=baseline[table]||[]
    if(JSON.stringify(canonical(oldRows))===JSON.stringify(canonical(rows)))continue
    const rowKey=(r:Record<string,unknown>)=>r.id||r.request_id||r.business_id
    const keys=new Set([...oldRows,...rows].map(rowKey))
    for(const key of keys){const old=oldRows.find(r=>rowKey(r)===key),next=rows.find(r=>rowKey(r)===key);const fields=old&&next?Object.keys({...old,...next}).filter(k=>JSON.stringify(canonical(old[k]))!==JSON.stringify(canonical(next[k]))):[old?'row_removed':'row_added'];if(fields.length)changes.push({table,id:key,fields})}
   }
   if(changes.length)console.log('Snapshot changes (IDs and field names only): '+JSON.stringify(changes))
  }else baseline=structuredClone(state)
  return createHash('sha256').update(JSON.stringify(canonical(state))).digest('hex')
 }
}

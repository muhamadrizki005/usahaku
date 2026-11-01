export type SaleLine={id:string;name:string;sku:string;unit:string;price:number;quantity:number;total:number;unit_price?:number;original_total?:number;discount_kind?:string;discount_value?:number;discount?:number}
export type Sale={product_discount?:number|null;order_discount?:number|null;receipt_number?:string|null;tax_rate?:number;tax_amount?:number;id:string;business_id:string;actor_id:string|null;actor_name:string;customer:string;customer_id?:string|null;lines:SaleLine[];subtotal:number;discount_kind:'none'|'amount'|'percent';discount_value:number;discount:number;total:number;payment:'cash'|'qris'|'transfer'|'ewallet';received:number;change:number;status:'completed'|'cancelled';points_earned?:number|null;created_at:string;cancelled_at:string|null;cancelled_by_name:string|null;cancellation_reason:string|null;refund_amount:number|null}
export const saleCode=(sale:Pick<Sale,'id'> & Pick<Partial<Sale>,'receipt_number'>)=>sale.receipt_number||`TRX-${sale.id.toUpperCase()}`
export const rupiah=(n:number)=>`Rp${n.toLocaleString('id-ID')}`
export const saleDate=(s:string)=>new Date(s).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'})+' WIB'
export const paymentLabel={cash:'Tunai',qris:'QRIS usaha',transfer:'Transfer',ewallet:'E-wallet'}
export function salesSummary(sales:Sale[],now=new Date()){
  const day=(date:Date)=>new Date(date.getTime()+7*3600000).toISOString().slice(0,10)
  const dates=Array.from({length:7},(_,i)=>day(new Date(now.getTime()-(6-i)*86400000)))
  const done=sales.filter(s=>s.status==='completed'),today=done.filter(s=>day(new Date(s.created_at))===day(now))
  const daily=dates.map(d=>done.filter(s=>day(new Date(s.created_at))===d).reduce((n,s)=>n+Number(s.total)-Number(s.tax_amount||0),0))
  const best=new Map<string,{id:string;name:string;units:number;gross:number}>()
  for(const s of done)for(const l of s.lines){const b=best.get(l.id)||{id:l.id,name:l.name,units:0,gross:0};b.units=Math.round((b.units+Number(l.quantity))*1000)/1000;b.gross+=Number(l.original_total??l.total);best.set(l.id,b)}
  return{revenue:today.reduce((n,s)=>n+Number(s.total)-Number(s.tax_amount||0),0),count:today.length,units:Math.round(today.reduce((n,s)=>n+s.lines.reduce((n,l)=>n+Number(l.quantity),0),0)*1000)/1000,daily,labels:dates.map(d=>new Date(d+'T12:00:00+07:00').toLocaleDateString('id-ID',{weekday:'short',timeZone:'Asia/Jakarta'})),best:Array.from(best.values()).sort((a,b)=>b.units-a.units).slice(0,5)}
}
// Positive amounts: PostgreSQL numeric round(...,0), half up per line.
export function lineAmount(price:number,qty:number){return Number((BigInt(price)*BigInt(Math.round(qty*1000))+BigInt(500))/BigInt(1000))}
export function quote(lines:{product:{price:number};quantity:number}[],kind:string,value:string){
  const subtotal=lines.reduce((n,l)=>n+lineAmount(l.product.price,l.quantity),0)
  if(!Number.isSafeInteger(subtotal)||subtotal>999999999999)throw Error('Total melebihi batas transaksi.')
  if(!/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(value))throw Error('Diskon tidak valid.')
  const v=Number(value)
  if((kind==='none'&&v!==0)||(kind==='amount'&&!Number.isInteger(v))||(kind==='percent'&&v>100))throw Error('Diskon tidak valid.')
  const discount=kind==='amount'?v:kind==='percent'?Number((BigInt(subtotal)*BigInt(Math.round(v*100))+BigInt(5000))/BigInt(10000)):0
  if(discount>subtotal)throw Error('Diskon melebihi subtotal.')
  return{subtotal,discount,total:subtotal-discount}
}

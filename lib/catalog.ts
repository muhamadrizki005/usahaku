import { z } from 'zod'

export function quantity(value: unknown, signed=false): string {
  const text=String(value).trim().replace(',','.')
  if(!/^-?(0|[1-9]\d*)(\.\d{1,3})?$/.test(text)||text.length>20)throw Error('Jumlah harus angka dengan maksimal 3 desimal.')
  const [whole,fraction='']=text.replace('-','').split('.')
  const scaled=BigInt(whole)*BigInt(1000)+BigInt(fraction.padEnd(3,'0'))
  if(scaled>BigInt('999999999999')||(!signed&&text.startsWith('-')))throw Error('Jumlah di luar batas yang diperbolehkan.')
  return text
}
const qty=z.union([z.string(),z.number()]).transform((v,ctx)=>{try{return quantity(v)}catch(e){ctx.addIssue({code:'custom',message:(e as Error).message});return z.NEVER}})
export const productSchema=z.object({
  name:z.string().trim().min(1,'Nama produk wajib diisi.').max(160),category:z.string().trim().min(1,'Kategori wajib diisi.').max(100),
  unit:z.string().trim().min(1,'Unit stok wajib diisi.').max(30),sku:z.string().trim().max(64),barcode:z.string().trim().max(100),
  price:z.union([z.string(),z.number()]).transform(String).refine(v=>/^(0|[1-9]\d{0,11})$/.test(v),'Harga harus rupiah bulat, 0–999.999.999.999.'),
  minimum:qty,initialStock:qty,active:z.boolean(),
}).strict()
export type CatalogRow={id:string;business_id:string;name:string;category:string;unit:string;sku:string;barcode:string;price:number;stock:number;minimum_stock:number;active:boolean;revision:number;stock_revision:number;image_path:string|null;created_at:string;updated_at:string}
export type CatalogProduct={id:string;name:string;category:string;unit:string;sku:string;barcode:string;price:number;stock:number;minStock:number;active:boolean;revision:number;stockRevision:number;image?:string}
export type StockRow={id:string;product_id:string;kind:'initial'|'in'|'out'|'adjustment'|'sale'|'sale_cancel';quantity:number;before_stock:number;after_stock:number;product_name:string;unit:string;reason:string;actor_name:string;created_at:string}
export type CatalogResult={error?:string;success?:string;warning?:string;product?:CatalogProduct}
export function catalogView(p:CatalogRow):CatalogProduct{return{id:p.id,name:p.name,category:p.category,unit:p.unit,sku:p.sku,barcode:p.barcode,price:Number(p.price),stock:Number(p.stock),minStock:Number(p.minimum_stock),active:p.active,revision:p.revision,stockRevision:p.stock_revision,...(p.image_path?{image:`/api/products/${p.id}/image?v=${p.revision}`}:{})}}
export const formatQuantity=(n:number)=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(n)
export function adjustedStock(stock:number,delta:string){try{return (Math.round(stock*1000)+Math.round(Number(quantity(delta,true))*1000))/1000}catch{return NaN}}

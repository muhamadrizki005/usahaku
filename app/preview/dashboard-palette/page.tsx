import UsahakuDashboard from '@/components/usahaku-dashboard'
import type {Business,Member} from '@/lib/validation'
import type {CatalogProduct} from '@/lib/catalog'
import type {Sale} from '@/lib/pos'

export const dynamic='force-dynamic'

export default function DashboardPalettePreview() {
  const business:Business={id:'00000000-0000-4000-8000-000000000001',name:'Toko Senja',code:'PREVIEW1',category:'store',phone:'',address:'Data contoh preview',onboarding_completed_at:'2026-10-23T00:00:00Z'}
  const owner:Member={id:'00000000-0000-4000-8000-000000000002',user_id:'00000000-0000-4000-8000-000000000003',business_id:business.id,name:'Pak Arief',username:null,role:'owner',active:true,must_change_password:false,created_at:'2026-10-23T00:00:00Z'}
  const staff:Member={...owner,id:'00000000-0000-4000-8000-000000000004',user_id:'00000000-0000-4000-8000-000000000005',name:'Dina',username:'dina',role:'cashier'}
  const products:CatalogProduct[]=[
    {id:'00000000-0000-4000-8000-000000000010',name:'Kopi susu',category:'Minuman',unit:'pcs',sku:'KOPI-01',barcode:'',price:18000,stock:24,minStock:5,active:true,revision:0,stockRevision:0},
    {id:'00000000-0000-4000-8000-000000000011',name:'Roti cokelat',category:'Makanan',unit:'pcs',sku:'ROTI-01',barcode:'',price:12000,stock:18,minStock:5,active:true,revision:0,stockRevision:0},
    {id:'00000000-0000-4000-8000-000000000012',name:'Teh botol',category:'Minuman',unit:'pcs',sku:'TEH-01',barcode:'',price:8000,stock:12,minStock:3,active:true,revision:0,stockRevision:0},
  ]
  const now=new Date()
  const sales:Sale[]=Array.from({length:7},(_,i)=>{
    const lines=products.map((p,j)=>({id:p.id,name:p.name,sku:p.sku,unit:p.unit,price:p.price,quantity:([5,9,7,12,15,11,18][i])+j,total:p.price*(([5,9,7,12,15,11,18][i])+j)}))
    const total=lines.reduce((n,l)=>n+l.total,0)
    return{id:`00000000-0000-4000-8000-${String(100+i).padStart(12,'0')}`,business_id:business.id,actor_id:staff.user_id,actor_name:staff.name,customer:'Pelanggan umum',lines,subtotal:total,discount_kind:'none',discount_value:0,discount:0,total,payment:'cash',received:total,change:0,status:'completed',created_at:new Date(now.getTime()-(6-i)*86400000).toISOString(),cancelled_at:null,cancelled_by_name:null,cancellation_reason:null,refund_amount:null}
  })
  return <><div className="border-b border-[#454d5b] bg-[#1c222e] px-5 py-2 text-center text-xs text-[#c5cbd5]">Preview palet dashboard · Data contoh, tidak terhubung ke aktivitas usaha nyata</div><UsahakuDashboard business={business} member={owner} members={[owner,staff]} initialProducts={products} sales={sales}/></>
}

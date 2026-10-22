import {requireBusiness} from '@/lib/access'
import {readProducts} from '@/lib/catalog-server'
import PosManagement from '@/components/pos-management'
export default async function PosPage(){
 const {supabase,business,member}=await requireBusiness(['owner','admin','cashier'])
 return <PosManagement business={business} member={member} initialCategory="toko" initialProducts={await readProducts(supabase,business.id)} />
}

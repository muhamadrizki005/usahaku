import {requireBusiness} from '@/lib/access'
import {readProducts} from '@/lib/catalog-server'
import PosManagement from '@/components/pos-management'
import RestaurantOrders from '@/components/restaurant-orders'
import { readRestaurantMenu, readRestaurantTables, readRestaurantOrdersPage, readRestaurantUsage } from '@/lib/restaurant-server'
export default async function PosPage(){
 const {supabase,business,member}=await requireBusiness(['owner','admin','cashier'])
 if(business.category==='restaurant') return <RestaurantOrders member={member} menu={await readRestaurantMenu(supabase,business.id)} tables={await readRestaurantTables(supabase,business.id)} initialPage={await readRestaurantOrdersPage(supabase,business.id)} usage={await readRestaurantUsage(supabase,business.id)} />
 return <PosManagement business={business} member={member} initialCategory="toko" initialProducts={await readProducts(supabase,business.id)} />
}
